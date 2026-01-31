// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { TableCfg } from '@rljson/rljson';

import { IoMem } from './io-mem.ts';
import { IoMulti } from './io-multi.ts';


// Run »pnpm updateGoldens« when you change this file

/**
 * Example 1: Basic IoMem usage
 */
export const basicExample = async () => {
  // Create and initialize in-memory database
  const io = new IoMem();
  await io.init();

  // Create a table with schema
  await io.createOrExtendTable({
    tableCfg: {
      key: 'users',
      type: 'components',
      columns: [
        { key: '_hash', type: 'string', titleShort: 'Hash', titleLong: 'Hash' },
        {
          key: 'id',
          type: 'number',
          titleShort: 'ID',
          titleLong: 'User ID',
        },
        {
          key: 'name',
          type: 'string',
          titleShort: 'Name',
          titleLong: 'User Name',
        },
        {
          key: 'email',
          type: 'string',
          titleShort: 'Email',
          titleLong: 'Email Address',
        },
      ],
      isHead: false,
      isRoot: false,
      isShared: true,
    },
  });

  // Write data
  await io.write({
    data: {
      users: {
        _type: 'components',
        _data: [
          { id: 1, name: 'Alice', email: 'alice@example.com' },
          { id: 2, name: 'Bob', email: 'bob@example.com' },
        ],
      },
    },
  });

  // Query data
  const result = await io.readRows({
    table: 'users',
    where: { id: 1 },
  });

  console.log('Query result:', result);

  // Get row count
  const count = await io.rowCount('users');
  console.log('Total users:', count);

  // Dump entire database
  const allData = await io.dump();
  console.log('Database dump:', allData);

  await io.close();
};

/**
 * Example 2: Schema management
 */
export const schemaExample = async () => {
  const io = new IoMem();
  await io.init();

  // Create a table with schema
  await io.createOrExtendTable({
    tableCfg: {
      key: 'products',
      type: 'components',
      columns: [
        { key: '_hash', type: 'string', titleShort: 'Hash', titleLong: 'Hash' },
        {
          key: 'sku',
          type: 'string',
          titleShort: 'SKU',
          titleLong: 'Stock Keeping Unit',
        },
        {
          key: 'name',
          type: 'string',
          titleShort: 'Name',
          titleLong: 'Product Name',
        },
        {
          key: 'price',
          type: 'number',
          titleShort: 'Price',
          titleLong: 'Price in USD',
        },
        {
          key: 'inStock',
          type: 'boolean',
          titleShort: 'In Stock',
          titleLong: 'Available in Stock',
        },
      ],
      isHead: false,
      isRoot: false,
      isShared: true,
    },
  });

  // Check if table exists
  const exists = await io.tableExists('products');
  console.log('Table exists:', exists);

  // Get table configuration
  const configs = await io.rawTableCfgs();
  console.log('Table configs:', configs);

  await io.close();
};

/**
 * Example 3: IoMulti with caching
 */
export const multiExample = async () => {
  // Create cache layer
  const cache = new IoMem();
  await cache.init();

  // Create "remote" layer (simulated with another IoMem)
  const remote = new IoMem();
  await remote.init();

  // Create table schema in both
  const tableCfg: TableCfg = {
    key: 'items',
    type: 'components',
    columns: [
      { key: '_hash', type: 'string', titleShort: 'Hash', titleLong: 'Hash' },
      { key: 'id', type: 'number', titleShort: 'ID', titleLong: 'Item ID' },
      {
        key: 'value',
        type: 'string',
        titleShort: 'Value',
        titleLong: 'Item Value',
      },
    ],
    isHead: false,
    isRoot: false,
    isShared: true,
  };

  await remote.createOrExtendTable({ tableCfg });

  // Pre-populate remote with data
  await remote.write({
    data: {
      items: {
        _type: 'components',
        _data: [
          { id: 1, value: 'Remote Data' },
          { id: 2, value: 'More Data' },
        ],
      },
    },
  });

  // Create multi-tier Io
  const io = new IoMulti([
    {
      io: cache,
      priority: 1, // Check cache first
      read: true,
      write: true, // Write to cache
      dump: false,
    },
    {
      io: remote,
      priority: 2, // Fallback to remote
      read: true,
      write: true, // Also persist to remote
      dump: true, // Remote is source of truth
    },
  ]);

  await io.init();

  // First read hits remote, caches result
  console.log('First read (hits remote):');
  const data1 = await io.readRows({
    table: 'items',
    where: { id: 1 },
  });
  console.log(data1);

  // Second read hits cache (faster!)
  console.log('Second read (hits cache):');
  const data2 = await io.readRows({
    table: 'items',
    where: { id: 1 },
  });
  console.log(data2);

  // Write goes to both cache and remote
  await io.write({
    data: {
      items: {
        _type: 'components',
        _data: [{ id: 3, value: 'New Data' }],
      },
    },
  });

  /* v8 ignore next -- @preserve */
  await io.close();
};

/**
 * Run all examples
 */
export const example = async () => {
  console.log('=== Basic Example ===');
  await basicExample();

  console.log('\n=== Schema Example ===');
  await schemaExample();

  console.log('\n=== Multi-tier Example ===');
  await multiExample();
};

// Uncomment to run examples
// example();
