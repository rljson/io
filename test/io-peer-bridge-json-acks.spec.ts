// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { hip } from '@rljson/hash';
import { Rljson, TableCfg } from '@rljson/rljson';

import { describe, expect, it } from 'vitest';

import {
  createSocketPair,
  Io,
  IoMem,
  IoPeer,
  IoPeerBridge,
  Socket,
} from '../src';

// .............................................................................
/**
 * What Socket.IO does to an ack's arguments: they cross as JSON.
 *
 * An `Error` has no enumerable fields, so it arrives as `{}`. The in-process
 * socket mocks hand objects over by reference and never show that, which is
 * why a raw `Error` in an ack went unnoticed. This wraps every handler
 * registered on `socket` so its ack arguments make the same round trip.
 * @param socket - The socket a bridge listens on
 * @returns The same socket, with JSON acks
 */
const jsonAcks = (socket: Socket): Socket => {
  const on = socket.on.bind(socket);
  (socket as any).on = (event: string, handler: (...a: any[]) => void) =>
    on(event, (...args: any[]) => {
      const ack = args[args.length - 1];
      if (typeof ack !== 'function') return handler(...args);
      return handler(...args.slice(0, -1), (...ackArgs: any[]) =>
        ack(
          ...ackArgs.map((a) =>
            a === undefined ? undefined : JSON.parse(JSON.stringify(a)),
          ),
        ),
      );
    });
  return socket;
};

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

/** A store without batch reads — `IoSqliteNode` and `IoMssql` today. */
const storeWithoutBatchReads = async (): Promise<{ io: Io; rows: any[] }> => {
  const mem = new IoMem();
  await mem.init();
  await mem.isReady();
  await mem.createOrExtendTable({ tableCfg: tableCfg('t') });
  const rows = [hip({ name: 'a' }), hip({ name: 'b' })];
  await mem.write({
    data: { t: { _type: 'components', _data: rows } } as unknown as Rljson,
  });
  const io = Object.create(mem) as Io;
  (io as any).readRowsByHashes = undefined;
  return { io, rows };
};

describe('IoPeer against an IoPeerBridge, acks as JSON', () => {
  it('falls back to per-hash reads when the far store has no batch reads', async () => {
    const { io, rows } = await storeWithoutBatchReads();
    const [peerSocket, bridgeSocket] = createSocketPair();
    new IoPeerBridge(io, jsonAcks(bridgeSocket)).start();
    peerSocket.connect();
    const peer = new IoPeer(peerSocket);
    await peer.init();

    const result = await peer.readRowsByHashes({
      table: 't',
      hashes: rows.map((r) => r._hash),
    });

    expect(result.t._data.map((r: any) => r.name).sort()).toEqual(['a', 'b']);
    expect((peer as any)._batchReadsUnsupported).toBe(true);
  });

  it('carries the reason of a failing method across the socket', async () => {
    const { io } = await storeWithoutBatchReads();
    const [peerSocket, bridgeSocket] = createSocketPair();
    const bridge = new IoPeerBridge(io, jsonAcks(bridgeSocket));
    bridge.start();
    bridge.registerEvent('missingMethod');

    const reply = await new Promise<unknown[]>((resolve) =>
      peerSocket.emit('missingMethod', (...args: unknown[]) => resolve(args)),
    );

    expect(reply).toEqual([
      null,
      {
        message: 'Method "missingMethod" not found on Io instance',
        name: 'Error',
      },
    ]);
  });
});
