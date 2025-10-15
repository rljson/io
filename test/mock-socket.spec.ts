// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Io, IoMem } from '../src';
import { PeerSocketMock } from '../src/peer-socket-mock';
import { Socket } from '../src/socket';

describe('MockSocket', () => {
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
  it('should add and remove listeners', () => {
    const connectCallback = vi.fn();
    const disconnectCallback = vi.fn();

    socket.addListener('connect', connectCallback);
    socket.on('disconnect', disconnectCallback);

    socket.connect();
    socket.disconnect();

    socket.removeListener('connect', connectCallback);
    socket.removeListener('disconnect', disconnectCallback);

    socket.connect();
    socket.disconnect();

    expect(connectCallback).toHaveBeenCalledTimes(1);
    expect(disconnectCallback).toHaveBeenCalledTimes(1);
  });
  it('should add and remove once listeners', () => {
    const connectCallback = vi.fn();
    const disconnectCallback = vi.fn();

    socket.once('connect', connectCallback);
    socket.once('disconnect', disconnectCallback);

    socket.connect();
    socket.disconnect();

    // Call again to check that once listeners are removed
    socket.connect();
    socket.disconnect();

    expect(connectCallback).toHaveBeenCalledTimes(1);
    expect(disconnectCallback).toHaveBeenCalledTimes(1);
  });
  it('should off listeners', () => {
    const connectCallback = vi.fn();
    const disconnectCallback = vi.fn();

    socket.on('connect', connectCallback);
    socket.on('disconnect', disconnectCallback);

    socket.connect();
    socket.disconnect();

    socket.off('connect', connectCallback);
    socket.off('disconnect', disconnectCallback);

    socket.connect();
    socket.disconnect();

    expect(connectCallback).toHaveBeenCalledTimes(1);
    expect(disconnectCallback).toHaveBeenCalledTimes(1);
  });

  it('should remove all listeners', () => {
    const connectCallback = vi.fn();
    const disconnectCallback = vi.fn();

    socket.on('connect', connectCallback);
    socket.on('disconnect', disconnectCallback);

    socket.connect();
    socket.disconnect();

    socket.removeAllListeners('connect');
    socket.removeAllListeners('disconnect');

    socket.connect();
    socket.disconnect();

    expect(connectCallback).toHaveBeenCalledTimes(1);
    expect(disconnectCallback).toHaveBeenCalledTimes(1);
  });

  it('should remove all listeners w/o table given', () => {
    const connectCallback = vi.fn();
    const disconnectCallback = vi.fn();

    socket.on('connect', connectCallback);
    socket.on('disconnect', disconnectCallback);

    socket.connect();
    socket.disconnect();

    socket.removeAllListeners();

    socket.connect();
    socket.disconnect();

    expect(connectCallback).toHaveBeenCalledTimes(1);
    expect(disconnectCallback).toHaveBeenCalledTimes(1);
  });

  it('should get all listeners', () => {
    const connectCallback = () => {
      // console.log('connected');
    };
    const disconnectCallback = () => {
      // console.log('disconnected');
    };

    socket.on('connect', connectCallback);
    socket.on('disconnect', disconnectCallback);

    const connectListeners = socket.listeners('connect');
    expect(connectListeners.length).toBe(1);
    expect(connectListeners[0]).toBe(connectCallback);

    const disconnectListeners = socket.rawListeners('disconnect');
    expect(disconnectListeners.length).toBe(1);
    expect(disconnectListeners[0]).toBe(disconnectCallback);

    socket.connect();
    socket.disconnect();
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

  it('Not implemented Methods', () => {
    expect(() => socket.setMaxListeners(10)).toThrowError(
      'Method not implemented.',
    );
    expect(() => socket.getMaxListeners()).toThrowError(
      'Method not implemented.',
    );
    expect(() => socket.listenerCount('eventName', () => {})).toThrowError(
      'Method not implemented.',
    );
    expect(() => socket.prependListener('eventName', () => {})).toThrowError(
      'Method not implemented.',
    );
    expect(() =>
      socket.prependOnceListener('eventName', () => {}),
    ).toThrowError('Method not implemented.');
    expect(() => socket.eventNames()).toThrowError('Method not implemented.');
  });
});
