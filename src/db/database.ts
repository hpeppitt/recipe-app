import Dexie, { type Table } from 'dexie';
import type { Recipe, Favorite } from '../types/recipe';
import { oneEmoji, RECIPE_EMOJI_FALLBACK } from '../lib/emoji';

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

    // RL-272: older rows may hold several emoji; normalise on read, never rewrite the row.
    this.recipes.hook('reading', (recipe) =>
      recipe ? { ...recipe, emoji: oneEmoji(recipe.emoji, RECIPE_EMOJI_FALLBACK) } : recipe,
    );
  }
}

export const db = new RecipeDatabase();
