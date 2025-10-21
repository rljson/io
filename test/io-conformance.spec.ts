// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { hip, hsh, rmhsh } from '@rljson/hash';
import {
  addColumnsToTableCfg,
  exampleTableCfg,
  Rljson,
  TableCfg,
  TableType,
} from '@rljson/rljson';

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import { Io, IoTestSetup, IoTools } from '../src';

import {
  testMemSetup,
  testPeerServerSetup,
  testPeerSetup,
} from './io-conformance.setup.ts';
import { expectGolden, ExpectGoldenOptions } from './setup/goldens.ts';

const ego: ExpectGoldenOptions = {
  npmUpdateGoldensEnabled: true,
};

const setups: Record<string, IoTestSetup> = {
  IoMem: testMemSetup(),
  IoPeer: testPeerSetup(),
  IoPeerServer: testPeerServerSetup(),
};

export const runIoConformanceTests = (
  setupName: string,
  ioTestSetup: IoTestSetup,
) => {
  return describe('Io Conformance - ' + setupName, async () => {
    let io: Io;
    let ioTools: IoTools;
    let setup: IoTestSetup;

    beforeAll(async () => {
      setup = ioTestSetup;
      await setup.beforeAll();
    });

    beforeEach(async () => {
      await setup.beforeEach();
      io = setup.io;
      await io.init();
      await io.isReady();
      ioTools = new IoTools(io);
    });

    afterEach(async () => {
      await io.close();
      await setup.afterEach();
    });

    afterAll(async () => {
      await setup.afterAll();
    });

    describe('isReady()', () => {
      it('should return a resolved promise', async () => {
        await io.isReady();
      });
    });

    describe('isOpen()', () => {
      it('should return false before init, true after and false after close', async () => {
        expect(io.isOpen).toBe(true);

        await io.close();
        expect(io.isOpen).toBe(false);
      });
    });

    const createExampleTable = async (key: string) => {
      // Register a new table config and generate the table
      const tableCfg: TableCfg = exampleTableCfg({ key });
      try {
        await io.createOrExtendTable({ tableCfg: tableCfg });
      } catch (error) {
        throw error; // Re-throw the error after logging it
      }
    };

    describe('tableCfgs table', () => {
      it('should be available after isReady() resolves', async () => {
        const dump = await io.dumpTable({ table: 'tableCfgs' });
        await expectGolden('io-conformance/tableCfgs.json', ego).toBe(dump);
      });
    });

    describe('tableCfgs()', () => {
      it('returns an rljson object containing the newest config for each table', async () => {
        //create four tables with two versions each
        const tableV0: TableCfg = {
          key: 'table0',
          type: 'components',
          isHead: false,
          isRoot: false,
          isShared: true,
          columns: [
            { key: '_hash', type: 'string' },
            { key: 'col0', type: 'string' },
          ],
        };

        const tableV1 = addColumnsToTableCfg(tableV0, [
          { key: 'col1', type: 'string' },
        ]);

        const tableV2 = addColumnsToTableCfg(tableV1, [
          { key: 'col2', type: 'string' },
        ]);

        await io.createOrExtendTable({ tableCfg: tableV0 });
        await io.createOrExtendTable({ tableCfg: tableV1 });
        await io.createOrExtendTable({ tableCfg: tableV2 });

        // Check the tableCfgs
        const actualTableCfgs = await ioTools.tableCfgs();

        await expectGolden('io-conformance/tableCfgs-1.json', ego).toBe(
          actualTableCfgs,
        );
      });
    });

    describe('rawTableCfgs()', () => {
      it('returns an array of all table configurations', async () => {
        //create four tables with two versions each
        const tableV0: TableCfg = {
          key: 'table0',
          type: 'components',
          isHead: false,
          isRoot: false,
          isShared: true,
          columns: [
            { key: '_hash', type: 'string' },
            { key: 'col0', type: 'string' },
          ],
        };

        const tableV1 = addColumnsToTableCfg(tableV0, [
          { key: 'col1', type: 'string' },
        ]);

        const tableV2 = addColumnsToTableCfg(tableV1, [
          { key: 'col2', type: 'string' },
        ]);

        await io.createOrExtendTable({ tableCfg: tableV0 });
        await io.createOrExtendTable({ tableCfg: tableV1 });
        await io.createOrExtendTable({ tableCfg: tableV2 });

        // Check the tableCfgs
        const actualTableCfgs = await io.rawTableCfgs();
        await expectGolden('io-conformance/rawTableCfgs.json', ego).toBe(
          actualTableCfgs,
        );
      });
    });

    describe('throws an error', async () => {
      it('if the hashes in the tableCfg are wrong', async () => {
        const tableCfg: TableCfg = hip(exampleTableCfg({ key: 'table1' }));
        tableCfg._hash = 'wrongHash';
        let message: string = '';

        await expect(
          io.createOrExtendTable({ tableCfg: tableCfg }),
        ).rejects.toThrow(
          'Hash "wrongHash" does not match the newly calculated one "9jZWK-5WPpnlQHCWSPg80D". ' +
            'Please make sure that all systems are producing the same hashes.',
        );

        try {
          await io.createOrExtendTable({ tableCfg: tableCfg });
        } catch (err: any) {
          message = err.message;
        }

        expect(message).toBe(
          'Hash "wrongHash" does not match the newly calculated one "9jZWK-5WPpnlQHCWSPg80D". ' +
            'Please make sure that all systems are producing the same hashes.',
        );
      });
    });

    describe('tableExists(tableKey)', () => {
      it('returns true if the table exists', async () => {
        await createExampleTable('table1');
        const exists = await io.tableExists('table1');
        expect(exists).toBe(true);
      });

      it('returns false if the table does not exist', async () => {
        const exists = await io.tableExists('nonexistentTable');
        expect(exists).toBe(false);
      });
    });

    describe('createOrExtendTable(request)', () => {
      let existing: TableCfg;
      beforeEach(async () => {
        existing = exampleTableCfg();
        await io.createOrExtendTable({ tableCfg: existing });
      });

      describe('throws an error', () => {
        it('if the hashes in the tableCfg are wrong', async () => {
          const tableCfg: TableCfg = hip(exampleTableCfg({ key: 'table' }));
          const rightHash = tableCfg._hash;
          tableCfg._hash = 'wrongHash';
          let message: string = '';
          try {
            await io.createOrExtendTable({ tableCfg: tableCfg });
          } catch (err: any) {
            message = err.message;
          }

          expect(message).toBe(
            `Hash "wrongHash" does not match the newly calculated one "${rightHash}". ` +
              'Please make sure that all systems are producing the same hashes.',
          );
        });

        it('when the update has invalid column types', async () => {
          const update = exampleTableCfg({
            ...existing,
            columns: [
              ...existing.columns,
              {
                key: 'x',
                type: 'unknown' as any,
              },
            ],
          });

          await expect(
            io.createOrExtendTable({ tableCfg: update }),
          ).rejects.toThrow(
            'Invalid table configuration: Column "x" of table "table" has an unsupported type "unknown"',
          );
        });

        it('when the update has deleted columns', async () => {
          const update = {
            ...existing,
            columns: [existing.columns[0], existing.columns[1]],
          };
          await expect(
            io.createOrExtendTable({ tableCfg: update }),
          ).rejects.toThrow(
            'Invalid update of table able "table": ' +
              'Columns must not be deleted. Deleted columns: b',
          );
        });

        it('when column keys have changed', async () => {
          const update = {
            ...existing,
            columns: [
              { ...existing.columns[0], key: '_hash' },
              { ...existing.columns[1], key: 'b' },
              { ...existing.columns[2], key: 'a' },
            ],
          };
          await expect(
            io.createOrExtendTable({ tableCfg: update }),
          ).rejects.toThrow(
            'Invalid update of table able "table": Column keys must not change! ' +
              'Column "a" was renamed into "b".',
          );
        });

        it('when column types have changed', async () => {
          const update = {
            ...existing,
            columns: [
              { ...existing.columns[0], type: 'string' },
              { ...existing.columns[1], type: 'boolean' },
              { ...existing.columns[2], type: 'number' },
            ],
          } as TableCfg;
          await expect(
            io.createOrExtendTable({ tableCfg: update }),
          ).rejects.toThrow(
            'Invalid update of table able "table": ' +
              'Column types must not change! ' +
              'Type of column "a" was changed from "string" to boolean.',
          );
        });
      });

      it('should add a table and a table config', async () => {
        const tablesFromConfig = async () => {
          const tables = await ioTools.tableCfgs();
          return tables.map((e) => e.key);
        };

        const physicalTables = async () => await ioTools.allTableKeys();

        // Create a first table
        await createExampleTable('table1');

        expect(await tablesFromConfig()).toEqual([
          'revisions',
          'table',
          'table1',
          'tableCfgs',
        ]);
        expect(await physicalTables()).toEqual([
          'revisions',
          'table',
          'table1',
          'tableCfgs',
        ]);

        // Create a second table
        await createExampleTable('table2');
        expect(await tablesFromConfig()).toEqual([
          'revisions',
          'table',
          'table1',
          'table2',
          'tableCfgs',
        ]);
        expect(await physicalTables()).toEqual([
          'revisions',
          'table',
          'table1',
          'table2',
          'tableCfgs',
        ]);
      });

      it('should add tables with foreign keys', async () => {
        const tableCfg1: TableCfg = exampleTableCfg({ key: 'table1' });
        // Create a first table
        const domTable = {
          ...tableCfg1,
          key: 'domTable',
        } as TableCfg;
        await io.createOrExtendTable({ tableCfg: domTable });

        // Create a second table
        const mainTable = {
          ...tableCfg1,
          key: 'mainTable',
          columns: [
            { ...tableCfg1.columns[0], type: 'string' },
            { ...tableCfg1.columns[1], type: 'boolean' },
            { ...tableCfg1.columns[2], key: 'domTableRef', type: 'string' },
          ],
        } as TableCfg;
        await io.createOrExtendTable({ tableCfg: mainTable });
      });

      it('should do nothing when the columns do not have changed', async () => {
        const exampleCfg: TableCfg = exampleTableCfg({ key: 'tableA' });
        await io.createOrExtendTable({ tableCfg: exampleCfg });

        // Check state before
        const dumpBefore = await io.dumpTable({ table: 'tableA' });

        // Add same table config again
        await io.createOrExtendTable({ tableCfg: exampleCfg });

        // Dump again, should be the same
        const dumpAfter = await io.dumpTable({ table: 'tableA' });
        expect(dumpBefore).toEqual(dumpAfter);
      });

      it('should extend an existing table', async () => {
        // Create a first table
        const tableCfg: TableCfg = exampleTableCfg({ key: 'tableA' });
        await io.createOrExtendTable({ tableCfg });
        await io.write({
          data: {
            tableA: {
              _type: 'components',
              _data: [{ a: 'hello', b: 5 }],
            },
          },
        });

        // Check the table content before
        const dump = rmhsh(await io.dumpTable({ table: 'tableA' }));
        const dumpExpected = {
          tableA: {
            _data: [
              {
                a: 'hello',
                b: 5,
              },
            ],
            _tableCfg: 'GUGis7DIUDWCLFUJQZwJQ1',
            _type: 'components',
          },
        };
        expect(dump).toEqual(dumpExpected);

        // Update the table by adding a new column
        const tableCfg2 = addColumnsToTableCfg(tableCfg, [
          {
            key: 'keyA1',
            type: 'string',
            titleShort: 'Key A1',
            titleLong: 'Key A1',
          },
          {
            key: 'keyA2',
            type: 'string',
            titleShort: 'Key A2',
            titleLong: 'Key A2',
          },
          {
            key: 'keyB2',
            type: 'string',
            titleShort: 'Key B2',
            titleLong: 'Key B2',
          },
        ]);

        await io.createOrExtendTable({ tableCfg: tableCfg2 });

        // Check the table contents after.
        const dump2 = rmhsh(await io.dumpTable({ table: 'tableA' }));

        // Only the hash of the table config has changed
        expect(dump.tableA._tableCfg).not.toEqual(dump2.tableA._tableCfg);

        const dumpExpected2 = {
          ...dumpExpected,
          tableA: {
            ...dumpExpected.tableA,
            _tableCfg: dump2.tableA._tableCfg,
          },
        };

        expect(dump2).toEqual(dumpExpected2);

        // Now add a new row adding
        await io.write({
          data: {
            tableA: {
              _type: 'components',
              _data: [{ keyA1: 'a1', keyA2: 'a2', keyB2: 'b2' }],
            },
          },
        });

        // Check the table contents after. It has an additional row.
        const dump3 = rmhsh(await io.dumpTable({ table: 'tableA' }));
        expect(dump3).toEqual({
          tableA: {
            _data: [
              {
                a: 'hello',
                b: 5,
              },
              {
                keyA1: 'a1',
                keyA2: 'a2',
                keyB2: 'b2',
              },
            ],
            _tableCfg: '73RBnYL3eR5SRPx7rMFiWN',
            _type: 'components',
          },
        });
      });
    });

    describe('write(request)', async () => {
      it('adds data to existing data', async () => {
        const exampleCfg: TableCfg = exampleTableCfg({ key: 'tableA' });
        const tableCfg: TableCfg = {
          ...exampleCfg,
          columns: [
            {
              key: '_hash',
              type: 'string',
              titleShort: 'Hash',
              titleLong: 'Hash',
            },
            {
              key: 'keyA1',
              type: 'string',
              titleShort: 'Key A1',
              titleLong: 'Key A1',
            },
            {
              key: 'keyA2',
              type: 'string',
              titleShort: 'Key A2',
              titleLong: 'Key A2',
            },
            {
              key: 'keyB2',
              type: 'string',
              titleShort: 'Key B2',
              titleLong: 'Key B2',
            },
          ],
        };

        await io.createOrExtendTable({ tableCfg });
        const allTableKeys = await ioTools.allTableKeys();
        expect(allTableKeys).toContain('tableA');

        expect('tableA').toBe(tableCfg.key);

        // Write a first item
        await io.write({
          data: {
            tableA: {
              _type: 'components',
              _data: [{ keyA2: 'a2' }],
            },
          },
        });

        expect(await io.rowCount('tableA')).toEqual(1);

        const dump = await io.dump();
        const items = (dump.tableA as TableType)._data;
        expect(items).toEqual([
          {
            _hash: 'apLP3I2XLnVm13umIZdVhV',
            keyA2: 'a2',
          },
        ]);

        // Write a second item
        await io.write({
          data: {
            tableA: {
              _type: 'components',
              _data: [{ keyB2: 'b2' }],
            },
          },
        });

        const dump2 = await io.dump();
        const items2 = (dump2.tableA as TableType)._data;
        expect(items2).toEqual([
          {
            _hash: 'apLP3I2XLnVm13umIZdVhV',
            keyA2: 'a2',
          },
          {
            _hash: 'oNNJMCE_2iycGPDyM_5_lp',
            keyB2: 'b2',
          },
        ]);
      });

      it('does not add the same data twice', async () => {
        const tableName = 'testTable';
        const exampleCfg: TableCfg = exampleTableCfg({ key: tableName });
        const tableCfg: TableCfg = {
          ...exampleCfg,
          columns: [
            {
              key: '_hash',
              type: 'string',
              titleShort: 'Hash',
              titleLong: 'Hash',
            },
            {
              key: 'string',
              type: 'string',
              titleShort: 'String',
              titleLong: 'String',
            },
            {
              key: 'number',
              type: 'number',
              titleShort: 'Number',
              titleLong: 'Number',
            },
            {
              key: 'null',
              type: 'string',
              titleShort: 'Null',
              titleLong: 'Null',
            },
            {
              key: 'boolean',
              type: 'boolean',
              titleShort: 'Boolean',
              titleLong: 'Boolean',
            },
            {
              key: 'array',
              type: 'jsonArray',
              titleShort: 'Array',
              titleLong: 'Array',
            },
            {
              key: 'object',
              type: 'json',
              titleShort: 'Object',
              titleLong: 'Object',
            },
          ],
        };

        await io.createOrExtendTable({ tableCfg });
        const allTableKeys = await ioTools.allTableKeys();
        expect(allTableKeys).toContain(tableName);
        expect(await ioTools.allColumnKeys(tableName)).toEqual([
          '_hash',
          'string',
          'number',
          'null',
          'boolean',
          'array',
          'object',
        ]);

        const rows = [
          {
            string: 'hello',
            number: 5,
            null: null,
            boolean: true,
            array: [1, 2, { a: 10 }],
            object: { a: 1, b: { c: 3 } },
          },
          {
            string: 'world',
            number: 6,
            null: null,
            boolean: true,
            array: [1, 2, { a: 10 }],
            object: { a: 1, b: 2 },
          },
        ];

        const testData: Rljson = {
          testTable: {
            _type: 'components',
            _data: rows,
          },
        };

        // Get row count before
        const rowCountBefore = await io.rowCount(tableName);
        expect(rowCountBefore).toEqual(0);

        // Write first two rows
        await io.write({ data: testData });
        const rowCountAfterFirstWrite = await io.rowCount(tableName);
        expect(rowCountAfterFirstWrite).toEqual(2);

        // Write the same item again
        await io.write({ data: testData });

        // Nothing changes because the data is the same
        const rowCountAfterSecondWrite = await io.rowCount(tableName);
        expect(rowCountAfterSecondWrite).toEqual(rowCountAfterFirstWrite);
      });

      describe('throws', () => {
        it('when table does not exist', async () => {
          await expect(
            io.write({
              data: {
                tableA: {
                  _type: 'components',
                  _data: [{ keyA2: 'a2' }],
                },
              },
            }),
          ).rejects.toThrow('The following tables do not exist: tableA');
        });
      });
    });

    describe('readRows({table, where})', async () => {
      describe('should return rows matching the where clause', async () => {
        beforeEach(async () => {
          const tableName = 'testTable';
          const exampleCfg: TableCfg = exampleTableCfg({ key: tableName });
          const tableCfg: TableCfg = {
            ...exampleCfg,
            columns: [
              {
                key: '_hash',
                type: 'string',
                titleShort: 'Hash',
                titleLong: 'Hash',
              },
              {
                key: 'string',
                type: 'string',
                titleShort: 'String',
                titleLong: 'String',
              },
              {
                key: 'number',
                type: 'number',
                titleShort: 'Number',
                titleLong: 'Number',
              },
              {
                key: 'null',
                type: 'string',
                titleShort: 'Null',
                titleLong: 'Null',
              },
              {
                key: 'boolean',
                type: 'boolean',
                titleShort: 'Boolean',
                titleLong: 'Boolean',
              },
              {
                key: 'array',
                type: 'jsonArray',
                titleShort: 'Array',
                titleLong: 'Array',
              },
              {
                key: 'object',
                type: 'json',
                titleShort: 'Object',
                titleLong: 'Object',
              },
            ],
          };

          await io.createOrExtendTable({ tableCfg });

          const testData: Rljson = {
            testTable: {
              _type: 'components',
              _data: [
                {
                  string: 'hello',
                  number: 5,
                  null: null,
                  boolean: true,
                  array: [1, 2, { a: 10 }],
                  object: { a: 1, b: { c: 3 } },
                },
                {
                  string: 'world',
                  number: 6,
                  null: null,
                  boolean: true,
                  array: [1, 2, { a: 10 }],
                  object: { a: 1, b: 2 },
                },
                {
                  string: 'third',
                  number: null,
                  null: 'test',
                  boolean: false,
                  array: [3, 4, { a: 10 }],
                  object: { a: 1, b: 2 },
                },
              ],
            },
          };
          await io.write({ data: testData });
        });

        it('with where searching string values', async () => {
          const result = rmhsh(
            await io.readRows({
              table: 'testTable',
              where: { string: 'hello' },
            }),
          );

          expect(result).toEqual({
            testTable: {
              _data: [
                {
                  array: [1, 2, { a: 10 }],
                  boolean: true,
                  number: 5,
                  object: {
                    a: 1,
                    b: {
                      c: 3,
                    },
                  },
                  string: 'hello',
                },
              ],
              _type: 'components',
            },
          });
        });

        it('with where searching number values', async () => {
          const result = rmhsh(
            await io.readRows({
              table: 'testTable',
              where: { number: 6 },
            }),
          );

          expect(result).toEqual({
            testTable: {
              _data: [
                {
                  array: [1, 2, { a: 10 }],
                  boolean: true,
                  number: 6,
                  object: { a: 1, b: 2 },
                  string: 'world',
                },
              ],
              _type: 'components',
            },
          });
        });

        it('with where searching null values', async () => {
          const result = rmhsh(
            await io.readRows({
              table: 'testTable',
              where: { null: null },
            }),
          );

          expect(result).toEqual({
            testTable: {
              _data: [
                {
                  array: [1, 2, { a: 10 }],
                  boolean: true,
                  number: 6,
                  object: { a: 1, b: 2 },
                  string: 'world',
                },
                {
                  array: [1, 2, { a: 10 }],
                  boolean: true,
                  number: 5,
                  object: { a: 1, b: { c: 3 } },
                  string: 'hello',
                },
              ],
              _type: 'components',
            },
          });
        });

        it('with where searching boolean values', async () => {
          const result = rmhsh(
            await io.readRows({
              table: 'testTable',
              where: { boolean: true },
            }),
          );

          expect(result).toEqual({
            testTable: {
              _data: [
                {
                  array: [1, 2, { a: 10 }],
                  boolean: true,
                  number: 6,
                  object: { a: 1, b: 2 },
                  string: 'world',
                },
                {
                  array: [1, 2, { a: 10 }],
                  boolean: true,
                  number: 5,
                  object: { a: 1, b: { c: 3 } },
                  string: 'hello',
                },
              ],
              _type: 'components',
            },
          });
        });

        it('with where searching array values', async () => {
          const result = rmhsh(
            await io.readRows({
              table: 'testTable',
              //where: { array: [1, 2, { a: 10 }] },
              where: {
                array: [1, 2, { a: 10, _hash: 'LeFJOCQVgToOfbUuKJQ-GO' }],
              },
            }),
          );

          expect(result).toEqual({
            testTable: {
              _data: [
                {
                  array: [1, 2, { a: 10 }],
                  boolean: true,
                  number: 6,
                  object: { a: 1, b: 2 },
                  string: 'world',
                },
                {
                  array: [1, 2, { a: 10 }],
                  boolean: true,
                  number: 5,
                  object: { a: 1, b: { c: 3 } },
                  string: 'hello',
                },
              ],

              _type: 'components',
            },
          });
        });

        it('with where searching object values', async () => {
          const result = rmhsh(
            await io.readRows({
              table: 'testTable',
              //where: { object: { a: 1, b: { c: 3 } } },
              where: {
                object: {
                  a: 1,
                  b: { c: 3, _hash: 'yrqcsGrHfad4G4u9fgcAxY' },
                  _hash: 'd-0fwNtdekpWJzLu4goUDI',
                },
              },
            }),
          );

          expect(result).toEqual({
            testTable: {
              _data: [
                {
                  array: [1, 2, { a: 10 }],
                  boolean: true,
                  number: 5,
                  object: { a: 1, b: { c: 3 } },
                  string: 'hello',
                },
              ],
              _type: 'components',
            },
          });
        });
      });

      it('should return an empty array if no rows match the where clause', async () => {
        await createExampleTable('testTable');

        await io.write({
          data: {
            testTable: {
              _data: [
                { a: 'value1', b: 2 },
                { a: 'value3', b: 4 },
              ],
              _hash: 'dth8Ear2g__PlkgIscPXwB',
              _type: 'components',
            },
          },
        });

        const result = await io.readRows({
          table: 'testTable',
          where: { a: 'nonexistent' },
        });

        expect(result).toEqual({
          testTable: {
            _data: [],
            _hash: 'tpbDwaQADV4jPexwWgCTBJ',
            _type: 'components',
          },
        });
      });

      it('should throw an error if the table does not exist', async () => {
        await expect(
          io.readRows({
            table: 'nonexistentTable',
            where: { column1: 'value1' },
          }),
        ).rejects.toThrow('Table "nonexistentTable" not found');
      });

      it('should throw an error if the where clause is invalid', async () => {
        await createExampleTable('testTable');

        await expect(
          io.readRows({
            table: 'testTable',
            where: { invalidColumn: 'value' },
          }),
        ).rejects.toThrow(
          'The following columns do not exist in table "testTable": invalidColumn.',
        );
      });
    });

    describe('rowCount(table)', () => {
      it('returns the number of rows in the table', async () => {
        await createExampleTable('table1');
        await createExampleTable('table2');
        await io.write({
          data: {
            table1: {
              _type: 'components',
              _data: [
                { a: 'a1' },
                { a: 'a2' },
                { a: 'a3' },
                { a: 'a4' },
                { a: 'a5' },
              ],
            },
            table2: {
              _type: 'components',
              _data: [{ a: 'a1' }, { a: 'a2' }],
            },
          },
        });
        const count1 = await io.rowCount('table1');
        const count2 = await io.rowCount('table2');
        expect(count1).toBe(5);
        expect(count2).toBe(2);
      });

      it('throws an error if the table does not exist', async () => {
        await expect(io.rowCount('nonexistentTable')).rejects.toThrow(
          'Table "nonexistentTable" not found',
        );
      });
    });

    describe('dump()', () => {
      it('returns a copy of the complete database', async () => {
        const dump = await io.dump();
        hsh(dump);

        await expectGolden('io-conformance/dump/empty.json', ego).toBe(dump);
        await createExampleTable('table1');
        await createExampleTable('table2');

        const dump2 = await io.dump();
        await expectGolden('io-conformance/dump/two-tables.json', ego).toBe(
          dump2,
        );
      });
    });

    describe('dumpTable(request)', () => {
      it('returns a copy of the table', async () => {
        await createExampleTable('table1');

        await io.write({
          data: {
            table1: {
              _type: 'components',
              _data: [{ a: 'a2' }],
            },
          },
        });

        const result = await io.dumpTable({ table: 'table1' });
        hsh(result);

        await expectGolden('io-conformance/dumpTable/table1.json', ego).toBe(
          result,
        );
      });

      it('throws an error if the table does not exist', async () => {
        await expect(
          io.dumpTable({ table: 'nonexistentTable' }),
        ).rejects.toThrow('Table "nonexistentTable" not found');
      });
    });

    describe('contentType()', () => {
      it('returns the content type of the given table', async () => {
        await createExampleTable('table1');

        await io.write({
          data: {
            table1: {
              _type: 'components',
              _data: [{ a: 'a2' }],
            },
          },
        });

        const contentType = await io.contentType({ table: 'table1' });
        expect(contentType).toBe('components');
      });

      it('returns error if table is not existing', async () => {
        await expect(io.contentType({ table: 'unknown' })).rejects.toThrow(
          'Table "unknown" not found',
        );
      });
    });
  });
};

// Run the tests for all setups
for (const [setupName, setup] of Object.entries(setups)) {
  runIoConformanceTests(setupName, setup);
}
