// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { JsonValue } from '@rljson/json';
import { ContentType, Rljson } from '@rljson/rljson';

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
  dumpTable(request: { name: string }): Promise<Rljson>;

  // ...........................................................................
  // Tables

  /** Creates a table with a given type */
  createTable(request: { name: string; type: ContentType }): Promise<void>;

  /** Returns the available table names */
  tables(): Promise<string[]>;

  // ...........................................................................
  // Write

  /** Writes Rljson data in to the database */
  write(request: { data: Rljson }): Promise<void>;

  // ...........................................................................
  // Read rows

  /** Reads a specific row from a database table */
  readRow(request: { table: string; rowHash: string }): Promise<Rljson>;

  /** Queries a list of rows */
  readRows(request: {
    table: string;
    where: { [column: string]: JsonValue };
  }): Promise<Rljson>;
}

// .............................................................................
export const exampleIo =
  'Checkout @rljson/io-mem for an example implementation';
