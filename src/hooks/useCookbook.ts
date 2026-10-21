import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getPublicCookbook, getPublishedRecipe, isFollowingCookbook, setCookbookFollow, type PublicCookbookResult } from '../services/firestore';
import { COOKBOOK_PAGE_SIZE, cookbookTileMeta } from '../lib/cookbook';
import { boundedWrite, TOGGLE_ERROR, TOGGLE_TIMEOUT_MS } from './useFollow';
import { reportError } from '../services/telemetry';
import type { RecipeTile } from '../components/profile/RecipeTileGrid';

type Ready = Extract<PublicCookbookResult, { status: 'ready' }>['cookbook'];
type Known = RecipeTile | 'gone' | 'failed';

/**
 * A shared cookbook (RL-258): one read of the collection, then its recipes a page at a time
 * (one read each, appended by `showMore`), then one follow lookup for a verified viewer. No listeners.
 * `unavailable` covers missing and private alike.
 */
export function useCookbook(id: string) {
  const { user } = useAuth();
  const [state, setState] = useState<{ id: string; status: 'ready' | 'unavailable' | 'failed'; cookbook?: Ready } | null>(null);
  const [reload, setReload] = useState(0);
  const [shown, setShown] = useState(COOKBOOK_PAGE_SIZE);
  const [known, setKnown] = useState<ReadonlyMap<string, Known>>(new Map());
  const inFlight = useRef(new Set<string>());
  const [follow, setFollow] = useState<{ key: string; following: boolean; failed?: boolean } | null>(null);
  const [lookupTry, setLookupTry] = useState(0);
  const [followError, setFollowError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [countDelta, setCountDelta] = useState(0);
  const busyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getPublicCookbook(id)
      .then((r) => !cancelled && setState({ id, status: r.status, cookbook: r.status === 'ready' ? r.cookbook : undefined }))
      .catch((err) => {
        reportError(err, 'cookbook-load');
        if (!cancelled) setState({ id, status: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [id, reload]);

  const settled = state?.id === id ? state : null;
  const cookbook = settled?.cookbook;
  const ids = cookbook?.recipeIds;

  useEffect(() => {
    if (!ids) return;
    for (const rid of ids.slice(0, shown)) {
      if (known.has(rid) || inFlight.current.has(rid)) continue;
      inFlight.current.add(rid);
      getPublishedRecipe(rid)
        .then((r): Known => (r ? { id: rid, emoji: r.emoji, title: r.title, meta: cookbookTileMeta(r as { parentId?: string | null; prompt?: string | null }) } : 'gone'))
        .catch((err): Known => {
          reportError(err, 'cookbook-recipe');
          return 'failed';
        })
        .then((value) => setKnown((prev) => new Map(prev).set(rid, value)));
    }
  }, [ids, shown, known]);

  const verifiedUid = user?.emailVerified ? user.uid : undefined;
  const followKey = verifiedUid && cookbook ? `${verifiedUid}:${id}` : undefined;
  useEffect(() => {
    if (!followKey || !verifiedUid) return;
    let cancelled = false;
    isFollowingCookbook(verifiedUid, id)
      .then((following) => !cancelled && setFollow({ key: followKey, following }))
      .catch((err) => {
        reportError(err, 'cookbook-follow-lookup');
        if (!cancelled) setFollow({ key: followKey, following: false, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [followKey, verifiedUid, id, lookupTry]);

  const answered = !!followKey && follow?.key === followKey;
  const following = answered && follow.following;

  const toggleFollow = useCallback(async () => {
    if (!verifiedUid || !cookbook || !followKey || !answered || follow.failed || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFollowError(null);
    try {
      await boundedWrite(setCookbookFollow(verifiedUid, id, !following, cookbook.followerCount + countDelta), TOGGLE_TIMEOUT_MS);
      setFollow({ key: followKey, following: !following });
      setCountDelta((d) => d + (following ? -1 : 1));
    } catch (err) {
      reportError(err, 'cookbook-follow-toggle');
      setFollowError(TOGGLE_ERROR);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [verifiedUid, cookbook, followKey, id, following, countDelta, answered, follow]);

  const list = ids ?? [];
  const tiles: RecipeTile[] = list.slice(0, shown).map((rid) => {
    const k = known.get(rid);
    if (k === 'gone') return { id: rid, emoji: '🍽️', title: 'A deleted recipe', meta: '', gone: true };
    if (k === 'failed') return { id: rid, emoji: '⚠️', title: "Couldn't load this recipe", meta: '', gone: true, retry: () => {
      inFlight.current.delete(rid);
      setKnown((prev) => {
        const next = new Map(prev);
        next.delete(rid);
        return next;
      });
    } };
    return k ?? { id: rid, emoji: '…', title: 'Loading recipe', meta: '', loading: true };
  });

  return {
    status: settled?.status ?? 'loading',
    cookbook,
    followerCount: cookbook ? Math.max(0, cookbook.followerCount + countDelta) : 0,
    tiles,
    total: list.length,
    hasMore: list.length > shown,
    showMore: () => setShown((n) => n + COOKBOOK_PAGE_SIZE),
    retry: () => {
      setState(null);
      setReload((n) => n + 1);
    },
    isFollowing: following,
    /** Unverified viewers never look up, so their button is always ready (it opens sign-in). */
    followReady: !followKey || (answered && !follow.failed),
    followLookupFailed: answered && !!follow.failed,
    retryFollowLookup: () => {
      setFollow(null);
      setLookupTry((n) => n + 1);
    },
    toggleFollow,
    followBusy: busy,
    followError,
  };
}
