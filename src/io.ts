// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { JsonValue } from '@rljson/json';
import { Rljson, TableCfg } from '@rljson/rljson';

// .............................................................................
export interface Io {
  // ...........................................................................
  // General

  /** A promise resolving once the Io interface is ready
   *
   * 💡 Use @rljson/is-ready
   */
  isReady(): Promise<void>;

  // ...........................................................................
  // Dump

  /** Returns the complete db content as Rljson */
  dump(): Promise<Rljson>;

  /** Returns the dump of a complete table */
  dumpTable(request: { table: string }): Promise<Rljson>;

  // ...........................................................................
  // Tables

  /**
   * Creates a table with a given config.
   * If the table already exists, new columns are added to the existing table.
   * If the table does not exist, it is created with the given config.
   * If the table exists and columns are removed, an error is thrown.
   * If the table exists and the column type is changed, an error is thrown.
   */
  createOrExtendTable(request: { tableCfg: TableCfg }): Promise<void>;

  /**
   * Returns a json structure returning current table configurations
   */
  tableCfgs(): Promise<Rljson>;

  // ...........................................................................
  // Write

  /** Writes Rljson data into the database */
  write(request: { data: Rljson }): Promise<void>;

  // ...........................................................................
  // Read rows

  /** Queries a list of rows */
  readRows(request: {
    table: string;
    where: { [column: string]: JsonValue };
  }): Promise<Rljson>;

  /** Returns the number of rows in the given table */
  rowCount(table: string): Promise<number>;
}

// .............................................................................
export const exampleIo =
  'Checkout @rljson/io-mem for an example implementation';
