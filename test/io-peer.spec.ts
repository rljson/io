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
import { PeerSocketMock } from '../src/peer-socket-mock';
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
        { key: '_hash', type: 'string', titleShort: 'Hash', titleLong: 'Hash' },
        {
          key: 'id',
          type: 'string',
          titleShort: 'ID',
          titleLong: 'Identifier',
        },
        {
          key: 'energy',
          type: 'number',
          titleShort: 'Energy',
          titleLong: 'Energy in kcal',
        },
        {
          key: 'fat',
          type: 'number',
          titleShort: 'Fat',
          titleLong: 'Fat in grams',
        },
        {
          key: 'protein',
          type: 'number',
          titleShort: 'Protein',
          titleLong: 'Protein in grams',
        },
        {
          key: 'carbohydrates',
          type: 'number',
          titleShort: 'Carbs',
          titleLong: 'Carbohydrates in grams',
        },
      ],
      isHead: false,
      isRoot: false,
      isShared: true,
    };
    const exampleData = bakeryExample().nutritionalValues;

    await io.createOrExtendTable({ tableCfg: exampleTableCfg });
    await io.write({ data: { nutritionalValues: exampleData } });

    socket = new PeerSocketMock(io);

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

  describe('_withTimeout', () => {
    it('should bypass timeout when _requestTimeoutMs <= 0', async () => {
      const noTimeoutPeer = new IoPeer(socket, 0);
      await noTimeoutPeer.init();
      const result = await noTimeoutPeer.dump();
      expect(result).toBeDefined();
    });

    it('should reject with timeout when ack never arrives', async () => {
      // Create a socket mock that connects but never fires ack callbacks
      const listeners: Map<string, ((...args: any[]) => void)[]> = new Map();
      const noAckSocket: Socket = {
        connected: false,
        disconnected: true,
        connect() {
          this.connected = true;
          this.disconnected = false;
          const cbs = listeners.get('connect') ?? [];
          for (const cb of cbs) cb();
        },
        disconnect() {
          this.connected = false;
          this.disconnected = true;
          const cbs = listeners.get('disconnect') ?? [];
          for (const cb of cbs) cb();
        },
        on(event: string, listener: (...args: any[]) => void) {
          const cbs = listeners.get(event) ?? [];
          cbs.push(listener);
          listeners.set(event, cbs);
          return this;
        },
        emit() {
          // Intentionally never calls the ack callback
          return true;
        },
        off() {
          return this;
        },
        removeAllListeners() {
          return this;
        },
      };

      const timeoutPeer = new IoPeer(noAckSocket, 50);
      noAckSocket.connect();
      timeoutPeer.isOpen = true;

      await expect(timeoutPeer.dump()).rejects.toThrow(
        'Timeout after 50ms: dump',
      );
    });
  });
});
