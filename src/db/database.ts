import Dexie, { type Table } from 'dexie';
import type { Recipe } from '../types/recipe';

export class RecipeDatabase extends Dexie {
  recipes!: Table<Recipe, string>;

  constructor() {
    super('RecipeAppDB');
    this.version(1).stores({
      recipes: 'id, parentId, rootId, createdAt, *tags',
    });
  }
}

export const db = new RecipeDatabase();
