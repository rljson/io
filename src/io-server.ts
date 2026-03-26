// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { JsonValue } from '@rljson/json';
import { Rljson, TableCfg, TableKey } from '@rljson/rljson';

import { Io } from './io.ts';
import { Socket } from './socket.ts';


export class IoServer {
  private _sockets: Socket[] = [];

  constructor(private _io: Io) {}

  // ...........................................................................
  /**
   * Adds a socket to the IoServer instance.
   * @param socket - The socket to add.
   */
  async addSocket(socket: Socket): Promise<void> {
    // Add transport layer to the socket
    await this._addTransportLayer(socket);

    // Add socket to the list of sockets
    this._sockets.push(socket);
  }

  // ...........................................................................
  /**
   * Removes a transport layer from the given socket.
   * @param socket - The socket to remove the transport layer from.
   */
  removeSocket(socket: Socket): void {
    this._sockets = this._sockets.filter((s) => s !== socket);
  }

  // ...........................................................................
  /**
   * Adds a transport layer to the given socket.
   * @param socket - The socket to add the transport layer to.
   */
  private async _addTransportLayer(socket: Socket): Promise<void> {
    // CRUD operations — use arrow functions that read this._io at call time,
    // so that when _io is replaced (e.g. after _rebuildMultis), existing
    // socket handlers automatically use the latest Io instance.
    const crud = this._generateTransportLayerCRUD();
    for (const [key, fn] of Object.entries(crud)) {
      socket.on(key, (...args: any[]) => {
        const cb = args[args.length - 1];

        fn.apply(this, args.slice(0, -1))
          .then((result) => {
            cb(result, null);
          })
          .catch((err) => {
            cb(null, err);
          });
      });
    }
  }

  // ...........................................................................
  /**
   * Creates or extends a table with the given configuration.
   * @param request - An object containing the table configuration.
   */
  private async createOrExtendTable(request: {
    tableCfg: TableCfg;
  }): Promise<void> {
    return this._io.createOrExtendTable(request);
  }

  // ...........................................................................
  /**
   * Generates a transport layer object that always delegates to the current
   * this._io.  Each method is an arrow function reading this._io at call
   * time so that external code can replace _io after construction and all
   * existing socket handlers pick up the new instance.
   */
  private _generateTransportLayerCRUD = () =>
    ({
      init: () => this._io.init(),
      close: () => this._io.close(),
      isOpen: () =>
        new Promise((resolve) => resolve(this._io.isOpen)) as Promise<boolean>,
      isReady: () => this._io.isReady(),
      dump: () => this._io.dump(),
      dumpTable: (request: { table: string }) => this._io.dumpTable(request),
      contentType: (request: { table: string }) =>
        this._io.contentType(request),
      tableExists: (tableKey: TableKey) => this._io.tableExists(tableKey),
      createOrExtendTable: (request: { tableCfg: TableCfg }) =>
        this.createOrExtendTable(request),
      rawTableCfgs: () => this._io.rawTableCfgs(),
      write: (request: { data: Rljson }) => this._io.write(request),
      readRows: (request: {
        table: string;
        where: { [column: string]: JsonValue | null };
      }) => this._io.readRows(request),
      rowCount: (table: string) => this._io.rowCount(table),
    } as { [key: string]: (...args: any[]) => Promise<any> });
}
