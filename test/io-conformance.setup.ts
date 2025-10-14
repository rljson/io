// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { Io, IoMem, IoTestSetup } from '../src';
import { IoPeer } from '../src/io-peer';

// ..............................................................................
abstract class GenericIoTestSetup implements IoTestSetup {
  async beforeAll(): Promise<void> {
    // This method can be used for any additional setup required before init.
    // Currently, it does nothing.
  }
  async beforeEach(): Promise<void> {}

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

  protected _io: Io | null = null;
}

class IoMemTestSetup extends GenericIoTestSetup {
  async beforeEach(): Promise<void> {
    this._io = await IoMem.example();
  }
}

class IoPeerTestSetup extends GenericIoTestSetup {
  async beforeEach(): Promise<void> {
    this._io = await IoPeer.example();
  }
}

// .............................................................................
export const testMemSetup = () => new IoMemTestSetup();
export const testPeerSetup = () => new IoPeerTestSetup();
