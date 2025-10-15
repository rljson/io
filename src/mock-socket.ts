// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { Io } from './io.ts';
import { Socket } from './socket.ts';

export class MockSocket implements Socket {
  private _onceListeners: { [event: string]: ((...args: any[]) => void)[] } =
    {};

  connected: boolean = false;
  disconnected: boolean = true;

  constructor(private _io: Io) {}

  connect(): void {
    this.connected = true;
    this.disconnected = false;

    const listeners = this.listeners('connect');
    for (const cb of listeners) {
      cb({});
    }
  }

  disconnect(): void {
    this.connected = false;
    this.disconnected = true;

    const listeners = this.listeners('disconnect');
    for (const cb of listeners) {
      cb({});
    }
  }

  addListener(
    eventName: string | symbol,
    listener: (...args: any[]) => void,
  ): this {
    this._io.observeTable(eventName.toString(), listener);
    return this;
  }
  on(eventName: string | symbol, listener: (...args: any[]) => void): this {
    this.addListener(eventName, listener);
    return this;
  }
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
  removeListener(
    eventName: string | symbol,
    listener: (...args: any[]) => void,
  ): this {
    this._io.unobserveTable(eventName.toString(), listener);
    return this;
  }
  off(eventName: string | symbol, listener: (...args: any[]) => void): this {
    this.removeListener(eventName, listener);
    return this;
  }
  removeAllListeners(eventName?: string | symbol | undefined): this {
    this._io.unobserveAll(eventName?.toString() ?? '');
    return this;
  }
  setMaxListeners(n: number): this {
    throw new Error(`Method not implemented. ${n}`);
  }
  getMaxListeners(): number {
    throw new Error('Method not implemented.');
  }
  listeners(eventName: string | symbol) {
    return this._io.observers(eventName.toString());
  }
  rawListeners(eventName: string | symbol) {
    return this.listeners(eventName);
  }
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
  listenerCount(
    eventName: string | symbol,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    listener?: Function | undefined,
  ): number {
    throw new Error(
      `Method not implemented. ${eventName.toString} ${listener}`,
    );
  }
  prependListener(
    eventName: string | symbol,
    listener: (...args: any[]) => void,
  ): this {
    throw new Error(
      `Method not implemented. ${eventName.toString} ${listener}`,
    );
  }
  prependOnceListener(
    eventName: string | symbol,
    listener: (...args: any[]) => void,
  ): this {
    throw new Error(
      `Method not implemented. ${eventName.toString} ${listener}`,
    );
  }
  eventNames(): (string | symbol)[] {
    throw new Error('Method not implemented.');
  }
}
