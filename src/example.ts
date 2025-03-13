// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { hsh } from '@rljson/hash';
import { Rljson } from '@rljson/rljson';

import { IoMem } from './io-mem.ts';

// Run »pnpm updateGoldens« when you change this file
export const example = async () => {
  const ioMem = new IoMem();

  const row = { keyA2: 'a2' };
  const rowWithHash = hsh(row);

  // Create a table first
  await ioMem.createTable({ name: 'tableA', type: 'properties' });

  // Write data into the table
  await ioMem.write({
    data: {
      tableA: {
        _type: 'properties',
        _data: [row],
      },
    },
  });

  // Read data from the table
  const data: Rljson = await ioMem.readRow({
    table: 'tableA',
    rowHash: rowWithHash._hash,
  });

  // Print the return rljson data
  console.log(JSON.stringify(data, null, 2));
};

// example();
