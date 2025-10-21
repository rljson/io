// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { Io } from './io.ts';
import { Socket } from './socket.ts';


export class PeerSocketMock implements Socket {
  private _listenersMap: Map<string | symbol, Array<(...args: any[]) => void>> =
    new Map();

  connected: boolean = false;
  disconnected: boolean = true;

  constructor(private _io: Io) {}

  // ............................................................................
  /**
   * Registers an event listener for the specified event.
   * @param eventName - The name of the event to listen for.
   * @param listener - The callback function to invoke when the event is emitted.
   * @returns The PeerSocketMock instance for chaining.
   */
  on(eventName: string | symbol, listener: (...args: any[]) => void): this {
    if (!this._listenersMap.has(eventName)) {
      this._listenersMap.set(eventName, []);
    }
    this._listenersMap.get(eventName)!.push(listener);
    return this;
  }

  // ...........................................................................
  /**
   * Simulates a connection event.
   *
   * Emits the 'connect' event to all registered listeners.
   */
  connect(): void {
    this.connected = true;
    this.disconnected = false;

    const listeners = this._listenersMap.get('connect') || [];
    for (const cb of listeners) {
      cb({});
    }
  }

  // ...........................................................................
  /**
   * Simulates a disconnection event.
   *
   * Emits the 'disconnect' event to all registered listeners.
   */
  disconnect(): void {
    this.connected = false;
    this.disconnected = true;

    const listeners = this._listenersMap.get('disconnect') || [];
    for (const cb of listeners) {
      cb({});
    }
  }

  // ............................................................................
  /**
   * Emits an event, invoking the corresponding method on the Io instance.
   * @param eventName - The name of the event to emit.
   * @param args - The arguments to pass to the event listener.
   * @returns
   */
  emit(eventName: string | symbol, ...args: any[]): boolean {
    const fn = (this._io as any)[eventName] as (...args: any[]) => Promise<any>;
    if (typeof fn !== 'function') {
      throw new Error(`Event ${eventName.toString()} not supported`);
    }
    const cb = args[args.length - 1];
    fn.apply(this._io, args.slice(0, -1))
      .then((result) => {
        cb(result, null);
      })
      .catch((err) => {
        cb(null, err);
      });

    return true;
  }
}
