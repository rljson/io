// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { Io, IoMem, IoTestSetup } from '../src';

// ..............................................................................
class MyIoTestSetup implements IoTestSetup {
  async mainSetup(): Promise<void> {
    // This method can be used for any additional setup required before init.
    // Currently, it does nothing.
  }
  async init(): Promise<void> {
    this._io = await IoMem.example();
  }

  async tearDown(): Promise<void> {
    await this.io.close();
  }

  async mainFinish(): Promise<void> {
    // This method can be used for any additional cleanup after tearDown.
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
export const testSetup = () => new MyIoTestSetup();
