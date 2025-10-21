// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { hsh } from '@rljson/hash';
import { bakeryExample, TableCfg } from '@rljson/rljson';

import EventEmitter from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Io } from '../src/io';
import { IoServer } from '../src/io-server';
import { IoTools } from '../src/io-tools';
import { Socket } from '../src/socket';

describe('IoServer', () => {
  let ioTools: IoTools;
  let io: Io;
  let socket: Socket;
  let server: IoServer;

  beforeEach(async () => {
    ioTools = await IoTools.example();
    io = ioTools.io;

    // Add example data
    const exampleTableCfg: TableCfg = {
      key: 'nutritionalValues',
      type: 'components',
      columns: [
        { key: '_hash', type: 'string', titleShort: 'Hash', titleLong: 'Hash' },
        {
          key: 'id',
          type: 'string',
          titleShort: 'ID',
          titleLong: 'Identifier',
        },
        {
          key: 'energy',
          type: 'number',
          titleShort: 'Energy',
          titleLong: 'Energy in kcal',
        },
        {
          key: 'fat',
          type: 'number',
          titleShort: 'Fat',
          titleLong: 'Fat in grams',
        },
        {
          key: 'protein',
          type: 'number',
          titleShort: 'Protein',
          titleLong: 'Protein in grams',
        },
        {
          key: 'carbohydrates',
          type: 'number',
          titleShort: 'Carbs',
          titleLong: 'Carbohydrates in grams',
        },
      ],
      isHead: false,
      isRoot: false,
      isShared: true,
    };
    const exampleData = bakeryExample().nutritionalValues;

    await io.createOrExtendTable({ tableCfg: exampleTableCfg });
    await io.write({ data: { nutritionalValues: exampleData } });

    // Create server with mock socket
    // Using EventEmitter as Socket mock
    socket = new EventEmitter() as any as Socket;

    server = new IoServer(io);

    server.addSocket(socket);
  });

  it('should be defined', async () => {
    expect(server).toBeDefined();
    expect((server as any)._sockets.length).toBe(1);
  });

  it('should isOpen', async () => {
    const isOpen = await vi.waitFor(
      () =>
        new Promise((r) => {
          socket.emit('isOpen', (data: any) => {
            r(data);
          });
        }),
      { timeout: 5000 },
    );

    expect(isOpen).toBe(true);
  });

  it('should isReady', async () => {
    const isReady = await vi.waitFor(
      () =>
        new Promise((r) => {
          socket.emit('isReady', (data: any) => {
            r(data);
          });
        }),
      { timeout: 5000 },
    );

    expect(isReady).toBe(undefined);
  });

  it('should init', async () => {
    const init = await vi.waitFor(
      () =>
        new Promise((r) => {
          socket.emit('init', (data: any) => {
            r(data);
          });
        }),
      { timeout: 5000 },
    );

    expect(init).toBe(undefined);
  });

  it('should close', async () => {
    expect(io.isOpen).toBe(true);

    await vi.waitFor(
      () =>
        new Promise((r, j) => {
          socket.emit('close', (err: any) => {
            if (err) {
              j(err);
            } else {
              r(true);
            }
          });
        }),
      { timeout: 5000 },
    );

    expect(io.isOpen).toBe(false);
  });

  it('should add socket', async () => {
    expect((server as any)._sockets.length).toBe(1);
    await server.addSocket(socket);
    expect((server as any)._sockets.length).toBe(2);
  });

  it('should remove socket', async () => {
    expect((server as any)._sockets.length).toBe(1);
    server.removeSocket(socket);
    expect((server as any)._sockets.length).toBe(0);
  });

  it('should dump', async () => {
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

  it('should dumpTable', async () => {
    const dumpTable = await vi.waitFor(
      () =>
        new Promise((r) => {
          socket.emit(
            'dumpTable',
            { table: 'nutritionalValues' },
            (data: any) => {
              r(data);
            },
          );
        }),
      { timeout: 5000 },
    );

    expect(dumpTable).toEqual(
      await io.dumpTable({ table: 'nutritionalValues' }),
    );
  });

  it('should return error on wrong dumpTable call', async () => {
    const error: Error = await vi.waitFor(
      () =>
        new Promise((r) => {
          socket.emit(
            'dumpTable',
            { table: 'unknown' },
            (data: any, error: Error) => {
              if (error) r(error);
              r(data);
            },
          );
        }),
      { timeout: 5000 },
    );

    expect(error.message).toEqual('Table "unknown" not found');
  });

  it('should get contentType', async () => {
    const contentType = await vi.waitFor(
      () =>
        new Promise((r) => {
          socket.emit(
            'contentType',
            { table: 'nutritionalValues' },
            (data: any) => {
              r(data);
            },
          );
        }),
      { timeout: 5000 },
    );

    expect(contentType).toEqual(
      await io.contentType({ table: 'nutritionalValues' }),
    );
  });

  it('should tableExists', async () => {
    const exists = await vi.waitFor(
      () =>
        new Promise((r) => {
          socket.emit('tableExists', 'nutritionalValues', (data: any) => {
            r(data);
          });
        }),
      { timeout: 5000 },
    );

    expect(exists).toEqual(await io.tableExists('nutritionalValues'));
  });

  it('should createOrExtendTable', async () => {
    const newTableCfg: TableCfg = {
      key: 'newTable',
      type: 'components',
      columns: [
        { key: '_hash', type: 'string', titleShort: 'Hash', titleLong: 'Hash' },
        {
          key: 'id',
          type: 'string',
          titleShort: 'ID',
          titleLong: 'Identifier',
        },
        {
          key: 'value',
          type: 'number',
          titleShort: 'Value',
          titleLong: 'Some Value',
        },
      ],
      isHead: false,
      isRoot: false,
      isShared: true,
    };

    await vi.waitFor(
      () =>
        new Promise((r, j) => {
          socket.emit(
            'createOrExtendTable',
            { tableCfg: newTableCfg },
            (err: any) => {
              if (err) {
                j(err);
              } else {
                r(true);
              }
            },
          );
        }),
      { timeout: 5000 },
    );

    const exists = await io.tableExists('newTable');
    expect(exists).toBe(true);
  });

  it('should rawTableCfgs', async () => {
    const rawTableCfgs = await vi.waitFor(
      () =>
        new Promise((r) => {
          socket.emit('rawTableCfgs', (data: any) => {
            r(data);
          });
        }),
      { timeout: 5000 },
    );

    expect(rawTableCfgs).toEqual(await io.rawTableCfgs());
  });

  it('should write', async () => {
    const newData = {
      _data: [
        hsh({
          id: 'bread',
          energy: 265,
          fat: 3.2,
          protein: 9,
          carbohydrates: 49,
        }),
        hsh({
          id: 'croissant',
          energy: 406,
          fat: 21,
          protein: 8,
          carbohydrates: 45,
        }),
      ],
    };

    await vi.waitFor(
      () =>
        new Promise((r, j) => {
          socket.emit(
            'write',
            { data: { nutritionalValues: newData } },
            (err: any) => {
              if (err) {
                j(err);
              } else {
                r(true);
              }
            },
          );
        }),
      { timeout: 5000 },
    );

    const dump = await io.dump();
    expect(dump.nutritionalValues._data.length).toBe(4);
  });

  it('should readRows', async () => {
    const rows = await vi.waitFor(
      () =>
        new Promise((r) => {
          socket.emit(
            'readRows',
            { table: 'nutritionalValues', where: { id: 'flour' } },
            (data: any) => {
              r(data);
            },
          );
        }),
      { timeout: 5000 },
    );

    expect(rows).toBeDefined();
    expect(rows).toEqual(
      await io.readRows({ table: 'nutritionalValues', where: { id: 'flour' } }),
    );
  });

  it('should rowCount', async () => {
    const count = await vi.waitFor(
      () =>
        new Promise((r) => {
          socket.emit('rowCount', 'nutritionalValues', (data: any) => {
            r(data);
          });
        }),
      { timeout: 5000 },
    );

    expect(count).toBeDefined();
    expect(count).toEqual(await io.rowCount('nutritionalValues'));
  });
});
