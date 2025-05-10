// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { IoMem } from '../src/io-mem';
import { IoTestSetup } from '../src/io-test-setup.ts';

import { Io } from './io-conformance.setup';

// ..............................................................................
class IoMemTestSetup implements IoTestSetup {
  async init(): Promise<void> {
    this._io = await IoMem.example();
  }

  async tearDown(): Promise<void> {
    await this.io.close();
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
export const testSetup = () => new IoMemTestSetup();

export { Io } from '../src/io';
export { IoTestSetup } from '../src/io-test-setup.ts';
export { IoTools } from '../src/io-tools';
