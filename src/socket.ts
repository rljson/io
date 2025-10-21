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
  on(eventName: string | symbol, listener: (...args: any[]) => void): this;
  emit(eventName: string | symbol, ...args: any[]): boolean;
}
/* v8 ignore end */
