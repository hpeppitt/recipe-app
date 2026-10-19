/**
 * Pure list logic behind Explore (the paged cloud feed, or the device's recipes
 * in local-only mode) and the Saved and You lists. Extracted from
 * `useRecipeLibrary` (RL-008); no imports from services or hooks, so it tests in node.
 */
import { countDescendantsByRoot } from './tree';
import { queryWords, recipeHaystack } from './search';

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

/** What a cloud read of one favourited recipe produced (RL-121). */
export type FavoriteFetch = { status: 'recipe'; recipe: FeedSource } | { status: 'missing' } | { status: 'failed' };

/**
 * The Saved list: saved copies plus the user's favourites (RL-121). A favourite
 * uses the device's row when there is one, else the fetched recipe. Own recipes
 * (they live on the You tab), deleted and failed reads are left out and counted;
 * ids not fetched yet come back in `toFetch`. Favourites keep branches, unlike
 * saved copies. A recipe both saved and favourited appears once, ordered by the
 * favourite's date. Newest first.
 */
export function buildSavedList(
  recipes: readonly FeedSource[],
  saved: readonly FeedRecipe[],
  favorites: readonly { recipeId: string; createdAt: number }[],
  fetched: ReadonlyMap<string, FavoriteFetch>,
  uid: string | undefined
): { rows: FeedRecipe[]; toFetch: string[]; deletedCount: number; failedCount: number } {
  const toFeed = feedMapper(recipes);
  const local = new Map(recipes.map((r) => [r.id, r]));
  const byId = new Map<string, { row: FeedRecipe; at: number }>();
  for (const r of saved) byId.set(r.id, { row: r, at: r.createdAt });
  const toFetch: string[] = [];
  let deletedCount = 0;
  let failedCount = 0;
  for (const f of favorites) {
    let source = local.get(f.recipeId);
    if (!source) {
      const result = fetched.get(f.recipeId);
      if (!result) toFetch.push(f.recipeId);
      else if (result.status === 'missing') deletedCount++;
      else if (result.status === 'failed') failedCount++;
      else source = result.recipe;
    }
    if (!source || (uid && source.createdBy.uid === uid)) continue;
    byId.set(f.recipeId, { row: toFeed(source), at: f.createdAt });
  }
  const rows = [...byId.values()].sort((a, b) => b.at - a.at).map((e) => e.row);
  return { rows, toFetch, deletedCount, failedCount };
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

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** "New this week" when every recipe is at most 7 days old, else "Newest". */
export function tileRowTitle(recipes: readonly { createdAt: number }[], now: number): string {
  return recipes.every((r) => now - r.createdAt <= WEEK_MS) ? 'New this week' : 'Newest';
}

export type SearchFilter = 'all' | 'under30' | 'easy' | 'branches';

export const SEARCH_FILTERS: readonly { id: SearchFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'under30', label: 'Under 30 min' },
  { id: 'easy', label: 'Easy' },
  { id: 'branches', label: 'Branches' },
];

export type SearchResult = FeedRecipe & { familyLabel: string | null; line: string };

/**
 * The Search screen's matching (RL-123): every query word must be a substring of
 * the title or an ingredient name (each word may hit a different field), across
 * originals and branches. An empty query lists originals only, or branches under
 * the Branches chip. Rows are de-duplicated by id, first wins; newest first.
 */
export function searchLibrary(
  sources: readonly (FeedSource & { prompt?: string })[],
  { query, filter }: { query: string; filter: SearchFilter }
): SearchResult[] {
  const trimmed = query.trim().toLowerCase();
  let words = queryWords(trimmed);
  if (words.length === 0 && trimmed) words = [trimmed];
  const toFeed = feedMapper(sources);
  const byId = new Map<string, FeedSource & { prompt?: string }>();
  for (const r of sources) if (!byId.has(r.id)) byId.set(r.id, r);
  const rows: SearchResult[] = [];
  for (const r of byId.values()) {
    if (!trimmed && filter !== 'branches' && r.parentId) continue;
    if (filter === 'under30' && !(r.totalTime <= 30)) continue;
    if (filter === 'easy' && r.difficulty !== 'easy') continue;
    if (filter === 'branches' && !r.parentId) continue;
    const fields = [r.title, ...(r.ingredients ?? []).map((i) => i.name)].map((f) => f.toLowerCase());
    if (!words.every((w) => fields.some((f) => f.includes(w)))) continue;
    const root = r.parentId ? byId.get(r.rootId ?? r.id) : undefined;
    rows.push({
      ...toFeed(r),
      familyLabel: r.parentId ? (root ? `${root.title} variation` : 'Variation') : null,
      line: r.parentId && r.prompt ? `"${r.prompt}"` : r.description,
    });
  }
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}
