import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { Recipe } from '../types/recipe';

export type SharedRecipe = Pick<
  Recipe,
  | 'title'
  | 'description'
  | 'emoji'
  | 'ingredients'
  | 'instructions'
  | 'notes'
  | 'prepTime'
  | 'cookTime'
  | 'totalTime'
  | 'servings'
  | 'difficulty'
  | 'tags'
>;

function toShareable(recipe: Recipe): SharedRecipe {
  return {
    title: recipe.title,
    description: recipe.description,
    emoji: recipe.emoji,
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
    notes: recipe.notes,
    prepTime: recipe.prepTime,
    cookTime: recipe.cookTime,
    totalTime: recipe.totalTime,
    servings: recipe.servings,
    difficulty: recipe.difficulty,
    tags: recipe.tags,
  };
}

export function encodeRecipeToUrl(recipe: Recipe): string {
  const shareable = toShareable(recipe);
  const json = JSON.stringify(shareable);
  const compressed = compressToEncodedURIComponent(json);
  return `${window.location.origin}/shared#r=${compressed}`;
}

export function decodeRecipeFromHash(hash: string): SharedRecipe | null {
  try {
    const param = hash.replace(/^#/, '').replace(/^r=/, '');
    if (!param) return null;
    const json = decompressFromEncodedURIComponent(param);
    if (!json) return null;
    return JSON.parse(json) as SharedRecipe;
  } catch {
    return null;
  }
}
