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
import { distDir, testDir } from './functions/directories.js';
import { syncFolders } from './functions/sync-folders.js';

// .............................................................................
async function _copyGoldens(targetDir) {
  const goldensDir = path.join(testDir, 'goldens', 'io-conformance');
  const targetGoldensDir = path.join(targetDir, 'goldens');
  if (!existsSync(targetGoldensDir)) {
    await fs.mkdir(targetGoldensDir, { recursive: true });
  }

  await syncFolders(goldensDir, targetGoldensDir, { excludeHidden: true });
}

// .............................................................................
async function _copyConformanceTests(targetDir) {
  // Get path to original conformance test file
  const conformanceTestPath = path.join(testDir, 'io-conformance.spec.ts');

  // Read the content of the conformance test file
  const conformanceTestFileContent = await fs.readFile(
    conformanceTestPath,
    'utf-8',
  );

  // Find the first line that does not start with a comment
  const lines = conformanceTestFileContent.split('\n');
  const firstNonCommentLineIndex = lines.findIndex((line) => {
    return !line.trim().startsWith('//');
  });

  if (firstNonCommentLineIndex < 0 || firstNonCommentLineIndex > 10) {
    throw new Error(
      'io-conformance.spec.ts does not start with an valid license header',
    );
  }
  const licenseHeader = lines.slice(0, firstNonCommentLineIndex);

  const fileContent = lines.slice(firstNonCommentLineIndex);

  // Add modification hint behind the license header
  const dontModifyHint = [
    '// ⚠️ DO NOT MODIFY THIS FILE DIRECTLY ⚠️',
    '// ',
    '// This file is a copy of @rljson/io/test/io-conformance.spec.ts.',
    '//',
    '// To make changes, please execute the following steps:',
    '//   1. Clone <https://github.com/rljson/io>',
    '//   2. Make changes to the original file in the test folder',
    '//   3. Submit a pull request',
    '//   4. Publish a the new changes to npm',
  ];

  const contentWithDontModifyHint = [
    ...licenseHeader,
    '',
    ...dontModifyHint,
    '',
    ...fileContent,
  ].join('\n');

  // Write result to the target file
  const targetTestPath = path.join(targetDir, 'io-conformance.spec.ts');
  await fs.writeFile(targetTestPath, contentWithDontModifyHint, 'utf-8');
}

// .............................................................................
async function _targetDir() {
  const targetDir = path.join(distDir, 'conformance-tests');
  if (!existsSync(targetDir)) {
    await fs.mkdir(targetDir, { recursive: true });
  }
  return targetDir;
}

// .............................................................................
try {
  // Create target directory if it doesn't exist
  const targetDir = await _targetDir();
  await _copyConformanceTests(targetDir);
  await _copyGoldens(targetDir);
} catch (err) {
  console.error(
    red('❌ Error while deploying conformance tests:', err.message),
  );
  process.exit(1);
}
