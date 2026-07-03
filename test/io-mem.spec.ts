// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { hip } from '@rljson/hash';
import { TableCfg } from '@rljson/rljson';

import { beforeEach, describe, expect, it } from 'vitest';

import { IoMem } from '../src/io-mem';

describe('IoMem', () => {
  let io: IoMem;

  const tableCfg = (key: string): TableCfg =>
    hip<TableCfg>({
      _hash: '',
      version: 0,
      key,
      type: 'components',
      isHead: false,
      isRoot: false,
      isShared: true,
      columns: [
        { key: '_hash', type: 'string', titleShort: 'Hash', titleLong: 'Hash' },
        { key: 'name', type: 'string', titleShort: 'Name', titleLong: 'Name' },
      ],
    } as unknown as TableCfg);

  beforeEach(async () => {
    io = new IoMem();
    await io.init();
    await io.isReady();
    await io.createOrExtendTable({ tableCfg: tableCfg('memTable') });
  });

  describe('readRows', () => {
    it('reads the tableCfgs table (lazy config cache fill)', async () => {
      // tableCfgs is created during init without passing through
      // createOrExtendTable — its config is resolved lazily
      const result = await io.readRows({
        table: 'tableCfgs',
        where: { key: 'memTable' },
      });

      expect(result.tableCfgs._data.length).toBe(1);
      expect((result.tableCfgs._data[0] as TableCfg).key).toBe('memTable');
    });
  });

  describe('readRows by _hash', () => {
    it('serves hash lookups from the row index', async () => {
      const row = hip({ name: 'indexed', _hash: '' } as any);
      await io.write({
        data: {
          memTable: { _type: 'components', _data: [row] },
        } as any,
      });

      // Found
      const found = await io.readRows({
        table: 'memTable',
        where: { _hash: row._hash },
      });
      expect(found.memTable._data.length).toBe(1);
      expect(found.memTable._data[0].name).toBe('indexed');

      // Not found
      const missing = await io.readRows({
        table: 'memTable',
        where: { _hash: 'DOES-NOT-EXIST' },
      });
      expect(missing.memTable._data.length).toBe(0);

      // Found by hash but rejected by an additional column condition
      const rejected = await io.readRows({
        table: 'memTable',
        where: { _hash: row._hash, name: 'differentName' },
      });
      expect(rejected.memTable._data.length).toBe(0);
    });

    it('builds the row index lazily for tables with existing rows', async () => {
      // tableCfgs already contains rows from init — a hash lookup
      // builds its index from the existing data
      const cfgs = await io.rawTableCfgs();
      const someCfg = cfgs[0];

      const result = await io.readRows({
        table: 'tableCfgs',
        where: { _hash: someCfg._hash as string },
      });
      expect(result.tableCfgs._data.length).toBe(1);
      expect((result.tableCfgs._data[0] as TableCfg).key).toBe(someCfg.key);
    });
  });

  describe('re-init', () => {
    it('re-initializes after writes with pending lazy hash updates', async () => {
      await io.write({
        data: {
          memTable: {
            _type: 'components',
            _data: [hip({ name: 'beforeReInit', _hash: '' } as any)],
          },
        } as any,
      });

      // Re-init validates all hashes — pending lazy updates must be
      // folded and caches reset
      await io.init();
      await io.isReady();

      const dump = await io.dump();
      expect(dump).toBeDefined();
    });
  });

  describe('write', () => {
    it('ignores non-table values like a top-level _hash', async () => {
      await io.write({
        data: {
          _hash: '',
          memTable: {
            _type: 'components',
            _data: [{ name: 'a', _hash: '' }],
          },
        } as any,
      });

      const rows = await io.readRows({
        table: 'memTable',
        where: { name: 'a' },
      });
      expect(rows.memTable._data.length).toBe(1);
    });

    it('rejects rows with columns not in the table config', async () => {
      await expect(
        io.write({
          data: {
            memTable: {
              _type: 'components',
              _data: [{ name: 'a', unknownColumn: 1, _hash: '' }],
            },
          } as any,
        }),
      ).rejects.toThrow('Table data does not match the configuration.');
    });
  });
});
