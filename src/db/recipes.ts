import { db } from './database';
import type { Recipe, RecipeWithChildren } from '../types/recipe';
import type { GeneratedRecipe } from '../types/api';
import type { ChatMessage } from '../types/recipe';

export async function createRecipe(
  generated: GeneratedRecipe,
  prompt: string,
  chatHistory: ChatMessage[],
  parentId: string | null = null,
  parentRootId: string | null = null,
  parentDepth: number = -1
): Promise<Recipe> {
  const id = crypto.randomUUID();
  const now = Date.now();
  const recipe: Recipe = {
    id,
    parentId,
    rootId: parentRootId ?? id,
    depth: parentDepth + 1,
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

export async function deleteRecipeTree(id: string): Promise<void> {
  const recipe = await db.recipes.get(id);
  if (!recipe) return;

  // Get all recipes in the tree
  const treeRecipes = await db.recipes.where('rootId').equals(recipe.rootId).toArray();

  // Build a set of IDs to delete: the recipe and all its descendants
  const toDelete = new Set<string>();
  toDelete.add(id);

  // Iteratively find all descendants
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of treeRecipes) {
      if (r.parentId && toDelete.has(r.parentId) && !toDelete.has(r.id)) {
        toDelete.add(r.id);
        changed = true;
      }
    }
  }

  await db.recipes.bulkDelete([...toDelete]);
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
