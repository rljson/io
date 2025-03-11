// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { RljsonTableType } from '@rljson/rljson/dist/rljson';

import { beforeEach, describe, expect, it } from 'vitest';

import { IoMem } from '../src/io-mem';

describe('IoMem', () => {
  let ioMem: IoMem;

  beforeEach(async () => {
    ioMem = await IoMem.example();
  });

  describe('write(data)', () => {
    it('adds a new table when not existing', async () => {
      await ioMem.write({
        data: {
          tableA: {
            _type: 'properties',
            _data: [{ keyA2: 'a2' }],
          },
        },
      });

      const items = (ioMem.dump.tableA as RljsonTableType)._data;
      expect(items).toEqual([{ keyA2: 'a2', _hash: 'apLP3I2XLnVm13umIZdVhV' }]);
    });

    it('adds data to existing data', async () => {
      // Write a first item
      await ioMem.write({
        data: {
          tableA: {
            _type: 'properties',
            _data: [{ keyA2: 'a2' }],
          },
        },
      });

      const items = (ioMem.dump.tableA as RljsonTableType)._data;
      expect(items).toEqual([{ keyA2: 'a2', _hash: 'apLP3I2XLnVm13umIZdVhV' }]);

      // Write a second item
      await ioMem.write({
        data: {
          tableA: {
            _type: 'properties',
            _data: [{ keyB2: 'b2' }],
          },
        },
      });

      const items2 = (ioMem.dump.tableA as RljsonTableType)._data;
      expect(items2).toEqual([
        { keyA2: 'a2', _hash: 'apLP3I2XLnVm13umIZdVhV' },
        { keyB2: 'b2', _hash: 'oNNJMCE_2iycGPDyM_5_lp' },
      ]);
    });

    describe('throws', () => {
      it('when the table has a different type then an existing one', async () => {
        await ioMem.write({
          data: {
            tableA: {
              _type: 'properties',
              _data: [{ keyA2: 'a2' }],
            },
          },
        });

        let message: string = '';

        try {
          await ioMem.write({
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
});
