import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../db/database';
import { getTasteProfile, saveTasteProfile } from '../services/firestore';
import { reportError } from '../services/telemetry';
import {
  learnTaste,
  normaliseAvoid,
  tasteHeadline,
  termLength,
  TASTE_AVOID_MAX,
  TASTE_TERM_MAX,
  type TasteCooked,
  type TastePrompt,
  type TasteProfile,
} from '../lib/taste';
import type { Cook } from '../types/social';

const EMPTY: TasteProfile = { avoids: [], hidden: [], askedAt: null };
const NONE = { cooked: [] as TasteCooked[], prompts: [] as TastePrompt[] };

/** Why an avoid was refused. Thrown by `addAvoid`; `full` means 12 are stored, `duplicate` that it is already there. */
export class TasteAvoidError extends Error {
  code: 'full' | 'duplicate' | 'empty';
  constructor(code: 'full' | 'duplicate' | 'empty') {
    super(code);
    this.code = code;
  }
}

/**
 * The stored taste profile (RL-230) plus what `learnTaste` derives from the user's cooks and branches.
 * `cooks` comes from the caller's own `useOwnCooks()`, so this opens no second listener; the cooked
 * recipes' titles and tags and the user's own branch prompts are read from Dexie, where own rows mirror
 * the cloud. A cook whose recipe is not held locally is skipped. Verified users only: anyone else gets
 * empty values and nothing is read. Mutators run one at a time, each on the freshly read document, and
 * reject when refused or when the write fails (the profile is then re-read so state matches the server).
 * `hideTerm` rejects a term over 40 code points; `learnTaste` can offer one, so the caller should catch it.
 */
export function useTasteProfile(cooks: Cook[]) {
  const { user, isConfigured } = useAuth();
  const uid = isConfigured && user?.emailVerified ? user.uid : null;
  const [state, setState] = useState<{ uid: string; profile: TasteProfile | null } | null>(null);
  const [attempt, setAttempt] = useState(0);

  const read = useCallback(
    (forUid: string, isCancelled: () => boolean = () => false) =>
      getTasteProfile(forUid).then(
        (profile) => !isCancelled() && setState({ uid: forUid, profile }),
        (err) => {
          // Permission denied means the rules are not deployed yet (RL-249): expected, so not reported.
          if ((err as { code?: unknown } | null)?.code !== 'permission-denied') reportError(err, 'taste-profile');
          if (!isCancelled()) setState({ uid: forUid, profile: null });
        }
      ),
    []
  );

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    void read(uid, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [uid, attempt, read]);

  const cookKey = cooks.map((c) => `${c.recipeId}:${c.createdAt}`).join(',');
  const local = useLiveQuery(
    async () => {
      if (!uid) return NONE;
      const ids = [...new Set(cooks.map((c) => c.recipeId))];
      const rows = new Map((await db.recipes.bulkGet(ids)).flatMap((r) => (r ? [[r.id, r] as const] : [])));
      const cooked = cooks.flatMap((c) => {
        const r = rows.get(c.recipeId);
        return r ? [{ title: r.title, tags: r.tags, at: c.createdAt }] : [];
      });
      // Branches have a parentId (indexed); originals have null, which sorts below any string.
      const prompts: TastePrompt[] = [];
      await db.recipes
        .where('parentId')
        .above('')
        .filter((r) => r.createdBy.uid === uid)
        .each((r) => prompts.push({ prompt: r.prompt, at: r.createdAt }));
      return { cooked, prompts };
    },
    // cookKey stands in for `cooks`, so a new array with the same cooks does not re-run the query.
    [uid, cookKey]
  );

  const mine = state?.uid === uid ? state.profile : null;
  const stored = mine ?? EMPTY;
  const loadedRef = useRef<{ uid: string | null; loaded: boolean }>({ uid, loaded: false });
  useEffect(() => {
    loadedRef.current = { uid, loaded: !!mine };
  });
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const learned = useMemo(
    () => learnTaste({ cookedRecipes: local?.cooked ?? [], branchPrompts: local?.prompts ?? [], hidden: stored.hidden }),
    [local, stored.hidden]
  );

  const save = useCallback(
    (update: (cur: TasteProfile) => Partial<TasteProfile>) => {
      const run = async () => {
        // A failed read leaves `stored` empty; writing from it would erase the real document.
        const { uid: forUid, loaded } = loadedRef.current;
        if (!forUid || !loaded) throw new Error('Your taste profile has not loaded');
        try {
          const saved = await saveTasteProfile(forUid, update);
          setState({ uid: forUid, profile: saved });
        } catch (err) {
          // Refused or failed: show what the server holds (a timed-out write may still have landed).
          if (!(err instanceof TasteAvoidError)) void read(forUid);
          throw err;
        }
      };
      const next = queue.current.then(run, run);
      queue.current = next.catch(() => {});
      return next;
    },
    [read]
  );

  const addAvoid = useCallback(
    (term: string) =>
      save((p) => {
        const t = normaliseAvoid(term);
        if (!t) throw new TasteAvoidError('empty');
        if (p.avoids.some((a) => a.toLowerCase() === t.toLowerCase())) throw new TasteAvoidError('duplicate');
        if (p.avoids.length >= TASTE_AVOID_MAX) throw new TasteAvoidError('full');
        return { avoids: [...p.avoids, t] };
      }),
    [save]
  );
  const removeAvoid = useCallback(
    (term: string) => save((p) => ({ avoids: p.avoids.filter((a) => a.toLowerCase() !== normaliseAvoid(term).toLowerCase()) })),
    [save]
  );
  const hideTerm = useCallback(
    (term: string) => {
      if (termLength(term.trim()) > TASTE_TERM_MAX) return Promise.reject(new Error('That term is too long to hide'));
      return save((p) => ({ hidden: [...p.hidden, term] }));
    },
    [save]
  );
  const unhideTerm = useCallback(
    (term: string) => save((p) => ({ hidden: p.hidden.filter((h) => h.trim().toLowerCase() !== term.trim().toLowerCase()) })),
    [save]
  );
  const markAsked = useCallback(() => save(() => ({ askedAt: Date.now() })), [save]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const loading = !!uid && (!state || state.uid !== uid || local === undefined);
  return {
    avoids: stored.avoids,
    full: stored.avoids.length >= TASTE_AVOID_MAX,
    cookALot: learned.cookALot,
    tendToChange: learned.tendToChange,
    cookCount: learned.cookCount,
    branchCount: learned.branchCount,
    headline: tasteHeadline(learned.cookCount, learned.branchCount),
    askedAt: stored.askedAt,
    loading,
    loadFailed: !!uid && state?.uid === uid && state.profile === null,
    reload,
    addAvoid,
    removeAvoid,
    hideTerm,
    unhideTerm,
    markAsked,
  };
}
