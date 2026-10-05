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
 * How long ONE source may take to answer a batch read while another source
 * could still be asked.
 *
 * `readRowsByHashes` walks the readables sequentially, narrowing the wanted
 * hashes as it goes — that ordering is load-bearing, so the cascade cannot be
 * grouped and raced the way `readRows` is. The cost was that a source which is
 * open and never answers blocked every source BEHIND it for its full request
 * timeout: `IoPeer`'s default is 30 s, and this is the path a TREE fetch takes
 * (`@rljson/db`'s tree-controller calls `readRowsByHashes`).
 *
 * Measured in `@rljson/fs-agent`: a node resolved a peer's announcement,
 * lifted its tombstone for the re-created path, and then sat in the tree fetch
 * while a cut peer timed out. The file arrived only when the test window was
 * widened to 120 s.
 *
 * **The bound applies only while a FALLBACK exists.** The last readable in the
 * cascade is never bounded, because there is nobody else to ask — so a cloud
 * store at the end keeps exactly the behaviour it had, and a slow-but-working
 * WAN source is only ever skipped when somebody nearer can answer instead.
 *
 * **And it decides who is asked FIRST, never who is believed.** A source past
 * the bound is SET ASIDE, not abandoned: if the batch is still short once
 * everybody else has answered, the cascade comes back to it — see
 * {@link BATCH_READ_SET_ASIDE_TIMEOUT_MS}. `@rljson/bs` shipped this bound
 * without that second half and lost a working read to it within a day: a blob
 * only one client held, fetched over a socket through the hub, took longer
 * than two seconds on a loaded runner and the cascade gave up with the data
 * reachable. Fifteen of ninety-one tests failed there once the bound was
 * forced to bite.
 *
 * Two seconds, not thirty: a LAN peer that is working answers a batch in
 * milliseconds, and the source this is meant to protect against is one that
 * answers never. The real WAN source — a cloud store — sits LAST in the
 * cascade by design (`server.ts` puts it at priority 3), so it has no fallback
 * behind it and is never bounded by this at all.
 */
export const BATCH_READ_SOURCE_TIMEOUT_MS = 2_000;

/**
 * How long a SET-ASIDE source gets once nobody else could complete the batch.
 *
 * Generous on purpose. At this point the alternative is not a faster answer,
 * it is no answer: every other readable has been asked and the batch is still
 * short, so waiting is the only thing left that can succeed. Five times the
 * first bound covers a loaded machine without reinstating the hang this file
 * set out to remove — an `IoPeer` would reject on its own after 30 s anyway,
 * and a source that is neither bounded nor self-timing cannot be allowed to
 * hold the cascade for ever.
 */
export const BATCH_READ_SET_ASIDE_TIMEOUT_MS = 10_000;

// ...........................................................................
/**
 * A source that lost its turn in a batch read, not a source that failed.
 *
 * Thrown by the bound so one `catch` can tell the two apart, and it carries
 * the source's still-pending answer: the cascade sets the source aside, asks
 * everybody else, and comes back to this promise if the batch is still short.
 */
class SourceSetAside extends Error {
  constructor(
    readonly pending: Promise<Rljson>,
    readonly sourceId: string,
  ) {
    super(
      `IoMulti.readRowsByHashes: source ${sourceId} did not answer within ` +
        `${BATCH_READ_SOURCE_TIMEOUT_MS}ms — asking the others first`,
    );
    this.name = 'SourceSetAside';
  }
}

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
          const error = IoMulti._asError(e, readable.id);
          errors.push(error);
          ioTrace(
            () =>
              `IoMulti.readRows group priority=${readable.priority} size=1 error=${error.message}`,
          );
        }
      } else {
        // Multiple readables at the same priority — a REAL race now.
        //
        // This said "race them in parallel" and then awaited
        // `Promise.allSettled`, which is not a race: it waits for every
        // member. So a group was only ever as fast as its SLOWEST member,
        // and one member that never answers made every read through this
        // priority cost that member's request timeout — `IoPeer`'s default
        // is 30 s.
        //
        // `_skipClosed` above handles the member that can be SEEN to be
        // gone; `isOpen` is false and it never enters the group. The one
        // that hurts is the member that is still open and simply silent: a
        // half-open TCP socket, a firewall that drops without resetting, a
        // peer under load. Nothing can be skipped, and the wait was the
        // timeout.
        //
        // Measured from both ends. `server.ts` records it against a cloud
        // store that used to sit at priority 2 — *"a read the LAN could
        // answer in milliseconds instead takes as long as the cloud does …
        // files that were sitting on a peer two metres away never arrived,
        // because the hub was waiting on a continent"* — and moving the
        // cloud to priority 3 sidestepped the symptom without touching this.
        // In `@rljson/fs-agent` one gagged socket in a four-node mesh
        // blocked thirteen reads in a single test.
        //
        // **Taking the first answer WITH ROWS changes only timing, not the
        // result.** The old loop already used the first non-empty member's
        // rows and discarded every other member's, so nothing downstream
        // ever saw more than one member's answer per group.
        //
        // When NOBODY has rows the full set of outcomes is still needed,
        // because an empty answer is only trustworthy if nothing failed —
        // the rule stated further down. So the race is between "someone has
        // rows" and "everyone has settled", and both branches are correct:
        // whichever resolves first gives an answer the old code could also
        // have produced.
        const attempts = group.map(async (readable) => {
          const { [request.table]: tableData } = await readable.io.readRows(
            request,
          );
          return {
            readable,
            tableRows: (tableData as RljsonTable<Json, ContentType>)._data,
            tableType: (tableData as RljsonTable<Json, ContentType>)._type,
          };
        });

        // Never settles when no member has rows, which is exactly what makes
        // the race below fall through to the settled set. Each attempt gets
        // its own rejection handler so a failing member cannot surface as an
        // unhandled rejection; the settled set records it properly.
        const firstWithRows = new Promise<{
          readable: IoMultiIo;
          tableRows: Json[];
          tableType: ContentType;
        }>((resolve) => {
          for (const attempt of attempts) {
            attempt.then(
              (value) => {
                if (value.tableRows.length > 0) resolve(value);
              },
              () => undefined,
            );
          }
        });

        // AND A GROUP THAT CANNOT SETTLE MUST STOP TRYING TO.
        //
        // `allSettled` waits for the slowest member, and a member that is open
        // but never answers only settles at its own request timeout — 30 s for
        // an `IoPeer`. "Nobody has this row" is exactly what a lookup for an
        // unreplicated ref is, so that wait is the common path, not the rare
        // one.
        //
        // Measured in `@rljson/fs-agent`: 24–27 reads per gate run blocked for
        // a full 10 s, concentrated on whichever node was partitioned. Two of
        // them decide protocol behaviour — `ancestryPrevious` and
        // `resolveAnnouncement` — because both feed the edit chain's verdict on
        // which way two folders disagree. A verdict that arrives too late is
        // indistinguishable from no history at all, and the decision then falls
        // to inference from a content hash, which cannot be made correct.
        //
        // Each member is bounded, and a bounded-out member is recorded as a
        // FAILURE rather than as an absence. The classification below is
        // unchanged and does the right thing: a fetch by hash that found
        // nothing while something failed throws instead of reporting a verified
        // absence. Fast and honest beats slow and honest; fast and WRONG is
        // what that throw prevents.
        //
        // Armed unconditionally here, because this branch only runs for a group
        // of two or more — a single readable at a priority takes the direct
        // path above, where there is nobody else to conclude with.
        const settling = attempts.map((attempt, index) =>
          IoMulti._withGroupBound(attempt, group[index]),
        );

        const outcome = await Promise.race([
          firstWithRows.then((hit) => ({ hit })),
          Promise.allSettled(settling).then((results) => ({ results })),
        ]);

        let foundRows = false;
        if ('hit' in outcome) {
          const { readable, tableRows, tableType } = outcome.hit;
          foundRows = true;
          tableExistsAny = true;
          type ??= tableType;
          readFrom = readable.id ?? '';
          for (const tableRow of tableRows) {
            const ref = tableRow._hash as string;
            rows.set(ref, tableRow);
          }
        } else {
          for (const result of outcome.results) {
            if (result.status === 'rejected') {
              errors.push(IoMulti._asError(result.reason));
              continue;
            }
            tableExistsAny = true;
            type ??= result.value.tableType;
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
      // Only a FETCH BY HASH is held to this rule, not every query.
      //
      // `readRows({_hash})` is what `readRow` issues: "give me this exact
      // content-addressed row". There, an empty answer means "it does not
      // exist", and a source that failed makes that unknowable — so returning
      // empty is a lie the caller cannot detect.
      //
      // A query on any other column is a different question, and an empty
      // result is a normal answer to it. Callers issue those constantly, so
      // making a single flaky readable turn every one of them into an
      // exception would trade a narrow, proven fault for a wide, unmeasured
      // one.
      const where = request.where as Record<string, unknown>;
      const isFetchByHash =
        Object.keys(where).length === 1 && where['_hash'] !== undefined;
      const unanswered = IoMulti._realFailures(request.table, errors);
      if (isFetchByHash && rows.size === 0 && unanswered.length > 0) {
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
  /**
   * What a readable actually rejected with, as an `Error`.
   *
   * A readable may reject with NOTHING. `IoPeer.isReady()` does exactly that —
   * a bare `Promise.reject()` — and a rejection with no value has no
   * `.message`, so every later line that classified or logged it threw
   * `Cannot read properties of undefined (reading 'includes')` from inside the
   * cascade. One offline peer then failed the whole read with a TypeError that
   * named neither the table nor the layer.
   *
   * Measured on the lab: a node that had just been told about a ref could not
   * fetch the tree behind it and reported
   * `No tree nodes found for e2eFileTree@wNVEQejv…` — a message that blames
   * the data for a fault in the reader.
   *
   * Normalised here, once, at the only two places a readable's rejection
   * enters the cascade, so nothing downstream has to defend itself.
   * @param reason - Whatever was thrown or rejected.
   * @param id - The readable's id, when it has one.
   * @returns An Error that says something.
   */
  private static _asError(reason: unknown, id?: string): Error {
    if (reason instanceof Error) return reason;
    const where = id === undefined ? 'a readable' : `Io "${id}"`;
    if (reason === undefined || reason === null) {
      return new Error(`${where} failed without a reason`);
    }
    // A failure that crossed a socket arrives as a plain object — see
    // {@link serializableError}. Read the text off it rather than rendering
    // `[object Object]`, because the text is what {@link _realFailures}
    // branches on.
    if (typeof reason === 'object') {
      const bag = reason as { message?: unknown };
      return new Error(
        `${where} failed: ` +
          (typeof bag.message === 'string' && bag.message.length > 0
            ? bag.message
            : JSON.stringify(reason)),
      );
    }
    return new Error(`${where} failed: ${String(reason)}`);
  }

  private static _realFailures(table: string, errors: Error[]): Error[] {
    return errors.filter(
      // Every collected failure is a real `Error` — see {@link _asError} — so
      // reading `.message` here is safe, and the text is intact even when the
      // failure crossed a socket to get here.
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
    // No `= undefined` initializer: `absorb` below assigns this from inside a
    // closure, and TypeScript's narrowing does not follow a closure — with the
    // initializer the read at the end of this method is pinned to `undefined`
    // and the result no longer typechecks as an `Rljson`. Declared-only keeps
    // it `ContentType | undefined`.
    let type: ContentType | undefined;
    let readFrom: string = '';
    const errors: Error[] = [];
    const setAside: SourceSetAside[] = [];

    let remaining = Array.from(new Set(request.hashes));

    /**
     * Takes what one source answered into the result being built.
     *
     * Shared by the first pass and by the set-aside pass below, which must
     * absorb an answer on exactly the same terms — a source that lost its turn
     * is still a source, and its rows count the same as anybody else's.
     * @param result - What the source returned.
     * @param sourceId - Its id, for the hot-swap exclusion.
     */
    const absorb = (result: Rljson, sourceId: string): void => {
      const tableData = result[request.table] as RljsonTable<Json, ContentType>;
      tableExistsAny = true;
      // The table type is identical across all ios serving the table
      type = tableData._type;

      if (tableData._data.length > 0) {
        readFrom = sourceId;
        for (const tableRow of tableData._data) {
          rows.set(tableRow._hash as string, tableRow);
        }
        remaining = remaining.filter((hash) => !rows.has(hash));
      }
    };

    for (let index = 0; index < this.readables.length; index++) {
      const readable = this.readables[index];
      if (remaining.length === 0) break;

      // Skip readables that are closed right now — recorded as an
      // error (see IoMulti._isClosed) so that an all-closed cascade
      // still throws below instead of returning an empty result.
      if (IoMulti._isClosed(readable, errors)) {
        continue;
      }

      // Is there anybody else to ask? Only then is this source bounded.
      // See `BATCH_READ_SOURCE_TIMEOUT_MS`.
      const hasFallback = this.readables
        .slice(index + 1)
        .some((later) => later.read && later.io.isOpen !== false);

      try {
        const answer = readable.io.readRowsByHashes
          ? readable.io.readRowsByHashes({
              table: request.table,
              hashes: remaining,
            })
          : IoMulti._readHashesViaReadRows(
              readable.io,
              request.table,
              remaining,
            );
        // ONE await in this scope, not two. A ternary with an `await` on each
        // arm cost v8 the attribution of the `_data.length > 0` branch below,
        // which the comment there already explains for the same cause.
        const result = await (hasFallback
          ? IoMulti._withSourceBound(answer, readable)
          : answer);

        absorb(result, readable.id ?? '');
      } catch (e) {
        // A source past the bound has not failed — it has lost its turn.
        if (e instanceof SourceSetAside) setAside.push(e);
        else errors.push(IoMulti._asError(e, readable.id));
      }
    }

    // Everybody else has been asked and the batch is still short, so the
    // sources that only lost their turn get the last word. Skipped entirely
    // when the batch is already complete, which is the common case: the bound
    // is there to make a NEARER source answer first, not to drop a far one.
    for (const aside of setAside) {
      if (remaining.length === 0) break;
      try {
        absorb(await IoMulti._lastWord(aside), aside.sourceId);
      } catch (e) {
        errors.push(IoMulti._asError(e, aside.sourceId));
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
  /**
   * Bounds ONE member of a priority group so the group can settle at all.
   *
   * A group is RACED, so there is no "next source" to fall to — what the bound
   * buys is the ability to conclude. A member past it rejects with a described
   * error, which the caller records like any other failure, and that is what
   * keeps a short answer from being reported as a verified absence. See
   * {@link BATCH_READ_SOURCE_TIMEOUT_MS}.
   *
   * A late answer is discarded and its rejection absorbed: it belongs to a
   * question already concluded, and an unhandled rejection would crash the
   * process.
   * @param attempt - The member's pending answer.
   * @param readable - The member, named in the message.
   * @returns The answer, or a rejection once the bound passes.
   */
  private static _withGroupBound<T>(
    attempt: Promise<T>,
    readable: IoMultiIo,
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    return Promise.race([
      attempt,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          void attempt.catch(() => undefined);
          reject(
            new Error(
              `IoMulti.readRows: source ${
                readable.id ?? 'unknown'
              } did not answer within ${BATCH_READ_SOURCE_TIMEOUT_MS}ms — ` +
                `this is not a verified absence`,
            ),
          );
        }, BATCH_READ_SOURCE_TIMEOUT_MS);
      }),
    ]).finally(() => clearTimeout(timer));
  }

  /**
   * Bounds one source's answer so the cascade can move on to the next.
   *
   * Only ever applied when a fallback exists — see
   * {@link BATCH_READ_SOURCE_TIMEOUT_MS}. The rejection is caught by the
   * caller's `try` and recorded in `errors`, which is what keeps a batch that
   * ends up short from being reported as a complete answer.
   * @param answer - The source's pending reply.
   * @param readable - The source, named in the message.
   * @returns The reply, or a rejection once the bound passes.
   */
  private static _withSourceBound(
    answer: Promise<Rljson>,
    readable: IoMultiIo,
  ): Promise<Rljson> {
    let timer: ReturnType<typeof setTimeout>;
    return Promise.race([
      answer,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new SourceSetAside(answer, readable.id ?? 'unknown')),
          BATCH_READ_SOURCE_TIMEOUT_MS,
        );
      }),
    ]).finally(() => clearTimeout(timer));
  }

  /**
   * Gives a set-aside source the last word, under a generous deadline.
   *
   * Nobody else could complete the batch, so this is the only thing left that
   * can succeed — but it still has to end. See
   * {@link BATCH_READ_SET_ASIDE_TIMEOUT_MS}.
   * @param aside - The source that lost its turn earlier.
   * @returns Its answer, or a rejection naming it once the deadline passes.
   */
  private static _lastWord(aside: SourceSetAside): Promise<Rljson> {
    let timer: ReturnType<typeof setTimeout>;
    return Promise.race([
      aside.pending,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `IoMulti.readRowsByHashes: source ${aside.sourceId} did not ` +
                  `answer within ${BATCH_READ_SET_ASIDE_TIMEOUT_MS}ms, and ` +
                  `nobody else could complete the batch`,
              ),
            ),
          BATCH_READ_SET_ASIDE_TIMEOUT_MS,
        );
      }),
    ]).finally(() => clearTimeout(timer));
  }

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
