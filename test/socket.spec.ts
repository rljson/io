// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { describe, expect, it } from 'vitest';

import { socketExample } from '../src/socket';

describe('Socket', () => {
  it('should be defined', () => {
    const socket = socketExample();

    expect(socket).toBeDefined();

    expect(socket.connected).toBe(false);
    expect(socket.disconnected).toBe(true);

    socket.connect();
    expect(socket.connected).toBe(true);
    expect(socket.disconnected).toBe(false);

    socket.disconnect();
    expect(socket.connected).toBe(false);
    expect(socket.disconnected).toBe(true);

    expect(socket.on).toBeDefined();
    expect(socket.emit).toBeDefined();
  });
});
