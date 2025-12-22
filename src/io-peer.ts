// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { JsonValue } from '@rljson/json';
import { ContentType, Rljson, TableCfg, TableKey } from '@rljson/rljson';

import { IoMem } from './io-mem.ts';
import { Io } from './io.ts';
import { PeerSocketMock } from './peer-socket-mock.ts';
import { Socket } from './socket.ts';


export class IoPeer implements Io {
  isOpen: boolean = false;

  constructor(private _socket: Socket) {}

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
    return new Promise((resolve) => {
      // Request dump, resolve once the data is received (ack)
      this._socket.emit('dump', (data: Rljson) => {
        resolve(data);
      });
    });
  }

  // ...........................................................................
  /**
   * Dumps a specific table from the database.
   * @param request An object containing the table name to dump.
   * @returns A promise that resolves to the dumped table data.
   */
  dumpTable(request: { table: string }): Promise<Rljson> {
    return new Promise((resolve, reject) => {
      // Request dumpTable, resolve once the data is received (ack)
      this._socket.emit('dumpTable', request, (data: Rljson, error?: Error) => {
        if (error) reject(error);
        resolve(data);
      });
    });
  }

  // ...........................................................................
  /**
   * Gets the content type of a specific table.
   * @param request An object containing the table name to get the content type for.
   * @returns A promise that resolves to the content type of the specified table.
   */
  contentType(request: { table: string }): Promise<ContentType> {
    return new Promise((resolve, reject) => {
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
    });
  }

  // ...........................................................................
  /**
   * Checks if a specific table exists in the database.
   * @param tableKey The key of the table to check for existence.
   * @returns A promise that resolves to true if the table exists, false otherwise.
   */
  tableExists(tableKey: TableKey): Promise<boolean> {
    return new Promise((resolve) => {
      // Request tableExists, resolve once the data is received (ack)
      this._socket.emit('tableExists', tableKey, (exists: boolean) => {
        resolve(exists);
      });
    });
  }

  // ...........................................................................
  /**
   * Creates or extends a table with the given configuration.
   * @param request An object containing the table configuration.
   * @returns A promise that resolves once the table is created or extended.
   */
  createOrExtendTable(request: { tableCfg: TableCfg }): Promise<void> {
    return new Promise((resolve, reject) => {
      // Request createOrExtendTable, resolve once the data is received (ack)
      this._socket.emit(
        'createOrExtendTable',
        request,
        (_?: boolean, error?: Error) => {
          if (error) reject(error);
          resolve();
        },
      );
    });
  }

  // ...........................................................................
  /**
   * Retrieves the raw table configurations from the database.
   * @returns A promise that resolves to an array of table configurations.
   */
  rawTableCfgs(): Promise<TableCfg[]> {
    return new Promise((resolve) => {
      // Request rawTableCfgs, resolve once the data is received (ack)
      this._socket.emit('rawTableCfgs', (data: TableCfg[]) => {
        resolve(data);
      });
    });
  }

  // ...........................................................................
  /**
   * Writes data to the database.
   * @param request An object containing the data to write.
   * @returns A promise that resolves once the data is written.
   */
  write(request: { data: Rljson }): Promise<void> {
    return new Promise((resolve, reject) => {
      // Request write, resolve once the data is received (ack)
      this._socket.emit('write', request, (_?: boolean, error?: Error) => {
        if (error) reject(error);
        resolve();
      });
    });
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
    return new Promise((resolve, reject) => {
      // Request readRows, resolve once the data is received (ack)
      this._socket.emit(
        'readRows',
        request,
        (result?: Rljson, error?: Error) => {
          if (error) reject(error);
          resolve(result!);
        },
      );
    });
  }

  // ...........................................................................
  /**
   * Retrieves the number of rows in a specific table.
   * @param table The name of the table to count rows in.
   * @returns A promise that resolves to the number of rows in the specified table.
   */
  rowCount(table: string): Promise<number> {
    return new Promise((resolve, reject) => {
      // Request rowCount, resolve once the data is received (ack)
      this._socket.emit('rowCount', table, (count?: number, error?: Error) => {
        if (error) reject(error);
        resolve(count!);
      });
    });
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
