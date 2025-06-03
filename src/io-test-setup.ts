// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { Io, IoMem } from './index.ts';

// .............................................................................
/**
 * Io implementation need to implement this interface to be used in
 * conformance tests.
 */
export interface IoTestSetup {
  /** setup before the single setups */
  mainSetup: () => Promise<void>;

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

  /** cleanup after all tests */
  mainFinish: () => Promise<void>;

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
    mainSetup: async () => {
      // This method can be used for any additional setup required before init.
      // Currently, it does nothing.
    },

    mainFinish: async () => {
      // This method can be used for any additional cleanup after tearDown.
    },
  };
};
