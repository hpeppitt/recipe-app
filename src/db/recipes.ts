import { db } from './database';
import { rankByQuery, recipeHaystack, variationHaystack } from '../lib/search';
import { collectSubtreeIds } from '../lib/tree';
import { parseImportedRecipes } from '../lib/import';
import { planOwnRecipeSync } from '../lib/recipeSync';
import type { Recipe, CreatedBy, Collaborator } from '../types/recipe';
import type { GeneratedRecipe } from '../types/api';
import type { ChatMessage } from '../types/recipe';

/**
 * The record `createRecipe` would store, without writing it. A verified user's
 * save publishes first and caches only on success (RL-082), so the id has to be
 * minted before anything is written, and kept for a retry.
 */
export function buildRecipe(
  generated: GeneratedRecipe,
  prompt: string,
  chatHistory: ChatMessage[],
  parentId: string | null = null,
  parentRootId: string | null = null,
  parentDepth: number = -1,
  createdBy: CreatedBy = { uid: 'local', displayName: null }
): Recipe {
  const id = crypto.randomUUID();
  const now = Date.now();
  return {
    id,
    parentId,
    rootId: parentRootId ?? id,
    depth: parentDepth + 1,
    createdBy,
    collaborators: [],
    ...generated,
    prompt,
    chatHistory,
    createdAt: now,
    updatedAt: now,
  };
}

export async function createRecipe(
  ...args: Parameters<typeof buildRecipe>
): Promise<Recipe> {
  const recipe = buildRecipe(...args);
  await db.recipes.add(recipe);
  return recipe;
}

/** Caches a recipe that is already in the cloud, overwriting any row with its id. */
export async function cacheRecipe(recipe: Recipe): Promise<void> {
  await db.recipes.put(recipe);
}

/**
 * Makes Dexie mirror a server snapshot of `uid`'s own recipes (RL-078, decision 1b) in one
 * transaction, so a save landing between the read and the write cannot be lost to a stale plan.
 */
export async function applyOwnRecipeSync(
  uid: string,
  cloudDocs: unknown[],
  previousUids: string[]
): Promise<void> {
  await db.transaction('rw', db.recipes, async () => {
    // A row with no owner (an old or hand-made import) would throw in the plan; leave it alone.
    const rows = (await db.recipes.toArray()).filter((r) => typeof r.createdBy?.uid === 'string');
    const { put, remove } = planOwnRecipeSync(uid, rows, cloudDocs, previousUids);
    if (put.length) await db.recipes.bulkPut(put);
    if (remove.length) await db.recipes.bulkDelete(remove);
  });
}

export async function getRecipe(id: string): Promise<Recipe | undefined> {
  return db.recipes.get(id);
}

export async function getAllRecipes(): Promise<Recipe[]> {
  return db.recipes.orderBy('createdAt').reverse().toArray();
}

export async function getRecipeChildren(parentId: string): Promise<Recipe[]> {
  return db.recipes.where('parentId').equals(parentId).toArray();
}

export async function getRecipeTree(rootId: string): Promise<Recipe[]> {
  return db.recipes.where('rootId').equals(rootId).toArray();
}

export async function getRecipeAncestors(recipe: Recipe): Promise<Recipe[]> {
  const ancestors: Recipe[] = [];
  let current = recipe;
  while (current.parentId) {
    const parent = await db.recipes.get(current.parentId);
    if (!parent) break;
    ancestors.unshift(parent);
    current = parent;
  }
  return ancestors;
}

/** The ids `deleteRecipeTree(id)` would remove, without removing anything. */
export async function getSubtreeIds(id: string): Promise<string[]> {
  const recipe = await db.recipes.get(id);
  if (!recipe) return [];
  const treeRecipes = await db.recipes.where('rootId').equals(recipe.rootId).toArray();
  return collectSubtreeIds(treeRecipes, id);
}

/** Deletes a recipe and all its descendants, returning the ids removed. */
export async function deleteRecipeTree(id: string): Promise<string[]> {
  const toDelete = await getSubtreeIds(id);
  await db.recipes.bulkDelete(toDelete);
  return toDelete;
}

/**
 * Mirror an approved collaborator onto the local copy of a recipe.
 *
 * Approval only wrote to the Firestore doc, but `useRecipe` prefers the local
 * Dexie record, so the owner — who always has one — never saw the collaborator
 * they had just approved. Idempotent on uid, matching Firestore's `arrayUnion`.
 * A no-op when the recipe isn't held locally.
 */
export async function addLocalCollaborator(
  recipeId: string,
  collaborator: Collaborator
): Promise<boolean> {
  const recipe = await db.recipes.get(recipeId);
  if (!recipe) return false;

  const existing = recipe.collaborators ?? [];
  if (existing.some((c) => c.uid === collaborator.uid)) return false;

  await db.recipes.put({
    ...recipe,
    collaborators: [...existing, collaborator],
    updatedAt: Date.now(),
  });
  return true;
}

export async function updateRecipe(id: string, updates: Partial<Recipe>): Promise<void> {
  const recipe = await db.recipes.get(id);
  if (!recipe) return;
  await db.recipes.put({ ...recipe, ...updates, updatedAt: Date.now() });
}

export interface ImportResult {
  added: number;
  replaced: number;
  skipped: number;
  duplicatesInFile: number;
}

/**
 * Import recipes from an untrusted export file.
 *
 * Takes the raw parsed JSON rather than `Recipe[]`: validation is part of the
 * job, not the caller's responsibility. Existing ids are overwritten (bulkPut
 * is keyed on the inbound id), so re-importing the same file is idempotent.
 */
export async function importRecipes(raw: unknown): Promise<ImportResult> {
  const { recipes, skipped, duplicatesInFile } = parseImportedRecipes(raw);
  if (recipes.length === 0) {
    return { added: 0, replaced: 0, skipped, duplicatesInFile };
  }

  const existing = await db.recipes.bulkGet(recipes.map((r: Recipe) => r.id));
  const replaced = existing.filter(Boolean).length;

  await db.recipes.bulkPut(recipes);

  return {
    added: recipes.length - replaced,
    replaced,
    skipped,
    duplicatesInFile,
  };
}

export async function exportAllRecipes(): Promise<Recipe[]> {
  return db.recipes.toArray();
}

/**
 * Wipes every local table, not just recipes. Favourites used to survive, so
 * "Clear All Data" left rows keyed to recipes that no longer existed — and
 * re-signing in resurrected a favourites list for a library that was gone.
 *
 * Deliberately local-only: published recipes are not touched. Deleting them is
 * both irreversible and not purely the user's to do, since other people may
 * have favourited or branched from them. The Settings copy now says so, and
 * per-recipe delete remains the way to remove a published recipe.
 */
export async function clearAllRecipes(): Promise<void> {
  await db.transaction('rw', db.recipes, db.favorites, async () => {
    await db.recipes.clear();
    await db.favorites.clear();
  });
}

export async function searchRecipes(
  query: string,
  excludeRootId?: string
): Promise<Recipe[]> {
  const all = await db.recipes.toArray();
  return rankByQuery(
    all.filter((r) => !excludeRootId || r.rootId !== excludeRootId),
    query,
    { haystack: recipeHaystack, threshold: 0.5, limit: 5 }
  );
}

export async function searchVariations(
  rootId: string,
  query: string,
  excludeId?: string
): Promise<Recipe[]> {
  const tree = await db.recipes.where('rootId').equals(rootId).toArray();
  return rankByQuery(
    tree.filter((r) => r.id !== excludeId),
    query,
    { haystack: variationHaystack, threshold: 0.4, limit: 3 }
  );
}

export async function migrateRecipesUid(
  oldUid: string,
  newUid: string,
  displayName: string | null
): Promise<number> {
  const recipes = await db.recipes.toArray();
  const toUpdate = recipes.filter((r) => r.createdBy.uid === oldUid);
  for (const recipe of toUpdate) {
    await db.recipes.put({
      ...recipe,
      createdBy: { uid: newUid, displayName },
      updatedAt: Date.now(),
    });
  }
  return toUpdate.length;
}
