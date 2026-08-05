// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { JsonValue } from '@rljson/json';
import { ContentType, Rljson, TableCfg, TableKey } from '@rljson/rljson';

import { IoMem } from './io-mem.ts';
import { ioTrace } from './io-trace.ts';
import { Io } from './io.ts';
import { PeerSocketMock } from './peer-socket-mock.ts';
import { Socket } from './socket.ts';


export class IoPeer implements Io {
  isOpen: boolean = false;

  constructor(
    private _socket: Socket,
    private _requestTimeoutMs: number = 30_000,
  ) {}

  // ...........................................................................
  /**
   * Wraps a promise with a timeout. If the promise does not settle within
   * `_requestTimeoutMs`, the returned promise rejects with a timeout error.
   * Clears the timer on settlement to avoid leaks and unhandled rejections.
   */
  private _withTimeout<T>(promise: Promise<T>, operation: string): Promise<T> {
    if (this._requestTimeoutMs <= 0) return promise;
    let timer: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new Error(
            `Timeout after ${this._requestTimeoutMs}ms: ${operation}`,
          ),
        );
      }, this._requestTimeoutMs);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
      clearTimeout(timer!);
    });
  }

  // ...........................................................................
  /**
   * Guards request methods against emitting onto a socket that is
   * already known to be closed. Without this, a request against a dead
   * socket would sit in `_withTimeout` and burn the full
   * `_requestTimeoutMs` (default 30s) before failing — even though
   * `isOpen` already told us the answer.
   * @param operation - Name of the operation, used in the error message.
   * @returns A rejected promise when the socket is closed, `null` when the request may proceed.
   */
  private _closedError(operation: string): Promise<never> | null {
    if (this.isOpen === false) {
      return Promise.reject(new Error(`IoPeer: socket closed (${operation})`));
    }
    return null;
  }

  // ...........................................................................
  /**
   *
   * Initializes the Peer connection.
   * @returns
   */
  async init(): Promise<void> {
    // Update isOpen on connect/disconnect
    this._socket.on('connect', () => {
      this.isOpen = true;
    });
    this._socket.on('disconnect', () => {
      this.isOpen = false;
    });

    // Connect the socket
    this._socket.connect();

    // Wait for the socket to connect before returning
    return new Promise<void>((resolve) => {
      /* v8 ignore else -- @preserve */
      if (this._socket.connected) {
        this.isOpen = true;
        resolve();
      } else {
        this._socket.on('connect', () => {
          resolve();
        });
      }
    });
  }

  // ...........................................................................
  /**
   * Closes the Peer connection.
   * @returns
   */

  async close(): Promise<void> {
    // Disconnect the socket and wait for it to complete
    if (!this._socket.connected) return;

    return new Promise<void>((resolve) => {
      this._socket.on('disconnect', () => {
        resolve();
      });
      this._socket.disconnect();
    });
  }

  // ...........................................................................
  /**
   * Returns a promise that resolves once the Peer connection is ready.
   * @returns
   */
  async isReady(): Promise<void> {
    if (!!this._socket && this._socket.connected === true) this.isOpen = true;
    else this.isOpen = false;

    return !!this.isOpen ? Promise.resolve() : Promise.reject();
  }

  // ...........................................................................
  /**
   * Dumps the entire database content.
   * @returns A promise that resolves to the dumped database content.
   */
  async dump(): Promise<Rljson> {
    const closed = this._closedError('dump');
    if (closed) return closed;

    return this._withTimeout(
      new Promise((resolve) => {
        // Request dump, resolve once the data is received (ack)
        this._socket.emit('dump', (data: Rljson) => {
          resolve(data);
        });
      }),
      'dump',
    );
  }

  // ...........................................................................
  /**
   * Dumps a specific table from the database.
   * @param request An object containing the table name to dump.
   * @returns A promise that resolves to the dumped table data.
   */
  dumpTable(request: { table: string }): Promise<Rljson> {
    const closed = this._closedError('dumpTable');
    if (closed) return closed;

    return this._withTimeout(
      new Promise((resolve, reject) => {
        // Request dumpTable, resolve once the data is received (ack)
        this._socket.emit(
          'dumpTable',
          request,
          (data: Rljson, error?: Error) => {
            if (error) reject(error);
            resolve(data);
          },
        );
      }),
      'dumpTable',
    );
  }

  // ...........................................................................
  /**
   * Gets the content type of a specific table.
   * @param request An object containing the table name to get the content type for.
   * @returns A promise that resolves to the content type of the specified table.
   */
  contentType(request: { table: string }): Promise<ContentType> {
    const closed = this._closedError('contentType');
    if (closed) return closed;

    return this._withTimeout(
      new Promise((resolve, reject) => {
        // Request contentType, resolve once the data is received (ack)
        this._socket.emit(
          'contentType',
          request,
          (data: ContentType, error?: Error) => {
            /* v8 ignore next -- @preserve */
            if (error) reject(error);
            resolve(data);
          },
        );
      }),
      'contentType',
    );
  }

  // ...........................................................................
  /**
   * Checks if a specific table exists in the database.
   * @param tableKey The key of the table to check for existence.
   * @returns A promise that resolves to true if the table exists, false otherwise.
   */
  tableExists(tableKey: TableKey): Promise<boolean> {
    const closed = this._closedError('tableExists');
    if (closed) return closed;

    return this._withTimeout(
      new Promise((resolve) => {
        // Request tableExists, resolve once the data is received (ack)
        this._socket.emit('tableExists', tableKey, (exists: boolean) => {
          resolve(exists);
        });
      }),
      'tableExists',
    );
  }

  // ...........................................................................
  /**
   * Creates or extends a table with the given configuration.
   * @param request An object containing the table configuration.
   * @returns A promise that resolves once the table is created or extended.
   */
  createOrExtendTable(request: { tableCfg: TableCfg }): Promise<void> {
    const closed = this._closedError('createOrExtendTable');
    if (closed) return closed;

    return this._withTimeout(
      new Promise((resolve, reject) => {
        // Request createOrExtendTable, resolve once the data is received (ack)
        this._socket.emit(
          'createOrExtendTable',
          request,
          (_?: boolean, error?: Error) => {
            if (error) reject(error);
            resolve();
          },
        );
      }),
      'createOrExtendTable',
    );
  }

  // ...........................................................................
  /**
   * Retrieves the raw table configurations from the database.
   * @returns A promise that resolves to an array of table configurations.
   */
  rawTableCfgs(): Promise<TableCfg[]> {
    const closed = this._closedError('rawTableCfgs');
    if (closed) return closed;

    return this._withTimeout(
      new Promise((resolve) => {
        // Request rawTableCfgs, resolve once the data is received (ack)
        this._socket.emit('rawTableCfgs', (data: TableCfg[]) => {
          resolve(data);
        });
      }),
      'rawTableCfgs',
    );
  }

  // ...........................................................................
  /**
   * Writes data to the database.
   * @param request An object containing the data to write.
   * @returns A promise that resolves once the data is written.
   */
  write(request: { data: Rljson }): Promise<void> {
    const closed = this._closedError('write');
    if (closed) return closed;

    return this._withTimeout(
      new Promise((resolve, reject) => {
        // Request write, resolve once the data is received (ack)
        this._socket.emit('write', request, (_?: boolean, error?: Error) => {
          if (error) reject(error);
          resolve();
        });
      }),
      'write',
    );
  }

  // ...........................................................................
  /**
   * Reads rows from a specific table that match the given criteria.
   * @param request An object containing the table name and the criteria for selecting rows.
   * @returns A promise that resolves to the selected rows.
   */
  readRows(request: {
    table: string;
    where: { [column: string]: JsonValue | null };
  }): Promise<Rljson> {
    const closed = this._closedError('readRows');
    if (closed) return closed;

    // Trace hook for diagnosing read amplification: logs the request
    // and, once settled, the row count or the error. Both are no-ops
    // unless a trace logger has been installed via setIoTraceLogger.
    ioTrace(() => `peer readRows-> table=${request.table}`);

    return this._withTimeout(
      new Promise((resolve, reject) => {
        // Request readRows, resolve once the data is received (ack)
        this._socket.emit(
          'readRows',
          request,
          (result?: Rljson, error?: Error) => {
            if (error) {
              ioTrace(() => `peer readRows<- err=${error.message}`);
              reject(error);
            } else {
              ioTrace(
                () =>
                  `peer readRows<- rows=${result![request.table]._data.length}`,
              );
            }
            resolve(result!);
          },
        );
      }),
      'readRows',
    );
  }

  // ...........................................................................
  /**
   * True once the remote side signalled that it does not support batch
   * reads at all (old server, method missing) — all further batch
   * reads then use per-hash readRows permanently.
   */
  private _batchReadsUnsupported = false;

  /**
   * Timestamp (ms, `Date.now()`) before which batch reads are skipped
   * after a *timeout* — as opposed to `_batchReadsUnsupported`, this is
   * not permanent. A timeout is often transient (temporarily
   * overloaded/slow peer) rather than proof the remote side lacks
   * batch support, so retrying after a decay window is safer than
   * latching per-hash reads forever. `null` means no decay is active.
   */
  private _batchRetryAfter: number | null = null;

  /** Decay window applied after a batch-read timeout (see `_batchRetryAfter`). */
  private readonly _batchRetryDecayMs = 60_000;

  /**
   * Batch read over the socket. Falls back to per-hash readRows when
   * the remote side does not support it.
   *
   * Two distinct "unsupported" signals are handled differently:
   * - The remote side reports the method is missing/unsupported
   *   ('not found on Io instance' / 'not supported'): batch reads are
   *   latched off permanently (`_batchReadsUnsupported`), matching the
   *   fact that this can never change for a given remote.
   * - The request times out ('Timeout after'): this is treated as
   *   transient. The current call falls back to per-hash reads, and
   *   further batch attempts are suppressed only until
   *   `_batchRetryAfter` (a decay window), after which batch reads are
   *   tried again.
   * @param request - The table and the row hashes to read
   */
  async readRowsByHashes(request: {
    table: string;
    hashes: string[];
  }): Promise<Rljson> {
    const closed = this._closedError('readRowsByHashes');
    if (closed) return closed;

    const decayActive =
      this._batchRetryAfter !== null && Date.now() < this._batchRetryAfter;

    if (!this._batchReadsUnsupported && !decayActive) {
      try {
        const batchResult = await this._withTimeout(
          new Promise<Rljson>((resolve, reject) => {
            this._socket.emit(
              'readRowsByHashes',
              request,
              (result?: Rljson, error?: Error) => {
                if (error) reject(error);
                resolve(result!);
              },
            );
          }),
          'readRowsByHashes',
        );
        this._batchRetryAfter = null;
        return batchResult;
      } catch (error) {
        const message = String((error as Error).message);
        const permanentlyUnsupported =
          message.includes('not found on Io instance') ||
          message.includes('not supported');
        const timedOut = message.includes('Timeout after');
        if (permanentlyUnsupported) {
          this._batchReadsUnsupported = true;
        } else if (timedOut) {
          this._batchRetryAfter = Date.now() + this._batchRetryDecayMs;
        } else {
          throw error;
        }
      }
    }

    // Per-hash fallback for remote sides without batch support
    const hashes = Array.from(new Set(request.hashes));
    const results = await Promise.all(
      hashes.map((hash) =>
        this.readRows({ table: request.table, where: { _hash: hash } }),
      ),
    );

    let type: ContentType | undefined = undefined;
    const rows: any[] = [];
    for (const result of results) {
      const tableData = result[request.table];
      type ??= tableData._type;
      rows.push(...tableData._data);
    }

    /* v8 ignore next -- @preserve */
    if (type === undefined) {
      // No hashes given — derive the table type from an empty query
      const empty = await this.readRows({
        table: request.table,
        where: { _hash: '__NONE__' },
      });
      type = empty[request.table]._type;
    }

    return { [request.table]: { _data: rows, _type: type } } as Rljson;
  }

  // ...........................................................................
  /**
   * Retrieves the number of rows in a specific table.
   * @param table The name of the table to count rows in.
   * @returns A promise that resolves to the number of rows in the specified table.
   */
  rowCount(table: string): Promise<number> {
    const closed = this._closedError('rowCount');
    if (closed) return closed;

    return this._withTimeout(
      new Promise((resolve, reject) => {
        // Request rowCount, resolve once the data is received (ack)
        this._socket.emit(
          'rowCount',
          table,
          (count?: number, error?: Error) => {
            if (error) reject(error);
            resolve(count!);
          },
        );
      }),
      'rowCount',
    );
  }

  // ...........................................................................
  static example = async () => {
    const ioMem = await IoMem.example();
    const socket = new PeerSocketMock(ioMem);
    const io = new IoPeer(socket);
    await io.init();
    return io;
  };
}
