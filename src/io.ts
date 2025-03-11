// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { Rljson } from '@rljson/rljson';

/**
 * The low level data read and write interface.
 */
export interface Io {
  write(request: { data: Rljson }): Promise<void>;
}

/**
 * Example Io implementation
 */
export const exampleIo = 'See IoMem for an example implementation';
