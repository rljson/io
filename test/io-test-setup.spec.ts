// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { describe, expect, it } from 'vitest';

import { exampleTestSetup } from '../src/io-test-setup.ts';

describe('TestSetup', () => {
  it('exampleTestSetup', async () => {
    const testSetup = exampleTestSetup();
    await testSetup.init();
    expect(testSetup.io).toBeDefined();

    testSetup.tearDown();
  });

  it('mainSetup resolves without error', async () => {
    const testSetup = exampleTestSetup();
    await expect(testSetup.mainSetup()).resolves.toBeUndefined();
  });

  it('mainFinish resolves without error', async () => {
    const testSetup = exampleTestSetup();
    await expect(testSetup.mainFinish()).resolves.toBeUndefined();
  });
});
