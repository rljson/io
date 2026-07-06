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

    it('golden test', async () => {
      await expectGolden('reverse-refs.json').toBe(reverseRefs);
    });

    describe('writes the reverse references for elements referenced by', () => {
      describe('components', () => {
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

          // Get the hash of the recipes parent row
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

        it('ingredients row 1 is not referenced by any components row', () => {
          // Get the hash of the ingredients child row
          const childRow = bakery.ingredients._data[1]._hash;

          // The child row is not referenced by a parent row.
          // Thus the reverse reference object is empty
          expect(reverseRefs.ingredients[childRow]).toEqual({});
        });
      });

      describe('layers', () => {
        it('recipes row 0 is referenced by recipeLayers row 0', () => {
          // Get the hash of the recipes child row
          const childRow = bakery.recipes._data[0]._hash;

          // Get the hash of the recipeLayers parent row
          const parentRow = bakery.recipeLayers._data[0]._hash;

          // The reverse reference object should tell that the child row
          // is referenced by the parent row
          expect(reverseRefs.recipes[childRow]).toEqual({
            recipeLayers: {
              // parent table name
              // parent table row hash
              [parentRow]: {},
            },
          });
        });

        it('recipes row 0 is referenced only once although recipeLayers row 0 maps slice0 and slice1 to it', () => {
          // recipeLayers row 0 maps two different slice ids (slice0 and
          // slice1) to the very same recipes row. The reverse reference
          // object must not contain duplicate entries for this.
          const childRow = bakery.recipes._data[0]._hash;
          const parentRow = bakery.recipeLayers._data[0]._hash;

          expect(
            Object.keys(reverseRefs.recipes[childRow].recipeLayers),
          ).toEqual([parentRow]);
        });
      });

      describe('sliceIds', () => {
        it('do not reference any other columns', () => {
          // Get the hash of the slices child row
          const childRow = bakery.slices._data[0]._hash;

          // sliceIds rows do not write any reverse references. Thus the
          // reverse reference object stays empty for this row.
          expect(reverseRefs.slices[childRow]).toEqual({});
        });
      });

      describe('cakes', () => {
        it('recipeLayers row 0 is referenced by cake row 0', () => {
          // Get the hash of the recipeLayers row 0 child row
          const childRow = bakery.recipeLayers._data[0]._hash;

          // Get the hash of the cakes parent row
          const parentRow = bakery.cakes._data[0]._hash;

          // The reverse reference object should tell that the child row
          // is referenced by the parent row
          expect(reverseRefs.recipeLayers[childRow]).toEqual({
            cakes: {
              // parent table name
              // parent table row hash
              [parentRow]: {},
            },
          });
        });

        it('does not create a reverse reference for the internal _hash key of the layers map', () => {
          // Cake rows carry an internal _hash key alongside the real
          // layers keys. It must not be mistaken for a referenced table.
          expect(reverseRefs['_hash']).toBeUndefined();
        });
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
