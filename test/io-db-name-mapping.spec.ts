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

  test('should have correct type column name', () => {
    expect(nameMapping.typeColumn).toBe('type');
  });

  test('should have correct key column name', () => {
    expect(nameMapping.keyColumn).toBe('key');
  });

  test('should add and remove tmp suffix correctly', () => {
    const tmpName = 'myTemp';
    const suffixed = nameMapping.addTmpSuffix(tmpName);
    expect(suffixed).toBe('myTemp_tmp');
    const removed = nameMapping.removeTmpSuffix(suffixed);
    expect(removed).toBe(tmpName);
  });

  test('should add and remove tmp suffix correctly when already good', () => {
    const tmpName = 'myTemp_tmp';
    const suffixed = nameMapping.addTmpSuffix(tmpName);
    expect(suffixed).toBe('myTemp_tmp');
    const tmpName2 = 'myTemp';
    const removed = nameMapping.removeTmpSuffix(tmpName2);
    expect(removed).toBe('myTemp');
  });

  test('should handle empty string for suffix operations', () => {
    expect(nameMapping.addTableSuffix('')).toBe('_tbl');
    expect(nameMapping.addColumnSuffix('')).toBe('_col');
    expect(nameMapping.addTmpSuffix('')).toBe('_tmp');
    expect(nameMapping.removeTableSuffix('')).toBe('');
    expect(nameMapping.removeColumnSuffix('')).toBe('');
    expect(nameMapping.removeTmpSuffix('')).toBe('');
  });

  test('should handle names with partial suffix match', () => {
    expect(nameMapping.addTableSuffix('my_tb')).toBe('my_tb_tbl');
    expect(nameMapping.removeTableSuffix('my_tb')).toBe('my_tb');
    expect(nameMapping.addColumnSuffix('my_co')).toBe('my_co_col');
    expect(nameMapping.removeColumnSuffix('my_co')).toBe('my_co');
    expect(nameMapping.addTmpSuffix('my_tm')).toBe('my_tm_tmp');
    expect(nameMapping.removeTmpSuffix('my_tm')).toBe('my_tm');
  });
});
