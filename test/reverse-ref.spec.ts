// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { Example, Rljson } from '@rljson/rljson';

import { beforeAll, describe, expect, it } from 'vitest';

import { calcReverseRefs, ReverseRefs } from '../src/reverse-ref';

import { expectGolden } from './setup/goldens';

describe('ReverseRefs', () => {
  describe('calcReverseRefs', () => {
    let bakery: Rljson;
    let reverseRefs: ReverseRefs;

    beforeAll(() => {
      bakery = Example.ok.bakery();
      reverseRefs = calcReverseRefs(bakery);
    });

    it('golden test', () => {
      expectGolden('reverse-refs.json').toBe(reverseRefs);
    });

    describe('writes the reverse references for', () => {
      describe('ingredients', () => {
        it('nutritionalValues row 0 is referenced by ingredients row 0', () => {
          // Get the hash of the nutritionalValues child row
          const childRow = bakery.nutritionalValues._data[0]._hash;

          // Get the hash of the ingredients parent row
          const parentRow = bakery.ingredients._data[0]._hash;

          // The reverse reference object should tell that the child row
          // is referenced by the parent row
          expect(reverseRefs.nutritionalValues[childRow]).toEqual({
            ingredients: {
              // parent table name
              // parent table row hash
              [parentRow]: {},
            },
          });

          expect(reverseRefs).not.toBeUndefined();
        });

        it('nutritionalValues row 1 is not referenced by any ingredients row', () => {
          // Get the hash of the nutritionalValues child row
          const childRow = bakery.nutritionalValues._data[1]._hash;

          // The child row is not referenced by a parent row.
          // Thus the reverse reference object is undefined
          expect(reverseRefs.nutritionalValues[childRow]).toEqual({});
        });

        it('ingredients row 0 is referenced by recipeIngredients', () => {
          // Get the hash of the ingredients child row
          const childRow = bakery.ingredients._data[0]._hash;

          // Get the hash of the recipeIngredients parent row
          const parentRow = bakery.recipeIngredients._data[0]._hash;

          // The reverse reference object should tell that the child row
          // is referenced by the parent row
          expect(reverseRefs.ingredients[childRow]).toEqual({
            recipeIngredients: {
              // parent table name
              // parent table row hash
              [parentRow]: {},
            },
          });
        });
      });
    });
  });
});
