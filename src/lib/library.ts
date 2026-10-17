/**
 * Pure list logic behind the Library's two tabs, My Recipes (local Dexie) and
 * Explore (the paged cloud feed). Extracted from `useRecipeLibrary` when it was
 * split in two (RL-008); no imports from services or hooks, so it tests in node.
 */
import { countDescendantsByRoot } from './tree';
import { recipeHaystack } from './search';

export type LibraryTab = 'mine' | 'explore';

/**
 * Trimmed, lower-case, de-duplicated tags in first-seen order, for the published
 * copy (RL-059): the Explore chips query `array-contains`, which is exact.
 * Tolerates a missing array on old recipes.
 */
export function normalizeTags(tags: string[] | undefined): string[] {
  return [...new Set((tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean))];
}

/** Validates a stored tab value; anything unknown falls back to My Recipes. */
export function parseLibraryTab(raw: string | null | undefined): LibraryTab {
  return raw === 'explore' ? 'explore' : 'mine';
}

export interface FeedRecipe {
  id: string;
  parentId: string | null;
  rootId: string;
  depth: number;
  emoji: string;
  title: string;
  description: string;
  totalTime: number;
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];
  /**
   * Carried purely so search can match them. Searching "chicken" and missing
   * every recipe full of chicken is the opposite of what a recipe app should do.
   */
  ingredients: { name: string }[];
  createdBy: { uid: string; displayName: string | null };
  childCount: number;
  createdAt: number;
}

/** The structural shape both a Dexie recipe and a published recipe satisfy. */
export type FeedSource = Omit<FeedRecipe, 'childCount' | 'parentId' | 'rootId' | 'depth' | 'createdAt' | 'ingredients'> & {
  parentId?: string | null;
  rootId?: string;
  depth?: number;
  createdAt?: number;
  ingredients?: { name: string }[];
};

/**
 * One tab's feed: roots only, deduplicated by id (first occurrence wins), newest
 * first.
 *
 * `countFrom` is every record known from both stores. Variation counts span
 * both: a root saved locally can have variations that only exist in the cloud,
 * and vice versa. Counting one store at a time is what left cloud feed entries
 * showing zero.
 */
export function buildFeed(source: readonly FeedSource[], countFrom: readonly FeedSource[]): FeedRecipe[] {
  const childCounts = countDescendantsByRoot(
    countFrom.map((r) => ({ id: r.id, rootId: r.rootId ?? r.id }))
  );
  const byId = new Map<string, FeedRecipe>();
  for (const r of source) {
    if (r.parentId) continue;
    if (byId.has(r.id)) continue;
    byId.set(r.id, {
      id: r.id,
      parentId: r.parentId ?? null,
      rootId: r.rootId ?? r.id,
      depth: r.depth ?? 0,
      emoji: r.emoji,
      title: r.title,
      description: r.description,
      totalTime: r.totalTime,
      difficulty: r.difficulty,
      tags: r.tags,
      ingredients: r.ingredients ?? [],
      createdBy: r.createdBy,
      childCount: childCounts.get(r.id) ?? 0,
      createdAt: r.createdAt ?? 0,
    });
  }
  return Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export interface FeedFilter {
  search?: string;
  /** Set to keep favourites only; undefined means no favourites filter. */
  favoriteIds?: ReadonlySet<string>;
  /** Set to keep recipes by these creators only (Explore's Following filter). */
  followingIds?: ReadonlySet<string>;
}

/**
 * Applies the active tab's filters. Search uses the same haystack the dedup
 * check uses, so "already exists" and "I can find it" cannot disagree about what
 * a recipe contains.
 */
export function filterFeed<T extends Parameters<typeof recipeHaystack>[0] & {
  id: string;
  createdBy?: { uid: string };
}>(feed: readonly T[], { search, favoriteIds, followingIds }: FeedFilter): T[] {
  let result = [...feed];
  if (favoriteIds) result = result.filter((r) => favoriteIds.has(r.id));
  if (followingIds) result = result.filter((r) => !!r.createdBy && followingIds.has(r.createdBy.uid));
  // Trim decides whether a search is active, but the match keeps the raw text,
  // exactly as the merged feed did.
  const q = search?.trim() ? search.toLowerCase() : '';
  if (q) result = result.filter((r) => recipeHaystack(r).toLowerCase().includes(q));
  return result;
}
