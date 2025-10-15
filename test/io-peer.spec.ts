// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { bakeryExample, TableCfg } from '@rljson/rljson';

import { beforeEach, describe, expect, it } from 'vitest';

import { Io } from '../src/io';
import { IoPeer } from '../src/io-peer';
import { IoTools } from '../src/io-tools';
import { MockSocket } from '../src/mock-socket';
import { Socket } from '../src/socket';

describe('IoPeer', () => {
  let ioTools: IoTools;
  let io: Io;
  let socket: Socket;
  let peer: IoPeer;

  beforeEach(async () => {
    ioTools = await IoTools.example();
    io = ioTools.io;

    // Add example data
    const exampleTableCfg: TableCfg = {
      key: 'nutritionalValues',
      type: 'components',
      columns: [
        { key: '_hash', type: 'string' },
        { key: 'id', type: 'string' },
        { key: 'energy', type: 'number' },
        { key: 'fat', type: 'number' },
        { key: 'protein', type: 'number' },
        { key: 'carbohydrates', type: 'number' },
      ],
      isHead: false,
      isRoot: false,
      isShared: true,
    };
    const exampleData = bakeryExample().nutritionalValues;

    await io.createOrExtendTable({ tableCfg: exampleTableCfg });
    await io.write({ data: { nutritionalValues: exampleData } });

    socket = new MockSocket(io);

    peer = new IoPeer(socket);
    await peer.init();
  });

  it('should be defined', async () => {
    expect(peer).toBeDefined();
    expect(peer.isOpen).toBe(true);
  });

  it('should close', async () => {
    expect(peer.isOpen).toBe(true);
    await peer.close();
    expect(peer.isOpen).toBe(false);
  });

  it('should be ready', async () => {
    await expect(peer.isReady()).resolves.toBeUndefined();
  });

  it('should not be ready when socket is disconnected', async () => {
    await peer.close();
    await expect(peer.isReady()).rejects.toBeUndefined();
  });
});
