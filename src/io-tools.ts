// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { hip } from '@rljson/hash';
import {
  iterateTables,
  Rljson,
  TableCfg,
  TableKey,
  TableType,
  throwOnInvalidTableCfg,
  validateRljsonAgainstTableCfg,
} from '@rljson/rljson';

import { IoMem } from './io-mem.ts';
import { Io } from './io.ts';

/**
 * Provides utility functions for the Io interface.
 */
export class IoTools {
  /**
   * Constructor
   * @param io The Io interface to use
   */
  constructor(public readonly io: Io) {}

  /**
   * Returns the table configuration of the tableCfgs table.
   */
  static get tableCfgsTableCfg() {
    const tableCfg = hip<TableCfg>({
      _hash: '',
      key: 'tableCfgs',
      type: 'ingredients',
      isHead: false,
      isRoot: false,
      isShared: true,
      previous: '',

      columns: [
        { key: '_hash', type: 'string' },
        { key: 'key', type: 'string' },
        { key: 'type', type: 'string' },
        { key: 'isHead', type: 'boolean' },
        { key: 'isRoot', type: 'boolean' },
        { key: 'isShared', type: 'boolean' },
        { key: 'previous', type: 'string' },
        { key: 'columns', type: 'jsonArray' },
      ],
    });

    return tableCfg;
  }

  /**
   * Initializes the revisions table.
   */
  initRevisionsTable = async () => {
    const tableCfg: TableCfg = {
      key: 'revisions',
      type: 'ingredients',
      isHead: true,
      isRoot: true,
      isShared: false,

      columns: [
        { key: '_hash', type: 'string' },
        { key: 'table', type: 'string' },
        { key: 'predecessor', type: 'string' },
        { key: 'successor', type: 'string' },
        { key: 'timestamp', type: 'number' },
        { key: 'id', type: 'string' },
      ],
    };

    await this.io.createOrExtendTable({ tableCfg });
  };

  /**
   * Example object for test purposes
   * @returns An instance of io tools
   */
  static example = async () => {
    const io = await IoMem.example();
    await io.init();
    await io.isReady();
    return new IoTools(io);
  };

  /**
   * Throws if the table does not exist
   */
  async throwWhenTableDoesNotExist(table: TableKey): Promise<void> {
    const exists = await this.io.tableExists(table);
    if (!exists) {
      throw new Error(`Table "${table}" not found`);
    }
  }

  /**
   * Throws if any of the tables in rljson do not exist
   * @param rljson - The Rljson object to check
   */
  async throwWhenTablesDoNotExist(rljson: Rljson): Promise<void> {
    try {
      await iterateTables(rljson, async (tableKey) => {
        const exists = await this.io.tableExists(tableKey);
        if (!exists) {
          throw new Error(`Table "${tableKey}" not found`);
        }
      });
    } catch (e) {
      const missingTables = (e as Array<any>).map((e) => e.tableKey);

      throw new Error(
        `The following tables do not exist: ${missingTables.join(', ')}`,
      );
    }
  }

  /**
   * Returns the current table cfgs of all tables
   * @returns The table configuration of all tables
   */
  async tableCfgs(): Promise<TableCfg[]> {
    const tableCfgDump = await this.io.dumpTable({ table: 'tableCfgs' });
    const tables = tableCfgDump.tableCfgs._data as TableCfg[];

    // Take the latest version of each type key
    const newestVersion: Record<TableKey, TableCfg> = {};
    for (let i = tables.length - 1; i >= 0; i--) {
      const table = tables[i];
      const existing = newestVersion[table.key];
      if (!existing || existing.columns.length < table.columns.length) {
        newestVersion[table.key] = table;
      }
    }

    const resultData = Object.values(newestVersion).sort((a, b) => {
      if (a.key < b.key) {
        return -1;
      }
      if (a.key > b.key) {
        return 1;
        /* v8 ignore start */
      }

      return 0;
      /* v8 ignore end */
    });
    return resultData;
  }

  /**
   * Returns a list with all table names
   */
  async allTableKeys(): Promise<string[]> {
    const result = (await this.tableCfgs()).map((e) => e.key);
    return result;
  }

  /**
   * Returns the configuration of a given table
   */
  async tableCfg(table: TableKey): Promise<TableCfg> {
    const tableCfg = await this.tableCfgOrNull(table);
    if (!tableCfg) {
      throw new Error(`Table "${table}" not found`);
    }

    return tableCfg!;
  }

  /**
   * Returns the configuration of a given table or null if it does not exist.

   */
  async tableCfgOrNull(table: TableKey): Promise<TableCfg | null> {
    const tableCfgs = await this.tableCfgs();
    const tableCfg = tableCfgs.find((e) => e.key === table);
    return tableCfg ?? null;
  }

  /**
   * Returns a list of all column names of a given table
   */
  async allColumnKeys(table: TableKey): Promise<string[]> {
    const tableCfg = await this.tableCfg(table);
    const result = tableCfg.columns.map((column) => column.key);
    return result;
  }

  /**
   * Throws when a column does not exist in a given table
   * @param table - The table to check
   * @param columns - The column to check
   */
  async throwWhenColumnDoesNotExist(
    table: TableKey,
    columns: string[],
  ): Promise<void> {
    const tableCfg = await this.tableCfg(table);
    const columnKeys = tableCfg.columns.map((column) => column.key);
    const missingColumns = columns.filter(
      (column) => !columnKeys.includes(column),
    );
    if (missingColumns.length > 0) {
      throw new Error(
        `The following columns do not exist in table "${table}": ${missingColumns.join(
          ', ',
        )}.`,
      );
    }
  }

  /**
   * Throws when a table update is not compatible with the current table
   * configuration.
   */
  async throwWhenTableIsNotCompatible(update: TableCfg): Promise<void> {
    const prefix = `Invalid update of table able "${update.key}"`;

    throwOnInvalidTableCfg(update);

    // Check compatibility with existing table
    const existing = await this.tableCfgOrNull(update.key);
    if (existing) {
      // Have columns been deleted?
      if (existing.columns.length > update.columns.length) {
        const deletedColumnKeys = existing.columns
          .map((column) => column.key)
          .filter(
            (key) => !update.columns.some((column) => column.key === key),
          );
        if (deletedColumnKeys.length > 0) {
          const deletedColumns = deletedColumnKeys.join(', ');
          throw new Error(
            `${prefix}: Columns must not be deleted. ` +
              `Deleted columns: ${deletedColumns}}`,
          );
        }
      }

      // Have column keys changed?
      for (let i = 0; i < existing.columns.length; i++) {
        const before = existing.columns[i].key;
        const after = update.columns[i].key;
        if (before !== after) {
          throw new Error(
            `${prefix}: ` +
              `Column keys must not change! ` +
              `Column "${before}" was renamed into "${after}".`,
          );
        }
      }

      // Have column types changed?
      for (let i = 0; i < existing.columns.length; i++) {
        const column = existing.columns[i].key;
        const before = existing.columns[i].type;
        const after = update.columns[i].type;
        if (before !== after) {
          throw new Error(
            `${prefix}: ` +
              `Column types must not change! ` +
              `Type of column "${column}" was changed from "${before}" to ${after}.`,
          );
        }
      }
    }
  }

  /**
   * Throws if the data in the table do not match the table configuration
   */
  async throwWhenTableDataDoesNotMatchCfg(data: Rljson) {
    const errors: string[] = [];

    await iterateTables(data, async (tableKey) => {
      const tableCfg = await this.tableCfg(tableKey);
      const table = data[tableKey];
      errors.push(...validateRljsonAgainstTableCfg(table._data, tableCfg));
    });

    if (errors.length > 0) {
      throw new Error(
        `Table data does not match the configuration.\n\nErrors:\n${errors
          .map((e) => `- ${e}`)
          .join('\n')}`,
      );
    }
  }

  /**
   * Sorts the data of a table by the hash and updates the table hash in place
   */
  sortTableDataAndUpdateHash(table: TableType): void {
    table._data.sort((a, b) => {
      const hashA = a._hash as string;
      const hashB = b._hash as string;
      if (hashA < hashB) {
        return -1;
      }
      if (hashA > hashB) {
        return 1;
        /* v8 ignore start */
      }

      return 0;
      /* v8 ignore end */
    });

    table._hash = '';
    hip(table, {
      updateExistingHashes: false,
      throwOnWrongHashes: false,
    });
  }
}
