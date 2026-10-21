import { useEffect, useState } from 'react';
import { getRecentCooks } from '../services/firestore';
import { reportError } from '../services/telemetry';
import { getRecentCooksCache, setRecentCooksCache } from '../services/storage';
import type { RecentCook } from '../lib/cookRanking';

export const RECENT_COOKS_DAYS = 90;

// One read per page session, and a 6 hour localStorage cache across sessions (services/storage).
// Only a success is cached, in memory or in storage, so a failure retries on the next mount.
let query: Promise<RecentCook[] | null> | undefined;

/** Test use only: the cache is module state and would leak between tests. */
export function clearRecentCooksCache() {
  query = undefined;
}

function read(): Promise<RecentCook[] | null> {
  if (!query) {
    const cached = getRecentCooksCache();
    const p: Promise<RecentCook[] | null> = cached
      ? Promise.resolve(cached)
      : getRecentCooks(Date.now() - RECENT_COOKS_DAYS * 86_400_000).then(
          (cooks) => {
            if (cooks.length > 0) setRecentCooksCache(cooks);
            return cooks;
          },
          (err) => {
            reportError(err, 'recent-cooks');
            if (query === p) query = undefined;
            return null;
          }
        );
    query = p;
  }
  return query;
}

/** The slim recent cooks for Explore's cook sections. Cooks outlive deleted recipes: callers must resolve ids against recipe docs, drop and backfill missing ones, and never navigate to familyLeader's result unchecked. Empty while loading, on failure, and local-only. Read only. */
export function useRecentCooks(): { cooks: RecentCook[]; loading: boolean } {
  const [state, setState] = useState<{ cooks: RecentCook[]; loading: boolean }>({ cooks: [], loading: true });
  useEffect(() => {
    let cancelled = false;
    void read().then((cooks) => {
      if (!cancelled) setState({ cooks: cooks ?? [], loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
