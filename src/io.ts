// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { Rljson } from '@rljson/rljson';

// .............................................................................
export interface Io {
  write(request: { data: Rljson }): Promise<void>;
  readRow(request: {
    table: string;
    where: Record<string, any>;
  }): Promise<Rljson>;
}

// .............................................................................
export const exampleIo =
  'Checkout @rljson/io-mem for an example implementation';
