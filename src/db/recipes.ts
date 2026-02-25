import { db } from './database';
import type { Recipe, RecipeWithChildren, CreatedBy } from '../types/recipe';
import type { GeneratedRecipe } from '../types/api';
import type { ChatMessage } from '../types/recipe';

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

export async function searchRecipes(
  query: string,
  excludeRootId?: string
): Promise<Recipe[]> {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  if (words.length === 0) return [];

  const all = await db.recipes.toArray();
  const scored = all
    .filter((r) => !excludeRootId || r.rootId !== excludeRootId)
    .map((r) => {
      const haystack = [
        r.title,
        r.description,
        ...r.tags,
        ...r.ingredients.map((i) => i.name),
      ]
        .join(' ')
        .toLowerCase();
      const hits = words.filter((w) => haystack.includes(w)).length;
      return { recipe: r, score: hits / words.length };
    })
    .filter((s) => s.score >= 0.5)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 5).map((s) => s.recipe);
}

export async function searchVariations(
  rootId: string,
  query: string,
  excludeId?: string
): Promise<Recipe[]> {
  const tree = await db.recipes.where('rootId').equals(rootId).toArray();
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  if (words.length === 0) return [];

  const scored = tree
    .filter((r) => r.id !== excludeId)
    .map((r) => {
      const haystack = [r.title, r.description, r.prompt, ...r.tags]
        .join(' ')
        .toLowerCase();
      const hits = words.filter((w) => haystack.includes(w)).length;
      return { recipe: r, score: hits / words.length };
    })
    .filter((s) => s.score >= 0.4)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 3).map((s) => s.recipe);
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
