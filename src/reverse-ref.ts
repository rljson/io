// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { Json } from '@rljson/json';
import {
  Buffet,
  Cake,
  iterateTablesSync,
  Layer,
  Ref,
  Rljson,
  TableKey,
} from '@rljson/rljson';

// .............................................................................
/**
 * Describes a row that references a child table row
 */
export interface ParentRef {
  /**
   * The parent table that references the child table
   */
  [parentTable: TableKey]: {
    /**
     * The parent row that references the child row
     */
    [parentRow: Ref]: {
      /**
       * Details about the reference, e.g. an array index etc.
       */
      details?: Json;
    };
  };
}

// .............................................................................
/**
 * Describes the parent table rows referencing a child table row
 */
export interface ReverseRefs {
  /**
   * The child table we need the referencing rows for
   */
  [childTable: TableKey]: {
    /**
     * The row hashwe need the referencing rows for
     */
    [childRow: Ref]: ParentRef;
  };
}

/* v8 ignore start */

// .............................................................................
/**
 * Calculates the reverse references for a given rljson object
 */
export const calcReverseRefs = (rljson: Rljson): ReverseRefs => {
  const result: ReverseRefs = {};

  // ......................
  // Prepare data structure
  iterateTablesSync(rljson, (childTableKey, table) => {
    const childTable: { [childRowHash: string]: ParentRef } = {};
    result[childTableKey] = childTable;
    for (const childRow of table._data) {
      childTable[childRow._hash] = {};
    }
  });

  // ............................
  // Generate reverse references
  iterateTablesSync(rljson, (parentTableKey, parentTable) => {
    // Iterate all rows of each table
    for (const parentTableRow of parentTable._data) {
      // Find out whe other tables & rows are referenced by this row
      // Write these information intto result
      switch (parentTable._type) {
        case 'components':
          _writeComponentRefs(parentTableKey, parentTableRow, result);
          break;

        case 'layers': {
          _writeLayerRefs(parentTableKey, parentTableRow, result);
          break;
        }

        case 'sliceIds': {
          // Slice ids do not reference other tables
          break;
        }

        case 'cakes': {
          _writeCakeRefs(parentTableKey, parentTableRow, result);
          break;
        }

        case 'buffets': {
          _writeBuffetRefs(parentTableKey, parentTableRow, result);
          break;
        }
      }
    }
  });

  return result;
};

/* v8 ignore end */

// .............................................................................
const _writeComponentRefs = (
  parentTableName: TableKey,
  parentRow: Json,
  result: ReverseRefs,
) => {
  const parentRowHash = parentRow._hash as string;

  for (const parentColumnName in parentRow) {
    if (parentColumnName.startsWith('_')) {
      continue;
    }

    if (!parentColumnName.endsWith('Ref')) {
      continue;
    }

    const childTableName = parentColumnName.slice(0, -3);
    const childRowHash = parentRow[parentColumnName] as string;

    _write(
      result,
      childTableName,
      childRowHash,
      parentTableName,
      parentRowHash,
    );
  }
};

// .............................................................................
const _writeLayerRefs = (
  parentTableName: TableKey,
  parentRow: Layer,
  result: ReverseRefs,
) => {
  const childTableName = parentRow.componentsTable;
  const parentRowHash = parentRow._hash as string;

  for (const sliceId in parentRow.add) {
    if (sliceId.startsWith('_')) {
      continue;
    }

    const sliceHash = parentRow.add[sliceId] as string;

    _write(result, childTableName, sliceHash, parentTableName, parentRowHash);
  }
};

// .............................................................................
const _writeCakeRefs = (
  parentTableName: TableKey,
  parentRow: Cake,
  result: ReverseRefs,
) => {
  const parentRowHash = parentRow._hash as string;

  for (const layer in parentRow.layers) {
    const childTableName = layer;
    const childRowHash = parentRow.layers[layer] as string;
    _write(
      result,
      childTableName,
      childRowHash,
      parentTableName,
      parentRowHash,
    );
  }
};

// .............................................................................
const _writeBuffetRefs = (
  parentTableName: TableKey,
  parentRow: Buffet,
  result: ReverseRefs,
) => {
  const parentRowHash = parentRow._hash as string;

  for (const item of parentRow.items) {
    const childTableName = item.table;
    const childRowHash = item.ref;
    _write(
      result,
      childTableName,
      childRowHash,
      parentTableName,
      parentRowHash,
    );
  }
};

// .............................................................................
const _write = (
  result: ReverseRefs,
  childTableName: string,
  childRowHash: string,
  parentTableName: string,
  parentRowHash: string,
) => {
  const referencesForChildTable = (result[childTableName] ??= {});
  const referencesForChildTableRow = (referencesForChildTable[childRowHash] ??=
    {});

  referencesForChildTableRow[parentTableName] ??= {};
  referencesForChildTableRow[parentTableName][parentRowHash] ??= {};
};
