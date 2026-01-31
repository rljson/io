// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { describe, expect, it, vi } from 'vitest';

import { createSocketPair } from '../src/directional-socket-mock.ts';


describe('DirectionalSocketMock', () => {
  describe('createSocketPair', () => {
    it('should create two connected sockets', () => {
      const [socketA, socketB] = createSocketPair();

      expect(socketA).toBeDefined();
      expect(socketB).toBeDefined();
      expect(socketA.connected).toBe(false);
      expect(socketB.connected).toBe(false);
    });

    it('should connect both sockets when one connects', () => {
      const [socketA, socketB] = createSocketPair();

      const connectAHandler = vi.fn();
      const connectBHandler = vi.fn();

      socketA.on('connect', connectAHandler);
      socketB.on('connect', connectBHandler);

      socketA.connect();

      expect(socketA.connected).toBe(true);
      expect(socketB.connected).toBe(false);
      expect(socketA.disconnected).toBe(false);
      expect(connectAHandler).toHaveBeenCalledTimes(1);
      expect(connectBHandler).toHaveBeenCalledTimes(1);
    });

    it('should disconnect both sockets when one disconnects', () => {
      const [socketA, socketB] = createSocketPair();

      const disconnectAHandler = vi.fn();
      const disconnectBHandler = vi.fn();

      socketA.on('disconnect', disconnectAHandler);
      socketB.on('disconnect', disconnectBHandler);

      socketA.connect();
      socketA.disconnect();

      expect(socketA.connected).toBe(false);
      expect(socketA.disconnected).toBe(true);
      expect(disconnectAHandler).toHaveBeenCalledTimes(1);
      expect(disconnectBHandler).toHaveBeenCalledTimes(1);
    });

    it('should not reconnect if already connected', () => {
      const [socketA] = createSocketPair();

      const connectHandler = vi.fn();
      socketA.on('connect', connectHandler);

      socketA.connect();
      socketA.connect(); // Second connect should be ignored

      expect(connectHandler).toHaveBeenCalledTimes(1);
      expect(socketA.connected).toBe(true);
    });

    it('should not disconnect if already disconnected', () => {
      const [socketA] = createSocketPair();

      const disconnectHandler = vi.fn();
      socketA.on('disconnect', disconnectHandler);

      socketA.disconnect(); // Disconnect without connecting first

      expect(disconnectHandler).not.toHaveBeenCalled();
      expect(socketA.disconnected).toBe(true);
    });
  });

  describe('emit and on', () => {
    it('should emit events to peer socket, not local', () => {
      const [socketA, socketB] = createSocketPair();

      const localHandler = vi.fn();
      const peerHandler = vi.fn();

      socketA.on('testEvent', localHandler);
      socketB.on('testEvent', peerHandler);

      socketA.emit('testEvent', 'data1', 'data2');

      expect(localHandler).not.toHaveBeenCalled(); // Local should NOT fire
      expect(peerHandler).toHaveBeenCalledWith('data1', 'data2');
    });

    it('should handle multiple listeners for the same event', () => {
      const [socketA, socketB] = createSocketPair();

      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      socketB.on('test', handler1);
      socketB.on('test', handler2);
      socketB.on('test', handler3);

      socketA.emit('test', 'value');

      expect(handler1).toHaveBeenCalledWith('value');
      expect(handler2).toHaveBeenCalledWith('value');
      expect(handler3).toHaveBeenCalledWith('value');
    });

    it('should support Socket.IO acknowledgement pattern', () => {
      const [socketA, socketB] = createSocketPair();

      socketB.on(
        'request',
        (data: string, callback: (response: string) => void) => {
          expect(data).toBe('question');
          callback('answer');
        },
      );

      const ackCallback = vi.fn();
      socketA.emit('request', 'question', ackCallback);

      expect(ackCallback).toHaveBeenCalledWith('answer');
    });

    it('should emit to peer without warning when peer exists', () => {
      const [socketA, socketB] = createSocketPair();
      const consoleWarnSpy = vi.spyOn(console, 'warn');

      socketB.on('test', () => {});
      const result = socketA.emit('test');

      expect(result).toBe(true);
      expect(consoleWarnSpy).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('should warn and return false when emitting without peer', () => {
      const [socketA] = createSocketPair();
      // Clear peer by creating new socket without connection
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      (socketA as any)._peer = undefined;
      const result = socketA.emit('test');

      expect(result).toBe(false);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('No peer connected'),
      );

      consoleWarnSpy.mockRestore();
    });

    it('should handle errors in listeners gracefully', () => {
      const [socketA, socketB] = createSocketPair();
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const errorHandler = vi.fn(() => {
        throw new Error('Handler error');
      });
      const normalHandler = vi.fn();

      socketB.on('test', errorHandler);
      socketB.on('test', normalHandler);

      socketA.emit('test');

      expect(errorHandler).toHaveBeenCalled();
      expect(normalHandler).toHaveBeenCalled(); // Should still be called
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error in listener'),
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('once', () => {
    it('should trigger listener only once', () => {
      const [socketA, socketB] = createSocketPair();

      const handler = vi.fn();
      socketB.once('test', handler);

      socketA.emit('test', 'value1');
      socketA.emit('test', 'value2');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('value1');
    });

    it('should handle errors in once listeners gracefully', () => {
      const [socketA, socketB] = createSocketPair();
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const errorHandler = vi.fn(() => {
        throw new Error('Once handler error');
      });

      socketB.once('test', errorHandler);
      socketA.emit('test');

      expect(errorHandler).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error in once listener'),
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });

    it('should support multiple once listeners', () => {
      const [socketA, socketB] = createSocketPair();

      const handler1 = vi.fn();
      const handler2 = vi.fn();

      socketB.once('test', handler1);
      socketB.once('test', handler2);

      socketA.emit('test', 'data');

      expect(handler1).toHaveBeenCalledWith('data');
      expect(handler2).toHaveBeenCalledWith('data');
    });
  });

  describe('off', () => {
    it('should remove specific listener', () => {
      const [socketA, socketB] = createSocketPair();

      const handler1 = vi.fn();
      const handler2 = vi.fn();

      socketB.on('test', handler1);
      socketB.on('test', handler2);

      socketB.off('test', handler1);

      socketA.emit('test');

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should remove all listeners for event when no listener specified', () => {
      const [socketA, socketB] = createSocketPair();

      const handler1 = vi.fn();
      const handler2 = vi.fn();

      socketB.on('test', handler1);
      socketB.on('test', handler2);

      socketB.off('test');

      socketA.emit('test');

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });

    it('should remove once listeners', () => {
      const [socketA, socketB] = createSocketPair();

      const handler = vi.fn();
      socketB.once('test', handler);

      socketB.off('test', handler);

      socketA.emit('test');

      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle removing non-existent listener', () => {
      const [socketA, socketB] = createSocketPair();

      const handler = vi.fn();

      // Should not throw
      socketB.off('test', handler);
      socketA.emit('test');

      expect(handler).not.toHaveBeenCalled();
    });

    it('should return this for chaining', () => {
      const [, socketB] = createSocketPair();

      const handler = vi.fn();
      const result = socketB.off('test', handler);

      expect(result).toBe(socketB);
    });
  });

  describe('removeAllListeners', () => {
    it('should remove all listeners for specific event', () => {
      const [socketA, socketB] = createSocketPair();

      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const otherHandler = vi.fn();

      socketB.on('test', handler1);
      socketB.once('test', handler2);
      socketB.on('other', otherHandler);

      socketB.removeAllListeners('test');

      socketA.emit('test');
      socketA.emit('other');

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
      expect(otherHandler).toHaveBeenCalled();
    });

    it('should remove all listeners for all events when no event specified', () => {
      const [socketA, socketB] = createSocketPair();

      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      socketB.on('event1', handler1);
      socketB.on('event2', handler2);
      socketB.once('event3', handler3);

      socketB.removeAllListeners();

      socketA.emit('event1');
      socketA.emit('event2');
      socketA.emit('event3');

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
      expect(handler3).not.toHaveBeenCalled();
    });

    it('should return this for chaining', () => {
      const [, socketB] = createSocketPair();

      const result = socketB.removeAllListeners();

      expect(result).toBe(socketB);
    });
  });

  describe('listenerCount', () => {
    it('should count regular listeners', () => {
      const [, socketB] = createSocketPair();

      socketB.on('test', () => {});
      socketB.on('test', () => {});

      expect(socketB.listenerCount('test')).toBe(2);
    });

    it('should count once listeners', () => {
      const [, socketB] = createSocketPair();

      socketB.once('test', () => {});
      socketB.once('test', () => {});

      expect(socketB.listenerCount('test')).toBe(2);
    });

    it('should count both regular and once listeners', () => {
      const [, socketB] = createSocketPair();

      socketB.on('test', () => {});
      socketB.once('test', () => {});
      socketB.on('test', () => {});

      expect(socketB.listenerCount('test')).toBe(3);
    });

    it('should return 0 for event with no listeners', () => {
      const [, socketB] = createSocketPair();

      expect(socketB.listenerCount('nonexistent')).toBe(0);
    });
  });

  describe('listeners', () => {
    it('should return array of all listeners for event', () => {
      const [, socketB] = createSocketPair();

      const handler1 = () => {};
      const handler2 = () => {};
      const handler3 = () => {};

      socketB.on('test', handler1);
      socketB.once('test', handler2);
      socketB.on('test', handler3);

      const listeners = socketB.listeners('test');

      expect(listeners).toHaveLength(3);
      expect(listeners).toContain(handler1);
      expect(listeners).toContain(handler2);
      expect(listeners).toContain(handler3);
    });

    it('should return empty array for event with no listeners', () => {
      const [, socketB] = createSocketPair();

      const listeners = socketB.listeners('nonexistent');

      expect(listeners).toEqual([]);
    });
  });

  describe('eventNames', () => {
    it('should return all event names with listeners', () => {
      const [, socketB] = createSocketPair();

      socketB.on('event1', () => {});
      socketB.once('event2', () => {});
      socketB.on('event3', () => {});

      const eventNames = socketB.eventNames();

      expect(eventNames).toHaveLength(3);
      expect(eventNames).toContain('event1');
      expect(eventNames).toContain('event2');
      expect(eventNames).toContain('event3');
    });

    it('should return empty array when no listeners registered', () => {
      const [, socketB] = createSocketPair();

      const eventNames = socketB.eventNames();

      expect(eventNames).toEqual([]);
    });

    it('should not duplicate event names with both on and once listeners', () => {
      const [, socketB] = createSocketPair();

      socketB.on('test', () => {});
      socketB.once('test', () => {});

      const eventNames = socketB.eventNames();

      expect(eventNames).toHaveLength(1);
      expect(eventNames).toContain('test');
    });
  });

  describe('symbol event names', () => {
    it('should support symbol event names', () => {
      const [socketA, socketB] = createSocketPair();

      const testSymbol = Symbol('test');
      const handler = vi.fn();

      socketB.on(testSymbol, handler);
      socketA.emit(testSymbol, 'data');

      expect(handler).toHaveBeenCalledWith('data');
    });

    it('should count symbol event listeners', () => {
      const [, socketB] = createSocketPair();

      const testSymbol = Symbol('test');
      socketB.on(testSymbol, () => {});

      expect(socketB.listenerCount(testSymbol)).toBe(1);
    });

    it('should include symbols in eventNames', () => {
      const [, socketB] = createSocketPair();

      const testSymbol = Symbol('test');
      socketB.on(testSymbol, () => {});
      socketB.on('stringEvent', () => {});

      const eventNames = socketB.eventNames();

      expect(eventNames).toHaveLength(2);
      expect(eventNames).toContain(testSymbol);
      expect(eventNames).toContain('stringEvent');
    });
  });

  describe('chaining', () => {
    it('should support method chaining', () => {
      const [, socketB] = createSocketPair();

      const result = socketB
        .on('test1', () => {})
        .once('test2', () => {})
        .off('test3')
        .removeAllListeners('test4');

      expect(result).toBe(socketB);
    });
  });

  describe('edge cases', () => {
    it('should handle connect without peer', () => {
      const [socketA] = createSocketPair();
      (socketA as any)._peer = undefined;

      const connectHandler = vi.fn();
      socketA.on('connect', connectHandler);

      socketA.connect();

      expect(socketA.connected).toBe(true);
      expect(connectHandler).toHaveBeenCalledTimes(1);
    });

    it('should handle disconnect without peer', () => {
      const [socketA] = createSocketPair();
      socketA.connect();
      (socketA as any)._peer = undefined;

      const disconnectHandler = vi.fn();
      socketA.on('disconnect', disconnectHandler);

      socketA.disconnect();

      expect(socketA.disconnected).toBe(true);
      expect(disconnectHandler).toHaveBeenCalledTimes(1);
    });

    it('should handle off with listener when regularListeners is undefined', () => {
      const [, socketB] = createSocketPair();

      const handler = vi.fn();
      // Try to remove a listener that was never added
      socketB.off('nonexistent', handler);

      expect(socketB.listenerCount('nonexistent')).toBe(0);
    });

    it('should handle off with listener when listener not found in array', () => {
      const [, socketB] = createSocketPair();

      const handler1 = vi.fn();
      const handler2 = vi.fn();

      socketB.on('test', handler1);
      socketB.off('test', handler2); // Remove different handler

      expect(socketB.listenerCount('test')).toBe(1);
    });

    it('should handle off with once listener when listener not found in array', () => {
      const [, socketB] = createSocketPair();

      const handler1 = vi.fn();
      const handler2 = vi.fn();

      socketB.once('test', handler1);
      socketB.off('test', handler2); // Remove different handler

      expect(socketB.listenerCount('test')).toBe(1);
    });
  });

  describe('bidirectional communication', () => {
    it('should allow bidirectional message passing', () => {
      const [socketA, socketB] = createSocketPair();

      const handlerA = vi.fn((data: string) => {
        expect(data).toBe('ping');
        socketA.emit('pong', 'response');
      });

      const handlerB = vi.fn((data: string) => {
        expect(data).toBe('response');
      });

      socketA.on('ping', handlerA);
      socketB.on('pong', handlerB);

      socketB.emit('ping', 'ping');

      expect(handlerA).toHaveBeenCalled();
      expect(handlerB).toHaveBeenCalled();
    });

    it('should maintain separate listener sets for each socket', () => {
      const [socketA, socketB] = createSocketPair();

      const handlerA = vi.fn();
      const handlerB = vi.fn();

      socketA.on('event', handlerA);
      socketB.on('event', handlerB);

      // A emits to B
      socketA.emit('event', 'from A');
      expect(handlerA).not.toHaveBeenCalled();
      expect(handlerB).toHaveBeenCalledWith('from A');

      handlerA.mockClear();
      handlerB.mockClear();

      // B emits to A
      socketB.emit('event', 'from B');
      expect(handlerA).toHaveBeenCalledWith('from B');
      expect(handlerB).not.toHaveBeenCalled();
    });
  });
});
