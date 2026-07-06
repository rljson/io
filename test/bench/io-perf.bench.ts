// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { hip } from '@rljson/hash';
import { TableCfg } from '@rljson/rljson';

import { bench, describe } from 'vitest';

import { IoMem } from '../../src/io-mem.ts';

/**
 * Performance benchmark suite for IoMem.
 *
 * Run with: pnpm exec vitest bench --run
 *
 * NOTE: setup happens via top-level await — beforeAll hooks are not
 * executed in vitest benchmark mode.
 */

// .............................................................................
const benchTableCfg = (key: string): TableCfg =>
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
      { key: 'value', type: 'number', titleShort: 'Value', titleLong: 'Value' },
    ],
  } as unknown as TableCfg);

const mkRow = (i: number) =>
  hip({ name: `row${i}`, value: i, _hash: '' } as any);

const setupIo = async (
  table: string,
  prefillRows: number,
): Promise<{ io: IoMem; hashes: string[] }> => {
  const io = new IoMem();
  await io.init();
  await io.isReady();
  await io.createOrExtendTable({ tableCfg: benchTableCfg(table) });

  const rows = Array.from({ length: prefillRows }, (_, i) => mkRow(i));
  if (prefillRows > 0) {
    await io.write({ data: { [table]: { _type: 'components', _data: rows } } as any });
  }
  return { io, hashes: rows.map((r) => r._hash as string) };
};

// .............................................................................
// Top-level setup (bench mode does not execute beforeAll)
const writeSetup = await setupIo('writeTable', 10000);
let writeCounter = 100000;

const readSetup = await setupIo('readTable', 10000);
let readIdx = 0;

const dumpSetup = await setupIo('dumpTable', 10000);

const bulkIo = new IoMem();
await bulkIo.init();
await bulkIo.isReady();
await bulkIo.createOrExtendTable({ tableCfg: benchTableCfg('bulkTable') });
let bulkCounter = 500000;

// .............................................................................
describe('write', () => {
  bench('single-row write into 10k-row table', async () => {
    writeCounter++;
    await writeSetup.io.write({
      data: {
        writeTable: { _type: 'components', _data: [mkRow(writeCounter)] },
      } as any,
    });
  });

  bench(
    'bulk write 1000 rows (fresh chunk per iteration)',
    async () => {
      const rows = Array.from({ length: 1000 }, () => mkRow(bulkCounter++));
      await bulkIo.write({
        data: { bulkTable: { _type: 'components', _data: rows } } as any,
      });
    },
    { iterations: 5, warmupIterations: 1 },
  );
});

// .............................................................................
describe('read', () => {
  bench('readRows by _hash on 10k-row table', async () => {
    const hash = readSetup.hashes[readIdx++ % readSetup.hashes.length];
    await readSetup.io.readRows({
      table: 'readTable',
      where: { _hash: hash },
    });
  });

  bench('readRows by column value on 10k-row table', async () => {
    const i = readIdx++ % 10000;
    await readSetup.io.readRows({
      table: 'readTable',
      where: { name: `row${i}` },
    });
  });
});

// .............................................................................
describe('dump', () => {
  bench(
    'dumpTable 10k rows',
    async () => {
      await dumpSetup.io.dumpTable({ table: 'dumpTable' });
    },
    { iterations: 10, warmupIterations: 2 },
  );
});
