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
import { ioTrace } from './io-trace.ts';
import { Io } from './io.ts';
import { PeerSocketMock } from './peer-socket-mock.ts';


// ...........................................................................
/**
 * Type representing an Io instance along with its capabilities and priority.
 */
export type IoMultiIo = {
  io: Io;
  id?: string;
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
    for (let idx = 0; idx < this._ios.length; idx++) {
      const { io } = this._ios[idx];
      if (io.isOpen === false) {
        throw new Error(
          'All underlying Io instances must be initialized before initializing IoMulti',
        );
      }

      this._ios[idx] = { ...this._ios[idx], id: `io-${idx}` };
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
      this.dumpables.map(({ io: dumpable }) => dumpable.dump()),
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

    for (const { io: dumpable } of this.dumpables) {
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
   * Retrieves the content type of a specific table from the first
   * underlying readable Io instance that contains the table. Skips
   * readables that are closed right now, using the next open one
   * instead.
   * @param request An object containing the table name.
   * @returns A promise that resolves to the content type of the table.
   */
  async contentType(request: { table: string }): Promise<ContentType> {
    /* v8 ignore next -- @preserve */
    if (this.readables.length === 0) {
      throw new Error('No readable Io available');
    }

    const errors: Error[] = [];
    for (const ioMultiIo of this.readables) {
      if (IoMulti._isClosed(ioMultiIo, errors)) continue;
      return ioMultiIo.io.contentType(request);
    }

    // Every readable was closed (the loop above only falls through
    // without returning in that case) — throw the recorded reason
    // instead of a generic "not found", which would look like a config
    // problem rather than "nothing was reachable".
    throw errors[0];
  }

  // ...........................................................................
  /**
   * Checks if a specific table exists in any of the underlying readable Io
   * instances.  Readables at the same priority level are queried in parallel
   * so that one slow peer does not block others. Readables that are
   * closed right now are skipped; if that leaves no readable at all to
   * ask, the call throws instead of returning `false` (which would
   * misleadingly claim the table was confirmed absent).
   * @param tableKey The key of the table to check.
   * @returns A promise that resolves to true if the table exists in any readable Io, false otherwise.
   */
  async tableExists(tableKey: TableKey): Promise<boolean> {
    /* v8 ignore next -- @preserve */
    if (this.readables.length === 0) {
      throw new Error('No readable Io available');
    }

    const errors: Error[] = [];
    let anyOpen = false;

    const groups = IoMulti._groupByPriority(this.readables);
    for (const group of groups) {
      const openGroup = IoMulti._skipClosed(group, errors);
      if (openGroup.length === 0) continue;
      anyOpen = true;

      if (openGroup.length === 1) {
        const exists = await openGroup[0].io.tableExists(tableKey);
        if (exists) return true;
      } else {
        const results = await Promise.allSettled(
          openGroup.map((r) => r.io.tableExists(tableKey)),
        );
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value) return true;
        }
      }
    }

    if (!anyOpen) {
      throw errors[0];
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
    const creations = this.writables.map(({ io: writable }) =>
      writable.createOrExtendTable(request),
    );
    return Promise.all(creations).then(() => Promise.resolve());
  }

  // ...........................................................................
  /**
   * Retrieves the raw table configurations from the highest priority underlying
   * readable Io instance that has any.  Stops after the first readable that
   * returns results — this avoids expensive network round-trips to lower-
   * priority peers when the local cache (IoMem, priority 1) already has the
   * answer. Readables that are closed right now are skipped in favor of
   * the next open one.
   * @returns A promise that resolves to an array of table configurations.
   */
  async rawTableCfgs(): Promise<TableCfg[]> {
    /* v8 ignore next -- @preserve */
    if (this.readables.length === 0) {
      throw new Error('No readable Io available');
    }

    const rawTableCfgs: Map<string, TableCfg> = new Map();
    const errors: Error[] = [];
    let anyOpen = false;

    for (const ioMultiIo of this.readables) {
      if (IoMulti._isClosed(ioMultiIo, errors)) continue;
      anyOpen = true;

      const cfgs = await ioMultiIo.io.rawTableCfgs();
      /* v8 ignore else -- @preserve */
      if (cfgs.length > 0) {
        for (const tableCfg of cfgs) {
          if (!rawTableCfgs.has(tableCfg.key)) {
            rawTableCfgs.set(tableCfg.key, tableCfg);
          }
        }
        break; // Stop after the first readable that has table configs
      }
    }

    // Every readable was closed — throw instead of pretending there are
    // simply no table configs anywhere.
    if (!anyOpen) {
      throw errors[0];
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
    const writes = this.writables.map(({ io: writable }) =>
      writable.write(request),
    );
    return Promise.all(writes).then(() => Promise.resolve());
  }

  // ...........................................................................
  /**
   * Reads rows from a specific table.  Readables are grouped by priority:
   * priorities are tried in ascending order.  Within a priority group,
   * all readables are queried **in parallel** — only the first one to
   * return rows wins.  This prevents one slow/stale peer from blocking
   * others at the same priority level.
   *
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
    let readFrom: string = '';

    const errors: Error[] = [];

    // Skip readables that are closed right now; each skip is recorded
    // as an error so that an all-closed situation still throws below
    // instead of silently returning an empty result.
    const openReadables = IoMulti._skipClosed(this.readables, errors);

    // Group readables by priority (already sorted by priority)
    const groups = IoMulti._groupByPriority(openReadables);

    ioTrace(
      () =>
        `IoMulti.readRows table=${request.table} readables=${this.readables.length} open=${openReadables.length} groups=${groups.length}`,
    );

    for (const group of groups) {
      if (group.length === 1) {
        // Single readable at this priority — query directly (no race overhead)
        const readable = group[0];
        try {
          const { [request.table]: tableData } = await readable.io.readRows(
            request,
          );
          const tableRows = (tableData as RljsonTable<Json, ContentType>)
            ._data;
          const tableType = (tableData as RljsonTable<Json, ContentType>)
            ._type;
          tableExistsAny = true;
          type ??= tableType;

          ioTrace(
            () =>
              `IoMulti.readRows group priority=${readable.priority} size=1 rows=${tableRows.length}`,
          );

          if (tableRows.length > 0) {
            /* v8 ignore next -- @preserve */
            readFrom = readable.id ?? '';
            /* v8 ignore else -- @preserve */
            for (const tableRow of tableRows) {
              const ref = tableRow._hash as string;
              rows.set(ref, tableRow);
            }
            break; // Got rows — done
          }
        } catch (e) {
          errors.push(e as Error);
          ioTrace(
            () =>
              `IoMulti.readRows group priority=${readable.priority} size=1 error=${(e as Error).message}`,
          );
        }
      } else {
        // Multiple readables at the same priority — race them in parallel.
        // Collect all settled results and pick the first with rows.
        const results = await Promise.allSettled(
          group.map(async (readable) => {
            const { [request.table]: tableData } = await readable.io.readRows(
              request,
            );
            return {
              readable,
              tableRows: (tableData as RljsonTable<Json, ContentType>)._data,
              tableType: (tableData as RljsonTable<Json, ContentType>)._type,
            };
          }),
        );

        let foundRows = false;
        for (const result of results) {
          if (result.status === 'rejected') {
            errors.push(result.reason as Error);
            continue;
          }
          tableExistsAny = true;
          const { readable, tableRows, tableType } = result.value;
          type ??= tableType;
          if (tableRows.length > 0 && !foundRows) {
            foundRows = true;
            readFrom = readable.id ?? '';
            /* v8 ignore else -- @preserve */
            for (const tableRow of tableRows) {
              const ref = tableRow._hash as string;
              rows.set(ref, tableRow);
            }
          }
        }

        ioTrace(
          () =>
            `IoMulti.readRows group priority=${group[0].priority} size=${group.length} found=${foundRows}`,
        );

        if (foundRows) break; // Got rows — done
      }
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
      // Same rule as the batch read: a readable that threw leaves us unable to
      // say the row is absent, so an empty answer would be a lie the caller
      // cannot detect.
      const unanswered = IoMulti._realFailures(request.table, errors);
      if (rows.size === 0 && unanswered.length > 0) {
        throw unanswered[0];
      }
      const rljson = {
        [request.table]: hip({ _data: Array.from(rows.values()), _type: type }),
      } as Rljson;

      // Write merged rows back to all writables (hot-swapping cache)
      if (this.writables.length > 0 && rows.size > 0) {
        for (const writeable of this.writables) {
          if (writeable.id === readFrom) {
            continue; // Skip writing back to the source readable Io
          }
          /* v8 ignore next -- @preserve */
          try {
            await writeable.io.write({
              data: rljson,
            });
          } catch {
            continue; // Table does not exist in this writable Io
          }
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
   * The errors that mean a readable could NOT ANSWER, as opposed to answering
   * that it has nothing.
   *
   * "Table not found" is the second kind: in a cascade it is normal for a
   * readable not to serve a given table, and it says nothing about whether the
   * row exists elsewhere. A closed socket or a timeout is the first kind, and
   * that is what must not be reported as an empty result.
   * @param table - The table that was read.
   * @param errors - Errors collected from the readables.
   * @returns The errors that leave the answer unknown.
   */
  private static _realFailures(table: string, errors: Error[]): Error[] {
    return errors.filter(
      (err) => !err.message.includes(`Table "${table}" not found`),
    );
  }

  // ...........................................................................
  /**
   * Batch read with PER-HASH cascade: every hash not found in a
   * higher-priority readable is looked up in the next one. Readables
   * without readRowsByHashes are queried per hash via readRows.
   * @param request - The table and the row hashes to read
   */
  async readRowsByHashes(request: {
    table: string;
    hashes: string[];
  }): Promise<Rljson> {
    /* v8 ignore next -- @preserve */
    if (this.readables.length === 0) {
      throw new Error('No readable Io available');
    }

    let tableExistsAny = false;
    const rows: Map<string, Json> = new Map();
    let type: ContentType | undefined = undefined;
    let readFrom: string = '';
    const errors: Error[] = [];

    let remaining = Array.from(new Set(request.hashes));

    for (const readable of this.readables) {
      if (remaining.length === 0) break;

      // Skip readables that are closed right now — recorded as an
      // error (see IoMulti._isClosed) so that an all-closed cascade
      // still throws below instead of returning an empty result.
      if (IoMulti._isClosed(readable, errors)) {
        continue;
      }

      try {
        let result: Rljson;
        if (readable.io.readRowsByHashes) {
          result = await readable.io.readRowsByHashes({
            table: request.table,
            hashes: remaining,
          });
        } else {
          result = await IoMulti._readHashesViaReadRows(
            readable.io,
            request.table,
            remaining,
          );
        }

        const tableData = result[request.table] as RljsonTable<
          Json,
          ContentType
        >;
        tableExistsAny = true;
        // The table type is identical across all ios serving the table
        type = tableData._type;

        if (tableData._data.length > 0) {
          // Same hint as in readRows: both sides are exercised by tests
          // but v8 cannot attribute this branch across the await above
          /* v8 ignore next -- @preserve */
          readFrom = readable.id ?? '';
          for (const tableRow of tableData._data) {
            rows.set(tableRow._hash as string, tableRow);
          }
          remaining = remaining.filter((hash) => !rows.has(hash));
        }
      } catch (e) {
        errors.push(e as Error);
      }
    }

    if (!tableExistsAny) {
      /* v8 ignore if -- @preserve */
      if (errors.length === 0) {
        throw new Error(`Table "${request.table}" not found`);
      } else {
        const preciseErrors = errors.filter(
          (err) => !err.message.includes(`Table "${request.table}" not found`),
        );
        /* v8 ignore next -- @preserve */
        if (preciseErrors.length > 0) {
          throw preciseErrors[0];
        } else {
          throw errors[0];
        }
      }
    }

    // A readable that FAILED is not a readable that had nothing. Dropping the
    // errors here turned "I could not ask" into "there is nothing" — and a
    // caller pulling document bodies by content hash cannot tell those apart:
    // it reads the empty answer as "already gone" and applies nothing. Measured
    // on the fleet: a node whose peer socket had dropped issued 1 705 body
    // pulls and applied none of them, while the hub held every document.
    //
    // Only report an empty or partial answer when nothing failed to answer.
    const unanswered = IoMulti._realFailures(request.table, errors);
    if (unanswered.length > 0 && remaining.length > 0) {
      throw unanswered[0];
    }

    const rljson = {
      [request.table]: hip({ _data: Array.from(rows.values()), _type: type }),
    } as Rljson;

    // Write merged rows back to all writables (hot-swapping cache) —
    // mirrors readRows
    if (this.writables.length > 0 && rows.size > 0) {
      for (const writeable of this.writables) {
        if (writeable.id === readFrom) {
          continue; // Skip writing back to the source readable Io
        }
        /* v8 ignore next -- @preserve */
        try {
          await writeable.io.write({ data: rljson });
        } catch {
          continue; // Table does not exist in this writable Io
        }
      }
    }

    return rljson;
  }

  /**
   * Per-hash fallback for readables without readRowsByHashes.
   * @param io - The readable io
   * @param table - The table to read from
   * @param hashes - The row hashes to read
   */
  private static async _readHashesViaReadRows(
    io: Io,
    table: string,
    hashes: string[],
  ): Promise<Rljson> {
    const results = await Promise.all(
      hashes.map((hash) => io.readRows({ table, where: { _hash: hash } })),
    );

    let type: ContentType | undefined = undefined;
    const rows: Json[] = [];
    for (const result of results) {
      const tableData = result[table] as RljsonTable<Json, ContentType>;
      type ??= tableData._type;
      rows.push(...tableData._data);
    }

    return { [table]: { _data: rows, _type: type } } as Rljson;
  }

  // ...........................................................................
  /**
   * Gets the list of underlying readable Io instances, sorted by priority.
   */
  get readables(): Array<IoMultiIo> {
    return this._ios
      .filter((ioMultiIo) => ioMultiIo.read)
      .sort((a, b) => a.priority - b.priority);
  }

  // ...........................................................................
  /**
   * Gets the list of underlying writable Io instances, sorted by priority.
   */
  get writables(): Array<IoMultiIo> {
    return this._ios
      .filter((ioMultiIo) => ioMultiIo.write)
      .sort((a, b) => a.priority - b.priority);
  }

  // ...........................................................................
  /**
   * Gets the list of underlying dumpable Io instances, sorted by priority.
   */
  get dumpables(): Array<IoMultiIo> {
    return this._ios
      .filter((ioMultiIo) => ioMultiIo.dump)
      .sort((a, b) => a.priority - b.priority);
  }

  // ...........................................................................
  /**
   * Returns true and records an Error in `errors` when the given
   * member's underlying Io reports itself closed (`io.isOpen ===
   * false`) at call time. `isOpen` is treated as "open" unless it is
   * literally `false` — this covers Io implementations that never set
   * the flag at all.
   *
   * Recording the skip as an error (instead of silently dropping the
   * member) matters: callers reuse the same error-collection path used
   * for genuine read failures, so when *every* potential holder of a
   * table turns out to be closed, the call throws a meaningful error
   * instead of returning a clean empty result that would be
   * indistinguishable from "table has no rows".
   * @param ioMultiIo - The candidate Io member.
   * @param errors - Error collector shared with the caller's error-handling path.
   */
  private static _isClosed(ioMultiIo: IoMultiIo, errors: Error[]): boolean {
    if (ioMultiIo.io.isOpen === false) {
      errors.push(new Error(`Io "${ioMultiIo.id ?? 'unknown'}" is closed`));
      return true;
    }
    return false;
  }

  // ...........................................................................
  /**
   * Filters out members that are closed right now (see `_isClosed`).
   * @param ios - The candidate Io members.
   * @param errors - Error collector shared with the caller's error-handling path.
   */
  private static _skipClosed(
    ios: Array<IoMultiIo>,
    errors: Error[],
  ): Array<IoMultiIo> {
    return ios.filter((ioMultiIo) => !IoMulti._isClosed(ioMultiIo, errors));
  }

  // ...........................................................................
  /**
   * Groups IoMultiIo entries by their priority value.
   * Input must already be sorted by priority (ascending).
   * Returns an array of groups, each group containing entries with the same
   * priority.
   */
  static _groupByPriority(ios: Array<IoMultiIo>): Array<Array<IoMultiIo>> {
    const groups: Array<Array<IoMultiIo>> = [];
    let current: Array<IoMultiIo> = [];
    let currentPriority: number | null = null;

    for (const io of ios) {
      if (io.priority !== currentPriority) {
        if (current.length > 0) groups.push(current);
        current = [io];
        currentPriority = io.priority;
      } else {
        current.push(io);
      }
    }
    if (current.length > 0) groups.push(current);

    return groups;
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
