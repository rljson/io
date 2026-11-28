<!--
@license
Copyright (c) 2025 Rljson

Use of this source code is governed by terms that can be
found in the LICENSE file in the root of this package.
-->

# Install IO conformance tests

Imagine you have an own implementation of `Io`, called `IoClient`. To make
sure that your implementation perfectly implements the `Io` interface, you need
to test it against the `io-conformance.spec.ts`. Here is how you install the
conformance tests in your project.

## Example

As example we are using our `io-sqlite` implementation. The project is derived
from the [rljson template-project](https://github.com/rljson/template-project).

## Use git-bash on windows

Your are working on windows? Please open a git-bash shipped with git to execute
the following commands.

## Open a console and switch into your project

```bash
cd ~/dev/rljson/io-sqlite
```

## Checkout rljson template project in the parent folder

```bash
 git clone git@github.com:rljson/template-project.git ../template-project
```

## Update the project DNA

The rljson project provides a bunch of required scripts and docs.
We call it project DNA. Copy it over to our project.

```bash
node scripts/update-dna.js
git add .
git commit -m"Update project DNA"
```

## Add or update @rljson/io

If not already done, add @rljson/io.

```bash
pnpm add @rljson/io --save
```

Alternatively update to the latest dependencies.

```bash
pnpm update --latest
```

## Copy install-conformance-tests.js to scripts

```bash
cp node_modules/@rljson/io/dist/conformance-tests/scripts/install-conformance-tests.js scripts/
```

## Add installation script to package.json

Open `package.json`.

Locate `script` section

Insert the following line at the end of the `scripts` section:

```json
, "installConformanceTests": "node scripts/install-conformance-tests.js"
```

## Call the installation script before each test

Locate `"test":` within `scripts` section.

Insert `pnpm installConformanceTests && ` at the beginning.

## Install the conformance tests the first time

```bash
pnpm installConformanceTests
```

## Adapt io-conformance.setup.ts

Open `test/io-conformance.setup.ts`.

Modify `MyIoTestSetup` and replace the initialization of `IoMem` by your
Io implementation.

## Run the conformance tests

In the terminal, run:

```bash
pnpm test
```

Alternatively open `test/io-conformance.spec.ts` and run the test using Vscode's test explorer.
