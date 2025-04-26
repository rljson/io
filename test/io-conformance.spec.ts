// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { hip, rmhsh } from '@rljson/hash';
import {
  exampleTableCfg,
  IngredientsTable,
  Rljson,
  TableCfg,
  TableType,
} from '@rljson/rljson';

import { beforeEach, describe, expect, it } from 'vitest';

import { IoMem } from '../src/io-mem';
import { IoTools } from '../src/io-tools';

import { expectGolden } from './setup/goldens.ts';

describe('Io Conformance', async () => {
  let io: IoMem;
  let ioTools: IoTools;

  beforeEach(async () => {
    io = await IoMem.example();
    ioTools = new IoTools(io);
    await io.isReady();
  });

  describe('isReady()', () => {
    it('should return a resolved promise', async () => {
      await io.isReady();
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
      await expectGolden('io-mem/tableCfgs.json').toBe(dump);
    });
  });

  describe('allTableNames()', () => {
    it('should return an empty array if no tables are created', async () => {
      const tables = await io.allTableNames();
      expect(tables).toEqual(['tableCfgs', 'revisions']);
    });

    it('should return the names of all tables', async () => {
      await createExampleTable('table1');
      await createExampleTable('table2');

      const tables = await io.allTableNames();
      expect(tables).toEqual(['tableCfgs', 'revisions', 'table1', 'table2']);
    });
  });

  describe('tableCfgs()', () => {
    it('returns an rljson object containing the newest config for each table', async () => {
      //create four tables with two versions each
      const table0V1: TableCfg = {
        key: 'table0',
        type: 'ingredients',
        isHead: false,
        isRoot: false,
        isShared: true,
        version: 1,
        columns: [
          { key: 'col0', type: 'string' },
          { key: 'col1', type: 'string' },
          { key: 'col2', type: 'string' },
        ],
      };

      await io.createOrExtendTable({ tableCfg: table0V1 });
      const table0V2 = { ...table0V1, version: 2 };
      await io.createOrExtendTable({ tableCfg: table0V2 });
      const table1V1 = { ...table0V1, key: 'table1', version: 1 };
      await io.createOrExtendTable({ tableCfg: table1V1 });
      const table1V2 = { ...table1V1, version: 2 };
      await io.createOrExtendTable({ tableCfg: table1V2 });

      // Check the tableCfgs
      const actualTableCfgs = (await io.tableCfgs()).tableCfgs
        ._data as unknown as TableCfg[];

      expect(actualTableCfgs.length).toBe(4);
      expect((actualTableCfgs[0] as TableCfg).key).toBe('tableCfgs');
      expect((actualTableCfgs[0] as TableCfg).version).toBe(1);
      expect((actualTableCfgs[1] as TableCfg).key).toBe('revisions');
      expect((actualTableCfgs[1] as TableCfg).version).toBe(1);
      expect((actualTableCfgs[2] as TableCfg).key).toBe('table0');
      expect((actualTableCfgs[2] as TableCfg).version).toBe(2);
      expect((actualTableCfgs[3] as TableCfg).key).toBe('table1');
      expect((actualTableCfgs[3] as TableCfg).version).toBe(2);
    });
  });

  describe('throws an error', async () => {
    it('if the hashes in the tableCfg are wrong', async () => {
      const tableCfg: TableCfg = hip(exampleTableCfg({ key: 'table1' }));
      tableCfg._hash = 'wrongHash';
      let message: string = '';
      try {
        await io.createOrExtendTable({ tableCfg: tableCfg });
      } catch (err: any) {
        message = err.message;
      }

      expect(message).toBe(
        'Hash "wrongHash" does not match the newly calculated one "V9NqVeFM0OLG4kObpo4JQQ". ' +
          'Please make sure that all systems are producing the same hashes.',
      );
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
          'Invalid update of table able "table": ' +
            'Column "x" has an unsupported type "unknown"',
        );
      });

      it('when the update has deleted columns', async () => {
        const update = { ...existing, columns: existing.columns.slice(0, 1) };
        await expect(
          io.createOrExtendTable({ tableCfg: update }),
        ).rejects.toThrow(
          'Invalid update of table able "table": ' +
            'Columns must not be deleted. Deleted columns: b}',
        );
      });

      it('when column keys have changed', async () => {
        const update = {
          ...existing,
          columns: [
            { ...existing.columns[0], key: 'b' },
            { ...existing.columns[1], key: 'a' },
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
            { ...existing.columns[0], type: 'boolean' },
            { ...existing.columns[1], type: 'number' },
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
        const tables = (await io.tableCfgs())
          .tableCfgs as IngredientsTable<TableCfg>;

        return tables._data.map((e) => e.key);
      };

      const physicalTables = async () => await io.allTableNames();

      // Create a first table
      await createExampleTable('table1');

      expect(await tablesFromConfig()).toEqual([
        'tableCfgs',
        'revisions',
        'table',
        'table1',
      ]);
      expect(await physicalTables()).toEqual([
        'tableCfgs',
        'revisions',
        'table',
        'table1',
      ]);

      // Create a second table
      await createExampleTable('table2');
      expect(await tablesFromConfig()).toEqual([
        'tableCfgs',
        'revisions',
        'table',
        'table1',
        'table2',
      ]);
      expect(await physicalTables()).toEqual([
        'tableCfgs',
        'revisions',
        'table',
        'table1',
        'table2',
      ]);
    });

    it('should extend an existing table', async () => {
      // Create a first table
      const tableCfg: TableCfg = exampleTableCfg({ key: 'tableA' });
      await io.createOrExtendTable({ tableCfg });
      await io.write({
        data: {
          tableA: {
            _type: 'ingredients',
            _data: [{ keyA2: 'a2' }],
          },
        },
      });

      // Check the table content before
      const dump = rmhsh(await io.dumpTable({ table: 'tableA' }));
      expect(dump).toEqual({
        tableA: {
          _data: [
            {
              keyA2: 'a2',
            },
          ],
          _type: 'ingredients',
          _tableCfg: '5xbrfD3vtlKPaLU4rcc5R3',
        },
      });

      // Update the table by adding a new column
      const tableCfg2: TableCfg = {
        ...tableCfg,
        columns: [
          ...tableCfg.columns,
          { key: 'keyA1', type: 'string' },
          { key: 'keyA2', type: 'string' },
          { key: 'keyB2', type: 'string' },
        ],
      };
      await io.createOrExtendTable({ tableCfg: tableCfg2 });

      // Check the table contents after. It has not changed.
      const dump2 = rmhsh(await io.dumpTable({ table: 'tableA' }));
      expect(dump2).toEqual({
        tableA: {
          _data: [
            {
              keyA2: 'a2',
            },
          ],
          _tableCfg: '5xbrfD3vtlKPaLU4rcc5R3',
          _type: 'ingredients',
        },
      });

      // Now add a new row adding
      await io.write({
        data: {
          tableA: {
            _type: 'ingredients',
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
              keyA2: 'a2',
            },
            {
              keyA1: 'a1',
              keyA2: 'a2',
              keyB2: 'b2',
            },
          ],
          _tableCfg: '5xbrfD3vtlKPaLU4rcc5R3',
          _type: 'ingredients',
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
          { key: 'keyA1', type: 'string' },
          { key: 'keyA2', type: 'string' },
          { key: 'keyB2', type: 'string' },
        ],
      };

      await io.createOrExtendTable({ tableCfg });
      const allTableNames = await io.allTableNames();
      expect(allTableNames).toContain('tableA');

      expect('tableA').toBe(tableCfg.key);

      // Write a first item
      await io.write({
        data: {
          tableA: {
            _type: 'ingredients',
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
            _type: 'ingredients',
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
          { key: 'string', type: 'string' },
          { key: 'number', type: 'number' },
          { key: 'null', type: 'null' },
          { key: 'boolean', type: 'boolean' },
          { key: 'array', type: 'jsonArray' },
          { key: 'object', type: 'json' },
        ],
      };

      await io.createOrExtendTable({ tableCfg });
      const allTableNames = await io.allTableNames();
      expect(allTableNames).toContain(tableName);
      expect(await ioTools.allColumnKeys(tableName)).toEqual([
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
          boolean: 1, //true
          array: '[1, 2, { a: 10 }]',
          object: '{ a: 1, b: { c: 3 } }',
        },
        {
          string: 'world',
          number: 6,
          null: null,
          boolean: 1, //true
          array: '[1, 2, { a: 10 }]',
          object: '{ a: 1, b: 2 }',
        },
      ];

      const testData: Rljson = {
        testTable: {
          _type: 'ingredients',
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
      expect(io.write({ data: testData }));

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
                _type: 'ingredients',
                _data: [{ keyA2: 'a2' }],
              },
            },
          }),
        ).rejects.toThrow('Table tableA does not exist');
      });

      it('when the table has a different type then an existing one', async () => {
        const exampleCfg: TableCfg = exampleTableCfg({ key: 'tableA' });
        const tableCfg: TableCfg = {
          ...exampleCfg,
          columns: [
            { key: 'keyA1', type: 'string' },
            { key: 'keyA2', type: 'string' },
            { key: 'keyB2', type: 'string' },
          ],
        };
        await io.createOrExtendTable({ tableCfg });

        await expect(
          io.write({
            data: {
              tableA: {
                _type: 'cakes',
                _data: [
                  {
                    keyB2: 'b2',
                    sliceIdsRow: 'xyz',
                    sliceIdsTable: 'xyz',
                    itemIds2: 'xyz',
                    layersTable: 'xyz',
                    layers: {},
                    collections: 'xyz',
                  },
                ],
              },
            },
          }),
        ).rejects.toThrow(
          'Table tableA has different types: "ingredients" vs "cakes"',
        );
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
            { key: 'string', type: 'string' },
            { key: 'number', type: 'number' },
            { key: 'null', type: 'null' },
            { key: 'boolean', type: 'boolean' },
            { key: 'array', type: 'jsonArray' },
            { key: 'object', type: 'json' },
          ],
        };

        await io.createOrExtendTable({ tableCfg });

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
      await createExampleTable('testTable');

      await io.write({
        data: {
          testTable: {
            _type: 'ingredients',
            _data: [
              { a: 'value1', b: 'value2' },
              { a: 'value3', b: 'value4' },
            ],
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

  describe('rowCount(table)', () => {
    it('returns the number of rows in the table', async () => {
      await createExampleTable('table1');
      await createExampleTable('table2');
      await io.write({
        data: {
          table1: {
            _type: 'ingredients',
            _data: [
              { a: 'a1' },
              { a: 'a2' },
              { a: 'a3' },
              { a: 'a4' },
              { a: 'a5' },
            ],
          },
          table2: {
            _type: 'ingredients',
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
      await expectGolden('io-mem/dump/empty.json').toBe(await io.dump());
      await createExampleTable('table1');
      await createExampleTable('table2');
      await expectGolden('io-mem/dump/two-tables.json').toBe(await io.dump());
    });
  });

  describe('dumpTable(request)', () => {
    it('returns a copy of the table', async () => {
      await createExampleTable('table1');

      await io.write({
        data: {
          table1: {
            _type: 'ingredients',
            _data: [{ a: 'a2' }],
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
