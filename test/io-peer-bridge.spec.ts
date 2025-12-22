// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { ContentType, Rljson, TableCfg } from '@rljson/rljson';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IoPeerBridge } from '../src/io-peer-bridge.ts';
import { Io } from '../src/io.ts';
import { SocketMock } from '../src/socket-mock.ts';


// Mock Io implementation for testing
class MockIo implements Io {
  dump(): Promise<Rljson> {
    throw new Error('Method not implemented.');
  }
  contentType(): Promise<ContentType> {
    throw new Error('Method not implemented.');
  }
  rawTableCfgs(): Promise<TableCfg[]> {
    throw new Error('Method not implemented.');
  }
  readRows(): Promise<Rljson> {
    throw new Error('Method not implemented.');
  }
  rowCount(): Promise<number> {
    throw new Error('Method not implemented.');
  }
  isOpen = false;

  async init(): Promise<void> {
    this.isOpen = true;
  }

  async isReady(): Promise<void> {}

  async close(): Promise<void> {
    this.isOpen = false;
  }

  async tableExists(table: string): Promise<boolean> {
    return table === 'existingTable';
  }

  async createOrExtendTable(): Promise<void> {}

  async write(request: any): Promise<any> {
    return { success: true, data: request };
  }

  async writeMany(request: any): Promise<any> {
    return { success: true, count: request.length };
  }

  async readMany(): Promise<any> {
    return { data: [], count: 0 };
  }

  async read(): Promise<any> {
    return { data: { id: 1, name: 'test' } };
  }

  async dumpTable(request: any): Promise<any> {
    return { table: request.table, rows: [] };
  }

  async tableCfgs(): Promise<any[]> {
    return [{ key: 'table1' }, { key: 'table2' }];
  }

  async tableCfg(table: string): Promise<any> {
    return { key: table, columns: [] };
  }

  async deleteTable(): Promise<void> {}

  async clearTable(): Promise<void> {}

  async dropAllTables(): Promise<void> {}
}

describe('IoPeerBridge', () => {
  let io: MockIo;
  let socket: SocketMock;
  let bridge: IoPeerBridge;

  beforeEach(() => {
    io = new MockIo();
    socket = new SocketMock();
    bridge = new IoPeerBridge(io, socket);
  });

  describe('constructor', () => {
    it('should create an instance with io and socket', () => {
      expect(bridge).toBeInstanceOf(IoPeerBridge);
      expect(bridge.io).toBe(io);
      expect(bridge.socket).toBe(socket);
    });
  });

  describe('start()', () => {
    it('should register connect and disconnect handlers', () => {
      const connectSpy = vi.spyOn(socket, 'on');
      bridge.start();

      expect(connectSpy).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(connectSpy).toHaveBeenCalledWith(
        'disconnect',
        expect.any(Function),
      );
    });

    it('should automatically register all Io methods', () => {
      const onSpy = vi.spyOn(socket, 'on');
      bridge.start();

      const ioMethods = [
        'init',
        'isReady',
        'close',
        'tableExists',
        'createOrExtendTable',
        'write',
        'readRows',
        'rowCount',
        'dumpTable',
        'dump',
        'contentType',
        'rawTableCfgs',
      ];

      for (const method of ioMethods) {
        expect(onSpy).toHaveBeenCalledWith(method, expect.any(Function));
      }
    });
  });

  describe('stop()', () => {
    it('should remove all event handlers', () => {
      bridge.start();
      const offSpy = vi.spyOn(socket, 'off');

      bridge.stop();

      expect(offSpy).toHaveBeenCalled();
    });

    it('should clear the event handlers map', () => {
      bridge.start();
      bridge.stop();

      // Verify handlers are cleared by checking internal state
      expect(bridge['_eventHandlers'].size).toBe(0);
    });
  });

  describe('registerEvent()', () => {
    it('should register a custom event handler', () => {
      const onSpy = vi.spyOn(socket, 'on');
      bridge.registerEvent('customEvent');

      expect(onSpy).toHaveBeenCalledWith('customEvent', expect.any(Function));
    });

    it('should map event name to different io method name', () => {
      const onSpy = vi.spyOn(socket, 'on');
      bridge.registerEvent('customEvent', 'init');

      expect(onSpy).toHaveBeenCalledWith('customEvent', expect.any(Function));
    });
  });

  describe('registerEvents()', () => {
    it('should register multiple events at once', () => {
      const onSpy = vi.spyOn(socket, 'on');
      const events = ['event1', 'event2', 'event3'];

      bridge.registerEvents(events);

      for (const event of events) {
        expect(onSpy).toHaveBeenCalledWith(event, expect.any(Function));
      }
    });
  });

  describe('unregisterEvent()', () => {
    it('should remove a specific event handler', () => {
      bridge.start();
      const offSpy = vi.spyOn(socket, 'off');

      bridge.unregisterEvent('init');

      expect(offSpy).toHaveBeenCalledWith('init', expect.any(Function));
    });

    it('should not throw if event does not exist', () => {
      expect(() => {
        bridge.unregisterEvent('nonExistentEvent');
      }).not.toThrow();
    });
  });

  describe('emitToSocket()', () => {
    it('should emit events through the socket', () => {
      const emitSpy = vi.spyOn(socket, 'emit');
      const testData = { message: 'hello' };

      bridge.emitToSocket('testEvent', testData);

      expect(emitSpy).toHaveBeenCalledWith('testEvent', testData);
    });

    it('should emit multiple arguments', () => {
      const emitSpy = vi.spyOn(socket, 'emit');

      bridge.emitToSocket('testEvent', 'arg1', 'arg2', 'arg3');

      expect(emitSpy).toHaveBeenCalledWith('testEvent', 'arg1', 'arg2', 'arg3');
    });
  });

  describe('callIoAndEmit()', () => {
    it('should call io method and emit result', async () => {
      const emitSpy = vi.spyOn(socket, 'emit');

      await bridge.callIoAndEmit('tableCfgs', 'tableCfgsResult');

      expect(emitSpy).toHaveBeenCalledWith(
        'tableCfgsResult',
        [{ key: 'table1' }, { key: 'table2' }],
        null,
      );
    });

    it('should emit error if io method fails', async () => {
      vi.spyOn(io, 'init').mockRejectedValueOnce(new Error('Init failed'));
      const emitSpy = vi.spyOn(socket, 'emit');

      await bridge.callIoAndEmit('init', 'initResult');

      expect(emitSpy).toHaveBeenCalledWith(
        'initResult',
        null,
        expect.objectContaining({ message: 'Init failed' }),
      );
    });

    it('should emit error if method does not exist', async () => {
      const emitSpy = vi.spyOn(socket, 'emit');

      await bridge.callIoAndEmit('nonExistentMethod', 'result');

      expect(emitSpy).toHaveBeenCalledWith(
        'result',
        null,
        expect.objectContaining({
          message: expect.stringContaining('not found on Io instance'),
        }),
      );
    });

    it('should pass arguments to io method', async () => {
      const readSpy = vi.spyOn(io, 'read');
      const emitSpy = vi.spyOn(socket, 'emit');
      const request = { table: 'test', id: 1 };

      await bridge.callIoAndEmit('read', 'readResult', request);

      expect(readSpy).toHaveBeenCalledWith(request);
      expect(emitSpy).toHaveBeenCalledWith(
        'readResult',
        { data: { id: 1, name: 'test' } },
        null,
      );
    });
  });

  describe('isConnected', () => {
    it('should return socket connection state', () => {
      expect(bridge.isConnected).toBe(false);

      socket.connect();
      expect(bridge.isConnected).toBe(true);

      socket.disconnect();
      expect(bridge.isConnected).toBe(false);
    });
  });

  describe('connection events', () => {
    it('should handle connection events', () => {
      let connectCalled = false;
      let disconnectCalled = false;

      // Override handlers to test
      bridge['_handleConnect'] = () => {
        connectCalled = true;
      };
      bridge['_handleDisconnect'] = () => {
        disconnectCalled = true;
      };

      bridge.start();
      socket.connect();
      socket.disconnect();

      expect(connectCalled).toBe(true);
      expect(disconnectCalled).toBe(true);
    });
  });
});
