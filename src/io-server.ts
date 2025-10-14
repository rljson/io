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

  constructor(private readonly _io: Io) {}

  // ...........................................................................
  /**
   * Adds a socket to the IoServer instance.
   * @param socket - The socket to add.
   */
  addSocket(socket: Socket): void {
    // Add transport layer to the socket
    this._addTransportLayer(socket);

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
  private _addTransportLayer(socket: Socket): void {
    const transport = generateTransportLayer(this._io);

    for (const [key, fn] of Object.entries(transport)) {
      socket.on(key, (...args: any[]) => {
        const cb = args[args.length - 1];
        if (typeof cb !== 'function') {
          throw new Error(`Last argument must be a callback function`);
        }

        fn.apply(this, args.slice(0, -1))
          .then((result) => {
            cb(result);
          })
          .catch((err) => {
            cb(err);
          });
      });
    }
  }
}

// ...........................................................................
/**
 * Generates a transport layer object for the given Io instance.
 * @param io - The Io instance to generate the transport layer for.
 * @returns An object containing methods that correspond to the Io interface.
 */
export const generateTransportLayer = (io: Io) =>
  ({
    init: () => io.init(),
    close: () => io.close(),
    isOpen: () =>
      new Promise((resolve) => resolve(io.isOpen)) as Promise<boolean>,
    isReady: () => io.isReady(),
    dump: () => io.dump(),
    dumpTable: (request: { table: string }) => io.dumpTable(request),
    contentType: (request: { table: string }) => io.contentType(request),
    tableExists: (tableKey: TableKey) => io.tableExists(tableKey),
    createOrExtendTable: (params: { tableCfg: TableCfg }) =>
      io.createOrExtendTable(params),
    rawTableCfgs: () => io.rawTableCfgs(),
    write: (request: { data: Rljson }) => io.write(request),
    readRows: (request: {
      table: string;
      where: { [column: string]: JsonValue | null };
    }) => io.readRows(request),
    rowCount: (table: string) => io.rowCount(table),
  } as { [key: string]: (...args: any[]) => Promise<any> });
