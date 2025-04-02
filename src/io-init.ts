// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { hip } from '@rljson/hash';
import { TableCfg } from '@rljson/rljson';

import { Io } from './io.ts';

/**
 * Initialization tools for Io
 */
export class IoInit {
  constructor(public readonly io: Io) {}

  get tableCfg() {
    const tableCfg = hip<TableCfg>({
      version: 1,
      key: 'tableCfgs',
      type: 'ingredients',
      isHead: false,
      isRoot: false,
      isShared: true,

      columns: {
        key: { type: 'string' },
        type: { type: 'string' },
      },
    });

    return tableCfg;
  }

  initRevisionsTable = async () => {
    const tableCfg: TableCfg = {
      version: 1,
      key: 'revisions',
      type: 'ingredients',
      isHead: false,
      isRoot: false,
      isShared: true,

      columns: {
        table: { type: 'string' },
        predecessor: { type: 'string' },
        successor: { type: 'string' },
        timestamp: { type: 'number' },
        id: { type: 'string' },
      },
    };

    await this.io.createTable({ tableCfg });
  };

  initReverseRefs = async () => {
    const tableCfg: TableCfg = {
      version: 1,
      key: 'reverseRefs',
      type: 'ingredients',
      isHead: false,
      isRoot: false,
      isShared: true,

      columns: {
        table: { type: 'string' },
        predecessor: { type: 'string' },
        successor: { type: 'string' },
        timestamp: { type: 'number' },
        id: { type: 'string' },
      },
    };

    await this.io.createTable({ tableCfg });
  };
}
