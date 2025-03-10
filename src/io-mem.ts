// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { Io } from './io.ts';

/**
 * In-Memory implementation of the Rljson Io interface.
 */
export class IoMem implements Io {
  /** Example instance for test purposes */
  static example = async () => {
    return new IoMem();
  };

  /** Remove when ready */
  foo = 'bar';
}
