// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

/**
 * The low level data read and write interface.
 */
export interface Io {
  foo: string;
}

/**
 * Example Io implementation
 */
export const exampleIo: Io = {
  foo: 'bar',
};
