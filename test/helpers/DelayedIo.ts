// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { JsonValue } from '@rljson/json';
import { ContentType, Rljson, TableCfg, TableKey } from '@rljson/rljson';

import { Io } from '../../src/io';

/**
 * Names of the `Io` methods `DelayedIo` can add a delay to.
 */
export type DelayableIoMethod =
  | 'init'
  | 'close'
  | 'isReady'
  | 'dump'
  | 'dumpTable'
  | 'contentType'
  | 'tableExists'
  | 'createOrExtendTable'
  | 'rawTableCfgs'
  | 'write'
  | 'readRows'
  | 'readRowsByHashes'
  | 'rowCount';

/**
 * Test helper that wraps an `Io` and delays (or hangs) selected
 * methods before delegating to the inner instance. Used to write
 * timing-sensitive tests (e.g. "a slow/dead peer must not stall a
 * healthy one") without needing a real network or real 30s timeouts.
 *
 * Not part of `src/` — this is a test-only double and is not held to
 * the package's 100% coverage bar.
 */
export class DelayedIo implements Io {
  constructor(
    private readonly _inner: Io,
    /**
     * Delay in milliseconds per method name. Use `Infinity` to hang
     * forever (the returned promise never settles) — this simulates a
     * dead peer whose request never comes back, as opposed to one that
     * merely answers slowly.
     */
    private readonly _delaysMs: Partial<Record<DelayableIoMethod, number>> = {},
  ) {}

  get isOpen(): boolean {
    return this._inner.isOpen;
  }

  set isOpen(value: boolean) {
    this._inner.isOpen = value;
  }

  private _delay(method: DelayableIoMethod): Promise<void> {
    const ms = this._delaysMs[method];
    if (ms === undefined || ms === 0) return Promise.resolve();
    if (ms === Infinity) return new Promise<void>(() => {}); // never resolves
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  async init(): Promise<void> {
    await this._delay('init');
    return this._inner.init();
  }

  async close(): Promise<void> {
    await this._delay('close');
    return this._inner.close();
  }

  async isReady(): Promise<void> {
    await this._delay('isReady');
    return this._inner.isReady();
  }

  async dump(): Promise<Rljson> {
    await this._delay('dump');
    return this._inner.dump();
  }

  async dumpTable(request: { table: string }): Promise<Rljson> {
    await this._delay('dumpTable');
    return this._inner.dumpTable(request);
  }

  async contentType(request: { table: string }): Promise<ContentType> {
    await this._delay('contentType');
    return this._inner.contentType(request);
  }

  async tableExists(tableKey: TableKey): Promise<boolean> {
    await this._delay('tableExists');
    return this._inner.tableExists(tableKey);
  }

  async createOrExtendTable(request: { tableCfg: TableCfg }): Promise<void> {
    await this._delay('createOrExtendTable');
    return this._inner.createOrExtendTable(request);
  }

  async rawTableCfgs(): Promise<TableCfg[]> {
    await this._delay('rawTableCfgs');
    return this._inner.rawTableCfgs();
  }

  async write(request: { data: Rljson }): Promise<void> {
    await this._delay('write');
    return this._inner.write(request);
  }

  async readRows(request: {
    table: string;
    where: { [column: string]: JsonValue | null };
  }): Promise<Rljson> {
    await this._delay('readRows');
    return this._inner.readRows(request);
  }

  async readRowsByHashes(request: {
    table: string;
    hashes: string[];
  }): Promise<Rljson> {
    await this._delay('readRowsByHashes');
    /* v8 ignore next -- @preserve */
    return this._inner.readRowsByHashes
      ? this._inner.readRowsByHashes(request)
      : Promise.reject(new Error('readRowsByHashes not implemented'));
  }

  async rowCount(table: string): Promise<number> {
    await this._delay('rowCount');
    return this._inner.rowCount(table);
  }
}
