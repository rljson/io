// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import EventEmitter from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Io, IoTools } from '../src';
import { IoServer } from '../src/io-server';
import { Socket } from '../src/socket';

describe('IoServer.removeSocket', () => {
  let io: Io;
  let socket: Socket;
  let server: IoServer;

  beforeEach(async () => {
    const ioTools = await IoTools.example();
    io = ioTools.io;
    socket = new EventEmitter() as unknown as Socket;
    server = new IoServer(io);
    await server.addSocket(socket);
  });

  it('stops answering after removeSocket — the ack is never invoked', async () => {
    server.removeSocket(socket);

    const ack = vi.fn();
    const hadListener = (socket as any).emit('rawTableCfgs', ack);

    // EventEmitter#emit returns false when there was no listener left
    // for the event — proves the handler was really unregistered, not
    // just left registered-but-inert.
    expect(hadListener).toBe(false);

    await new Promise((r) => setTimeout(r, 10));
    expect(ack).not.toHaveBeenCalled();
  });

  it('is idempotent — removing the same socket twice does not throw', async () => {
    expect(() => server.removeSocket(socket)).not.toThrow();
    expect(() => server.removeSocket(socket)).not.toThrow();
  });

  it('is a no-op for a socket that was never added', () => {
    const strangerSocket = new EventEmitter() as unknown as Socket;
    expect(() => server.removeSocket(strangerSocket)).not.toThrow();
  });

  it('lets a socket be added again after being removed, and it works normally', async () => {
    server.removeSocket(socket);

    await server.addSocket(socket);

    const cfgs = await vi.waitFor(
      () =>
        new Promise((r) => {
          socket.emit('rawTableCfgs', (data: any) => {
            r(data);
          });
        }),
      { timeout: 5000 },
    );

    expect(cfgs).toEqual(await io.rawTableCfgs());
  });

  it('only removes handlers for the targeted socket, not other sockets', async () => {
    const otherSocket = new EventEmitter() as unknown as Socket;
    await server.addSocket(otherSocket);

    server.removeSocket(socket);

    const otherCfgs = await vi.waitFor(
      () =>
        new Promise((r) => {
          otherSocket.emit('rawTableCfgs', (data: any) => {
            r(data);
          });
        }),
      { timeout: 5000 },
    );
    expect(otherCfgs).toEqual(await io.rawTableCfgs());

    const ack = vi.fn();
    (socket as any).emit('rawTableCfgs', ack);
    await new Promise((r) => setTimeout(r, 10));
    expect(ack).not.toHaveBeenCalled();
  });
});
