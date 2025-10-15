// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import EventEmitter from 'node:events';

export class PeerServerSocketMock extends EventEmitter {
  connected: boolean = false;
  disconnected: boolean = true;

  constructor() {
    super();
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
}
