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
  | 'createdBy'
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
    createdBy: recipe.createdBy,
  };
}

/** Link to a Firestore-backed recipe. Only valid once the doc actually exists. */
export function cloudShareUrl(id: string, origin = window.location.origin): string {
  return `${origin}/shared/${id}`;
}

/**
 * Self-contained link carrying the whole recipe in the URL hash. Always works,
 * even offline, but is view-only: recipients can't favourite or suggest changes.
 */
export function hashShareUrl(recipe: Recipe, origin = window.location.origin): string {
  const json = JSON.stringify(toShareable(recipe));
  return `${origin}/shared#r=${compressToEncodedURIComponent(json)}`;
}

/**
 * Which kind of share link to hand out.
 *
 * Publishing is fire-and-forget at save time, so a recipe can be local-only
 * without the app knowing. Returning a cloud URL on that assumption produced
 * links that 404 for the recipient, so the caller has to confirm the doc exists
 * (or publish it) before a cloud link is chosen.
 */
export function pickShareUrl(
  recipe: Recipe,
  opts: { firebaseConfigured: boolean; isPublished: boolean; origin?: string }
): { url: string; mode: 'cloud' | 'self-contained' } {
  if (opts.firebaseConfigured && opts.isPublished) {
    return { url: cloudShareUrl(recipe.id, opts.origin), mode: 'cloud' };
  }
  return { url: hashShareUrl(recipe, opts.origin), mode: 'self-contained' };
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
