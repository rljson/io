// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { Io } from './io.ts';

/**
 * Provide conformance tests for the Io interface.
 */
export class Conformance {
  constructor() {}

  static check(
    public readonly io: Io,

    log: (info: {
      test: string;
      state: 'run' | 'success' | 'error';
      error?: string;
    }) => void,
  ) {
    log({ test: 'write', state: 'run' });
    // Execute the test

    log({ test: 'write', state: 'success' });
  }
}
