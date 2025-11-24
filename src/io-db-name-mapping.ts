// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

export class IoDbNameMapping {
  // The primary key column is always named '_hash'
  public primaryKeyColumn: string = '_hash';
  public dataSection: string = '_data';
  public typeColumn: string = 'type';
  public keyColumn: string = 'key';

  // Names for the main tables in the database
  public tableNames: { [key: string]: string } = {
    main: 'tableCfgs',
    revision: 'revisions',
  };

  /// Suffix handling for the database
  private _suffix: { [key: string]: string } = {
    col: '_col',
    tbl: '_tbl',
    tmp: '_tmp',
  };

  // ********************************************************************
  // add and remove suffixes for use in SQL statements
  private _addFix(name: string, fix: string): string {
    return name.endsWith(fix) ? name : name + fix;
  }

  public addTableSuffix(name: string): string {
    return this._addFix(name, this._suffix.tbl);
  }

  public addColumnSuffix(name: string): string {
    return this._addFix(name, this._suffix.col);
  }

  public addTmpSuffix(name: string): string {
    return this._addFix(name, this._suffix.tmp);
  }

  private _removeFix(name: string, fix: string): string {
    return name.endsWith(fix) ? name.slice(0, -fix.length) : name;
  }

  public removeTableSuffix(name: string): string {
    return this._removeFix(name, this._suffix.tbl);
  }

  public removeColumnSuffix(name: string): string {
    return this._removeFix(name, this._suffix.col);
  }

  public removeTmpSuffix(name: string): string {
    return this._removeFix(name, this._suffix.tmp);
  }
}
