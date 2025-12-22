// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { hip } from '@rljson/hash';
import { Json, JsonValue, merge } from '@rljson/json';
import { ContentType, Rljson, RljsonTable, TableCfg, TableKey, TableType } from '@rljson/rljson';

import { IoMem } from './io-mem.ts';
import { IoPeer } from './io-peer.ts';
import { Io } from './io.ts';
import { PeerSocketMock } from './peer-socket-mock.ts';


// ...........................................................................
/**
 * Type representing an Io instance along with its capabilities and priority.
 */
export type IoMultiIo = {
  io: Io;
  priority: number;
  read: boolean;
  write: boolean;
  dump: boolean;
};

// ...........................................................................
/**
 * Multi Io implementation that combines multiple underlying Io instances
 * with different capabilities (read, write, dump) and priorities.
 */
export class IoMulti implements Io {
  isOpen: boolean = false;

  constructor(private _ios: Array<IoMultiIo>) {}

  // ...........................................................................
  /**
   *
   * Initializes all underlying Io instances.
   * @returns
   */
  async init(): Promise<void> {
    for (const { io } of this._ios) {
      if (io.isOpen === false) {
        throw new Error(
          'All underlying Io instances must be initialized before initializing IoMulti',
        );
      }
    }

    this.isOpen = true;
    return Promise.resolve();
  }

  // ...........................................................................
  /**
   * Closes all underlying Io instances.
   * @returns
   */
  async close(): Promise<void> {
    await Promise.all(this._ios.map((ioMultiIo) => ioMultiIo.io.close()));

    this.isOpen = false;

    return Promise.resolve();
  }

  // ...........................................................................
  /**
   * Returns a promise that resolves once all underlying Io instances are ready.
   * @returns
   */
  isReady(): Promise<void> {
    return Promise.all(
      this._ios.map((ioMultiIo) => ioMultiIo.io.isReady()),
    ).then(() => Promise.resolve());
  }

  // ...........................................................................
  /**
   * Dumps the entire database content by merging dumps from all dumpable underlying Io instances.
   * @returns
   */
  async dump(): Promise<Rljson> {
    /* v8 ignore next -- @preserve */
    if (this.dumpables.length === 0) {
      throw new Error('No dumpable Io available');
    }

    const dumps = await Promise.all(
      this.dumpables.map((dumpable) => dumpable.dump()),
    );

    return merge(...dumps) as Rljson;
  }

  // ...........................................................................
  /**
   * Dumps a specific table by merging dumps from all dumpable underlying Io instances that contain the table.
   * @param request An object containing the table name to dump.
   * @returns A promise that resolves to the dumped table data.
   */
  async dumpTable(request: { table: string }): Promise<Rljson> {
    /* v8 ignore next -- @preserve */
    if (this.dumpables.length === 0) {
      throw new Error('No dumpable Io available');
    }

    const dumps: Rljson[] = [];

    for (const dumpable of this.dumpables) {
      try {
        const dump = await dumpable.dumpTable(request);
        dumps.push(dump);
      } catch {
        continue; // Table does not exist in this dumpable Io
      }
    }

    if (dumps.length === 0) {
      throw new Error(`Table "${request.table}" not found`);
    }

    return merge(...dumps) as Rljson;
  }

  // ...........................................................................
  /**
   * Retrieves the content type of a specific table from the first underlying readable Io instance that contains the table.
   * @param request An object containing the table name.
   * @returns A promise that resolves to the content type of the table.
   */
  async contentType(request: { table: string }): Promise<ContentType> {
    /* v8 ignore next -- @preserve */
    if (this.readables.length === 0) {
      throw new Error('No readable Io available');
    }

    for (const readable of this.readables) {
      return readable.contentType(request);
    }
    /* v8 ignore next -- @preserve */
    throw new Error(`Table "${request.table}" not found`);
  }

  // ...........................................................................
  /**
   * Checks if a specific table exists in any of the underlying readable Io instances.
   * @param tableKey The key of the table to check.
   * @returns A promise that resolves to true if the table exists in any readable Io, false otherwise.
   */
  async tableExists(tableKey: TableKey): Promise<boolean> {
    /* v8 ignore next -- @preserve */
    if (this.readables.length === 0) {
      throw new Error('No readable Io available');
    }

    for (let i = 0; i < this.readables.length; i++) {
      const readable = this.readables[i];
      const exists = await readable.tableExists(tableKey);
      if (exists) {
        return true;
      }
    }
    return false;
  }

  // ...........................................................................
  /**
   * Creates or extends a table in all underlying writable Io instances.
   * @param request An object containing the table configuration.
   * @returns A promise that resolves once the table has been created or extended in all writable Io instances.
   */
  createOrExtendTable(request: { tableCfg: TableCfg }): Promise<void> {
    /* v8 ignore next -- @preserve */
    if (this.writables.length === 0) {
      throw new Error('No writable Io available');
    }
    //Create or extend table in all writables in parallel and resolve when all have completed
    const creations = this.writables.map((writable) =>
      writable.createOrExtendTable(request),
    );
    return Promise.all(creations).then(() => Promise.resolve());
  }

  // ...........................................................................
  /**
   * Retrieves the raw table configurations from the highest priority underlying readable Io instance.
   * @returns A promise that resolves to an array of table configurations.
   */
  async rawTableCfgs(): Promise<TableCfg[]> {
    /* v8 ignore next -- @preserve */
    if (this.readables.length === 0) {
      throw new Error('No readable Io available');
    }

    const rawTableCfgs: Map<string, TableCfg> = new Map();
    for (const readable of this.readables) {
      const cfgs = await readable.rawTableCfgs();
      /* v8 ignore else -- @preserve */
      if (cfgs.length > 0) {
        for (const tableCfg of cfgs) {
          if (!rawTableCfgs.has(tableCfg.key)) {
            rawTableCfgs.set(tableCfg.key, tableCfg);
          }
        }
      }
    }
    return Array.from(rawTableCfgs.values());
  }

  // ...........................................................................
  /**
   * Writes data to all underlying writable Io instances.
   * @param request - An object containing the data to write.
   * @returns A promise that resolves once the data has been written to all writable Io instances.
   */
  write(request: { data: Rljson }): Promise<void> {
    /* v8 ignore next -- @preserve */
    if (this.writables.length === 0) {
      throw new Error('No writable Io available');
    }

    // Write to all writables in parallel and resolve when all have completed
    const writes = this.writables.map((writable) => writable.write(request));
    return Promise.all(writes).then(() => Promise.resolve());
  }

  // ...........................................................................
  /**
   * Reads rows from the first underlying readable Io instance that contains the requested table and has matching rows.
   * @param request An object containing the table name and where clause.
   * @returns A promise that resolves to the read rows.
   */
  async readRows(request: {
    table: string;
    where: { [column: string]: JsonValue | null };
  }): Promise<Rljson> {
    /* v8 ignore next -- @preserve */
    if (this.readables.length === 0) {
      throw new Error('No readable Io available');
    }

    let tableExistsAny = false;
    const rows: Map<string, Json> = new Map();
    let type: ContentType | undefined = undefined;
    const errors: Error[] = [];
    for (const readable of this.readables) {
      // Read rows from this readable Io
      let tableRows: any[] = [];
      let tableType: ContentType;

      try {
        const { [request.table]: tableData } = await readable.readRows(request);
        tableRows = (tableData as RljsonTable<Json, ContentType>)._data;
        tableType = (tableData as RljsonTable<Json, ContentType>)._type;
        tableExistsAny = true;
      } catch (e) {
        errors.push(e as Error);
        continue; // Table does not exist in this readable Io
      }

      /* v8 ignore else -- @preserve */
      for (const tableRow of tableRows) {
        const ref = tableRow._hash;
        rows.set(ref, tableRow);
      }

      type ??= tableType;
    }

    if (!tableExistsAny) {
      /* v8 ignore if -- @preserve */
      if (errors.length === 0) {
        throw new Error(`Table "${request.table}" not found`);
      } else {
        const preciseErrors = errors.filter(
          (err) => !err.message.includes(`Table "${request.table}" not found`),
        );
        if (preciseErrors.length > 0) {
          throw preciseErrors[0];
        } else {
          throw errors[0];
        }
      }
    } else {
      const rljson = {
        [request.table]: hip({ _data: Array.from(rows.values()), _type: type }),
      } as Rljson;

      // Write merged rows back to all writables (hot-swapping cache)
      for (const writeable of this.writables) {
        try {
          await writeable.write({
            data: rljson,
          });
        } catch {
          continue; // Table does not exist in this writable Io
        }
      }

      // Return merged rows
      return rljson;
    }
  }

  // ...........................................................................
  /**
   * Retrieves the row count of a specific table by aggregating row counts from all dumpable underlying Io instances.
   * @param table The name of the table.
   * @returns A promise that resolves to the row count of the table.
   */
  async rowCount(table: string): Promise<number> {
    /* v8 ignore next -- @preserve */
    if (this.dumpables.length === 0) {
      throw new Error('No dumpable Io available');
    }

    const dumpTable = await this.dumpTable({ table });
    const tableData: TableType = dumpTable[table];
    /* v8 ignore next -- @preserve */
    if (!tableData) {
      throw new Error(`Table "${table}" not found`);
    }
    return Promise.resolve(tableData._data.length);
  }

  // ...........................................................................
  /**
   * Gets the list of underlying readable Io instances, sorted by priority.
   */
  get readables(): Array<Io> {
    return this._ios
      .filter((ioMultiIo) => ioMultiIo.read)
      .sort((a, b) => a.priority - b.priority)
      .map((ioMultiIo) => ioMultiIo.io);
  }

  // ...........................................................................
  /**
   * Gets the list of underlying writable Io instances, sorted by priority.
   */
  get writables(): Array<Io> {
    return this._ios
      .filter((ioMultiIo) => ioMultiIo.write)
      .sort((a, b) => a.priority - b.priority)
      .map((ioMultiIo) => ioMultiIo.io);
  }

  // ...........................................................................
  /**
   * Gets the list of underlying dumpable Io instances, sorted by priority.
   */
  get dumpables(): Array<Io> {
    return this._ios
      .filter((ioMultiIo) => ioMultiIo.dump)
      .sort((a, b) => a.priority - b.priority)
      .map((ioMultiIo) => ioMultiIo.io);
  }

  // ...........................................................................
  static example = async () => {
    const ioPeerMem = await IoMem.example();
    await ioPeerMem.init();

    const ioPeerSocket = new PeerSocketMock(ioPeerMem);
    const ioPeer = new IoPeer(ioPeerSocket);
    await ioPeer.init();

    const ioMem = await IoMem.example();
    await ioMem.init();

    const ios: Array<IoMultiIo> = [
      { io: ioPeer, priority: 1, read: true, write: false, dump: false },
      { io: ioMem, priority: 0, read: true, write: true, dump: true },
    ];

    const ioMulti = new IoMulti(ios);
    await ioMulti.init();

    return ioMulti;
  };
}
