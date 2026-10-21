import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../services/firebase';
import { subscribeKitchen, updateKitchen, type Kitchen } from '../services/firestore';
import { reportError } from '../services/telemetry';
import { ITEM_NAME_MAX, KitchenFullError, type KitchenLists } from '../lib/kitchen';
import { addRecipe, aisleFor, boughtItAll, removeSource, splitByPantry } from '../lib/shopping';
import type { Recipe } from '../types/recipe';

export const KITCHEN_FULL_MESSAGE = 'Your list is full. Clear some lines first.';
export const KITCHEN_FAILED_MESSAGE = "Couldn't update your kitchen. Check your connection and try again.";
export const KITCHEN_MAYBE_SAVED_MESSAGE = 'It may have saved. Check your list before adding again.';
export const KITCHEN_BUSY_MESSAGE = 'Still saving your list. Try again in a moment.';
export const KITCHEN_RETRY_MS = 2000;

interface KitchenState {
  uid: string;
  kitchen: Kitchen | null;
  /** A snapshot has arrived, so `kitchen: null` means "no document yet", not "unknown". */
  received: boolean;
  loading: boolean;
  error: string | null;
}

// One listener per session, shared by every caller (RL-213); counted so the last unmount closes it.
let state: KitchenState | null = null;
let unsubscribe: (() => void) | null = null;
let holders = 0;
let retried = false;
// Single in-flight write: calls made while one runs are dropped and get the running promise.
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: KitchenState | null) {
  state = next;
  listeners.forEach((l) => l());
}

function onStoreChange(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function listen(uid: string) {
  let dead = false;
  let unsub: (() => void) | null = null;
  unsub = subscribeKitchen(
    uid,
    (kitchen) => state?.uid === uid && set({ ...state, kitchen, received: true, loading: false, error: null }),
    (err) => {
      // Firestore closes a listener after an error; drop it so the next acquire or the retry resubscribes.
      dead = true;
      if (unsub && unsubscribe === unsub) unsubscribe = null;
      reportError(err, 'kitchen-listener');
      if (state?.uid !== uid) return;
      set({ ...state, loading: false, error: KITCHEN_FAILED_MESSAGE });
      if (retried) return;
      retried = true;
      setTimeout(async () => {
        // A just-verified email is only in a fresh token; the rules read it from there.
        if ((err as { code?: unknown }).code === 'permission-denied') await auth?.currentUser?.getIdToken(true).catch(() => {});
        if (state?.uid === uid && holders > 0 && !unsubscribe) listen(uid);
      }, KITCHEN_RETRY_MS);
    }
  );
  if (!dead) unsubscribe = unsub;
}

function acquire(uid: string): () => void {
  if (state?.uid !== uid) {
    unsubscribe?.();
    unsubscribe = null;
    retried = false;
    set({ uid, kitchen: null, received: false, loading: true, error: null });
  }
  if (!unsubscribe) listen(uid);
  holders++;
  return () => {
    if (--holders > 0) return;
    unsubscribe?.();
    unsubscribe = null;
    state = null;
  };
}

function write(uid: string, fn: (lists: KitchenLists) => KitchenLists): Promise<void> {
  if (inFlight) return inFlight;
  const fail = (message: string) => {
    if (state?.uid === uid) set({ ...state, error: message });
    return new Error(message);
  };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.reject(fail(KITCHEN_FAILED_MESSAGE));
  const run = updateKitchen(uid, fn).then(
    () => {
      if (state?.uid === uid && state.error) set({ ...state, error: null });
    },
    (err: unknown) => {
      if (err instanceof KitchenFullError) throw fail(KITCHEN_FULL_MESSAGE);
      reportError(err, 'kitchen-write');
      // A timed-out transaction may still commit, so a blind retry could add twice.
      if (err instanceof Error && err.message.endsWith('timed out')) throw fail(KITCHEN_MAYBE_SAVED_MESSAGE);
      throw fail(KITCHEN_FAILED_MESSAGE);
    }
  );
  inFlight = run.finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/**
 * Add a recipe to the list without opening the kitchen listener (RL-218). Resolves with how many
 * of the recipe's lines are not in the pantry. Rejects with KITCHEN_BUSY_MESSAGE when another
 * write is running (write() would drop this one), so a drop is never reported as success. The
 * hook's own actions keep the documented drop-and-return-the-running-promise behaviour.
 */
export async function addRecipeToKitchen(uid: string, recipe: Recipe, servings: number): Promise<number> {
  if (inFlight) throw new Error(KITCHEN_BUSY_MESSAGE);
  let count = 0;
  await write(uid, (k) => {
    const shopping = addRecipe(k.shopping, recipe, servings);
    // The transaction can retry; the last run is the one that commits.
    count = splitByPantry(shopping, k.pantry).toBuy.filter((l) => l.sources.some((s) => s.recipeId === recipe.id)).length;
    return { ...k, shopping };
  });
  return count;
}

/**
 * The user's kitchen, live, with its mutations (RL-213). Verified users only:
 * anyone else gets `kitchen: null` and nothing is read. The kitchen id is the
 * uid in Phase 2. Cloud only: a failed or offline write rejects with the user
 * copy and sets `error`; nothing is queued. One write at a time: a call made
 * while a write runs is dropped and returns that write's promise.
 */
export function useKitchen() {
  const { user, isConfigured } = useAuth();
  const uid = isConfigured && user && !user.isAnonymous && user.emailVerified ? user.uid : null;

  useEffect(() => (uid ? acquire(uid) : undefined), [uid]);
  const snap = useSyncExternalStore(onStoreChange, () => state);
  const mine = uid && snap?.uid === uid ? snap : null;

  const mutate = useCallback(
    (fn: (lists: KitchenLists) => KitchenLists): Promise<void> =>
      uid ? write(uid, fn) : Promise.reject(new Error('Sign in with a verified email to use your kitchen')),
    [uid]
  );

  const actions = {
    addRecipe: useCallback(
      (recipe: Recipe, servings: number) => mutate((k) => ({ ...k, shopping: addRecipe(k.shopping, recipe, servings) })),
      [mutate]
    ),
    toggleLine: useCallback(
      (id: string, done: boolean) =>
        mutate((k) => ({ ...k, shopping: k.shopping.map((l) => (l.id === id ? { ...l, done } : l)) })),
      [mutate]
    ),
    removeSource: useCallback(
      (recipeId: string) => mutate((k) => ({ ...k, shopping: removeSource(k.shopping, recipeId) })),
      [mutate]
    ),
    boughtItAll: useCallback(
      () =>
        mutate((k) => {
          const { list, pantry } = boughtItAll(k.shopping, k.pantry, Date.now(), uid ?? '');
          return { shopping: list, pantry };
        }),
      [mutate, uid]
    ),
    addPantry: useCallback(
      async (name: string) => {
        const trimmed = name.trim().slice(0, ITEM_NAME_MAX);
        if (!trimmed) return;
        // A one-line list through boughtItAll: same grouping and same skip-if-already-there.
        const line = { id: '', name: trimmed, amount: null, unit: null, aisle: aisleFor(trimmed), sources: [], done: false };
        await mutate((k) => ({ ...k, pantry: boughtItAll([line], k.pantry, Date.now(), uid ?? '').pantry }));
      },
      [mutate, uid]
    ),
    removePantry: useCallback(
      (id: string) => mutate((k) => ({ ...k, pantry: k.pantry.filter((p) => p.id !== id) })),
      [mutate]
    ),
  };

  // Null until a snapshot arrives (so a failed first read is not shown as an empty kitchen); a
  // verified user with no document then sees an empty kitchen, and the first write creates it.
  const kitchen =
    !uid || !mine?.received
      ? null
      : (mine.kitchen ?? { memberUids: [uid], ownerUid: uid, shopping: [], pantry: [], updatedAt: null });
  return { kitchen, loading: !!uid && (mine?.loading ?? true), error: mine?.error ?? null, ...actions };
}
