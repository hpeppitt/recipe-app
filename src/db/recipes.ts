import { db } from './database';
import { rankByQuery, recipeHaystack } from '../lib/search';
import { collectSubtreeIds } from '../lib/tree';
import type { Recipe, RecipeWithChildren, CreatedBy } from '../types/recipe';
import type { GeneratedRecipe } from '../types/api';
import type { ChatMessage } from '../types/recipe';

/** Variations also score against the prompt that produced them. */
function variationHaystack(r: Recipe): string {
  return [r.title, r.description, r.prompt, ...r.tags].join(' ');
}

export async function createRecipe(
  generated: GeneratedRecipe,
  prompt: string,
  chatHistory: ChatMessage[],
  parentId: string | null = null,
  parentRootId: string | null = null,
  parentDepth: number = -1,
  createdBy: CreatedBy = { uid: 'local', displayName: null }
): Promise<Recipe> {
  const id = crypto.randomUUID();
  const now = Date.now();
  const recipe: Recipe = {
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
  await db.recipes.add(recipe);
  return recipe;
}

export async function getRecipe(id: string): Promise<Recipe | undefined> {
  return db.recipes.get(id);
}

export async function getAllRecipes(): Promise<Recipe[]> {
  return db.recipes.orderBy('createdAt').reverse().toArray();
}

export async function getCoreRecipes(): Promise<RecipeWithChildren[]> {
  const all = await getAllRecipes();
  const cores = all.filter((r) => r.parentId === null);
  return cores.map((core) => ({
    ...core,
    childCount: all.filter((r) => r.rootId === core.id && r.id !== core.id).length,
  }));
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

/** Deletes a recipe and all its descendants, returning the ids removed. */
export async function deleteRecipeTree(id: string): Promise<string[]> {
  const recipe = await db.recipes.get(id);
  if (!recipe) return [];

  const treeRecipes = await db.recipes.where('rootId').equals(recipe.rootId).toArray();
  const toDelete = collectSubtreeIds(treeRecipes, id);

  await db.recipes.bulkDelete(toDelete);
  return toDelete;
}

export async function updateRecipe(id: string, updates: Partial<Recipe>): Promise<void> {
  const recipe = await db.recipes.get(id);
  if (!recipe) return;
  await db.recipes.put({ ...recipe, ...updates, updatedAt: Date.now() });
}

export async function importRecipes(recipes: Recipe[]): Promise<void> {
  await db.recipes.bulkPut(recipes);
}

export async function exportAllRecipes(): Promise<Recipe[]> {
  return db.recipes.toArray();
}

export async function clearAllRecipes(): Promise<void> {
  await db.recipes.clear();
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
