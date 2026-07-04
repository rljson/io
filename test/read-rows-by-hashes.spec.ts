// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { hip } from '@rljson/hash';
import { Rljson, TableCfg } from '@rljson/rljson';

import EventEmitter from 'node:events';
import { beforeEach, describe, expect, it } from 'vitest';

import { Io } from '../src/io';
import { IoMem } from '../src/io-mem';
import { IoMulti } from '../src/io-multi';
import { IoPeer } from '../src/io-peer';
import { IoServer } from '../src/io-server';
import { PeerSocketMock } from '../src/peer-socket-mock';
import { Socket } from '../src/socket';

const tableCfg = (key: string): TableCfg =>
  hip<TableCfg>({
    _hash: '',
    version: 0,
    key,
    type: 'components',
    isHead: false,
    isRoot: false,
    isShared: true,
    columns: [
      { key: '_hash', type: 'string', titleShort: 'Hash', titleLong: 'Hash' },
      { key: 'name', type: 'string', titleShort: 'Name', titleLong: 'Name' },
    ],
  } as unknown as TableCfg);

const setupIoMem = async (rows: any[]): Promise<IoMem> => {
  const io = new IoMem();
  await io.init();
  await io.isReady();
  await io.createOrExtendTable({ tableCfg: tableCfg('t') });
  if (rows.length > 0) {
    await io.write({
      data: { t: { _type: 'components', _data: rows } } as unknown as Rljson,
    });
  }
  return io;
};

/** Wraps an IoMem, hiding readRowsByHashes (simulates an older io) */
const withoutBatchReads = (io: IoMem): Io => {
  const wrapped = Object.create(io) as Io;
  (wrapped as any).readRowsByHashes = undefined;
  return wrapped;
};

describe('readRowsByHashes', () => {
  let rowA: any;
  let rowB: any;

  beforeEach(() => {
    rowA = hip({ name: 'a', _hash: '' } as any);
    rowB = hip({ name: 'b', _hash: '' } as any);
  });

  describe('IoMem', () => {
    it('returns found rows, skips missing and duplicate hashes', async () => {
      const io = await setupIoMem([rowA, rowB]);

      const result = await io.readRowsByHashes({
        table: 't',
        hashes: [rowA._hash, rowA._hash, 'MISSING', rowB._hash],
      });

      const names = result.t._data.map((r: any) => r.name).sort();
      expect(names).toEqual(['a', 'b']);
      expect(result.t._type).toBe('components');
    });

    it('throws for missing tables', async () => {
      const io = await setupIoMem([]);
      await expect(
        io.readRowsByHashes({ table: 'nope', hashes: ['x'] }),
      ).rejects.toThrow('Table "nope" not found');
    });
  });

  describe('IoMulti', () => {
    it('cascades per hash across readables', async () => {
      const io1 = await setupIoMem([rowA]);
      const io2 = await setupIoMem([rowB]);

      const multi = new IoMulti([
        { io: io1, read: true, write: false, dump: true, priority: 1 },
        { io: io2, read: true, write: false, dump: false, priority: 2 },
      ]);

      const result = await multi.readRowsByHashes({
        table: 't',
        hashes: [rowA._hash, rowB._hash],
      });

      const names = result.t._data.map((r: any) => r.name).sort();
      expect(names).toEqual(['a', 'b']);
    });

    it('falls back to per-hash readRows for members without batch support', async () => {
      const io1 = await setupIoMem([rowA, rowB]);

      const multi = new IoMulti([
        {
          io: withoutBatchReads(io1),
          read: true,
          write: false,
          dump: true,
          priority: 1,
        },
      ]);

      const result = await multi.readRowsByHashes({
        table: 't',
        hashes: [rowA._hash, rowB._hash, 'MISSING'],
      });

      const names = result.t._data.map((r: any) => r.name).sort();
      expect(names).toEqual(['a', 'b']);
    });

    it('stops cascading once all hashes are found', async () => {
      const io1 = await setupIoMem([rowA, rowB]);
      const io2 = await setupIoMem([]);

      const multi = new IoMulti([
        { io: io1, read: true, write: false, dump: true, priority: 1 },
        { io: io2, read: true, write: false, dump: false, priority: 2 },
      ]);

      const result = await multi.readRowsByHashes({
        table: 't',
        hashes: [rowA._hash, rowB._hash],
      });
      expect(result.t._data.length).toBe(2);
    });

    it('does not write back to the source readable', async () => {
      const io1 = await setupIoMem([rowA]);

      const multi = new IoMulti([
        {
          io: io1,
          id: 'source',
          read: true,
          write: true,
          dump: true,
          priority: 1,
        },
      ]);

      const result = await multi.readRowsByHashes({
        table: 't',
        hashes: [rowA._hash],
      });
      expect(result.t._data.length).toBe(1);
    });

    it('writes fetched rows back to writables (hot-swap cache)', async () => {
      const io1 = await setupIoMem([]); // empty local cache
      const io2 = await setupIoMem([rowA]); // remote source

      const multi = new IoMulti([
        { io: io1, read: true, write: true, dump: true, priority: 1 },
        { io: io2, read: true, write: false, dump: false, priority: 2 },
      ]);

      await multi.readRowsByHashes({ table: 't', hashes: [rowA._hash] });

      // The row is now cached in the writable local io
      const local = await io1.readRows({
        table: 't',
        where: { _hash: rowA._hash },
      });
      expect(local.t._data.length).toBe(1);
    });

    it('throws when the table exists nowhere', async () => {
      const io1 = await setupIoMem([]);
      const multi = new IoMulti([
        { io: io1, read: true, write: false, dump: true, priority: 1 },
      ]);

      await expect(
        multi.readRowsByHashes({ table: 'nope', hashes: ['x'] }),
      ).rejects.toThrow('Table "nope" not found');
    });
  });

  describe('IoPeer', () => {
    it('reads batches over the socket', async () => {
      const io = await setupIoMem([rowA, rowB]);
      const peer = new IoPeer(new PeerSocketMock(io));

      const result = await peer.readRowsByHashes({
        table: 't',
        hashes: [rowA._hash, rowB._hash],
      });

      const names = result.t._data.map((r: any) => r.name).sort();
      expect(names).toEqual(['a', 'b']);
    });

    it('falls back to per-hash reads when the remote side lacks support', async () => {
      const io = await setupIoMem([rowA, rowB]);
      const peer = new IoPeer(new PeerSocketMock(withoutBatchReads(io)));

      const result = await peer.readRowsByHashes({
        table: 't',
        hashes: [rowA._hash, rowB._hash],
      });

      const names = result.t._data.map((r: any) => r.name).sort();
      expect(names).toEqual(['a', 'b']);
      expect((peer as any)._batchReadsUnsupported).toBe(true);

      // Subsequent calls use the fallback directly
      const again = await peer.readRowsByHashes({
        table: 't',
        hashes: [rowA._hash],
      });
      expect(again.t._data.length).toBe(1);

      // Empty batch resolves the table type via an empty query
      const empty = await peer.readRowsByHashes({ table: 't', hashes: [] });
      expect(empty.t._data.length).toBe(0);
      expect(empty.t._type).toBe('components');
    });

    it('rethrows genuine remote errors without latching the fallback', async () => {
      const io = await setupIoMem([]);
      const peer = new IoPeer(new PeerSocketMock(io));

      await expect(
        peer.readRowsByHashes({ table: 'nope', hashes: ['x'] }),
      ).rejects.toThrow('Table "nope" not found');
      expect((peer as any)._batchReadsUnsupported).toBe(false);
    });

    it('falls back after a timeout and remembers it', async () => {
      const io = await setupIoMem([rowA]);
      const inner = new PeerSocketMock(io);

      // A socket that swallows batch requests but forwards the rest
      const socket = {
        on: inner.on.bind(inner),
        off: inner.off.bind(inner),
        removeAllListeners: inner.removeAllListeners.bind(inner),
        connected: inner.connected,
        disconnected: inner.disconnected,
        emit: (eventName: string | symbol, ...args: any[]) => {
          if (eventName === 'readRowsByHashes') {
            return true; // never acks
          }
          return inner.emit(eventName, ...args);
        },
      } as unknown as Socket;

      const peer = new IoPeer(socket, 30);

      const result = await peer.readRowsByHashes({
        table: 't',
        hashes: [rowA._hash],
      });
      expect(result.t._data.length).toBe(1);
      expect((peer as any)._batchReadsUnsupported).toBe(true);
    });
  });

  describe('IoServer', () => {
    it('serves readRowsByHashes over the socket', async () => {
      const io = await setupIoMem([rowA]);
      const socket = new EventEmitter() as unknown as Socket;
      const server = new IoServer(io);
      await server.addSocket(socket);

      const result = await new Promise<Rljson>((resolve, reject) => {
        (socket as any).emit(
          'readRowsByHashes',
          { table: 't', hashes: [rowA._hash] },
          (data: Rljson, error?: Error) =>
            error ? reject(error) : resolve(data),
        );
      });

      expect(result.t._data.length).toBe(1);
    });

    it('answers with a not-found error for ios without batch support', async () => {
      const io = withoutBatchReads(await setupIoMem([rowA]));
      const socket = new EventEmitter() as unknown as Socket;
      const server = new IoServer(io);
      await server.addSocket(socket);

      const error = await new Promise<Error | null>((resolve) => {
        (socket as any).emit(
          'readRowsByHashes',
          { table: 't', hashes: [rowA._hash] },
          (_data: Rljson | null, err?: Error) => resolve(err ?? null),
        );
      });

      expect(error?.message).toContain(
        'Method "readRowsByHashes" not found on Io instance',
      );
    });
  });
});
