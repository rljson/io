// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { hip, rmhsh } from '@rljson/hash';
import { equals } from '@rljson/json';
import {
  exampleTableCfg,
  IngredientsTable,
  Rljson,
  TableCfg,
  TableType,
} from '@rljson/rljson';

import { beforeEach, describe, expect, it } from 'vitest';

import { IoMem } from '../src/io-mem.ts';
import { Io } from '../src/io.ts';

import { expectGolden } from './setup/goldens.ts';

// import { IsReady } from '@rljson/is-ready';

describe('Io Conformance', async () => {
  let io: Io;

  beforeEach(async () => {
    io = IoMem.example();
    await io.isReady();
  });

  describe('isReady()', () => {
    it('should return a resolved promise', async () => {
      await io.isReady();
    });
  });

  const createTableHelper = async (key: string) => {
    // Register a new table config
    const tableCfg: TableCfg = hip(exampleTableCfg({ key }));

    // Generate the table
    await io.createTable({ tableCfg: tableCfg });
  };

  describe('tableCfgs table', () => {
    it('should be available after isReady() resolves', async () => {
      const dump = await io.dumpTable({ table: 'tableCfgs' });
      await expectGolden('io-mem/tableCfgs.json').toBe(dump);
    });
  });

  describe('allTableNames()', () => {
    it('should return an empty array if no tables are created', async () => {
      const tables = await io.allTableNames();
      expect(tables).toEqual(['tableCfgs']);
    });

    it('should return the names of all tables', async () => {
      await createTableHelper('table1');
      await createTableHelper('table2');

      const tables = await io.allTableNames();
      expect(tables).toEqual(['tableCfgs', 'table1', 'table2']);
    });
  });

  describe('tableCfgs()', () => {
    it('an rljson containing the newest config of each table', async () => {
      const table0V1: TableCfg = {
        key: 'table0',
        type: 'ingredients',
        version: 1,
        isHead: false,
        isRoot: false,
        isShared: true,
        columns: {
          col0: { type: 'string' },
          col1: { type: 'string' },
          col2: { type: 'string' },
        },
      };

      const table0V2 = { ...table0V1, version: 2 };
      const table1V1 = { ...table0V1, key: 'table1', version: 1 };
      const table1V2 = { ...table1V1, version: 2 };

      // Add multiple versions of the same tables
      await io.write({
        data: {
          tableCfgs: {
            _type: 'ingredients',
            _data: [table0V1, table0V2, table1V1, table1V2],
          },
        },
      });

      // Check the tableCfgs
      const tableCfgs = await io.tableCfgs();
      const tableCfgsData = (tableCfgs.tableCfgs as TableType)._data;
      expect(tableCfgsData.length).toBe(4);
      expect(tableCfgsData[0].key).toBe('tableCfgs');
      expect(tableCfgsData[0].version).toBe(1);
      expect(tableCfgsData[1].key).toBe('revisions');
      expect(tableCfgsData[1].version).toBe(1);
      expect(tableCfgsData[2].key).toBe('table0');
      expect(tableCfgsData[2].version).toBe(2);
      expect(tableCfgsData[3].key).toBe('table1');
      expect(tableCfgsData[3].version).toBe(2);
    });
  });

  describe('createTable(request)', () => {
    it('should add a table and a table config', async () => {
      const tablesFromConfig = async () => {
        const tables = (await io.tableCfgs())
          .tableCfgs as IngredientsTable<TableCfg>;

        return tables._data.map((e) => e.key);
      };

      const physicalTables = async () => await io.allTableNames();

      // Create a first table
      await createTableHelper('table1');

      expect(await tablesFromConfig()).toEqual([
        'tableCfgs',
        'revisions',
        'table1',
      ]);
      expect(await physicalTables()).toEqual([
        'tableCfgs',
        'revisions',
        'table1',
      ]);

      // Create a second table
      await createTableHelper('table2');
      expect(await tablesFromConfig()).toEqual([
        'tableCfgs',
        'revisions',
        'table1',
        'table2',
      ]);
      expect(await physicalTables()).toEqual([
        'tableCfgs',
        'revisions',
        'table1',
        'table2',
      ]);
    });

    describe('throws', async () => {
      it('if the table already exists', async () => {
        await createTableHelper('table');
        await expect(createTableHelper('table')).rejects.toThrow(
          'Table table already exists',
        );
      });

      it('if the hashes in the tableCfg are wrong', async () => {
        const tableCfg: TableCfg = hip(exampleTableCfg({ key: 'table' }));
        const rightHash = tableCfg._hash;
        tableCfg._hash = 'wrongHash';
        let message: string = '';
        try {
          await io.createTable({ tableCfg: tableCfg });
        } catch (err: any) {
          message = err.message;
        }

        expect(message).toBe(
          `Hash "wrongHash" does not match the newly calculated one "${rightHash}". ` +
            'Please make sure that all systems are producing the same hashes.',
        );
      });
    });
  });

  describe('write(request)', async () => {
    it('adds data to existing data', async () => {
      await createTableHelper('tableA');

      // Write a first item
      await io.write({
        data: {
          tableA: {
            _type: 'ingredients',
            _data: [{ keyA2: 'a2' }],
          },
        },
      });

      const dump = await io.dump();
      const items = (dump.tableA as TableType)._data;
      expect(items).toEqual([{ keyA2: 'a2', _hash: 'apLP3I2XLnVm13umIZdVhV' }]);

      // Write a second item
      await io.write({
        data: {
          tableA: {
            _type: 'ingredients',
            _data: [{ keyB2: 'b2' }],
          },
        },
      });

      const dump2 = await io.dump();
      const items2 = (dump2.tableA as TableType)._data;
      expect(items2).toEqual([
        { keyA2: 'a2', _hash: 'apLP3I2XLnVm13umIZdVhV' },
        { keyB2: 'b2', _hash: 'oNNJMCE_2iycGPDyM_5_lp' },
      ]);
    });

    it('does not add the same data twice', async () => {
      await createTableHelper('testTable');

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
          _type: 'ingredients',
          _data: rows,
        },
      };

      // Write a first item
      await io.write({ data: testData });

      // Write the same item again
      await io.write({ data: testData });

      // Only one item should be in the table
      const dump = await io.dump();
      const testTable = dump.testTable as TableType;
      expect(equals(testTable._data, rows)).toBe(true);
    });

    describe('throws', () => {
      it('when table does not exist', async () => {
        let message: string = '';

        try {
          await io.write({
            data: { testTable: { _type: 'ingredients', _data: [] } },
          });
        } catch (error) {
          message = (error as Error).message;
        }

        expect(message).toEqual('Table testTable does not exist');
      });

      it('when the table has a different type then an existing one', async () => {
        await createTableHelper('tableA');

        await io.write({
          data: {
            tableA: {
              _type: 'ingredients',
              _data: [{ keyA2: 'a2' }],
            },
          },
        });

        let message: string = '';

        try {
          await io.write({
            data: {
              tableA: {
                _type: 'cakes',
                _data: [
                  {
                    keyB2: 'b2',
                    sliceIds: 'xyz',
                    sliceIdsTable: 'xyz',
                    itemIds2: 'xyz',
                    layersTable: 'xyz',
                    layers: {},
                    collections: 'xyz',
                  },
                ],
              },
            },
            /* v8 ignore next */
          });
        } catch (err: any) {
          message = err.message;
        }

        expect(message).toBe(
          'Table tableA has different types: "ingredients" vs "cakes"',
        );
      });
    });
  });

  describe('readRows({table, where})', () => {
    describe('should return rows matching the where clause', async () => {
      const testData: Rljson = {
        testTable: {
          _type: 'ingredients',
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
          ],
        },
      };

      beforeEach(async () => {
        await createTableHelper('testTable');
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
                null: null,
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
                null: null,
                number: 6,
                object: { a: 1, b: 2 },
                string: 'world',
              },
            ],
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
                null: null,
                number: 5,
                object: { a: 1, b: { c: 3 } },
                string: 'hello',
              },
              {
                array: [1, 2, { a: 10 }],
                boolean: true,
                null: null,
                number: 6,
                object: { a: 1, b: 2 },
                string: 'world',
              },
            ],
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
                null: null,
                number: 5,
                object: { a: 1, b: { c: 3 } },
                string: 'hello',
              },
              {
                array: [1, 2, { a: 10 }],
                boolean: true,
                null: null,
                number: 6,
                object: { a: 1, b: 2 },
                string: 'world',
              },
            ],
          },
        });
      });

      it('with where searching array values', async () => {
        const result = rmhsh(
          await io.readRows({
            table: 'testTable',
            where: { array: [1, 2, { a: 10 }] },
          }),
        );

        expect(result).toEqual({
          testTable: {
            _data: [
              {
                array: [1, 2, { a: 10 }],
                boolean: true,
                null: null,
                number: 5,
                object: { a: 1, b: { c: 3 } },
                string: 'hello',
              },
              {
                array: [1, 2, { a: 10 }],
                boolean: true,
                null: null,
                number: 6,
                object: { a: 1, b: 2 },
                string: 'world',
              },
            ],
          },
        });
      });

      it('with where searching object values', async () => {
        const result = rmhsh(
          await io.readRows({
            table: 'testTable',
            where: { object: { a: 1, b: { c: 3 } } },
          }),
        );

        expect(result).toEqual({
          testTable: {
            _data: [
              {
                array: [1, 2, { a: 10 }],
                boolean: true,
                null: null,
                number: 5,
                object: { a: 1, b: { c: 3 } },
                string: 'hello',
              },
            ],
          },
        });
      });
    });

    it('should return an empty array if no rows match the where clause', async () => {
      await createTableHelper('testTable');

      await io.write({
        data: {
          testTable: {
            _type: 'ingredients',
            _data: [
              { column1: 'value1', column2: 'value2' },
              { column1: 'value3', column2: 'value4' },
            ],
          },
        },
      });

      const result = await io.readRows({
        table: 'testTable',
        where: { column1: 'nonexistent' },
      });

      expect(result).toEqual({
        testTable: {
          _data: [],
        },
      });
    });

    it('should throw an error if the table does not exist', async () => {
      await expect(
        io.readRows({
          table: 'nonexistentTable',
          where: { column1: 'value1' },
        }),
      ).rejects.toThrow('Table nonexistentTable not found');
    });
  });

  describe('dump()', () => {
    it('returns a copy of the complete database', async () => {
      await expectGolden('io-mem/dump/empty.json').toBe(await io.dump());
      await createTableHelper('table1');
      await createTableHelper('table2');
      await expectGolden('io-mem/dump/two-tables.json').toBe(await io.dump());
    });
  });

  describe('dumpTable(request)', () => {
    it('returns a copy of the table', async () => {
      await createTableHelper('table1');

      await io.write({
        data: {
          table1: {
            _type: 'ingredients',
            _data: [{ keyA2: 'a2' }],
          },
        },
      });

      await expectGolden('io-mem/dumpTable/table1.json').toBe(
        await io.dumpTable({ table: 'table1' }),
      );
    });

    it('throws an error if the table does not exist', async () => {
      await expect(io.dumpTable({ table: 'nonexistentTable' })).rejects.toThrow(
        'Table nonexistentTable not found',
      );
    });
  });
});
