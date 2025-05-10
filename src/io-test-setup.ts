// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { IoMem } from './io-mem.ts';
import { Io } from './io.ts';

// .............................................................................
/**
 * Io implementation need to implement this interface to be used in
 * conformance tests.
 */
export interface IoTestSetup {
  /**
   * Initializes the io implementation.
   * @returns The io implementation.
   */
  init: () => Promise<void>;

  /**
   * Tears down the io implementation.
   * @returns The io implementation.
   */
  tearDown: () => Promise<void>;

  /**
   * The io implementation to be used in the conformance tests.
   */
  io: Io;
}

// .............................................................................
// Example implementation of the IoTestSetup interface
export const exampleTestSetup = (): IoTestSetup => {
  return {
    io: new IoMem(),
    init: async () => {
      // Initialize the io implementation
    },
    tearDown: async () => {
      // Tear down the io implementation
    },
  };
};
