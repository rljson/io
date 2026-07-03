// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { hip, hsh } from '@rljson/hash';
import { IsReady } from '@rljson/is-ready';
import { copy, equals, JsonValue } from '@rljson/json';
import {
  ContentType,
  iterateTablesSync,
  Rljson,
  TableCfg,
  TableKey,
  TableType,
  validateRljsonAgainstTableCfg,
} from '@rljson/rljson';

import { IoTools } from './io-tools.ts';
import { Io } from './io.ts';


/**
 * In-Memory implementation of the Rljson Io interface.
 */
export class IoMem implements Io {
  // ...........................................................................
  // Constructor & example

  init(): Promise<void> {
    this._isOpen = true;
    return this._init();
  }

  close(): Promise<void> {
    this._isOpen = false;
    return Promise.resolve();
  }

  get isOpen(): boolean {
    return this._isOpen;
  }

  static example = async () => {
    const io = new IoMem();
    await io.init();
    return io;
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
  // Meta Data

  async contentType(request: { table: string }): Promise<ContentType> {
    return this._contentType(request);
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

  async rawTableCfgs(): Promise<TableCfg[]> {
    const tables = this._mem.tableCfgs._data as TableCfg[];
    return tables;
  }

  // ######################
  // Private
  // ######################

  private _ioTools!: IoTools;

  private _isReady = new IsReady();
  private _isOpen = false;

  private _mem: Rljson = hip({} as Rljson);

  /**
   * Latest table configuration per table (the one with the most
   * columns). Kept in sync by _createTable/_extendTable so that reads
   * and writes need no repeated scan over all configurations.
   */
  private readonly _latestCfgs = new Map<TableKey, TableCfg>();

  /** Column key sets per table, derived from _latestCfgs */
  private readonly _columnKeys = new Map<TableKey, Set<string>>();

  // ...........................................................................
  /**
   * Returns the latest table configuration, filling the cache lazily
   * from IoTools (which picks the config with the most columns).
   * @param table - The table to get the configuration for
   */
  private async _latestCfg(table: TableKey): Promise<TableCfg> {
    let cfg = this._latestCfgs.get(table);
    if (!cfg) {
      cfg = await this._ioTools.tableCfg(table);
      this._latestCfgs.set(table, cfg);
    }
    return cfg;
  }

  /**
   * Updates the cached latest configuration of a table
   * @param cfg - The new latest configuration
   */
  private _setLatestCfg(cfg: TableCfg): void {
    this._latestCfgs.set(cfg.key, cfg);
    this._columnKeys.set(cfg.key, new Set(cfg.columns.map((c) => c.key)));
  }

  /**
   * Throws when one of the given columns does not exist in the table.
   * Mirrors IoTools.throwWhenColumnDoesNotExist but uses the cached
   * configuration.
   * @param table - The table to check
   * @param columns - The columns to check
   */
  private async _throwWhenColumnDoesNotExist(
    table: TableKey,
    columns: string[],
  ): Promise<void> {
    let columnKeys = this._columnKeys.get(table);
    if (!columnKeys) {
      const cfg = await this._latestCfg(table);
      columnKeys = new Set(cfg.columns.map((c) => c.key));
      this._columnKeys.set(table, columnKeys);
    }

    const missingColumns = columns.filter((column) => !columnKeys.has(column));
    if (missingColumns.length > 0) {
      throw new Error(
        `The following columns do not exist in table "${table}": ${missingColumns.join(
          ', ',
        )}.`,
      );
    }
  }

  /**
   * Throws when the data does not match the table configurations.
   * Mirrors IoTools.throwWhenTableDataDoesNotMatchCfg but uses the
   * cached configurations.
   * @param data - The data to validate
   */
  private async _throwWhenTableDataDoesNotMatchCfg(
    data: Rljson,
  ): Promise<void> {
    const errors: string[] = [];

    for (const tableKey of Object.keys(data)) {
      const table = data[tableKey] as TableType;

      // Skip non-table values (like _hash) — mirrors iterateTables
      if (typeof table !== 'object' || !Array.isArray(table?._data)) continue;

      // Ignore tableCfgs table
      /* v8 ignore next -- @preserve */
      if (table._type === 'tableCfgs') continue;

      const tableCfg = await this._latestCfg(tableKey);
      errors.push(...validateRljsonAgainstTableCfg(table._data, tableCfg));
    }

    if (errors.length > 0) {
      throw new Error(
        `Table data does not match the configuration.\n\nErrors:\n${errors
          .map((e) => `- ${e}`)
          .join('\n')}`,
      );
    }
  }

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
      _type: 'tableCfgs',
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
    this._ioTools.sortTableDataAndUpdateHash(this._mem.tableCfgs);
    this._setLatestCfg(newConfig);

    // Create a table and write it into the database
    const table: TableType = {
      _type: newConfig.type,
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
    this._ioTools.sortTableDataAndUpdateHash(this._mem.tableCfgs);
    this._setLatestCfg(newConfig);

    // Update the config of the existing table
    const table = this._mem[newConfig.key] as TableType;
    table._tableCfg = newConfig._hash as string;

    // Update the hashes
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
  private async _contentType(request: { table: string }): Promise<ContentType> {
    await this._ioTools.throwWhenTableDoesNotExist(request.table);

    return (this._mem[request.table] as TableType)._type;
  }

  // ...........................................................................
  private async _write(request: { data: Rljson }): Promise<void> {
    const addedData = hsh(request.data);
    const removedNullValues = this._removeNullValues(addedData);
    const tables = Object.keys(addedData);

    // Row hashes only change when null values were actually removed
    if (removedNullValues) {
      hsh(addedData);
    }

    await this._ioTools.throwWhenTablesDoNotExist(request.data);
    await this._throwWhenTableDataDoesNotMatchCfg(request.data);

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

      this._ioTools.sortTableDataAndUpdateHash(oldTable);
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
    await this._throwWhenColumnDoesNotExist(
      request.table,
      Object.keys(request.where),
    );

    // Read table from data
    const table = this._mem[request.table] as TableType;

    // Filter table data
    const tableDataFiltered = table._data.filter((row) => {
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
    });

    // Create an table
    const tableFiltered: TableType = {
      _type: table._type,
      _data: tableDataFiltered,
    };

    this._ioTools.sortTableDataAndUpdateHash(tableFiltered);

    const result: Rljson = {
      [request.table]: tableFiltered,
    };

    return result;
  }

  _removeNullValues(rljson: Rljson): boolean {
    let removedAny = false;

    iterateTablesSync(rljson, (table) => {
      const data = rljson[table]._data;

      for (const row of data) {
        for (const key in row) {
          if (row[key] === null) {
            delete row[key];
            removedAny = true;
          }
        }
      }
    });

    return removedAny;
  }
}
