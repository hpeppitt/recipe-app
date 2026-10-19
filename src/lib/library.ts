/**
 * Pure list logic behind Explore (the paged cloud feed, or the device's recipes
 * in local-only mode) and the Saved and You lists. Extracted from
 * `useRecipeLibrary` (RL-008); no imports from services or hooks, so it tests in node.
 */
import { countDescendantsByRoot } from './tree';
import { recipeHaystack } from './search';

/**
 * Trimmed, lower-case, de-duplicated tags in first-seen order, for the published
 * copy (RL-059): the Explore chips query `array-contains`, which is exact.
 * Tolerates a missing array on old recipes.
 */
export function normalizeTags(tags: string[] | undefined): string[] {
  return [...new Set((tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean))];
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
  const toFeed = feedMapper(countFrom);
  const byId = new Map<string, FeedRecipe>();
  for (const r of source) {
    if (r.parentId) continue;
    if (byId.has(r.id)) continue;
    byId.set(r.id, toFeed(r));
  }
  return Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt);
}

function feedMapper(countFrom: readonly FeedSource[]): (r: FeedSource) => FeedRecipe {
  const childCounts = countDescendantsByRoot(
    countFrom.map((r) => ({ id: r.id, rootId: r.rootId ?? r.id }))
  );
  return (r) => ({
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

/**
 * A device's recipes sorted for the Created, Branched and Saved tabs (RL-084).
 * Own rows with no parent are Created, own rows with a parent are Branched
 * (whoever owns the parent), everything else is Saved, roots only. Each list is
 * deduplicated by id, newest first.
 *
 * Own means `createdBy.uid === uid` when Firebase is configured; with no uid
 * nothing is own. Pre-auth 'local' rows therefore land in Saved (open author
 * question, RL-084). Unconfigured, every row is the user's own, as in
 * `canManageRecipe`.
 */
export function splitLibrary(
  rows: readonly FeedSource[],
  countFrom: readonly FeedSource[],
  { uid, isConfigured }: { uid: string | undefined; isConfigured: boolean }
): { created: FeedRecipe[]; branched: FeedRecipe[]; saved: FeedRecipe[] } {
  const toFeed = feedMapper(countFrom);
  const seen = new Set<string>();
  const out = { created: [] as FeedRecipe[], branched: [] as FeedRecipe[], saved: [] as FeedRecipe[] };
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    const own = !isConfigured || (!!uid && r.createdBy.uid === uid);
    if (own) (r.parentId ? out.branched : out.created).push(toFeed(r));
    else if (!r.parentId) out.saved.push(toFeed(r));
  }
  const newest = (a: FeedRecipe, b: FeedRecipe) => b.createdAt - a.createdAt;
  return { created: out.created.sort(newest), branched: out.branched.sort(newest), saved: out.saved.sort(newest) };
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
