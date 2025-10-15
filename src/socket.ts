/* v8 ignore start */
// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

//Interface for a generic Socket, similar to Node.js EventEmitter
//This is a simplified version and may not cover all features of a full EventEmitter
export interface Socket {
  connected: boolean;
  disconnected: boolean;
  connect(): void;
  disconnect(): void;
  addListener(
    eventName: string | symbol,
    listener: (...args: any[]) => void,
  ): this;
  on(eventName: string | symbol, listener: (...args: any[]) => void): this;
  once(eventName: string | symbol, listener: (...args: any[]) => void): this;
  removeListener(
    eventName: string | symbol,
    listener: (...args: any[]) => void,
  ): this;
  off(eventName: string | symbol, listener: (...args: any[]) => void): this;
  removeAllListeners(event?: string | symbol): this;
  listeners(eventName: string | symbol): ((...args: any[]) => void)[];
  rawListeners(eventName: string | symbol): ((...args: any[]) => void)[];
  emit(eventName: string | symbol, ...args: any[]): boolean;
}
/* v8 ignore end */
