// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { hip } from '@rljson/hash';
import { jsonValueType } from '@rljson/json';
import { exampleTableCfg, Rljson } from '@rljson/rljson';

import { beforeEach, describe, expect, it } from 'vitest';

import { Io } from '../src/io';
import { IoTools } from '../src/io-tools';

describe('IoTools', () => {
  let ioTools: IoTools;
  let io: Io;
  beforeEach(async () => {
    ioTools = await IoTools.example();
    io = ioTools.io;
  });

  describe('throwWhenTableDoesNotExist', () => {
    it('should throw an error if the table does not exist', async () => {
      const tableKey = 'nonExistentTable';
      await expect(
        ioTools.throwWhenTableDoesNotExist(tableKey),
      ).rejects.toThrow(`Table "${tableKey}" not found`);
    });
    it('should not throw an error if the table exists', async () => {
      const tableKey = 'existingTable';
      await io.createOrExtendTable({
        tableCfg: exampleTableCfg({ key: tableKey }),
      });
      await expect(
        ioTools.throwWhenTableDoesNotExist(tableKey),
      ).resolves.not.toThrow();
    });
  });

  describe('throwWhenTablesDoNotExist', () => {
    it('should throw an error if any table does not exist', async () => {
      const rljson: Rljson = {
        unknownTable: { _data: [] } as any,
      };

      let message: string | undefined;
      try {
        await ioTools.throwWhenTablesDoNotExist(rljson);
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).toBe('The following tables do not exist: unknownTable');
    });

    it('should not throw an error if all tables exist', async () => {
      await io.createOrExtendTable({
        tableCfg: exampleTableCfg({ key: 'existingTable1' }),
      });
      await io.createOrExtendTable({
        tableCfg: exampleTableCfg({ key: 'existingTable2' }),
      });
      await expect(
        ioTools.throwWhenTablesDoNotExist({
          existingTable1: {},
          existingTable2: {},
        } as any),
      ).resolves.not.toThrow();
    });
  });

  describe('throwWhenTableDataDoesNotMatchCfg', () => {
    it('throws when data contains a column not in the cfg', async () => {
      const tableCfg = exampleTableCfg();
      await io.createOrExtendTable({ tableCfg });

      const data: Rljson = {
        table: {
          _data: [
            { a: 1, b: 2, c: 3 }, // Extra column 'c'
            { a: '1', b: 2 }, // Fine
          ],
        },
      };

      const errors: string[] = [];
      try {
        await ioTools.throwWhenTableDataDoesNotMatchCfg(data);
      } catch (e) {
        const errs = (e as Error).message.split('\n');
        errors.push(...errs);
      }

      expect(errors).toEqual([
        'Table data does not match the configuration.',
        '',
        'Errors:',
        '- Column "a" in row 0 of "table" has type "number", but expected "string"',
        '- Column "c" in row 0 of table "table" does not exist.',
      ]);
    });
  });

  describe('allTableKeys', () => {
    it('should return a list of all table names', async () => {
      await io.createOrExtendTable({ tableCfg: exampleTableCfg() });

      expect(ioTools.allTableKeys()).resolves.toEqual([
        'tableCfgs',
        'revisions',
        'table',
      ]);
    });

    it('should return an empty array if no tables are created', async () => {
      const tables = await ioTools.allTableKeys();
      expect(tables).toEqual(['tableCfgs', 'revisions']);
    });
  });

  describe('tableCfg(table)', () => {
    it('should return the configuration of a given table', async () => {
      const tableCfg = hip(exampleTableCfg());
      await io.createOrExtendTable({ tableCfg });
      expect(ioTools.tableCfg(tableCfg.key)).resolves.toEqual(tableCfg);
    });

    it('should throw an error if the table is not found', async () => {
      expect(ioTools.tableCfg('unknown')).rejects.toThrow(
        'Table "unknown" not found',
      );
    });
  });

  describe('tableCfgsTableCfg', () => {
    it('contains a column config for each key', () => {
      const cfg = IoTools.tableCfgsTableCfg;
      const keys = Object.keys(cfg);
      const columns = cfg.columns;
      expect(keys.length).toBe(columns.length);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const val = cfg[key];
        const column = columns[i];
        expect(column.key).toBe(key);

        const expectedType = jsonValueType(val!);
        expect(column.type).toBe(expectedType);
      }
    });
  });

  describe('allColumnKeys(table)', () => {
    it('should return a list of all column names of a given table', async () => {
      const tableCfg = exampleTableCfg();
      await io.createOrExtendTable({ tableCfg });
      expect(ioTools.allColumnKeys(tableCfg.key)).resolves.toEqual([
        '_hash',
        'a',
        'b',
      ]);
    });

    it('should throw an error if the table is not found', async () => {
      expect(ioTools.allColumnKeys('unknown')).rejects.toThrow(
        'Table "unknown" not found',
      );
    });
  });

  describe('throwWhenTableUpdateIsNotCompatible', () => {
    it('is tested in io-conformance.spec.ts, createOrExtendTable', () => {});
  });
});
