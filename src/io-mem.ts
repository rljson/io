// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { Hashed, hip, hsh } from '@rljson/hash';
import { IsReady } from '@rljson/is-ready';
import { copy, equals, JsonValue } from '@rljson/json';
import { Rljson, TableCfg, TableType } from '@rljson/rljson';

import { Io } from './io.ts';

/**
 * In-Memory implementation of the Rljson Io interface.
 */
export class IoMem implements Io {
  // ...........................................................................
  // Constructor & example
  constructor() {
    this._init();
  }

  static example = () => {
    return new IoMem();
  };

  // ...........................................................................
  // General
  isReady() {
    return this._isReady.promise;
  }

  // ...........................................................................
  // Dump

  dump(): Promise<Rljson> {
    return this._dump();
  }

  async dumpTable(request: { table: string }): Promise<Rljson> {
    return this._dumpTable(request);
  }

  // ...........................................................................
  // Rows

  readRow(request: { table: string; rowHash: string }): Promise<Rljson> {
    return this._readRow(request);
  }

  readRows(request: {
    table: string;
    where: { [column: string]: JsonValue };
  }): Promise<Rljson> {
    return this._readRows(request);
  }

  // ...........................................................................
  // Write

  write(request: { data: Rljson }): Promise<void> {
    return this._write(request);
  }

  // ...........................................................................
  // Table management
  createTable(request: { config: TableCfg }): Promise<void> {
    return this._createTable(request);
  }

  async tables(): Promise<string[]> {
    const keys = Object.keys(this._mem);
    const tables = keys.filter((key) => !key.startsWith('_'));
    return tables;
  }

  // ######################
  // Private
  // ######################

  private _isReady = new IsReady();

  private _mem: Hashed<Rljson> = hip({} as Rljson);

  // ...........................................................................
  private async _init() {
    this._initTableCfgs();
    this._isReady.resolve();
  }

  // ...........................................................................
  private _initTableCfgs = () => {
    const tableCfg: TableCfg = {
      key: 'tableCfgs',
      type: 'properties',
      columns: {
        key: { key: 'key', type: 'string', previous: 'string' },
        type: { key: 'type', type: 'string', previous: 'string' },
      },
    };

    hip(tableCfg);

    this._mem.tableCfgs = hip({
      _data: [tableCfg],
      _type: 'properties',
      _tableCfg: tableCfg._hash as string,
    });

    const updateExistingHashes = true;
    const throwOnOnWrongHashes = false;
    hip(this._mem, updateExistingHashes, throwOnOnWrongHashes);
  };

  // ...........................................................................
  private async _createTable(request: { config: TableCfg }): Promise<void> {
    const { key, type } = request.config;

    // Get the existing table
    const existing = this._mem[key] as TableType;
    if (existing) {
      // Throw if the existing table has a different type
      if (existing._type !== type) {
        throw new Error(
          `Table ${key} already exists with different type: "${existing._type}" vs "${type}"`,
        );
      }
    }

    // No table exists yet. Create it.
    else {
      const table: Hashed<TableType> = hip({
        _data: [],
        _type: type,
      });

      this._mem[key] ??= table;
    }
  }

  // ...........................................................................
  private async _readRow(request: {
    table: string;
    rowHash: string;
  }): Promise<Rljson> {
    const table = this._mem[request.table] as TableType;

    if (!table) {
      throw new Error(`Table ${request.table} not found`);
    }

    const row = table._data.find((row) => row._hash === request.rowHash);

    if (!row) {
      throw new Error(
        `Row "${request.rowHash}" not found in table ${request.table}`,
      );
    }

    const result: Rljson = {
      [request.table]: {
        _data: [row],
      },
    } as any;

    return result;
  }

  // ...........................................................................

  private async _dump(): Promise<Rljson> {
    return copy(this._mem);
  }

  // ...........................................................................
  private async _dumpTable(request: { table: string }): Promise<Rljson> {
    const table = this._mem[request.table] as TableType;
    if (!table) {
      throw new Error(`Table ${request.table} not found`);
    }

    return {
      [request.table]: copy(table),
    };
  }

  // ...........................................................................
  private async _write(request: { data: Rljson }): Promise<void> {
    const addedData = hsh(request.data);
    const tables = Object.keys(addedData);

    for (const table of tables) {
      if (table.startsWith('_')) {
        continue;
      } else {
        if (!this._mem[table]) {
          throw new Error(`Table ${table} does not exist`);
        }
      }

      const oldTable = this._mem[table] as TableType;
      const newTable = addedData[table] as TableType;

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
    this._mem._hash = '';
    const updateExistingHashes = false;
    const throwIfOnWrongHashes = false;
    hip(this._mem, updateExistingHashes, throwIfOnWrongHashes);
  }

  // ...........................................................................
  private async _readRows(request: {
    table: string;
    where: { [column: string]: JsonValue };
  }): Promise<Rljson> {
    const table = this._mem[request.table] as TableType;

    if (!table) {
      throw new Error(`Table ${request.table} not found`);
    }

    const result: Rljson = {
      [request.table]: {
        _data: table._data.filter((row) => {
          for (const column in request.where) {
            const a = row[column];
            const b = request.where[column];
            if (!equals(a, b)) {
              return false;
            }
          }
          return true;
        }),
      },
    } as any;

    return result;
  }
}
