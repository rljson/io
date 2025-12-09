// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { JsonValue } from '@rljson/json';
import {
  ContentType,
  Rljson,
  TableCfg,
  TableKey,
  TableType,
} from '@rljson/rljson';

import { IoMem } from './io-mem.ts';
import { IoPeer } from './io-peer.ts';
import { Io } from './io.ts';
import { PeerSocketMock } from './peer-socket-mock.ts';

export type IoMultiIo = {
  io: Io;
  priority: number;
  read: boolean;
  write: boolean;
};

export class IoMulti implements Io {
  isOpen: boolean = false;

  constructor(private _ios: Array<IoMultiIo>) {}

  async init(): Promise<void> {
    for (const ioMultiIo of this._ios) {
      await ioMultiIo.io.init();
    }

    for (const ioMultiIo of this._ios) {
      if (!ioMultiIo.io.isOpen) {
        throw new Error(
          'All underlying Io instances must be initialized before initializing IoMulti',
        );
      }
    }

    this.isOpen = true;
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.isOpen = false;
    return Promise.resolve();
  }
  isReady(): Promise<void> {
    return Promise.all(
      this._ios.map((ioMultiIo) => ioMultiIo.io.isReady()),
    ).then(() => Promise.resolve());
  }
  dump(): Promise<Rljson> {
    if (this.readables.length === 0) {
      return Promise.reject(new Error('No readable Io available'));
    }

    //Simple strategy: use the highest priority readable Io
    const readable = this.readables[0];

    return readable.dump();
  }

  async dumpTable(request: { table: string }): Promise<Rljson> {
    if (this.readables.length === 0) {
      return Promise.reject(new Error('No readable Io available'));
    }

    for (const readable of this.readables) {
      const tableExists = await readable.tableExists(request.table);
      if (tableExists) {
        return readable.dumpTable(request);
      }
    }
    return Promise.reject(new Error(`Table "${request.table}" not found`));
  }

  async contentType(request: { table: string }): Promise<ContentType> {
    if (this.readables.length === 0) {
      return Promise.reject(new Error('No readable Io available'));
    }

    for (const readable of this.readables) {
      const tableExists = await readable.tableExists(request.table);
      if (tableExists) {
        return readable.contentType(request);
      }
    }
    return Promise.reject(new Error(`Table "${request.table}" not found`));
  }

  async tableExists(tableKey: TableKey): Promise<boolean> {
    if (this.readables.length === 0) {
      return Promise.reject(new Error('No readable Io available'));
    }

    for (const readable of this.readables) {
      const exists = await readable.tableExists(tableKey);
      if (exists) {
        return true;
      }
    }
    return false;
  }

  createOrExtendTable(request: { tableCfg: TableCfg }): Promise<void> {
    if (this.writables.length === 0) {
      return Promise.reject(new Error('No writable Io available'));
    }

    //Simple strategy: use the highest priority writable Io
    const writable = this.writables[0];

    return writable.createOrExtendTable(request);
  }

  rawTableCfgs(): Promise<TableCfg[]> {
    if (this.readables.length === 0) {
      return Promise.reject(new Error('No readable Io available'));
    }

    //Simple strategy: use the highest priority readable Io
    const readable = this.readables[0];

    return readable.rawTableCfgs();
  }

  write(request: { data: Rljson }): Promise<void> {
    if (this.writables.length === 0) {
      return Promise.reject(new Error('No writable Io available'));
    }

    //Simple strategy: use the highest priority writable Io
    const writable = this.writables[0];

    return writable.write(request);
  }

  async readRows(request: {
    table: string;
    where: { [column: string]: JsonValue | null };
  }): Promise<Rljson> {
    if (this.readables.length === 0) {
      return Promise.reject(new Error('No readable Io available'));
    }

    let tableExistsAny = false;
    let rows: Rljson | null = null;
    for (const readable of this.readables) {
      // Check if table exists in this readable Io
      const tableExists = await readable.tableExists(request.table);
      tableExistsAny = tableExistsAny || tableExists;

      if (tableExists) {
        rows = await readable.readRows(request);
        const table: TableType = rows[request.table];

        // If rows were found, return them
        if (table && table._data.length > 0) {
          return rows;
        }
      }
    }

    if (!tableExistsAny || rows === null) {
      return Promise.reject(new Error(`Table "${request.table}" not found`));
    } else {
      return rows;
    }
  }

  rowCount(table: string): Promise<number> {
    if (this.readables.length === 0) {
      return Promise.reject(new Error('No readable Io available'));
    }

    //Simple strategy: use the highest priority readable Io
    const readable = this.readables[0];

    return readable.rowCount(table);
  }

  get readables(): Array<Io> {
    return this._ios
      .filter((ioMultiIo) => ioMultiIo.read)
      .sort((a, b) => a.priority - b.priority)
      .map((ioMultiIo) => ioMultiIo.io);
  }

  get writables(): Array<Io> {
    return this._ios
      .filter((ioMultiIo) => ioMultiIo.write)
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
      { io: ioPeer, priority: 1, read: true, write: false },
      { io: ioMem, priority: 0, read: true, write: true },
    ];

    const ioMulti = new IoMulti(ios);
    await ioMulti.init();

    return ioMulti;
  };
}
