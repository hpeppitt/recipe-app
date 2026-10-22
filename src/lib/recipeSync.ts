import type { Recipe } from '../types/recipe';
import { ImportedFromSchema } from '../schemas/recipe.schema';
import { oneEmoji, RECIPE_EMOJI_FALLBACK } from './emoji';

/** A recipe document as Firestore returns it: Recipe fields plus counters, some optional. */
export type CloudRecipeDoc = Partial<Omit<Recipe, 'chatHistory'>> & {
  id: string;
  title: string;
  ingredients: Recipe['ingredients'];
  instructions: Recipe['instructions'];
  favoriteCount?: number;
  viewCount?: number;
  [key: string]: unknown;
};

export interface OwnRecipeSyncPlan {
  put: Recipe[];
  remove: string[];
}

/** Keeps only `Recipe` fields; the cloud wins every field except `chatHistory`, which stays on the device. */
export function toLocalRecipe(doc: CloudRecipeDoc, localRow?: Recipe): Recipe {
  const recipe = {
    id: doc.id,
    parentId: doc.parentId ?? null,
    rootId: doc.rootId ?? doc.id,
    depth: doc.depth ?? 0,
    createdBy: doc.createdBy,
    collaborators: doc.collaborators ?? [],
    title: doc.title,
    description: doc.description,
    ingredients: doc.ingredients,
    instructions: doc.instructions,
    notes: doc.notes ?? [],
    prepTime: doc.prepTime,
    cookTime: doc.cookTime,
    totalTime: doc.totalTime,
    servings: doc.servings,
    difficulty: doc.difficulty,
    tags: doc.tags,
    emoji: oneEmoji(doc.emoji, RECIPE_EMOJI_FALLBACK),
    nutrition: doc.nutrition,
    relatedFamilyId: doc.relatedFamilyId,
    importedFrom: ImportedFromSchema.parse(doc.importedFrom),
    importedVia: doc.importedVia,
    prompt: doc.prompt ?? '',
    chatHistory: localRow?.chatHistory ?? [],
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  } as Recipe;
  if (recipe.nutrition === undefined) delete recipe.nutrition;
  if (recipe.relatedFamilyId === undefined) delete recipe.relatedFamilyId;
  if (recipe.importedFrom === undefined) delete recipe.importedFrom;
  if (recipe.importedVia === undefined) delete recipe.importedVia;
  return recipe;
}

function isValidDoc(d: unknown): d is CloudRecipeDoc {
  const doc = d as Partial<CloudRecipeDoc> | null;
  return (
    !!doc &&
    typeof doc.id === 'string' &&
    typeof doc.title === 'string' &&
    Array.isArray(doc.ingredients) &&
    Array.isArray(doc.instructions)
  );
}

// Key order and undefined-valued keys are ignored, as Dexie and Firestore differ on both.
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  return (
    ka.length === kb.length &&
    ka.every((k) => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  );
}

/**
 * Plans how to make Dexie mirror a verified user's own cloud recipes. `cloudDocs` must be a
 * server snapshot: present means overwrite, absent means remove. Rows of other accounts that
 * signed in on this device (`previousUids`) are tidied away; saved copies and 'local' rows stay.
 */
export function planOwnRecipeSync(
  uid: string,
  localRows: Recipe[],
  cloudDocs: unknown[],
  previousUids: string[],
): OwnRecipeSyncPlan {
  const local = new Map(localRows.map((r) => [r.id, r]));
  const put: Recipe[] = [];
  const seen = new Set<string>();

  for (const raw of cloudDocs) {
    const id = (raw as { id?: unknown } | null)?.id;
    if (typeof id === 'string') seen.add(id); // a malformed doc still protects its local row
    if (!isValidDoc(raw)) continue;
    if (raw.createdBy?.uid !== uid) continue;
    const row = local.get(raw.id);
    const next = toLocalRecipe(raw, row);
    if (!row || !same(next, row)) put.push(next);
  }

  const remove = localRows
    .filter((r) =>
      r.createdBy.uid === uid
        ? !seen.has(r.id)
        : previousUids.includes(r.createdBy.uid),
    )
    .map((r) => r.id);

  return { put, remove };
}
