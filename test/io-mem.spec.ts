// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { beforeEach, describe, expect, it } from 'vitest';

import { IoMem } from '../src/io-mem';

describe('IoMem', () => {
  let ioMem: IoMem;

  beforeEach(async () => {
    ioMem = await IoMem.example();
  });

  it('works', () => {
    expect(ioMem).toBeDefined();
  });
});
