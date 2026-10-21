import { useCallback, useContext, useEffect, useSyncExternalStore } from 'react';
import { TermsContext, useAuth } from '../contexts/AuthContext';
import { auth } from '../services/firebase';
import {
  addToCollection,
  createCollection,
  deleteCollection,
  removeFromCollection,
  renameCollection,
  setCookbookSharing,
  subscribeCollections,
  type RecipeCollection,
} from '../services/firestore';
import { reportError } from '../services/telemetry';
import {
  COLLECTION_GONE_MESSAGE,
  COOKBOOK_DESCRIPTION_MAX,
  CollectionRefusedError,
  checkCollectionCount,
  checkCollectionRecipeId,
  checkCollectionRoom,
  collectionName,
} from '../lib/kitchen';
import { RateLimitedError, rateLimitMessage } from '../lib/errors';

export const COLLECTIONS_LOAD_FAILED_MESSAGE = "Couldn't load your collections. Check your connection and try again.";
export const COLLECTIONS_FAILED_MESSAGE = "Couldn't update your collections. Check your connection and try again.";
export const COLLECTIONS_MAYBE_SAVED_MESSAGE = 'It may have saved. Check your collections before trying again.';
export const COLLECTIONS_RETRY_MS = 2000;

interface CollectionsState {
  uid: string;
  collections: RecipeCollection[];
  loading: boolean;
  error: string | null;
}

// One listener per session, shared by every caller (as useKitchen); counted so the last unmount closes it.
let state: CollectionsState | null = null;
let unsubscribe: (() => void) | null = null;
let holders = 0;
let retried = false;
const listeners = new Set<() => void>();

function set(next: CollectionsState | null) {
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
  unsub = subscribeCollections(
    uid,
    (collections) => {
      if (state?.uid !== uid) return;
      retried = false;
      set({ ...state, collections, loading: false, error: null });
    },
    (err) => {
      // Firestore closes a listener after an error; drop it so the next acquire or the retry resubscribes.
      dead = true;
      if (unsub && unsubscribe === unsub) unsubscribe = null;
      reportError(err, 'collections-listener');
      if (state?.uid !== uid) return;
      set({ ...state, loading: false, error: COLLECTIONS_LOAD_FAILED_MESSAGE });
      if (retried) return;
      retried = true;
      setTimeout(async () => {
        // A just-verified email is only in a fresh token; the rules read it from there.
        if ((err as { code?: unknown }).code === 'permission-denied') await auth?.currentUser?.getIdToken(true).catch(() => {});
        if (state?.uid === uid && holders > 0 && !unsubscribe) listen(uid);
      }, COLLECTIONS_RETRY_MS);
    }
  );
  if (!dead) unsubscribe = unsub;
}

function acquire(uid: string): () => void {
  if (state?.uid !== uid) {
    unsubscribe?.();
    unsubscribe = null;
    retried = false;
    set({ uid, collections: [], loading: true, error: null });
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

/** Re-subscribes after the listener died with an error; does nothing while one is live. */
function retryListener(uid: string) {
  if (state?.uid !== uid || holders === 0 || unsubscribe) return;
  retried = false;
  set({ ...state, loading: true, error: null });
  listen(uid);
}

/** The listener's copy of a collection; undefined before the first snapshot or when it is gone. */
function known(uid: string, id: string): RecipeCollection | undefined {
  return state?.uid === uid ? state.collections.find((c) => c.id === id) : undefined;
}

/** The first snapshot has arrived, so a collection missing from it is really gone. */
function loaded(uid: string): boolean {
  return state?.uid === uid && !state.loading;
}

/**
 * Runs one write. `validate` throws CollectionRefusedError with the copy to show; that rejects
 * as is and leaves `error` alone, since it belongs to the form, not the page. With `id`, a
 * denied or not-found write on a collection the listener no longer has is refused as gone: the
 * rules deny an update to a missing document rather than answering not-found.
 */
async function write<T>(uid: string, call: () => Promise<T>, validate?: () => void, id?: string): Promise<T> {
  const fail = (message: string) => {
    if (state?.uid === uid) set({ ...state, error: message });
    return new Error(message);
  };
  validate?.();
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw fail(COLLECTIONS_FAILED_MESSAGE);
  try {
    const out = await call();
    if (state?.uid === uid && state.error) set({ ...state, error: null });
    return out;
  } catch (err) {
    if (err instanceof CollectionRefusedError) throw err;
    // The cookbook publish cap (RL-265) is the form's copy, not a page failure; writeLimited reported it.
    if (err instanceof RateLimitedError) throw new CollectionRefusedError(rateLimitMessage(err) ?? COLLECTIONS_FAILED_MESSAGE);
    const code = (err as { code?: unknown }).code;
    if (id && (code === 'permission-denied' || code === 'not-found') && loaded(uid) && !known(uid, id)) {
      throw new CollectionRefusedError(COLLECTION_GONE_MESSAGE);
    }
    reportError(err, 'collections-write');
    // A timed-out write may still commit, so a blind retry could create a second collection.
    if (err instanceof Error && err.message.endsWith('timed out')) throw fail(COLLECTIONS_MAYBE_SAVED_MESSAGE);
    throw fail(COLLECTIONS_FAILED_MESSAGE);
  }
}

const EMPTY: RecipeCollection[] = [];
const NOT_VERIFIED = 'Sign in with a verified email to use collections';

/**
 * The user's private collections, live, newest change first, with their mutations (RL-222).
 * Verified users only: anyone else gets an empty list and nothing is read. Cloud only: a
 * failed or offline write rejects with the user copy and sets `error`; nothing is queued. A
 * refused write (bad name, full collection) rejects with its copy and does not set `error`.
 */
export function useCollections() {
  const { user, isConfigured } = useAuth();
  const terms = useContext(TermsContext);
  const uid = isConfigured && user && !user.isAnonymous && user.emailVerified ? user.uid : null;

  useEffect(() => (uid ? acquire(uid) : undefined), [uid]);
  const snap = useSyncExternalStore(onStoreChange, () => state);
  const mine = uid && snap?.uid === uid ? snap : null;

  const retry = useCallback(() => {
    if (uid) retryListener(uid);
  }, [uid]);

  const actions = {
    createCollection: useCallback(
      (name: string, firstRecipeId?: string): Promise<string> =>
        uid
          ? write(uid, () => createCollection(name, firstRecipeId), () => {
              collectionName(name);
              if (state?.uid === uid) checkCollectionCount(state.collections.length);
              if (firstRecipeId !== undefined) checkCollectionRecipeId(firstRecipeId);
            })
          : Promise.reject(new Error(NOT_VERIFIED)),
      [uid]
    ),
    renameCollection: useCallback(
      (id: string, name: string): Promise<void> =>
        uid ? write(uid, () => renameCollection(id, name), () => collectionName(name), id) : Promise.reject(new Error(NOT_VERIFIED)),
      [uid]
    ),
    setCookbookSharing: useCallback(
      (id: string, visibility: 'private' | 'public', description: string | null): Promise<void> =>
        uid
          ? write(uid, () => setCookbookSharing(id, visibility, description), () => {
              if (description !== null && description.length > COOKBOOK_DESCRIPTION_MAX) throw new CollectionRefusedError(`Keep the description to ${COOKBOOK_DESCRIPTION_MAX} characters.`);
            }, id)
          : Promise.reject(new Error(NOT_VERIFIED)),
      [uid]
    ),
    deleteCollection: useCallback(
      (id: string): Promise<void> => {
        if (!uid) return Promise.reject(new Error(NOT_VERIFIED));
        // Already gone (another device deleted it): the outcome the user asked for, so no write.
        if (loaded(uid) && !known(uid, id)) return Promise.resolve();
        return write(uid, () => deleteCollection(id));
      },
      [uid]
    ),
    /** Refused from the listener's list first; the service checks the stored list again. */
    addToCollection: useCallback(
      (id: string, recipeId: string): Promise<void> =>
        uid
          ? write(uid, async () => {
              // A public collection's write needs the current Terms: open the dialog instead of failing.
              if (known(uid, id)?.visibility === 'public' && terms?.ensureCurrent && !(await terms.ensureCurrent())) {
                throw new CollectionRefusedError('Accept the Terms, then try again.');
              }
              await addToCollection(id, recipeId);
            }, () => {
              checkCollectionRecipeId(recipeId);
              const current = known(uid, id);
              if (current && !current.recipeIds.includes(recipeId)) checkCollectionRoom(current.recipeIds);
            }, id)
          : Promise.reject(new Error(NOT_VERIFIED)),
      [uid, terms]
    ),
    removeFromCollection: useCallback(
      (id: string, recipeId: string): Promise<void> => {
        if (!uid) return Promise.reject(new Error(NOT_VERIFIED));
        // Not in the listener's copy: nothing to remove, so no write.
        const current = known(uid, id);
        if (current && !current.recipeIds.includes(recipeId)) return Promise.resolve();
        return write(uid, () => removeFromCollection(id, recipeId), undefined, id);
      },
      [uid]
    ),
  };

  return {
    collections: mine?.collections ?? EMPTY,
    loading: !!uid && (mine?.loading ?? true),
    error: mine?.error ?? null,
    /** After a load error: tries the listener again at once (it also retries once by itself). */
    retry,
    ...actions,
  };
}
