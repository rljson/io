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
    await testSetup.beforeEach();
    expect(testSetup.io).toBeDefined();

    testSetup.afterEach();
  });

  it('beforeAll resolves without error', async () => {
    const testSetup = exampleTestSetup();
    await expect(testSetup.beforeAll()).resolves.toBeUndefined();
  });

  it('afterAll resolves without error', async () => {
    const testSetup = exampleTestSetup();
    await expect(testSetup.afterAll()).resolves.toBeUndefined();
  });
});
