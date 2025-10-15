/* v8 ignore start */
// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import EventEmitter from 'node:events';

export interface Socket extends EventEmitter {
  connected: boolean;
  disconnected: boolean;
  connect(): void;
  disconnect(): void;
}
/* v8 ignore end */
