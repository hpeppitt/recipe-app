import { getPublishedRecipe, getRecentPublishedRecipes, type PublishedRecipe } from '../services/firestore';
import { reportError } from '../services/telemetry';
import { withTimeout } from '../lib/utils';

const TIMEOUT_MS = 10000;
export const RECENT_DAYS = 90;
export const RECENT_MAX = 100;

// Read only, module state for the page session, shared by Branching fast this week and Most
// branched (RL-166): one 90 day query, one read per unknown root. Only successes are cached, so
// a timeout or failure is retried on the next mount instead of sticking until reload.
let recentQuery: Promise<PublishedRecipe[] | null> | undefined;
const rootReads = new Map<string, Promise<PublishedRecipe | null>>();

/** Test use only: the caches are module state and would leak between tests. */
export function clearRecentPublishedCache() {
  recentQuery = undefined;
  rootReads.clear();
}

// withTimeout swallows rejections, so report them before it sees the promise.
const TIMED_OUT = Symbol('timed out');
const FAILED = Symbol('failed');
async function bounded<T>(read: Promise<T>, tag: string): Promise<T | typeof FAILED> {
  const out = await withTimeout<T | typeof TIMED_OUT | typeof FAILED>(
    read.catch((err) => {
      reportError(err, tag);
      return FAILED;
    }),
    TIMEOUT_MS,
    TIMED_OUT
  );
  if (out !== TIMED_OUT) return out;
  reportError(new Error(`${tag} timeout`), tag);
  return FAILED;
}

/** The newest 100 published recipes from the last 90 days. `tag` names the first caller in telemetry. */
export function readRecent(tag: string): Promise<PublishedRecipe[]> {
  return readRecentOrFail(tag).then((out) => out ?? []);
}

/** As `readRecent`, but null when the read failed, so a caller can tell failure from nothing. */
export function readRecentOrFail(tag: string): Promise<PublishedRecipe[] | null> {
  if (!recentQuery) {
    const p = bounded(getRecentPublishedRecipes(Date.now() - RECENT_DAYS * 86400000, RECENT_MAX), tag).then((out) => {
      if (out !== FAILED) return out;
      if (recentQuery === p) recentQuery = undefined;
      return null;
    });
    recentQuery = p;
  }
  return recentQuery;
}

export function readRoot(id: string, tag: string): Promise<PublishedRecipe | null> {
  let p = rootReads.get(id);
  if (!p) {
    p = bounded<PublishedRecipe | null>(getPublishedRecipe(id) as Promise<PublishedRecipe | null>, tag).then((out) => {
      if (out !== FAILED) return out;
      rootReads.delete(id);
      return null;
    });
    rootReads.set(id, p);
  }
  return p;
}
