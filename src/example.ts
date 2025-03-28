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
  const tableCfg = hip({
    key: 'tableA',
    type: 'ingredients',
    columns: {},
  } as TableCfg);

  await ioMem.write({
    data: {
      tableCfgs: {
        _type: 'ingredients',
        _data: [tableCfg],
      },
    },
  });

  // Create a table first
  await ioMem.createTable({ tableCfg: tableCfg });

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
    where: { _hash: rowWithHash._hash },
  });

  // Print the return rljson data
  console.log(JSON.stringify(data, null, 2));
};

// example();
