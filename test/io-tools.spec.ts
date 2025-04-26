// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { hip } from '@rljson/hash';
import { exampleTableCfg } from '@rljson/rljson';

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

  describe('allTableNames', () => {
    it('should return a list of all table names', async () => {
      await io.createOrExtendTable({ tableCfg: exampleTableCfg() });

      expect(ioTools.allTableNames()).resolves.toEqual([
        'tableCfgs',
        'revisions',
        'table',
      ]);
    });

    it('should return an empty array if no tables are created', async () => {
      const tables = await ioTools.allTableNames();
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

  describe('allColumnKeys(table)', () => {
    it('should return a list of all column names of a given table', async () => {
      const tableCfg = exampleTableCfg();
      await io.createOrExtendTable({ tableCfg });
      expect(ioTools.allColumnKeys(tableCfg.key)).resolves.toEqual(['a', 'b']);
    });

    it('should throw an error if the table is not found', async () => {
      expect(ioTools.allColumnKeys('unknown')).rejects.toThrow(
        'Table "unknown" not found',
      );
    });
    it('should return an empty list if the table has no columns', async () => {
      const tableCfg = exampleTableCfg({
        columns: [],
      });
      await io.createOrExtendTable({ tableCfg });
      expect(ioTools.allColumnKeys(tableCfg.key)).resolves.toEqual([]);
    });
  });

  describe('throwWhenTableUpdateIsNotCompatible', () => {
    it('is tested in io-conformance.spec.ts, createOrExtendTable', () => {});
  });
});
