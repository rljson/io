// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { ContentType, Rljson } from '@rljson/rljson';


// .............................................................................
export interface Io {
  /** A promise resolving once the Io interface is ready */
  isReady(): Promise<void>;

  /** Returns the complete db content as Rljson */
  dump(): Promise<Rljson>;

  /** Creates a table with a given type */
  createTable(request: { name: string; type: ContentType }): Promise<void>;

  /** Returns the available table names */
  tables(): Promise<string[]>;

  /** Writes Rljson data in to the database */
  write(request: { data: Rljson }): Promise<void>;

  /** Reads a specific row from a database table */
  readRow(request: { table: string; rowHash: string }): Promise<Rljson>;
}

// .............................................................................
export const exampleIo =
  'Checkout @rljson/io-mem for an example implementation';
