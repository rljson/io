/*
 * @license
 * Copyright (c) 2025 Rljson
 *
 * Use of this source code is governed by terms that can be
 * found in the LICENSE file in the root of this package.
 */

// A javascript that downloads the latest documentation and settings from the
// template-project
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const files = [
  'doc',
  'scripts',
  '.vscode/settings.json',
  '.gitignore',
  '.npmrc',
  '.npmignore',
  '.prettierignore',
  '.prettierrc',
  'README.contributors.md',
];

const templateRepo = 'https://github.com/rljson/template-' + 'project.git';
const tempDir = path.join(os.tmpdir(), 'template-project');

function checkOutTemplateProject() {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('Cloning template project...');
  execSync(`git clone ${templateRepo} "${tempDir}"`, { stdio: 'inherit' });
  console.log('Template project cloned to:', tempDir);
}

function copyRecursive(src, dest) {
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    for (const item of fs.readdirSync(src)) {
      copyRecursive(path.join(src, item), path.join(dest, item));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function copyFiles() {
  for (const file of files) {
    const src = path.join(tempDir, file);
    const dest = path.join(process.cwd(), file);

    if (fs.existsSync(src)) {
      copyRecursive(src, dest);
      console.log('Copied:', file);
    } else {
      console.warn('Not found in template:', file);
    }
  }
}

function replaceTemplateProject() {
  // Replace template-project with the actual project name from package.json
  const pkgFile = path.join(process.cwd(), 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  const projectName = pkg.name.replace('@rljson/', '');

  // Replace in the following files
  const replaceFiles = ['doc/workflows/prepare.md', 'doc/workflows/tools.md'];

  for (const file of replaceFiles) {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, 'utf8');
      content = content.replace(/template-project/g, projectName);
      fs.writeFileSync(filePath, content);
      console.log('Replaced:', file);
    } else {
      console.warn('Not found:', file);
    }
  }
}

function main() {
  try {
    checkOutTemplateProject();
    copyFiles();
    replaceTemplateProject();
    console.log('Done.');
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
