// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { exampleTableCfg } from '@rljson/rljson';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { IoMem } from '../src/io-mem';
import { IoPeer } from '../src/io-peer';
import { setIoTraceLogger } from '../src/io-trace';
import { PeerSocketMock } from '../src/peer-socket-mock';
import { Socket } from '../src/socket';

/**
 * A socket double whose `emit` is a spy that must never be called —
 * every request method is expected to fail fast on `isOpen === false`
 * before ever touching the socket.
 */
const socketThatMustNotBeUsed = (): { socket: Socket; emit: ReturnType<typeof vi.fn> } => {
  const emit = vi.fn();
  const socket: Socket = {
    connected: false,
    disconnected: true,
    connect: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn().mockReturnThis(),
    off: vi.fn().mockReturnThis(),
    removeAllListeners: vi.fn().mockReturnThis(),
    emit,
  };
  return { socket, emit };
};

// Every IoPeer method that emits on the socket, each with a minimal
// valid-shaped call. Covers the full set enumerated in the spec:
// dump, dumpTable, readRows, readRowsByHashes, write, tableExists,
// rawTableCfgs, rowCount, createOrExtendTable, contentType.
const requestMethods: Array<[string, (peer: IoPeer) => Promise<unknown>]> = [
  ['dump', (peer) => peer.dump()],
  ['dumpTable', (peer) => peer.dumpTable({ table: 't' })],
  ['contentType', (peer) => peer.contentType({ table: 't' })],
  ['tableExists', (peer) => peer.tableExists('t')],
  [
    'createOrExtendTable',
    (peer) =>
      peer.createOrExtendTable({ tableCfg: exampleTableCfg({ key: 't' }) }),
  ],
  ['rawTableCfgs', (peer) => peer.rawTableCfgs()],
  ['write', (peer) => peer.write({ data: {} })],
  ['readRows', (peer) => peer.readRows({ table: 't', where: {} })],
  ['readRowsByHashes', (peer) => peer.readRowsByHashes({ table: 't', hashes: [] })],
  ['rowCount', (peer) => peer.rowCount('t')],
];

describe('IoPeer — fail-fast on a closed socket', () => {
  it.each(requestMethods)(
    '%s rejects immediately with "socket closed" instead of emitting',
    async (_name, call) => {
      const { socket, emit } = socketThatMustNotBeUsed();
      const peer = new IoPeer(socket);
      expect(peer.isOpen).toBe(false); // never init()'d

      await expect(call(peer)).rejects.toThrow(/IoPeer: socket closed/);
      expect(emit).not.toHaveBeenCalled();
    },
  );

  it('starts failing fast once an open peer is closed', async () => {
    const mem = await IoMem.example();
    const socket = new PeerSocketMock(mem);
    const emitSpy = vi.spyOn(socket, 'emit');
    const peer = new IoPeer(socket);
    await peer.init();
    expect(peer.isOpen).toBe(true);

    await peer.close();
    expect(peer.isOpen).toBe(false);

    emitSpy.mockClear();
    await expect(peer.readRows({ table: 't', where: {} })).rejects.toThrow(
      /IoPeer: socket closed/,
    );
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('still answers normally once the socket is open', async () => {
    const mem = await IoMem.example();
    const socket = new PeerSocketMock(mem);
    const peer = new IoPeer(socket);
    await peer.init();

    await expect(peer.rawTableCfgs()).resolves.toEqual(
      await mem.rawTableCfgs(),
    );
  });
});

describe('ioTrace wiring into IoPeer.readRows', () => {
  afterEach(() => {
    setIoTraceLogger(null);
  });

  it('traces request start/settle for both a success and an error', async () => {
    const messages: string[] = [];
    setIoTraceLogger((msg) => messages.push(msg));

    const mem = new IoMem();
    await mem.init();
    await mem.createOrExtendTable({ tableCfg: exampleTableCfg({ key: 't' }) });
    await mem.write({
      data: { t: { _data: [{ a: 'x', b: 0 }], _hash: '', _type: 'components' } },
    });

    const peer = new IoPeer(new PeerSocketMock(mem));
    await peer.init();

    await peer.readRows({ table: 't', where: {} });
    await expect(
      peer.readRows({ table: 'nope', where: {} }),
    ).rejects.toThrow('Table "nope" not found');

    expect(messages).toContain('peer readRows-> table=t');
    expect(messages).toContain('peer readRows<- rows=1');
    expect(messages.some((m) => m.startsWith('peer readRows<- err='))).toBe(
      true,
    );
  });
});
