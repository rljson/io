// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { describe, expect, it } from 'vitest';

import { exampleIo } from '../src/io';

describe('Io', () => {
  it('should be defined', () => {
    expect(exampleIo).toBe(
      'Checkout @rljson/io-mem for an example implementation',
    );
  });
});
