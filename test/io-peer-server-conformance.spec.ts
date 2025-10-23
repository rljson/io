// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { Io, IoMem, IoTestSetup } from '../src';
import { IoPeer } from '../src/io-peer';
import { IoServer } from '../src/io-server';
import { PeerServerSocketMock } from '../src/peer-server-socket-mock';

import { runIoConformanceTests } from './io-conformance.spec';

// ..............................................................................
class IoPeerServerTestSetup implements IoTestSetup {
  async beforeAll(): Promise<void> {
    // This method can be used for any additional setup required before init.
    // Currently, it does nothing.
  }
  async beforeEach(): Promise<void> {
    //Io of Server --> IoMem
    const ioMemServer = await IoMem.example();

    //Socket between Server and Peer
    const socket = new PeerServerSocketMock();

    //IoPeer of Peer --> Socket
    const ioServer = new IoServer(ioMemServer);
    ioServer.addSocket(socket);

    //IoPeer of Peer --> Socket
    const io = new IoPeer(socket);
    await io.init();

    this._io = io;
  }

  async afterEach(): Promise<void> {
    await this.io.close();
  }

  async afterAll(): Promise<void> {
    // This method can be used for any additional cleanup after afterEach.
  }

  get io(): Io {
    if (!this._io) {
      throw new Error('Call init() before accessing io');
    }
    return this._io;
  }

  private _io: Io | null = null;
}

// .............................................................................
const runConformanceTests = runIoConformanceTests;
runConformanceTests(new IoPeerServerTestSetup());
