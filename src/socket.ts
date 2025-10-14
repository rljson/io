// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be

import EventEmitter from 'node:events';

// found in the LICENSE file in the root of this package.
export interface Socket extends EventEmitter {
  connected: boolean;
  disconnected: boolean;
  connect(): void;
  disconnect(): void;
}
