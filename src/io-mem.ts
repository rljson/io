// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { hip, hsh } from '@rljson/hash';
import { IsReady } from '@rljson/is-ready';
import { copy, equals, JsonValue } from '@rljson/json';
import { Rljson, TableCfg, TableKey, TableType } from '@rljson/rljson';

import { IoInit } from './io-init.ts';
import { IoTools } from './io-tools.ts';
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

  static example = async () => {
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

  async rowCount(table: string): Promise<number> {
    const tableData = this._mem[table] as TableType;
    if (!tableData) {
      throw new Error(`Table "${table}" not found`);
    }
    return Promise.resolve(tableData._data.length);
  }

  // ...........................................................................
  // Write

  write(request: { data: Rljson }): Promise<void> {
    return this._write(request);
  }

  // ...........................................................................
  // Table management
  createOrExtendTable(request: { tableCfg: TableCfg }): Promise<void> {
    return this._createOrExtendTable(request);
  }

  async tableCfgs(): Promise<Rljson> {
    const tables = this._mem.tableCfgs._data as TableCfg[];

    // Take the last version of eacth type key
    const newestVersion: Record<TableKey, TableCfg> = {};
    for (const table of tables) {
      const existing = newestVersion[table.key];
      if (!existing) {
        newestVersion[table.key] = table;
      } else if (table.version > existing.version) {
        newestVersion[table.key] = table;
      }
    }

    const resultData = Object.values(newestVersion);

    return hip({
      tableCfgs: {
        _type: 'ingredients',
        _data: resultData,
      },
    } as Rljson);
  }

  async allTableNames(): Promise<string[]> {
    const tables = Object.keys(this._mem).filter((key) => !key.startsWith('_'));
    return tables;
  }

  // ######################
  // Private
  // ######################

  private _ioTools!: IoTools;

  private _isReady = new IsReady();

  private _mem: Rljson = hip({} as Rljson);

  private _ioInit!: IoInit;

  // ...........................................................................
  private async _init() {
    this._ioTools = new IoTools(this);
    this._ioInit = new IoInit(this);
    this._initTableCfgs();
    await this._ioInit.initRevisionsTable();

    this._isReady.resolve();
  }

  // ...........................................................................
  private _initTableCfgs = () => {
    const tableCfg = this._ioInit.tableCfg;

    this._mem.tableCfgs = hip({
      _data: [tableCfg],
      _type: 'ingredients',
      _tableCfg: tableCfg._hash as string,
    });

    hip(this._mem, { updateExistingHashes: true, throwOnWrongHashes: false });
  };

  // ...........................................................................
  private async _createOrExtendTable(request: {
    tableCfg: TableCfg;
  }): Promise<void> {
    // Make sure that the table config is compatible
    // with an potential existing table
    await this._ioTools.throwWhenTableIsNotCompatible(request.tableCfg);

    const { type, key } = request.tableCfg;

    // Recreate hashes in the case the existing hashes are wrong
    const newConfig = hsh(request.tableCfg);

    // Find an existing table config with the same hash
    const existingConfig: TableCfg = this._mem.tableCfgs._data.find(
      (cfg) => cfg._hash === newConfig._hash,
    );

    // Write the new config into the database
    if (!existingConfig) {
      this._mem.tableCfgs._data.push(newConfig);
      this._mem.tableCfgs._hash = '';
      hip(this._mem.tableCfgs, {
        updateExistingHashes: false,
        throwOnWrongHashes: false,
      });
    }

    // Create the table annd assign the table config hash
    const table: TableType = {
      _data: [],
      _type: type,
      _tableCfg: newConfig._hash as string,
    };

    // Add hashes to the table
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
    (this._mem as any)._hash = '';
    hip(this._mem, { updateExistingHashes: false, throwOnWrongHashes: false });
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
