// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { hip, hsh } from '@rljson/hash';
import { Hashed } from '@rljson/json';
import { Rljson, RljsonTableType } from '@rljson/rljson';

import { Io } from './io.ts';

/**
 * In-Memory implementation of the Rljson Io interface.
 */
export class IoMem implements Io {
  static example = async () => {
    return new IoMem();
  };

  get dump() {
    return this._data;
  }

  /**
   * Imports data into the memory.
   */
  async write(request: { data: Rljson }): Promise<void> {
    const addedData = hsh(request.data);
    const tables = Object.keys(addedData);

    for (const table of tables) {
      if (table.startsWith('_')) {
        continue;
      }

      const oldTable = this._data[table] as RljsonTableType;
      const newTable = addedData[table] as RljsonTableType;

      // Table does not exist yet. Insert all
      if (!oldTable) {
        this._data[table] = newTable;
        continue;
      }

      // Make sure oldTable and newTable have the same type
      if (oldTable._type !== newTable._type) {
        throw new Error(
          `Table ${table} has different types: "${oldTable._type}" vs "${newTable._type}"`,
        );
      }

      // Table exists. Merge data
      for (const item of newTable._data) {
        const hash = item._hash;
        const exists = oldTable._data.find((i) => i._hash === hash);
        if (!exists) {
          oldTable._data.push(item as any);
        }
      }
    }

    // Recalc main hashes
    this._data._hash = '';
    const updateExistingHashes = false;
    const throwIfOnWrongHashes = false;
    hip(this._data, updateExistingHashes, throwIfOnWrongHashes);
  }

  // ######################
  // Private
  // ######################

  private _data: Hashed<Rljson> = hip({});
}
