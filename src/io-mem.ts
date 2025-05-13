// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { hip, hsh } from '@rljson/hash';
import { IsReady } from '@rljson/is-ready';
import { copy, equals, JsonValue } from '@rljson/json';
import {
  iterateTablesSync,
  Rljson,
  TableCfg,
  TableKey,
  TableType,
} from '@rljson/rljson';

import { IoTools } from './io-tools.ts';
import { Io } from './io.ts';

/**
 * In-Memory implementation of the Rljson Io interface.
 */
export class IoMem implements Io {
  // ...........................................................................
  // Constructor & example
  constructor() {}

  init(): Promise<void> {
    return this._init();
  }

  close(): Promise<void> {
    return Promise.resolve();
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
  async tableExists(tableKey: TableKey): Promise<boolean> {
    const table = this._mem[tableKey] as TableType;
    return table ? true : false;
  }

  createOrExtendTable(request: { tableCfg: TableCfg }): Promise<void> {
    return this._createOrExtendTable(request);
  }

  async tableCfgs(): Promise<Rljson> {
    const tables = this._mem.tableCfgs._data as TableCfg[];

    // Take the latest version of each type key
    const newestVersion: Record<TableKey, TableCfg> = {};
    for (let i = tables.length - 1; i >= 0; i--) {
      const table = tables[i];
      const existing = newestVersion[table.key];
      if (!existing) {
        newestVersion[table.key] = table;
      }
    }

    const resultData = Object.values(newestVersion).reverse();

    return hip({
      tableCfgs: {
        _data: resultData,
      },
    } as Rljson);
  }

  // ######################
  // Private
  // ######################

  private _ioTools!: IoTools;

  private _isReady = new IsReady();

  private _mem: Rljson = hip({} as Rljson);

  // ...........................................................................
  private async _init() {
    this._ioTools = new IoTools(this);
    this._initTableCfgs();
    this._updateGlobalHash();
    await this._ioTools.initRevisionsTable();
    hsh(this._mem);

    this._isReady.resolve();
  }

  // ...........................................................................
  private _initTableCfgs = () => {
    const tableCfg = IoTools.tableCfgsTableCfg;

    this._mem.tableCfgs = hip({
      _data: [tableCfg],
      _tableCfg: tableCfg._hash as string,
    });
  };

  // ...........................................................................
  private _updateGlobalHash() {
    (this._mem as any)._hash = '';
    hip(this._mem, {
      updateExistingHashes: false,
    });
  }

  // ...........................................................................
  private _updateTableHash(tableKey: TableKey) {
    const table = this._mem[tableKey] as TableType;
    table._hash = '';
    hip(table, { updateExistingHashes: false });
  }

  // ...........................................................................
  private async _createOrExtendTable(request: {
    tableCfg: TableCfg;
  }): Promise<void> {
    // Make sure that the table config is compatible
    // with an potential existing table
    const tableCfg = request.tableCfg;
    await this._ioTools.throwWhenTableIsNotCompatible(tableCfg);

    const { key } = tableCfg;

    // Recreate hashes in the case the existing hashes are wrong
    const newConfig = hsh(tableCfg);

    // Find an existing table config with the same hash
    const existingConfig = await this._ioTools.tableCfgOrNull(key);

    // Write the new config into the database
    if (!existingConfig) {
      this._createTable(newConfig, key);
    } else {
      this._extendTable(existingConfig, newConfig);
    }
  }

  // ...........................................................................
  private _createTable(newConfig: TableCfg, tableKey: TableKey) {
    // Write the table config into the database
    newConfig = hsh(newConfig);
    this._mem.tableCfgs._data.push(newConfig);
    this._updateTableHash('tableCfgs');

    // Create a table and write it into the database
    const table: TableType = {
      _data: [],
      _tableCfg: newConfig._hash as string,
    };

    this._mem[tableKey] ??= hip(table);

    // Update hashes
    this._updateTableHash(tableKey);
    this._updateGlobalHash();
  }

  // ...........................................................................
  private _extendTable(existingConfig: TableCfg, newConfig: TableCfg) {
    // No columns added? Return.
    if (existingConfig.columns.length === newConfig.columns.length) {
      return;
    }

    // Write the new table config into the database
    newConfig = hsh(newConfig);
    this._mem.tableCfgs._data.push(newConfig);

    // Update the config of the existing table
    const table = this._mem[newConfig.key] as TableType;
    table._tableCfg = newConfig._hash as string;

    // Update the hashes
    this._updateTableHash('tableCfgs');
    this._updateTableHash(newConfig.key);
    this._updateGlobalHash();
  }

  // ...........................................................................

  private async _dump(): Promise<Rljson> {
    return copy(this._mem);
  }

  // ...........................................................................
  private async _dumpTable(request: { table: string }): Promise<Rljson> {
    await this._ioTools.throwWhenTableDoesNotExist(request.table);

    const table = this._mem[request.table] as TableType;

    return {
      [request.table]: copy(table),
    };
  }

  // ...........................................................................
  private async _write(request: { data: Rljson }): Promise<void> {
    const addedData = hsh(request.data);
    this._removeNullValues(addedData);
    const tables = Object.keys(addedData);
    hsh(addedData);

    await this._ioTools.throwWhenTablesDoNotExist(request.data);
    await this._ioTools.throwWhenTableDataDoesNotMatchCfg(request.data);

    for (const table of tables) {
      if (table.startsWith('_')) {
        continue;
      }

      const oldTable = this._mem[table] as TableType;
      const newTable = addedData[table] as TableType;

      // Table exists. Merge data
      for (const item of newTable._data) {
        const hash = item._hash;
        const exists = oldTable._data.find((i) => i._hash === hash);
        if (!exists) {
          oldTable._data.push(item as any);
        }
      }

      this._updateTableHash(table);
    }

    // Recalc main hashes
    this._updateGlobalHash();
  }

  // ...........................................................................
  private async _readRows(request: {
    table: string;
    where: { [column: string]: JsonValue };
  }): Promise<Rljson> {
    await this._ioTools.throwWhenTableDoesNotExist(request.table);
    await this._ioTools.throwWhenColumnDoesNotExist(
      request.table,
      Object.keys(request.where),
    );

    const table = this._mem[request.table] as TableType;

    const result: Rljson = {
      [request.table]: {
        _data: table._data.filter((row) => {
          for (const column in request.where) {
            const a = row[column];
            const b = request.where[column];
            if (b === null && a === undefined) {
              return true;
            }

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

  _removeNullValues(rljson: Rljson) {
    iterateTablesSync(rljson, (table) => {
      const data = rljson[table]._data;

      for (const row of data) {
        for (const key in row) {
          if (row[key] === null) {
            delete row[key];
          }
        }
      }
    });
  }
}
