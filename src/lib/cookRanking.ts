// Ranking over the slim recent-cooks list (RL-242). Pure: callers pass `now`, and windows are
// plain millisecond spans, so nothing depends on the time zone.

export interface RecentCook {
  recipeId: string;
  rootId: string;
  uid: string;
  createdAt: number;
}

const DAY = 86_400_000;
export const COOKED_WEEK_MAX = 8;
export const MOST_COOKED_MAX = 3;
export const LEADER_FACTOR = 3;
export const LEADER_MIN_COOKS = 3;
const UIDS_MAX = 3;

const within = (cooks: readonly RecentCook[], now: number, days: number) =>
  cooks.filter((c) => c.createdAt > now - days * DAY && c.createdAt <= now);

/** A stored cache is `{ at, cooks }`; anything malformed or older than `ttlMs` is a miss (null). */
export function parseRecentCooksCache(raw: unknown, now: number, ttlMs: number): RecentCook[] | null {
  if (!raw || typeof raw !== 'object') return null;
  const { at, cooks } = raw as { at?: unknown; cooks?: unknown };
  if (typeof at !== 'number' || at > now || now - at >= ttlMs || !Array.isArray(cooks)) return null;
  const ok = cooks.every(
    (c) => c && typeof c.recipeId === 'string' && typeof c.rootId === 'string' && typeof c.uid === 'string' && typeof c.createdAt === 'number'
  );
  return ok ? (cooks as RecentCook[]) : null;
}

/** Recipes cooked in the last 7 days, most cooks first (ties: newest cook first), at most 8. */
export function cookedThisWeek(cooks: readonly RecentCook[], now: number) {
  const by = new Map<string, { recipeId: string; rootId: string; all: Set<string>; last: number }>();
  for (const c of within(cooks, now, 7)) {
    const e = by.get(c.recipeId) ?? { recipeId: c.recipeId, rootId: c.rootId, all: new Set<string>(), last: 0 };
    e.all.add(c.uid);
    e.last = Math.max(e.last, c.createdAt);
    by.set(c.recipeId, e);
  }
  // count is distinct cooks (people), so one person cannot push a recipe up by cooking it often.
  return [...by.values()]
    .map((e) => ({ recipeId: e.recipeId, rootId: e.rootId, count: e.all.size, uids: [...e.all].slice(0, UIDS_MAX), last: e.last }))
    .sort((a, b) => b.count - a.count || b.last - a.last || a.recipeId.localeCompare(b.recipeId))
    .slice(0, COOKED_WEEK_MAX)
    .map(({ recipeId, rootId, count, uids }) => ({ recipeId, rootId, count, uids }));
}

/** Distinct people per recipe inside a family, most first (ties: id order, so it is stable). */
function versionCounts(cooks: readonly RecentCook[]) {
  const n = new Map<string, Set<string>>();
  for (const c of cooks) n.set(c.recipeId, (n.get(c.recipeId) ?? new Set()).add(c.uid));
  return [...n.entries()].map(([id, u]) => [id, u.size] as const).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Families by cooks over `days` (30 or 90), top 3, each with its most-cooked version. */
export function mostCooked(cooks: readonly RecentCook[], now: number, days: 30 | 90) {
  const fams = new Map<string, RecentCook[]>();
  for (const c of within(cooks, now, days)) fams.set(c.rootId, [...(fams.get(c.rootId) ?? []), c]);
  return [...fams.entries()]
    .map(([rootId, list]) => ({ rootId, count: new Set(list.map((c) => c.uid)).size, topRecipeId: versionCounts(list)[0][0] }))
    .sort((a, b) => b.count - a.count || a.rootId.localeCompare(b.rootId))
    .slice(0, MOST_COOKED_MAX);
}

/** The version to open: a non-root with at least 3 cooks and 3x the original's over 90 days, else null. */
export function familyLeader(cooks: readonly RecentCook[], rootId: string, now: number): string | null {
  const counts = versionCounts(within(cooks, now, 90).filter((c) => c.rootId === rootId));
  const original = counts.find(([id]) => id === rootId)?.[1] ?? 0;
  const top = counts.find(([id]) => id !== rootId);
  return top && top[1] >= LEADER_MIN_COOKS && top[1] >= LEADER_FACTOR * original ? top[0] : null;
}
