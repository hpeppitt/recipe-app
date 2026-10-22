import { useEffect, useState } from 'react';
import { getFamilyCooks } from '../services/firestore';
import { reportError } from '../services/telemetry';
import { familyLeader, type RecentCook } from '../lib/cookRanking';

// One read per family per page session, at most 30 families kept (oldest dropped). Only a success is
// cached: a failure is retried after a 60 s cooldown, so a missing index (RL-209) is not hit on every mount.
// shortcut: nothing clears a family's entry after the user logs a cook (needs a hook point in the cook flow), so the counts lag until reload.
const MAX_FAMILIES = 30;
const RETRY_MS = 60_000;
const queries = new Map<string, { p: Promise<RecentCook[] | null>; failedAt?: number }>();

/** Test use only: the cache is module state and would leak between tests. */
export function clearFamilyCooksCache() {
  queries.clear();
}

function read(rootId: string): Promise<RecentCook[] | null> {
  const hit = queries.get(rootId);
  if (hit && (hit.failedAt === undefined || Date.now() - hit.failedAt < RETRY_MS)) return hit.p;
  const entry: { p: Promise<RecentCook[] | null>; failedAt?: number } = {
    p: getFamilyCooks(rootId).catch((err) => {
      // failed-precondition is the missing composite index before RL-209 deploys: expected, not worth a report.
      if (!String((err as { code?: unknown })?.code).includes('failed-precondition')) reportError(err, 'family-cooks');
      entry.failedAt = Date.now();
      return null;
    }),
  };
  queries.delete(rootId);
  queries.set(rootId, entry);
  if (queries.size > MAX_FAMILIES) queries.delete(queries.keys().next().value as string);
  return entry.p;
}

export interface FamilyCooks {
  countById: Map<string, number>;
  total: number;
  leaderId: string | null;
  loading: boolean;
}

const empty = (loading: boolean): FamilyCooks => ({ countById: new Map(), total: 0, leaderId: null, loading });

/** Counts are all-time over the family's newest 1000 cooks; leaderId looks only at the last 90 days (familyLeader), so a family can show cooks and no leader. Distinct people per version, distinct people in the family, and the most-cooked leader (RL-242 rules), from the family's newest 1000 cooks. Empty while loading, on failure and local-only. Read only. */
export function useFamilyCooks(rootId: string | undefined): FamilyCooks {
  const [state, setState] = useState<{ rootId?: string; value: FamilyCooks }>({ value: empty(true) });
  useEffect(() => {
    if (!rootId) return;
    let cancelled = false;
    void read(rootId).then((cooks) => {
      if (cancelled) return;
      const list = cooks ?? [];
      const by = new Map<string, Set<string>>();
      for (const c of list) by.set(c.recipeId, (by.get(c.recipeId) ?? new Set()).add(c.uid));
      setState({
        rootId,
        value: {
          countById: new Map([...by].map(([id, u]) => [id, u.size])),
          total: new Set(list.map((c) => c.uid)).size,
          leaderId: familyLeader(list, rootId, Date.now()),
          loading: false,
        },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [rootId]);
  return !rootId ? empty(false) : state.rootId === rootId ? state.value : empty(true);
}
