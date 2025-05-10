/*
 * @license
 * Copyright (c) 2025 Rljson
 *
 * Use of this source code is governed by terms that can be
 * found in the LICENSE file in the root of this package.
 */

// Create a folder dist/conformance-tests if it does not exist
import { existsSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { red } from './functions/colors.js';
import { nodeModulesDir, testDir } from './functions/directories.js';
import { syncFolders } from './functions/sync-folders.js';

// .............................................................................
async function _copyGoldens(srcDir) {
  const from = path.join(srcDir, 'goldens');
  const to = path.join(testDir, 'goldens', 'io-conformance');
  if (!existsSync(to)) {
    await fs.mkdir(to, { recursive: true });
  }

  await syncFolders(from, to, { excludeHidden: true });
}

// .............................................................................
async function _copyConformanceTests(srcDir) {
  const from = path.join(srcDir, 'io-conformance.spec.ts');
  const to = path.join(testDir, 'io-conformance.spec.ts');
  await fs.copyFile(from, to);
}

// .............................................................................
async function _srcDir() {
  const targetDir = path.join(
    nodeModulesDir,
    '@rljson',
    'io',
    'dist',
    'conformance-tests',
  );
  if (!existsSync(targetDir)) {
    await fs.mkdir(targetDir, { recursive: true });
  }
  return targetDir;
}

// .............................................................................
try {
  // Create target directory if it doesn't exist
  const srcDir = await _srcDir();
  await _copyConformanceTests(srcDir);
  await _copyGoldens(srcDir);
} catch (err) {
  console.error(
    red('❌ Error while deploying conformance tests:', err.message),
  );
  process.exit(1);
}
