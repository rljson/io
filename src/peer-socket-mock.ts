// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { Io } from './io.ts';
import { Socket } from './socket.ts';

export class PeerSocketMock implements Socket {
  private _onceListeners: { [event: string]: ((...args: any[]) => void)[] } =
    {};

  connected: boolean = false;
  disconnected: boolean = true;

  constructor(private _io: Io) {}

  // ...........................................................................
  /**
   * Simulates a connection event.
   *
   * Emits the 'connect' event to all registered listeners.
   */
  connect(): void {
    this.connected = true;
    this.disconnected = false;

    const listeners = this.listeners('connect');
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

    const listeners = this.listeners('disconnect');
    for (const cb of listeners) {
      cb({});
    }
  }

  // ............................................................................
  /**
   * Adds a listener for the specified event.
   * @param eventName - The name of the event to listen for.
   * @param listener - The callback function to invoke when the event is emitted.
   * @returns The current PeerSocketMock instance.
   */
  addListener(
    eventName: string | symbol,
    listener: (...args: any[]) => void,
  ): this {
    this._io.observeTable(eventName.toString(), listener);
    return this;
  }

  // ............................................................................
  /**
   * Alias for addListener method.
   * @param eventName - The name of the event to listen for.
   * @param listener - The callback function to invoke when the event is emitted.
   * @returns The current PeerSocketMock instance.
   */
  on(eventName: string | symbol, listener: (...args: any[]) => void): this {
    this.addListener(eventName, listener);
    return this;
  }

  // ............................................................................
  /**
   * Adds a one-time listener for the specified event.
   * The listener is invoked only the next time the event is emitted, after which it is removed.
   * @param eventName - The name of the event to listen for.
   * @param listener - The callback function to invoke when the event is emitted.
   * @returns The current PeerSocketMock instance.
   */
  once(eventName: string | symbol, listener: (...args: any[]) => void): this {
    //Helping structure --> Add listener to once list
    this.on(eventName, (...args: any[]) => {
      if (
        this._onceListeners[eventName.toString()] &&
        this._onceListeners[eventName.toString()].includes(listener)
      )
        return;

      //Call the listener
      listener(...args);

      //Add listener to once list
      this._onceListeners[eventName.toString()] = [
        ...(this._onceListeners[eventName.toString()] || []),
        listener,
      ];
    });
    return this;
  }

  // ............................................................................
  /**
   * Removes a listener for the specified event.
   * @param eventName - The name of the event to stop listening for.
   * @param listener - The callback function to remove.
   * @returns The current PeerSocketMock instance.
   */
  removeListener(
    eventName: string | symbol,
    listener: (...args: any[]) => void,
  ): this {
    this._io.unobserveTable(eventName.toString(), listener);
    return this;
  }

  // ............................................................................
  /**
   * Alias for removeListener method.
   * @param eventName - The name of the event to stop listening for.
   * @param listener - The callback function to remove.
   * @returns The current PeerSocketMock instance.
   */
  off(eventName: string | symbol, listener: (...args: any[]) => void): this {
    this.removeListener(eventName, listener);
    return this;
  }

  // ............................................................................
  /**
   * Removes all listeners for the specified event.
   * If no event is specified, all listeners for all events are removed.
   * @param eventName - The name of the event to stop listening for (optional).
   * @returns The current PeerSocketMock instance.
   */
  removeAllListeners(eventName?: string | symbol | undefined): this {
    this._io.unobserveAll(eventName?.toString() ?? '');
    return this;
  }

  // ............................................................................
  // The following methods are part of the EventEmitter interface but are not implemented in this mock.
  // They throw an error if called, indicating that they are not supported.
  setMaxListeners(n: number): this {
    throw new Error(`Method not implemented. ${n}`);
  }

  // ............................................................................
  // The following methods are part of the EventEmitter interface but are not implemented in this mock.
  // They throw an error if called, indicating that they are not supported.
  getMaxListeners(): number {
    throw new Error('Method not implemented.');
  }

  // ............................................................................
  // The following methods are part of the EventEmitter interface but are not implemented in this mock.
  // They throw an error if called, indicating that they are not supported.
  listeners(eventName: string | symbol) {
    return this._io.observers(eventName.toString());
  }

  // ............................................................................
  // The following methods are part of the EventEmitter interface but are not implemented in this mock.
  // They throw an error if called, indicating that they are not supported.
  rawListeners(eventName: string | symbol) {
    return this.listeners(eventName);
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

  // ............................................................................
  // The following methods are part of the EventEmitter interface but are not implemented in this mock.
  // They throw an error if called, indicating that they are not supported.
  listenerCount(
    eventName: string | symbol,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    listener?: Function | undefined,
  ): number {
    throw new Error(
      `Method not implemented. ${eventName.toString} ${listener}`,
    );
  }

  // ............................................................................
  // The following methods are part of the EventEmitter interface but are not implemented in this mock.
  // They throw an error if called, indicating that they are not supported.
  prependListener(
    eventName: string | symbol,
    listener: (...args: any[]) => void,
  ): this {
    throw new Error(
      `Method not implemented. ${eventName.toString} ${listener}`,
    );
  }

  // ............................................................................
  // The following methods are part of the EventEmitter interface but are not implemented in this mock.
  // They throw an error if called, indicating that they are not supported.
  prependOnceListener(
    eventName: string | symbol,
    listener: (...args: any[]) => void,
  ): this {
    throw new Error(
      `Method not implemented. ${eventName.toString} ${listener}`,
    );
  }

  // ............................................................................
  // The following methods are part of the EventEmitter interface but are not implemented in this mock.
  // They throw an error if called, indicating that they are not supported.
  eventNames(): (string | symbol)[] {
    throw new Error('Method not implemented.');
  }
}
