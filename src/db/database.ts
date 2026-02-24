import Dexie, { type Table } from 'dexie';
import type { Recipe, Favorite } from '../types/recipe';

export class RecipeDatabase extends Dexie {
  recipes!: Table<Recipe, string>;
  favorites!: Table<Favorite, [string, string]>;

  constructor() {
    super('RecipeAppDB');

    this.version(1).stores({
      recipes: 'id, parentId, rootId, createdAt, *tags',
    });

    this.version(2).stores({
      recipes: 'id, parentId, rootId, createdAt, *tags',
      favorites: '[uid+recipeId], uid',
    }).upgrade(tx => {
      return tx.table('recipes').toCollection().modify(recipe => {
        if (!recipe.createdBy) {
          recipe.createdBy = { uid: 'local', displayName: null };
        }
      });
    });

    this.version(3).stores({
      recipes: 'id, parentId, rootId, createdAt, *tags',
      favorites: '[uid+recipeId], uid',
    }).upgrade(tx => {
      return tx.table('recipes').toCollection().modify(recipe => {
        if (!recipe.collaborators) {
          recipe.collaborators = [];
        }
      });
    });
  }
}

export const db = new RecipeDatabase();
