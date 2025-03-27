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
  createTable(request: { tableCfg: TableCfg }): Promise<void> {
    return this._createTable(request);
  }

  async tables(): Promise<Rljson> {
    const tables: TableCfg[] = [];

    for (const key of Object.keys(this._mem)) {
      const table = this._mem[key];
      const tableCfgRef = table._tableCfg;
      if (tableCfgRef) {
        for (const tableCfg of this._mem.tableCfgs._data) {
          if (tableCfg._hash === tableCfgRef) {
            tables.push(tableCfg);
          }
        }
      }
    }

    const result: Rljson = {
      tableCfgs: {
        _type: 'ingredients',
        _data: tables,
      },
    };

    return hip(result);
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
      version: 1,
      key: 'tableCfgs',
      type: 'ingredients',
      columns: {
        key: { key: 'key', type: 'string', previous: 'string' },
        type: { key: 'type', type: 'string', previous: 'string' },
      },
    };

    hip(tableCfg);

    this._mem.tableCfgs = hip({
      _data: [tableCfg],
      _type: 'ingredients',
      _tableCfg: tableCfg._hash as string,
    });

    const updateExistingHashes = true;
    const throwOnOnWrongHashes = false;
    hip(this._mem, updateExistingHashes, throwOnOnWrongHashes);
  };

  // ...........................................................................
  private async _createTable(request: { tableCfg: TableCfg }): Promise<void> {
    const config: TableCfg = this._mem.tableCfgs._data.find(
      (cfg) => cfg._hash === request.tableCfg._hash,
    );

    if (!config) {
      throw new Error(`Table config ${request.tableCfg.key} not found`);
    }

    const { key, type } = config;

    // Get the existing table
    const existing = this._mem[key] as TableType;
    if (existing) {
      throw new Error(`Table ${key} already exists`);
    }

    const table: TableType = {
      _data: [],
      _type: type,
      _tableCfg: config._hash as string,
    };

    this._mem[key] ??= hip(table);
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
