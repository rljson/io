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

    describe('writes the reverse references for elements referenced by', () => {
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

        it('recipeIngredients row 0 is referenced by recipes', () => {
          // Get the hash of the recipeIngredients child row
          const childRow = bakery.recipeIngredients._data[0]._hash;

          // Get the hash of the recipeIngredients parent row
          const parentRow = bakery.recipes._data[0]._hash;

          // The reverse reference object should tell that the child row
          // is referenced by the parent row
          expect(reverseRefs.recipeIngredients[childRow]).toEqual({
            recipes: {
              // parent table name
              // parent table row hash
              [parentRow]: {},
            },
          });
        });

        it('nutritionalValues row 1 is not referenced by any ingredients row', () => {
          // Get the hash of the nutritionalValues child row
          const childRow = bakery.nutritionalValues._data[1]._hash;

          // The child row is not referenced by a parent row.
          // Thus the reverse reference object is undefined
          expect(reverseRefs.nutritionalValues[childRow]).toEqual({});
        });
      });

      describe('layers', () => {
        it('recipes row 0 is referenced by cake layer 0', () => {
          // Get the hash of the recipes child row
          const childRow = bakery.recipes._data[0]._hash;

          // Get the hash of the layers parent row
          const parentRow = bakery.layers._data[0]._hash;

          // The reverse reference object should tell that the child row
          // is referenced by the parent row
          expect(reverseRefs.recipes[childRow]).toEqual({
            layers: {
              // parent table name
              // parent table row hash
              [parentRow]: {},
            },
          });
        });
      });

      describe('sliceIds', () => {
        it('do not reference any other columns', () => {});
      });

      describe('cakes', () => {
        it('layers row 0 is referenced by cake row 0', () => {
          // Get the hash of the layers row 0 child row
          const childRow = bakery.layers._data[0]._hash;

          // Get the hash of the cakes parent row
          const parentRow = bakery.cakes._data[0]._hash;

          // The reverse reference object should tell that the child row
          // is referenced by the parent row
          expect(reverseRefs.layers[childRow]).toEqual({
            cakes: {
              // parent table name
              // parent table row hash
              [parentRow]: {},
            },
          });
        });
        it('recipies row 0 is referenced by layers row 0 slice0 and slice1', () => {});
      });

      describe('buffets', () => {
        it('cakes row 0 is referenced by buffet row 0', () => {
          // Get the has of the cakes child row
          const childRow = bakery.cakes._data[0]._hash;

          // Get the hash of the buffets parent row
          const parentRow = bakery.buffets._data[0]._hash;

          // The reverse reference object should tell that the child row
          // is referenced by the parent row
          expect(reverseRefs.cakes[childRow]).toEqual({
            buffets: {
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
