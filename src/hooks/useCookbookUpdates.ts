import { useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getProfile, listCookbookFollows, markCookbookSeen, readFollowedCookbook } from '../services/firestore';
import { COOKBOOK_FOLLOW_LIMIT, isNewSince, sortUpdates, type CookbookUpdate } from '../lib/cookbookUpdates';
import { reportError } from '../services/telemetry';

type Store = { uid: string | null; rows: CookbookUpdate[]; loaded: boolean; failed: boolean; loading: boolean };
let store: Store = { uid: null, rows: [], loaded: false, failed: false, loading: false };
let inFlight: string | null = null;
const listeners = new Set<() => void>();
const set = (next: Store) => {
  store = next;
  listeners.forEach((l) => l());
};

/** Test hook: forget the session. */
export function resetCookbookUpdates() {
  inFlight = null;
  set({ uid: null, rows: [], loaded: false, failed: false, loading: false });
}

/** Drops one row at once (the cookbook was opened), so the badge and the list agree before the write lands. */
export function dismissCookbookUpdate(collectionId: string) {
  set({ ...store, rows: store.rows.filter((r) => r.collectionId !== collectionId) });
}

/**
 * Pull-only (RL-259): the follows (at most 30, one query), then each followed collection one-shot,
 * then the owner's profile for rows that are new. Private or deleted cookbooks are skipped silently.
 * Nothing is written and nothing listens. A successful result, empty included, is kept for the session
 * (the never-cache-empty rule is for localStorage TTL caches, not this in-memory store); a failed load is not.
 */
async function load(uid: string) {
  inFlight = uid;
  set({ ...store, uid, loading: true, failed: false, rows: store.uid === uid ? store.rows : [], loaded: store.uid === uid && store.loaded });
  try {
    const follows = await listCookbookFollows(uid, COOKBOOK_FOLLOW_LIMIT);
    const reads = await Promise.all(follows.map((f) => readFollowedCookbook(f.collectionId)));
    const fresh = follows.flatMap((f, i) => {
      const c = reads[i];
      return c && c.lastAddedAt !== null && isNewSince(c.lastAddedAt, f.lastSeenAt) ? [{ f, c, lastAddedAt: c.lastAddedAt }] : [];
    });
    // One profile read per distinct owner; your own cookbooks are not "someone added".
    const mine = fresh.filter(({ c }) => c.ownerUid !== uid);
    const owners = [...new Set(mine.map(({ c }) => c.ownerUid))];
    const profiles = new Map(await Promise.all(owners.map(async (o) => [o, await getProfile(o).then((p) => p?.displayName ?? null, () => null)] as const)));
    const rows = sortUpdates(
      mine.map(({ f, c, lastAddedAt }) => ({ collectionId: f.collectionId, name: c.name, ownerUid: c.ownerUid, ownerName: profiles.get(c.ownerUid) ?? null, lastAddedAt, createdAt: lastAddedAt }))
    );
    if (inFlight === uid) set({ uid, rows, loaded: true, failed: false, loading: false });
  } catch (err) {
    reportError(err, 'cookbook-updates');
    if (inFlight === uid) set({ ...store, uid, failed: true, loading: false });
  } finally {
    if (inFlight === uid) inFlight = null;
  }
}

/**
 * Followed cookbooks with recipes added since the viewer last looked. Verified accounts only.
 * `fresh` (Activity) reads once per visit; without it (the badge) the session's result is reused.
 */
export function useCookbookUpdates(fresh = false) {
  const { user, isConfigured } = useAuth();
  const uid = isConfigured && user?.emailVerified ? user.uid : null;
  const snap = useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => store
  );
  useEffect(() => {
    if (!uid || inFlight === uid) return;
    if (fresh || !(snap.uid === uid && snap.loaded)) void load(uid);
    // snap is deliberately not a dependency: a visit reads once, whatever the store does after.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, fresh]);

  const rows = uid && snap.uid === uid ? snap.rows : [];
  const markSeen = (collectionId: string) => {
    dismissCookbookUpdate(collectionId);
    if (uid) void markCookbookSeen(uid, collectionId).catch((err) => reportError(err, 'cookbook-seen'));
  };
  const retry = () => {
    if (uid && inFlight !== uid) void load(uid);
  };
  const mine = uid && snap.uid === uid;
  return { updates: rows, markSeen, retry, loading: !!uid && (!mine || snap.loading || (!snap.loaded && !snap.failed)), error: !!mine && snap.failed };
}
