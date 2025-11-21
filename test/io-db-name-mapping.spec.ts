// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.
import { describe, expect, test } from 'vitest';

import { IoDbNameMapping } from '../src/io-db-name-mapping';

describe('IoDbNameMapping', () => {
  const nameMapping = new IoDbNameMapping();

  test('should have correct primary key name', () => {
    expect(nameMapping.primaryKeyColumn).toBe('_hash');
  });

  test('should have correct data name', () => {
    expect(nameMapping.dataSection).toBe('_data');
  });

  test('should have correct table names', () => {
    expect(nameMapping.tableNames.main).toBe('tableCfgs');
    expect(nameMapping.tableNames.revision).toBe('revisions');
  });

  test('should add and remove table suffix correctly', () => {
    const tableName = 'myTable';
    const suffixed = nameMapping.addTableSuffix(tableName);
    expect(suffixed).toBe('myTable_tbl');
    const removed = nameMapping.removeTableSuffix(suffixed);
    expect(removed).toBe(tableName);
  });
  test('should add and remove column suffix correctly', () => {
    const columnName = 'myColumn';
    const suffixed = nameMapping.addColumnSuffix(columnName);
    expect(suffixed).toBe('myColumn_col');
    const removed = nameMapping.removeColumnSuffix(suffixed);
    expect(removed).toBe(columnName);
  });
  test('should add and remove table suffix correctly when already good', () => {
    const tableName = 'myTable_tbl';
    const suffixed = nameMapping.addTableSuffix(tableName);
    expect(suffixed).toBe('myTable_tbl');
    const tableName2 = 'myTable';
    const removed = nameMapping.removeTableSuffix(tableName2);
    expect(removed).toBe('myTable');
  });
  test('should add and remove column suffix correctly when already good', () => {
    const columnName = 'myColumn_col';
    const suffixed = nameMapping.addColumnSuffix(columnName);
    expect(suffixed).toBe('myColumn_col');
    const columnName2 = 'myColumn';
    const removed = nameMapping.removeColumnSuffix(columnName2);
    expect(removed).toBe('myColumn');
  });
});
