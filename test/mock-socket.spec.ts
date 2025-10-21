// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Io, IoMem } from '../src';
import { PeerSocketMock } from '../src/peer-socket-mock';
import { Socket } from '../src/socket';


describe('PeerSocketMock', () => {
  let socket: Socket;
  let io: Io;

  beforeEach(async () => {
    io = await IoMem.example();
    socket = new PeerSocketMock(io);
  });

  it('should be defined', () => {
    expect(socket).toBeDefined();
  });
  it('should connect and disconnect', () => {
    expect(socket.connected).toBe(false);
    expect(socket.disconnected).toBe(true);

    socket.connect();
    expect(socket.connected).toBe(true);
    expect(socket.disconnected).toBe(false);

    socket.disconnect();
    expect(socket.connected).toBe(false);
    expect(socket.disconnected).toBe(true);
  });

  it('should emit events', async () => {
    const dump = await vi.waitFor(
      () =>
        new Promise((r) => {
          socket.emit('dump', (data: any) => {
            r(data);
          });
        }),
      { timeout: 5000 },
    );

    expect(dump).toEqual(await io.dump());
  });

  it('should return error on wrong parameters of events', async () => {
    const error: Error = await vi.waitFor(
      () =>
        new Promise((r) => {
          socket.emit('dumpTable', 'unknown', (data: any, error: Error) => {
            if (error) r(error);
            r(data);
          });
        }),
      { timeout: 5000 },
    );

    expect(error.message).toEqual('Table "undefined" not found');
  });

  it('should throw error on emitting unsupported event', () => {
    expect(() => socket.emit('unsupportedEvent')).toThrowError(
      'Event unsupportedEvent not supported',
    );
  });
});
