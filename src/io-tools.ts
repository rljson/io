// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { hip } from '@rljson/hash';
import { jsonValueTypes } from '@rljson/json';
import { TableCfg, TableKey } from '@rljson/rljson';

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
   * Initializes the revisions table.
   */
  initRevisionsTable = async () => {
    const tableCfg: TableCfg = {
      version: 1,
      key: 'revisions',
      type: 'ingredients',
      isHead: true,
      isRoot: true,
      isShared: false,

      columns: [
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
   * Returns the table configuration of the tableCfgs table.
   */
  get tableCfgsTableCfg() {
    const tableCfg = hip<TableCfg>({
      _hash: '',
      key: 'tableCfgs',
      type: 'ingredients',
      isHead: false,
      isRoot: false,
      isShared: true,
      version: 1,

      columns: [
        { key: '_hash', type: 'string' },
        { key: 'key', type: 'string' },
        { key: 'type', type: 'string' },
        { key: 'isHead', type: 'boolean' },
        { key: 'isRoot', type: 'boolean' },
        { key: 'isShared', type: 'boolean' },
        { key: 'version', type: 'number' },
        { key: 'columns', type: 'jsonArray' },
      ],
    });

    return tableCfg;
  }

  /**
   * Example object for test purposes
   * @returns An instance of io tools
   */
  static example = async () => {
    const io = await IoMem.example();
    return new IoTools(io);
  };

  /**
   * Returns a list with all table names
   */
  async allTableKeys(): Promise<string[]> {
    const result = (await this.io.tableCfgs()).tableCfgs._data.map(
      (e) => e.key,
    );
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
    const tableCfgs = await this.io.tableCfgs();
    const tableCfg = tableCfgs.tableCfgs._data.find((e) => e.key === table);
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
   * Throws when a table update is not compatible with the current table
   * configuration.
   */
  async throwWhenTableIsNotCompatible(update: TableCfg): Promise<void> {
    const prefix = `Invalid update of table able "${update.key}"`;

    // Have all columns one of the supported types?
    for (const column of update.columns) {
      if (!jsonValueTypes.includes(column.type)) {
        throw new Error(
          `${prefix}: Column "${column.key}" has an unsupported type "${column.type}"`,
        );
      }
    }

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
}
