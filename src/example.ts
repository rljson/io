// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { hip, hsh } from '@rljson/hash';
import { Rljson, TableCfg } from '@rljson/rljson';

import { IoMem } from './io-mem.ts';

// Run »pnpm updateGoldens« when you change this file
export const example = async () => {
  const ioMem = new IoMem();

  const row = { keyA2: 'a2' };
  const rowWithHash = hsh(row);

  // Create a table config first
  const tableCfg = hip<TableCfg>({
    key: 'tableA',
    type: 'ingredients',
    columns: [],
    version: 1,
    isHead: true,
    isRoot: true,
    isShared: false,
  });

  await ioMem.write({
    data: {
      tableCfgs: {
        _type: 'ingredients',
        _data: [tableCfg],
      },
    },
  });

  // Create a table first
  await ioMem.createOrExtendTable({ tableCfg: tableCfg });

  // Write data into the table
  await ioMem.write({
    data: {
      tableA: {
        _type: 'ingredients',
        _data: [row],
      },
    },
  });

  // Read data from the table
  const data: Rljson = await ioMem.readRows({
    table: 'tableA',
    where: { _hash: (rowWithHash as any)._hash },
  });

  // Print the return rljson data
  console.log(JSON.stringify(data, null, 2));
};

// example();
