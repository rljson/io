// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { exampleTableCfg, TableCfg } from '@rljson/rljson';

import { beforeEach, describe, expect, it } from 'vitest';

import { Io, IoMem, IoMulti, IoMultiIo, IoPeer, PeerSocketMock } from '../src';


const createExampleTableWithData = async (
  key: string,
  prefix: string,
  io: Io,
) => {
  // Register a new table config and generate the table
  const tableCfg: TableCfg = exampleTableCfg({ key });
  try {
    await io.createOrExtendTable({ tableCfg: tableCfg });
  } catch (error) {
    throw error; // Re-throw the error after logging it
  }

  await io.write({
    data: {
      [key]: {
        _data: [
          { a: `${key}Value${prefix}0`, b: 0 },
          { a: `${key}Value${prefix}1`, b: 1 },
          { a: `${key}Value${prefix}2`, b: 2 },
        ],
        _hash: '',
        _type: 'components',
      },
    },
  });
};

describe('IoMulti', () => {
  let dumpableA: Io;
  let dumpableB: Io;
  let writeableA: Io;
  let writeableB: Io;
  let readableA: Io;
  let readableB: Io;
  let ios: Array<IoMultiIo>;
  let ioMulti: Io;

  beforeEach(async () => {
    const ioReadableAPeerMem = new IoMem();
    await ioReadableAPeerMem.init();
    const ioReadableAPeerSocket = new PeerSocketMock(ioReadableAPeerMem);
    readableA = new IoPeer(ioReadableAPeerSocket);
    await readableA.init();
    await createExampleTableWithData('readableTable', 'A', readableA);

    const ioReadableBPeerMem = new IoMem();
    await ioReadableBPeerMem.init();
    const ioReadableBPeerSocket = new PeerSocketMock(ioReadableBPeerMem);
    readableB = new IoPeer(ioReadableBPeerSocket);
    await readableB.init();
    await createExampleTableWithData('readableTable', 'B', readableB);

    writeableA = new IoMem();
    await writeableA.init();
    await createExampleTableWithData('writeableTable', 'A', writeableA);

    writeableB = new IoMem();
    await writeableB.init();
    await createExampleTableWithData('writeableTable', 'B', writeableB);

    dumpableA = new IoMem();
    await dumpableA.init();
    await createExampleTableWithData('dumpableTable', 'A', dumpableA);

    dumpableB = new IoMem();
    await dumpableB.init();
    await createExampleTableWithData('dumpableTable', 'B', dumpableB);

    ios = [
      { io: dumpableA, priority: 1, read: true, write: false, dump: true },
      { io: dumpableB, priority: 1, read: true, write: false, dump: true },
      { io: writeableA, priority: 2, read: true, write: true, dump: true },
      { io: writeableB, priority: 2, read: true, write: true, dump: true },
      { io: readableA, priority: 3, read: true, write: false, dump: false },
      { io: readableB, priority: 3, read: true, write: false, dump: false },
    ];

    ioMulti = new IoMulti(ios);
  });

  it('should be defined', async () => {
    expect(ioMulti).toBeDefined();
  });

  it('should throw error if underlying ios are not initialized', async () => {
    const uninitializedIo = new IoMem();
    const ioMultiUninitialized = new IoMulti([
      { io: uninitializedIo, priority: 1, read: true, write: true, dump: true },
    ]);

    await expect(ioMultiUninitialized.init()).rejects.toThrowError(
      'All underlying Io instances must be initialized before initializing IoMulti',
    );
  });

  it('should dump from dumpable ios and merge the results', async () => {
    const dump = await ioMulti.dump();
    expect(dump).toBeDefined();
    expect(dump['dumpableTable']._data.length).toBe(6);
    expect(
      dump['dumpableTable']._data.map((r) => (r as any)['a']).sort(),
    ).toEqual([
      'dumpableTableValueA0',
      'dumpableTableValueA1',
      'dumpableTableValueA2',
      'dumpableTableValueB0',
      'dumpableTableValueB1',
      'dumpableTableValueB2',
    ]);
  });

  it('should read rows from readable ios and return first match', async () => {
    const { ['readableTable']: rows } = await ioMulti.readRows({
      table: 'readableTable',
      where: {},
    });
    expect(rows).toBeDefined();
    expect(Array.isArray(rows._data)).toBe(true);
    expect(rows._data.length).toBe(3);
    expect(rows._data.map((r) => (r as any)['a']).sort()).toEqual([
      'readableTableValueA0',
      'readableTableValueA1',
      'readableTableValueA2',
    ]);
  });

  it('should write to writeable ios in parallel', async () => {
    await ioMulti.write({
      data: {
        writeableTable: {
          _data: [
            { a: 'newValue0', b: 10 },
            { a: 'newValue1', b: 11 },
          ],
          _hash: '',
          _type: 'components',
        },
      },
    });

    for (const writeable of [writeableA, writeableB]) {
      const { ['writeableTable']: rows } = await writeable.readRows({
        table: 'writeableTable',
        where: {},
      });
      expect(rows).toBeDefined();
      expect(Array.isArray(rows._data)).toBe(true);
      expect(rows._data.length).toBe(5); // 3 original + 2 new
      const aValues = rows._data.map((r) => (r as any)['a']);
      expect(aValues).toContain('newValue0');
      expect(aValues).toContain('newValue1');
    }
  });

  it('should count rows across all ios', async () => {
    const rowCount = await ioMulti.rowCount('dumpableTable');
    expect(rowCount).toBe(6); // 3 from dumpableA + 3 from dumpableB
  });

  it('should throw error when trying to row count on nonexisting table', async () => {
    await expect(ioMulti.rowCount('nonExistingTable')).rejects.toThrowError(
      'Table "nonExistingTable" not found',
    );
  });

  it('should create or extend table in writeable ios', async () => {
    const newTableCfg: TableCfg = exampleTableCfg({ key: 'newTable' });
    await ioMulti.createOrExtendTable({ tableCfg: newTableCfg });

    for (const writeable of [writeableA, writeableB]) {
      const exists = await writeable.tableExists('newTable');
      expect(exists).toBe(true);
    }
  });

  it('throw error if trying to read contentType of nonexistent table', async () => {
    await expect(
      ioMulti.contentType({ table: 'nonExistingTable' }),
    ).rejects.toThrowError('Table "nonExistingTable" not found');
  });
});
