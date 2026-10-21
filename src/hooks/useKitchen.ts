import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../services/firebase';
import {
  createKitchenInvite,
  findKitchenId,
  getKitchenInvite,
  getKitchenMembers,
  getKitchenOnce,
  joinKitchenWithInvite,
  KitchenJoinDeniedError,
  deleteKitchenInvites,
  leaveKitchen as leaveKitchenDoc,
  removeKitchenMember,
  subscribeKitchen,
  updateKitchen,
  type Kitchen,
  type KitchenMember,
} from '../services/firestore';
import { reportError } from '../services/telemetry';
import {
  ALREADY_IN_KITCHEN_MESSAGE,
  INVITE_EXPIRED_MESSAGE,
  ITEM_NAME_MAX,
  KitchenFullError,
  KITCHEN_MEMBERS_FULL_MESSAGE,
  KITCHEN_SHARING_FAILED_MESSAGE,
  KITCHEN_SHARING_BUSY_MESSAGE,
  NOT_OWNER_MESSAGE,
  OWNER_CANNOT_LEAVE_MESSAGE,
  OWNER_HAS_MEMBERS_MESSAGE,
  inviteUrl,
  isInviteCode,
  type KitchenLists,
} from '../lib/kitchen';
import { addRecipe, aisleFor, boughtItAll, itemKey, removeSource, splitByPantry } from '../lib/shopping';
import type { Recipe } from '../types/recipe';

export const KITCHEN_FULL_MESSAGE = 'Your list is full. Clear some lines first.';
export const KITCHEN_FAILED_MESSAGE = "Couldn't update your kitchen. Check your connection and try again.";
export const KITCHEN_MAYBE_SAVED_MESSAGE = 'It may have saved. Check your list before adding again.';
export const KITCHEN_BUSY_MESSAGE = 'Still saving your list. Try again in a moment.';
export const KITCHEN_RETRY_MS = 2000;

interface KitchenState {
  uid: string;
  /** Resolved before subscribing (RL-238); null while resolving. */
  kitchenId: string | null;
  kitchen: Kitchen | null;
  /** A snapshot has arrived, so `kitchen: null` means "no document yet", not "unknown". */
  received: boolean;
  loading: boolean;
  error: string | null;
  members: KitchenMember[];
}

// One listener per session, shared by every caller (RL-213); counted so the last unmount closes it.
let state: KitchenState | null = null;
let unsubscribe: (() => void) | null = null;
let starting = false;
let holders = 0;
let retried = false;
// Single in-flight write: calls made while one runs are dropped and get the running promise.
let inFlight: Promise<void> | null = null;
// The kitchen id, resolved once per session and shared by the listener and the one-shot writers (RL-238).
let resolved: { uid: string; id: Promise<string> } | null = null;
// The member set whose profiles were last read, so they are read once per change.
let membersKey = '';
const listeners = new Set<() => void>();

function set(next: KitchenState | null) {
  state = next;
  listeners.forEach((l) => l());
}

function onStoreChange(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The kitchen id for a user: resolved once per session and shared with the listener (RL-238). */
export function resolveKitchenId(uid: string): Promise<string> {
  if (resolved?.uid === uid) return resolved.id;
  const entry = { uid, id: findKitchenId(uid) };
  resolved = entry;
  // A failed lookup is not cached, so the next caller tries again.
  entry.id.catch(() => {
    if (resolved === entry) resolved = null;
  });
  return entry.id;
}

const current = (uid: string, kitchenId: string) => state?.uid === uid && state.kitchenId === kitchenId;

function loadMembers(uid: string, kitchenId: string, uids: string[]) {
  const key = `${kitchenId}|${uids.join(',')}`;
  if (key === membersKey) return;
  membersKey = key;
  getKitchenMembers(uids).then(
    (members) => current(uid, kitchenId) && membersKey === key && set({ ...state!, members }),
    (err: unknown) => {
      reportError(err, 'kitchen-members');
      if (current(uid, kitchenId) && membersKey === key) set({ ...state!, members: uids.map((u) => ({ uid: u, name: null, avatar: null })) });
    }
  );
}

function listen(uid: string, kitchenId: string) {
  let dead = false;
  let unsub: (() => void) | null = null;
  unsub = subscribeKitchen(
    kitchenId,
    (kitchen) => {
      if (!current(uid, kitchenId)) return;
      retried = false;
      set({ ...state!, kitchen, received: true, loading: false, error: null });
      loadMembers(uid, kitchenId, kitchen?.memberUids ?? [uid]);
    },
    (err) => {
      // Firestore closes a listener after an error; drop it so the next acquire or the retry resubscribes.
      dead = true;
      if (unsub && unsubscribe === unsub) unsubscribe = null;
      reportError(err, 'kitchen-listener');
      if (!current(uid, kitchenId)) return;
      set({ ...state!, loading: false, error: KITCHEN_FAILED_MESSAGE });
      if (retried) return;
      retried = true;
      setTimeout(async () => {
        // A just-verified email is only in a fresh token; the rules read it from there.
        if ((err as { code?: unknown }).code === 'permission-denied') await auth?.currentUser?.getIdToken(true).catch(() => {});
        if (state?.uid !== uid || holders === 0 || unsubscribe || starting) return;
        // Resolve again: a member who was removed is denied the shared kitchen and goes back to their own.
        resolved = null;
        start(uid);
      }, KITCHEN_RETRY_MS);
    }
  );
  if (!dead) unsubscribe = unsub;
}

function start(uid: string) {
  starting = true;
  resolveKitchenId(uid).then(
    (kitchenId) => {
      starting = false;
      if (state?.uid !== uid || holders === 0 || unsubscribe) return;
      if (state.kitchenId !== kitchenId) set({ ...state, kitchenId, kitchen: null, received: false, members: [] });
      listen(uid, kitchenId);
    },
    (err: unknown) => {
      starting = false;
      reportError(err, 'kitchen-resolve');
      if (state?.uid === uid) set({ ...state, loading: false, error: KITCHEN_FAILED_MESSAGE });
    }
  );
}

/** Points the session at another kitchen after a join or leave, and resubscribes if anyone is listening. */
function switchKitchen(uid: string, kitchenId: string) {
  resolved = { uid, id: Promise.resolve(kitchenId) };
  if (state?.uid !== uid) return;
  unsubscribe?.();
  unsubscribe = null;
  retried = false;
  membersKey = '';
  set({ ...state, kitchenId, kitchen: null, received: false, loading: true, error: null, members: [] });
  if (holders > 0) listen(uid, kitchenId);
}

function acquire(uid: string): () => void {
  if (state?.uid !== uid) {
    unsubscribe?.();
    unsubscribe = null;
    retried = false;
    membersKey = '';
    set({ uid, kitchenId: null, kitchen: null, received: false, loading: true, error: null, members: [] });
  }
  holders++;
  if (!unsubscribe && !starting) start(uid);
  return () => {
    if (--holders > 0) return;
    unsubscribe?.();
    unsubscribe = null;
    state = null;
    // The next mount resolves again, so a join or removal made on another device is picked up.
    resolved = null;
  };
}

function write(uid: string, fn: (lists: KitchenLists) => KitchenLists): Promise<void> {
  if (inFlight) return inFlight;
  const fail = (message: string) => {
    if (state?.uid === uid) set({ ...state, error: message });
    return new Error(message);
  };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.reject(fail(KITCHEN_FAILED_MESSAGE));
  const run = resolveKitchenId(uid).then(
    (kitchenId) =>
      updateKitchen(kitchenId, fn).then(
        () => {
          if (state?.uid === uid && state.error) set({ ...state, error: null });
        },
        (err: unknown) => {
          if (err instanceof KitchenFullError) throw fail(KITCHEN_FULL_MESSAGE);
          reportError(err, 'kitchen-write');
          // Removed from the kitchen, or it is gone: the next write resolves the id again.
          if ((err as { code?: unknown }).code === 'permission-denied' || (err instanceof Error && err.message === 'That kitchen no longer exists')) {
            if (resolved?.uid === uid) resolved = null;
          }
          // A timed-out transaction may still commit, so a blind retry could add twice.
          if (err instanceof Error && err.message.endsWith('timed out')) throw fail(KITCHEN_MAYBE_SAVED_MESSAGE);
          throw fail(KITCHEN_FAILED_MESSAGE);
        }
      ),
    // The lookup never wrote anything, so a timeout here is a plain failure.
    (err: unknown) => {
      reportError(err, 'kitchen-resolve');
      throw fail(KITCHEN_FAILED_MESSAGE);
    }
  );
  inFlight = run.finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Forgets the resolved kitchen id between tests; the store itself empties when the last holder unmounts. */
export function __resetKitchenSessionForTests(): void {
  resolved = null;
}

const SHARING_COPY = new Set([
  INVITE_EXPIRED_MESSAGE,
  KITCHEN_MEMBERS_FULL_MESSAGE,
  ALREADY_IN_KITCHEN_MESSAGE,
  OWNER_HAS_MEMBERS_MESSAGE,
  OWNER_CANNOT_LEAVE_MESSAGE,
  NOT_OWNER_MESSAGE,
  KITCHEN_SHARING_BUSY_MESSAGE,
]);

// One membership action at a time, so a double tap cannot join twice or invite twice.
let sharingBusy = false;

/** Runs a membership action; rejects with one of the sharing copies, or the generic one after reporting. Never sets `error`. */
async function sharing<T>(what: string, fn: () => Promise<T>): Promise<T> {
  if (sharingBusy) throw new Error(KITCHEN_SHARING_BUSY_MESSAGE);
  sharingBusy = true;
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Error && SHARING_COPY.has(err.message)) throw err;
    reportError(err, what);
    throw new Error(KITCHEN_SHARING_FAILED_MESSAGE);
  } finally {
    sharingBusy = false;
  }
}

/** The kitchen document as the session last saw it, or a fresh read when not listening. */
async function kitchenNow(uid: string, kitchenId: string): Promise<Kitchen | null> {
  return current(uid, kitchenId) && state!.received ? state!.kitchen : getKitchenOnce(kitchenId);
}

async function join(uid: string, code: string): Promise<void> {
  if (!isInviteCode(code)) throw new Error(INVITE_EXPIRED_MESSAGE);
  const invite = await getKitchenInvite(code);
  if (!invite || invite.expiresAt <= Date.now()) throw new Error(INVITE_EXPIRED_MESSAGE);
  const kitchenId = await resolveKitchenId(uid);
  if (kitchenId === invite.kitchenId) return;
  // One kitchen per person (RL-236): refuse rather than leave silently; the UI can offer Leave first.
  if (kitchenId !== uid) throw new Error(ALREADY_IN_KITCHEN_MESSAGE);
  const own = await kitchenNow(uid, uid);
  if (own && own.memberUids.length > 1) throw new Error(OWNER_HAS_MEMBERS_MESSAGE);
  // Their own kitchen goes unused once they join, so its links must stop working (RL-238 review).
  await deleteKitchenInvites(uid);
  try {
    await joinKitchenWithInvite(invite);
  } catch (err) {
    if (!(err instanceof KitchenJoinDeniedError)) throw err;
    // A non-member cannot read the kitchen, so work out why: the invite went, the user is
    // already a member (counts as joined, RL-237), or the kitchen is full.
    const again = await getKitchenInvite(code).catch(() => null);
    if (!again || again.expiresAt <= Date.now()) throw new Error(INVITE_EXPIRED_MESSAGE);
    resolved = null;
    if ((await resolveKitchenId(uid)) === invite.kitchenId) return switchKitchen(uid, invite.kitchenId);
    throw new Error(KITCHEN_MEMBERS_FULL_MESSAGE);
  }
  switchKitchen(uid, invite.kitchenId);
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

/** Put one fresh item in the pantry without opening the listener (RL-221). Skips a name the pantry already has; rejects when busy, like addRecipeToKitchen. */
export async function addLeftoversToPantry(uid: string, name: string): Promise<void> {
  const trimmed = name.trim().slice(0, ITEM_NAME_MAX);
  if (!trimmed) return;
  if (inFlight) throw new Error(KITCHEN_BUSY_MESSAGE);
  await write(uid, (k) =>
    k.pantry.some((p) => itemKey(p.name) === itemKey(trimmed))
      ? k
      : { ...k, pantry: [...k.pantry, { id: crypto.randomUUID(), name: trimmed, group: 'fresh', addedBy: uid, addedAt: Date.now() }] }
  );
}

/**
 * The user's kitchen, live, with its mutations (RL-213). Verified users only:
 * anyone else gets `kitchen: null` and nothing is read. The kitchen id is
 * resolved before subscribing: a kitchen whose memberUids hold the user, else
 * their own uid (RL-238). Cloud only: a failed or offline write rejects with the
 * user copy and sets `error`; nothing is queued. One write at a time: a call made
 * while a write runs is dropped and returns that write's promise. Membership
 * actions (createInvite, joinKitchen, leaveKitchen, removeMember) reject with the
 * copy to show and do not set `error`.
 */
export function useKitchen() {
  const { user, isConfigured } = useAuth();
  const displayName = user?.displayName ?? '';
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
    /** Several names in ONE write (a second write while one runs is dropped). */
    addPantryItems: useCallback(
      async (names: string[]) => {
        const lines = names
          .map((n) => n.trim().slice(0, ITEM_NAME_MAX))
          .filter(Boolean)
          .map((name) => ({ id: '', name, amount: null, unit: null, aisle: aisleFor(name), sources: [], done: false }));
        if (!lines.length) return;
        await mutate((k) => ({ ...k, pantry: boughtItAll(lines, k.pantry, Date.now(), uid ?? '').pantry }));
      },
      [mutate, uid]
    ),
    removePantry: useCallback(
      (id: string) => mutate((k) => ({ ...k, pantry: k.pantry.filter((p) => p.id !== id) })),
      [mutate]
    ),
  };

  const sharingActions = {
    /** Owner only. Makes sure the kitchen document exists (the invite rule reads its owner), then returns the `/join/<code>` URL. */
    createInvite: useCallback(
      (): Promise<string> =>
        sharing('kitchen-invite', async () => {
          if (!uid) throw new Error(KITCHEN_SHARING_FAILED_MESSAGE);
          const kitchenId = await resolveKitchenId(uid);
          const existing = await kitchenNow(uid, kitchenId);
          if (existing ? existing.ownerUid !== uid : kitchenId !== uid) throw new Error(NOT_OWNER_MESSAGE);
          // Straight to the service, not write(), so a failure here does not set the hook's error.
          if (!existing) await updateKitchen(uid, (k) => k);
          const code = await createKitchenInvite(kitchenId, displayName);
          return inviteUrl(window.location.origin, code);
        }),
      [uid, displayName]
    ),
    joinKitchen: useCallback(
      (code: string): Promise<void> => (uid ? sharing('kitchen-join', () => join(uid, code)) : Promise.reject(new Error(KITCHEN_SHARING_FAILED_MESSAGE))),
      [uid]
    ),
    /** A member leaves the shared kitchen and goes back to their own; the owner cannot leave. */
    leaveKitchen: useCallback(
      (): Promise<void> =>
        sharing('kitchen-leave', async () => {
          if (!uid) throw new Error(KITCHEN_SHARING_FAILED_MESSAGE);
          const kitchenId = await resolveKitchenId(uid);
          const k = await kitchenNow(uid, kitchenId);
          if (kitchenId === uid || k?.ownerUid === uid) throw new Error(OWNER_CANNOT_LEAVE_MESSAGE);
          await leaveKitchenDoc(kitchenId);
          switchKitchen(uid, uid);
        }),
      [uid]
    ),
    /** Owner only; deletes the owner's live invites first so the removed person cannot rejoin with an old link. */
    removeMember: useCallback(
      (memberUid: string): Promise<void> =>
        sharing('kitchen-remove', async () => {
          if (!uid) throw new Error(KITCHEN_SHARING_FAILED_MESSAGE);
          const kitchenId = await resolveKitchenId(uid);
          const k = await kitchenNow(uid, kitchenId);
          if (!k || k.ownerUid !== uid || memberUid === uid) throw new Error(NOT_OWNER_MESSAGE);
          await removeKitchenMember(kitchenId, memberUid);
        }),
      [uid]
    ),
  };

  // Null until a snapshot arrives (so a failed first read is not shown as an empty kitchen); a
  // verified user with no document then sees an empty kitchen, and the first write creates it.
  const kitchen =
    !uid || !mine?.received
      ? null
      : (mine.kitchen ?? { memberUids: [uid], ownerUid: uid, shopping: [], pantry: [], updatedAt: null });
  return {
    kitchen,
    loading: !!uid && (mine?.loading ?? true),
    error: mine?.error ?? null,
    members: kitchen ? (mine?.members ?? []) : [],
    isOwner: !!kitchen && kitchen.ownerUid === uid,
    ...actions,
    ...sharingActions,
  };
}
