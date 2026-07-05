// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SocketMock } from '../src/socket-mock.ts';

describe('SocketMock', () => {
  let socket: SocketMock;

  beforeEach(() => {
    socket = new SocketMock();
  });

  describe('connect()', () => {
    it('marks the socket as connected and emits »connect«', () => {
      const handler = vi.fn();
      socket.on('connect', handler);

      socket.connect();

      expect(socket.connected).toBe(true);
      expect(socket.disconnected).toBe(false);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('does nothing when already connected', () => {
      const handler = vi.fn();
      socket.connect();
      socket.on('connect', handler);

      socket.connect();

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('disconnect()', () => {
    it('marks the socket as disconnected and emits »disconnect«', () => {
      socket.connect();
      const handler = vi.fn();
      socket.on('disconnect', handler);

      socket.disconnect();

      expect(socket.connected).toBe(false);
      expect(socket.disconnected).toBe(true);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('does nothing when already disconnected', () => {
      const handler = vi.fn();
      socket.on('disconnect', handler);

      socket.disconnect();

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('on()', () => {
    it('registers multiple listeners for the same event', () => {
      const handlerA = vi.fn();
      const handlerB = vi.fn();

      socket.on('message', handlerA);
      socket.on('message', handlerB);
      socket.emit('message', 'hello');

      expect(handlerA).toHaveBeenCalledWith('hello');
      expect(handlerB).toHaveBeenCalledWith('hello');
    });
  });

  describe('once()', () => {
    it('calls the listener only for the next emission', () => {
      const handler = vi.fn();
      socket.once('message', handler);

      socket.emit('message', 'first');
      socket.emit('message', 'second');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('first');
    });

    it('registers multiple once-listeners for the same event', () => {
      const handlerA = vi.fn();
      const handlerB = vi.fn();

      socket.once('message', handlerA);
      socket.once('message', handlerB);
      socket.emit('message', 'hello');

      expect(handlerA).toHaveBeenCalledWith('hello');
      expect(handlerB).toHaveBeenCalledWith('hello');
    });
  });

  describe('off()', () => {
    it('removes a specific regular listener', () => {
      const handler = vi.fn();
      socket.on('message', handler);

      socket.off('message', handler);
      socket.emit('message', 'hello');

      expect(handler).not.toHaveBeenCalled();
    });

    it('removes a specific once-listener', () => {
      const handler = vi.fn();
      socket.once('message', handler);

      socket.off('message', handler);
      socket.emit('message', 'hello');

      expect(handler).not.toHaveBeenCalled();
    });

    it('removes a regular listener without touching an unrelated once-listener', () => {
      const regular = vi.fn();
      const once = vi.fn();
      socket.on('message', regular);
      socket.once('message', once);

      socket.off('message', regular);
      socket.emit('message', 'hello');

      expect(regular).not.toHaveBeenCalled();
      expect(once).toHaveBeenCalledWith('hello');
    });

    it('does nothing when the listener was never registered', () => {
      const registered = vi.fn();
      const notRegistered = vi.fn();
      socket.on('message', registered);

      socket.off('message', notRegistered);
      socket.emit('message', 'hello');

      expect(registered).toHaveBeenCalledWith('hello');
    });

    it('removes all listeners for an event when no listener is given', () => {
      const regular = vi.fn();
      const once = vi.fn();
      socket.on('message', regular);
      socket.once('message', once);

      socket.off('message');
      socket.emit('message', 'hello');

      expect(regular).not.toHaveBeenCalled();
      expect(once).not.toHaveBeenCalled();
    });

    it('returns the socket to allow chaining', () => {
      expect(socket.off('message')).toBe(socket);
    });
  });

  describe('emit()', () => {
    it('returns false when there are no listeners', () => {
      expect(socket.emit('message', 'hello')).toBe(false);
    });

    it('returns true when a regular listener exists', () => {
      socket.on('message', vi.fn());
      expect(socket.emit('message', 'hello')).toBe(true);
    });

    it('returns true when only a once-listener exists', () => {
      socket.once('message', vi.fn());
      expect(socket.emit('message', 'hello')).toBe(true);
    });

    it('logs and continues when a regular listener throws', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const throwing = vi.fn(() => {
        throw new Error('boom');
      });
      const following = vi.fn();
      socket.on('message', throwing);
      socket.on('message', following);

      socket.emit('message', 'hello');

      expect(following).toHaveBeenCalledWith('hello');
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error in listener for event message:'),
        expect.any(Error),
      );

      errorSpy.mockRestore();
    });

    it('logs and continues when a once-listener throws', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const throwing = vi.fn(() => {
        throw new Error('boom');
      });
      const following = vi.fn();
      socket.once('message', throwing);
      socket.once('message', following);

      socket.emit('message', 'hello');

      expect(following).toHaveBeenCalledWith('hello');
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error in once listener for event message:'),
        expect.any(Error),
      );

      errorSpy.mockRestore();
    });
  });

  describe('removeAllListeners()', () => {
    it('removes all listeners for a specific event', () => {
      const regularA = vi.fn();
      const onceA = vi.fn();
      const regularB = vi.fn();
      socket.on('a', regularA);
      socket.once('a', onceA);
      socket.on('b', regularB);

      socket.removeAllListeners('a');

      expect(socket.emit('a', 'x')).toBe(false);
      expect(socket.emit('b', 'x')).toBe(true);
      expect(regularA).not.toHaveBeenCalled();
      expect(onceA).not.toHaveBeenCalled();
      expect(regularB).toHaveBeenCalled();
    });

    it('removes all listeners for all events when no event is given', () => {
      socket.on('a', vi.fn());
      socket.once('b', vi.fn());

      socket.removeAllListeners();

      expect(socket.eventNames()).toEqual([]);
    });

    it('returns the socket to allow chaining', () => {
      expect(socket.removeAllListeners()).toBe(socket);
    });
  });

  describe('listenerCount()', () => {
    it('counts regular and once-listeners together', () => {
      socket.on('a', vi.fn());
      socket.on('a', vi.fn());
      socket.once('a', vi.fn());

      expect(socket.listenerCount('a')).toBe(3);
    });

    it('returns 0 for an event without listeners', () => {
      expect(socket.listenerCount('unknown')).toBe(0);
    });
  });

  describe('listeners()', () => {
    it('returns regular and once-listeners together', () => {
      const regular = vi.fn();
      const once = vi.fn();
      socket.on('a', regular);
      socket.once('a', once);

      expect(socket.listeners('a')).toEqual([regular, once]);
    });

    it('returns an empty array for an event without listeners', () => {
      expect(socket.listeners('unknown')).toEqual([]);
    });
  });

  describe('eventNames()', () => {
    it('returns the deduplicated union of regular and once event names', () => {
      socket.on('a', vi.fn());
      socket.once('a', vi.fn());
      socket.once('b', vi.fn());

      expect(socket.eventNames().sort()).toEqual(['a', 'b']);
    });
  });

  describe('reset()', () => {
    it('resets connection state and removes all listeners', () => {
      socket.connect();
      socket.on('a', vi.fn());

      socket.reset();

      expect(socket.connected).toBe(false);
      expect(socket.disconnected).toBe(true);
      expect(socket.eventNames()).toEqual([]);
    });
  });

  describe('simulateError()', () => {
    it('emits an »error« event with the given error', () => {
      const handler = vi.fn();
      socket.on('error', handler);
      const error = new Error('simulated');

      socket.simulateError(error);

      expect(handler).toHaveBeenCalledWith(error);
    });
  });

  describe('simulateMessage()', () => {
    it('emits a »message« event with the given payload', () => {
      const handler = vi.fn();
      socket.on('message', handler);

      socket.simulateMessage({ foo: 'bar' });

      expect(handler).toHaveBeenCalledWith({ foo: 'bar' });
    });
  });

  describe('getListeners()', () => {
    it('returns a copy of the regular listeners map', () => {
      const handler = vi.fn();
      socket.on('a', handler);

      const listeners = socket.getListeners();
      listeners.delete('a');

      expect(listeners.has('a')).toBe(false);
      expect(socket.getListeners().has('a')).toBe(true);
    });
  });

  describe('getOnceListeners()', () => {
    it('returns a copy of the once-listeners map', () => {
      const handler = vi.fn();
      socket.once('a', handler);

      const listeners = socket.getOnceListeners();
      listeners.delete('a');

      expect(listeners.has('a')).toBe(false);
      expect(socket.getOnceListeners().has('a')).toBe(true);
    });
  });
});
