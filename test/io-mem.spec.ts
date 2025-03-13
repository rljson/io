// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { rmhsh } from '@rljson/hash';
import { equals } from '@rljson/json';
import { Rljson, TableType } from '@rljson/rljson';

import { beforeEach, describe, expect, it } from 'vitest';

import { IoMem } from '../src/io-mem';

describe('IoMem', async () => {
  let io: IoMem;

  beforeEach(async () => {
    io = IoMem.example();
  });

  describe('isReady()', () => {
    it('should return a resolved promise', async () => {
      await io.isReady();
    });
  });

  describe('createTable(request)', () => {
    it('should add a table', async () => {
      await io.createTable({ name: 'table1', type: 'properties' });
      let tables = await io.tables();
      expect(tables).toEqual(['table1']);

      await io.createTable({ name: 'table2', type: 'cake' });
      tables = await io.tables();
      expect(tables).toEqual(['table1', 'table2']);
    });

    describe('createTable', async () => {
      describe('throws', async () => {
        it('if the table already exists with a different type', async () => {
          await io.createTable({ name: 'table', type: 'properties' });
          await expect(
            io.createTable({ name: 'table', type: 'buffet' }),
          ).rejects.toThrow();
        });
      });

      describe('does nothing', async () => {
        it('if the table already exists with the same type', async () => {
          await io.createTable({ name: 'table', type: 'properties' });
          expect(await io.tables()).toEqual(['table']);
          await io.createTable({ name: 'table', type: 'properties' });
          expect(await io.tables()).toEqual(['table']);
        });
      });
    });
  });

  describe('write(request)', async () => {
    it('adds data to existing data', async () => {
      await io.createTable({ name: 'tableA', type: 'properties' });

      // Write a first item
      await io.write({
        data: {
          tableA: {
            _type: 'properties',
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
            _type: 'properties',
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
      await io.createTable({ name: 'testTable', type: 'properties' });

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
          _type: 'properties',
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
            data: { testTable: { _type: 'properties', _data: [] } },
          });
        } catch (error) {
          message = (error as Error).message;
        }

        expect(message).toEqual('Table testTable does not exist');
      });

      it('when the table has a different type then an existing one', async () => {
        await io.createTable({ name: 'tableA', type: 'properties' });

        await io.write({
          data: {
            tableA: {
              _type: 'properties',
              _data: [{ keyA2: 'a2' }],
            },
          },
        });

        let message: string = '';

        try {
          await io.write({
            data: {
              tableA: {
                _type: 'cake',
                _data: [
                  {
                    keyB2: 'b2',
                    itemIds: 'xyz',
                    itemIdsTable: 'xyz',
                    itemIds2: 'xyz',
                    layersTable: 'xyz',
                    layers: {},
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
          'Table tableA has different types: "properties" vs "cake"',
        );
      });
    });
  });

  describe('readRow(request)', () => {
    describe('throws', () => {
      it('when the table does not exist', async () => {
        let message: string = '';

        try {
          await io.readRow({
            table: 'tableA',
            rowHash: 'xyz',
            /* v8 ignore next */
          });
        } catch (err: any) {
          message = err.message;
        }

        expect(message).toBe('Table tableA not found');
      });
    });

    describe('returns Rljson containing the table with the one row', () => {
      it('when the data exists', async () => {
        await io.createTable({ name: 'tableA', type: 'properties' });

        await io.write({
          data: {
            tableA: {
              _type: 'properties',
              _data: [{ keyA2: 'a2', keyA3: 'a3' }],
            },
          },
        });

        const dump = await io.dump();
        const hash = (dump.tableA as any)._data[0]._hash;

        const data = await io.readRow({
          table: 'tableA',
          rowHash: hash,
        });

        expect(data).toEqual({
          tableA: {
            _data: [
              {
                _hash: hash,
                keyA2: 'a2',
                keyA3: 'a3',
              },
            ],
          },
        });
      });

      it('throws when the row does not exist', async () => {
        await io.createTable({ name: 'tableA', type: 'properties' });

        await io.write({
          data: {
            tableA: {
              _type: 'properties',
              _data: [{ keyA2: 'a2', keyA3: 'a3' }],
            },
          },
        });

        let message: string = '';

        try {
          await io.readRow({
            table: 'tableA',
            rowHash: 'xyz',
            /* v8 ignore next */
          });
        } catch (err: any) {
          message = err.message;
        }

        expect(message).toBe('Row "xyz" not found in table tableA');
      });
    });
  });

  describe('readRows({table, where})', () => {
    const io = IoMem.example();

    describe('should return rows matching the where clause', async () => {
      const testData: Rljson = {
        testTable: {
          _type: 'properties',
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
        await io.createTable({ name: 'testTable', type: 'properties' });
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
      await io.createTable({ name: 'testTable', type: 'properties' });
      await io.write({
        data: {
          testTable: {
            _type: 'properties',
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
      expect(await io.dump()).toEqual({ _hash: 'RBNvo1WzZ4oRRq0W9-hknp' });
      await io.createTable({ name: 'table1', type: 'properties' });
      await io.createTable({ name: 'table2', type: 'cake' });
      expect(await io.dump()).toEqual({
        _hash: 'RBNvo1WzZ4oRRq0W9-hknp',
        table1: {
          _data: [],
          _type: 'properties',
        },
        table2: {
          _data: [],
          _type: 'cake',
        },
      });
    });
  });

  describe('dumpTable(request)', () => {
    it('returns a copy of the table', async () => {
      await io.createTable({ name: 'table1', type: 'properties' });
      await io.write({
        data: {
          table1: {
            _type: 'properties',
            _data: [{ keyA2: 'a2' }],
          },
        },
      });

      expect(await io.dumpTable({ name: 'table1' })).toEqual({
        table1: {
          _data: [{ keyA2: 'a2', _hash: 'apLP3I2XLnVm13umIZdVhV' }],
          _type: 'properties',
          _hash: 'WhzHz3rwmdWwlxwX3oag8O',
        },
      });
    });

    it('throws an error if the table does not exist', async () => {
      await expect(io.dumpTable({ name: 'nonexistentTable' })).rejects.toThrow(
        'Table nonexistentTable not found',
      );
    });
  });
});
