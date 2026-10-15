import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  type QueryConstraint,
  type CollectionReference,
  type QueryDocumentSnapshot,
  type DocumentData,
  onSnapshot,
  increment,
  writeBatch,
  serverTimestamp,
  runTransaction,
  type DocumentReference,
  type Firestore,
  type Timestamp,
} from 'firebase/firestore';
import { EXPLORE_TAG_FIELD, FEED_ORDER_FIELD } from '../lib/constants';
import { auth, firestore } from './firebase';
import { arrayUnion } from 'firebase/firestore';
import { rankByQuery, recipeHaystack, variationHaystack } from '../lib/search';
import { collectSubtreeIds } from '../lib/tree';
import { replyRecipient } from '../lib/suggestions';
import { truncateNotificationMessage } from '../lib/notifications';
import { selectFavoritesToPush, type CloudFavoriteRow } from '../lib/favoritesMigration';
import { withTimeout } from '../lib/utils';
import { TERMS_VERSION } from '../lib/legal';
import { nextWindow, RATE_LIMITS, type RateLimitAction } from '../lib/rateLimit';
import { RateLimitedError } from '../lib/errors';
import { db } from '../db/database';
import type { Recipe, Collaborator } from '../types/recipe';
import type { SharedRecipe } from '../lib/share';
import type { Suggestion, SuggestionMessage, AppNotification } from '../types/social';
import type { UserProfile, Follow } from '../types/profile';
import { VERIFY_NOTE } from '../lib/dataExport';
import type { CloudInput, CloudDoc, CloudFavorite, CloudFollow, CloudSuggestion, Section } from '../lib/dataExport';
import { reportError } from './telemetry';

// --- Recipes ---

/**
 * Publish (or re-publish) a recipe to the shared library.
 *
 * Distinguishes create from update, which the previous unconditional `setDoc`
 * did not. On a re-publish it must NOT write `favoriteCount`/`viewCount`: those
 * belong to other people's favourites and views, and resetting them to 0 silently
 * destroys that data. The profile `recipeCount` is likewise only bumped on first
 * publish, or a retry would inflate it.
 *
 * A re-publish also omits `collaborators`. A merge replaces arrays wholesale, and
 * the cloud array is maintained by the approval `arrayUnion`, which reaches Dexie
 * only on the approving device, so writing the local copy here would erase credit.
 */
export async function publishRecipe(recipe: Recipe): Promise<void> {
  if (!firestore) return;

  const { chatHistory, ...data } = recipe;
  const ref = doc(firestore, 'recipes', recipe.id);
  const { collaborators, ...content } = data;

  const existing = await getDoc(ref);
  if (existing.exists()) {
    await setDoc(ref, content, { merge: true });
    return;
  }

  // The rules deny a create whose createdBy.uid is not the caller (the 'local'
  // placeholder, signed out, or a copy saved from someone else's link), so
  // reject as that denial did, before reading or moving any window.
  if (auth && auth.currentUser?.uid !== recipe.createdBy.uid) {
    throw new Error('Publishing needs the signed-in creator');
  }

  // Rules require both counters present and zero on create, and the recipe
  // window moved in the same request (RL-049). Throws RateLimitedError at the
  // daily cap, having written nothing; the caller keeps the Dexie copy. The
  // transaction re-reads the recipe: if it exists by then (a stale read above,
  // or an earlier publish that landed after its caller timed out), it writes
  // the re-publish merge instead, with no counters, window or recipeCount bump.
  const created = await writeLimited(
    firestore,
    recipe.createdBy.uid,
    'recipe',
    ref,
    { ...content, collaborators: collaborators ?? [], favoriteCount: 0, viewCount: 0 },
    content
  );

  // Increment the creator's recipeCount on their profile
  if (created && recipe.createdBy.uid && recipe.createdBy.uid !== 'local') {
    updateDoc(doc(firestore, 'profiles', recipe.createdBy.uid), {
      recipeCount: increment(1),
    }).catch((err) => {
      console.error('Incrementing profile recipeCount failed', err);
      reportError(err, 'profile-recipe-count');
    });
  }
}

export async function getPublishedRecipe(
  id: string
): Promise<(SharedRecipe & { id: string; favoriteCount: number }) | null> {
  if (!firestore) return null;
  const snap = await getDoc(doc(firestore, 'recipes', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as SharedRecipe & {
    id: string;
    favoriteCount: number;
  };
}

export type PublishedRecipe = SharedRecipe & {
  id: string;
  parentId: string | null;
  rootId: string;
  depth: number;
  favoriteCount: number;
  viewCount: number;
  createdAt: number;
  /**
   * `publishRecipe` strips only `chatHistory`, so published docs do carry the
   * originating prompt. Optional because older docs may predate it.
   */
  prompt?: string;
  collaborators?: Collaborator[];
};

/** Page size for the shared feed. Small enough that a first paint is cheap. */
export const FEED_PAGE_SIZE = 30;

/**
 * An opaque cursor. Deliberately the Firestore snapshot rather than a `createdAt`
 * value: two recipes published in the same millisecond would make a value-based
 * cursor either skip one or repeat one, and `createdAt` is a client clock, so
 * collisions are not hypothetical when someone imports a batch.
 */
export type FeedCursor = QueryDocumentSnapshot<DocumentData>;

export interface PublishedRecipePage {
  recipes: PublishedRecipe[];
  /** Pass to the next call. Null when the end has been reached. */
  cursor: FeedCursor | null;
  hasMore: boolean;
}

/**
 * One page of the shared library, newest first.
 *
 * Replaces a hard `limit(200)` with no way past it: beyond 200 published recipes
 * the rest of the library was simply invisible, and every visit re-read all 200
 * whether or not the user scrolled. This is roadmap 3.1's correctness half.
 */
export async function getPublishedRecipesPage(
  cursor?: FeedCursor | null,
  pageSize = FEED_PAGE_SIZE,
  tag?: string | null
): Promise<PublishedRecipePage> {
  if (!firestore) return { recipes: [], cursor: null, hasMore: false };

  // The tag filter needs the `tags` ARRAY_CONTAINS + `createdAt` DESC composite
  // index in firestore.indexes.json (RL-009).
  const q = query(
    collection(firestore, 'recipes'),
    ...(tag ? [where(EXPLORE_TAG_FIELD, 'array-contains', tag)] : []),
    orderBy(FEED_ORDER_FIELD, 'desc'),
    ...(cursor ? [startAfter(cursor)] : []),
    // One extra row is fetched purely to answer "is there a next page?" without a
    // second round trip, then dropped before returning.
    limit(pageSize + 1)
  );

  const snap = await getDocs(q);
  const hasMore = snap.docs.length > pageSize;
  const docs = hasMore ? snap.docs.slice(0, pageSize) : snap.docs;

  return {
    recipes: docs.map((d) => ({ id: d.id, ...d.data() }) as PublishedRecipe),
    cursor: docs.length > 0 ? docs[docs.length - 1] : null,
    hasMore,
  };
}

/**
 * The newest slice of the shared library, for callers that need a window rather
 * than a page: the dedup check, and the library's first paint.
 *
 * Still bounded, and still an accepted limit — see `searchPublishedRecipes`.
 */
export async function getAllPublishedRecipes(limitTo = 200): Promise<PublishedRecipe[]> {
  if (!firestore) return [];
  const q = query(
    collection(firestore, 'recipes'),
    orderBy('createdAt', 'desc'),
    limit(limitTo)
  );
  const snap = await getDocs(q);
  return snap.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as PublishedRecipe
  );
}

/**
 * Dedup check against the shared cloud library.
 *
 * Firestore has no full-text search, so this scores the most recent published
 * recipes client-side over the same window the library feed uses. Recipes past
 * that window are not considered — an accepted limit until dedup moves server-side.
 */
export async function searchPublishedRecipes(
  prompt: string,
  maxResults = 5
): Promise<PublishedRecipe[]> {
  if (!firestore) return [];
  const all = await getAllPublishedRecipes();
  return rankByQuery(all, prompt, {
    haystack: recipeHaystack,
    threshold: 0.5,
    limit: maxResults,
  });
}

/**
 * Every published recipe in one variation tree.
 *
 * The tree UI and variation dedup previously read local Dexie only, so viewing or
 * varying someone else's recipe showed an empty tree and detected no duplicates.
 */
export async function getPublishedRecipeTree(rootId: string): Promise<PublishedRecipe[]> {
  if (!firestore) return [];
  const snap = await getDocs(
    query(collection(firestore, 'recipes'), where('rootId', '==', rootId))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PublishedRecipe);
}

/** Dedup check for a new variation, against the published siblings in its tree. */
export async function searchPublishedVariations(
  rootId: string,
  prompt: string,
  excludeId?: string,
  maxResults = 3
): Promise<PublishedRecipe[]> {
  if (!firestore) return [];
  const tree = await getPublishedRecipeTree(rootId);
  return rankByQuery(
    tree.filter((r) => r.id !== excludeId),
    prompt,
    { haystack: variationHaystack, threshold: 0.4, limit: maxResults }
  );
}

/**
 * Delete a published recipe and every published descendant of it.
 *
 * The cloud tree is queried rather than derived from the local one, so variations
 * published from another device (or by another user) are still found. Deletes run
 * individually, not in a `writeBatch`: the rules only permit deleting your own
 * recipes, and one denied descendant would abort an atomic batch and leave the
 * whole subtree published.
 *
 * `extraIds` covers ids known to be part of the subtree locally but missing from
 * the cloud query, e.g. when a doc's rootId was never backfilled.
 *
 * Only documents created by `uid` are attempted: the rules deny the rest by design,
 * so counting them would report another user's copy as a failure of this delete.
 * Ids the query did not return are read first: a missing doc (never published, or
 * already deleted by an earlier attempt) is skipped, because the rules deny a delete
 * of a nonexistent doc and it would count as a failure that "Try again" can never
 * clear. If that read itself fails, the delete is still attempted.
 */
export async function deletePublishedRecipeTree(
  uid: string,
  id: string,
  rootId: string,
  extraIds: string[] = []
): Promise<{ deleted: number; failed: number }> {
  if (!firestore) return { deleted: 0, failed: 0 };

  let subtreeIds: string[];
  const ownerById = new Map<string, string | undefined>();
  try {
    const snap = await getDocs(
      query(collection(firestore, 'recipes'), where('rootId', '==', rootId))
    );
    const nodes = snap.docs.map((d) => {
      const data = d.data();
      ownerById.set(d.id, (data.createdBy as { uid?: string } | undefined)?.uid);
      return { id: d.id, parentId: (data.parentId as string | null) ?? null };
    });
    subtreeIds = collectSubtreeIds(nodes, id);
  } catch {
    // Tree query failed — still make a best effort on what the caller knows.
    subtreeIds = [id];
  }

  const candidates = [...new Set([...subtreeIds, ...extraIds])];
  const owners = await Promise.all(
    candidates.map(async (target): Promise<string | null | undefined> => {
      if (ownerById.has(target)) return ownerById.get(target);
      try {
        const snap = await getDoc(doc(firestore!, 'recipes', target));
        if (!snap.exists()) return null;
        return (snap.data().createdBy as { uid?: string } | undefined)?.uid;
      } catch {
        return uid; // Unreadable: ownership unknown, so try the delete anyway.
      }
    })
  );
  const targets = candidates.filter((_, i) => owners[i] === uid);
  const results = await Promise.allSettled(
    targets.map((target) => deleteDoc(doc(firestore!, 'recipes', target)))
  );

  const failed = results.filter((r) => r.status === 'rejected').length;
  return { deleted: results.length - failed, failed };
}

// --- Cloud Favorites ---

export async function addCloudFavorite(
  uid: string,
  recipeId: string,
  recipeOwnerId: string,
  recipeTitle: string,
  recipeEmoji: string,
  fromDisplayName: string | null
): Promise<void> {
  if (!firestore) return;

  const batch = writeBatch(firestore);
  const favoriteId = `${uid}_${recipeId}`;

  batch.set(doc(firestore, 'favorites', favoriteId), {
    uid,
    recipeId,
    recipeOwnerId,
    createdAt: Date.now(),
  });

  batch.update(doc(firestore, 'recipes', recipeId), {
    favoriteCount: increment(1),
  });

  await batch.commit();

  // Notify recipe owner (don't block on this, don't notify self)
  if (uid !== recipeOwnerId) {
    notify(firestore, {
      recipientUid: recipeOwnerId,
      type: 'favorite',
      recipeId,
      recipeTitle,
      recipeEmoji,
      fromUid: uid,
      fromDisplayName,
      message: null,
      read: false,
      createdAt: Date.now(),
    });
  }
}

/** Same bound as the favourite toggles, so a hung network cannot hang an upgrade. */
const FAVORITE_PUSH_TIMEOUT_MS = 5000;

export interface FavoritesPushSummary {
  attempted: number;
  pushed: number;
  skipped: number;
}

/**
 * Carry this device's local favourites of `uid` into cloud favourites after an
 * anonymous account upgrades to a verified email (RL-034).
 *
 * One batch per favourite (create + favoriteCount +1), run one at a time. A
 * failed, denied or timed-out batch is skipped and counted, never retried. The
 * rules make this idempotent: a favourite that already exists is an update,
 * which is denied, so the batch rolls back and the count is never bumped twice.
 * A recipe that is not in the cloud fails on the bump, so that bookmark stays
 * local. No notifications, and Dexie is never modified.
 */
export async function pushLocalFavoritesToCloud(uid: string): Promise<FavoritesPushSummary> {
  if (!firestore) return { attempted: 0, pushed: 0, skipped: 0 };
  const rows = selectFavoritesToPush(await db.favorites.where('uid').equals(uid).toArray(), uid);

  let pushed = 0;
  for (const fav of rows) {
    // Nothing reads recipeOwnerId today; same fallback as the toggle callers.
    const recipeOwnerId = (await db.recipes.get(fav.recipeId))?.createdBy?.uid ?? 'local';
    const batch = writeBatch(firestore);
    batch.set(doc(firestore, 'favorites', `${uid}_${fav.recipeId}`), {
      uid,
      recipeId: fav.recipeId,
      recipeOwnerId,
      createdAt: fav.createdAt,
    });
    batch.update(doc(firestore, 'recipes', fav.recipeId), { favoriteCount: increment(1) });
    // shortcut: a timed-out batch may still commit later; it is atomic, so the count stays right.
    const ok = await withTimeout(
      batch.commit().then(
        () => true,
        () => false
      ),
      FAVORITE_PUSH_TIMEOUT_MS,
      false
    );
    if (ok) pushed += 1;
  }
  return { attempted: rows.length, pushed, skipped: rows.length - pushed };
}

/** Bound on the one sign-in read of the user's cloud favourites. */
const FAVORITE_HYDRATE_TIMEOUT_MS = 8000;

/**
 * Every cloud favourite of `uid`, read once per session to fill this device's
 * Dexie favourites (RL-043). Read only. Never throws: a failure is reported and,
 * like a timeout, returns null, so the caller tries again next session.
 */
export async function getCloudFavorites(uid: string): Promise<CloudFavoriteRow[] | null> {
  if (!firestore) return null;
  const read = getDocs(query(collection(firestore, 'favorites'), where('uid', '==', uid))).then(
    (snap) => snap.docs.map((d) => d.data() as CloudFavoriteRow),
    (err) => {
      console.error('Reading cloud favourites failed', err);
      reportError(err, 'favorites-hydrate');
      return null;
    }
  );
  return withTimeout(read, FAVORITE_HYDRATE_TIMEOUT_MS, null);
}

/**
 * Unfavourite a recipe.
 *
 * Deliberately NOT a batch. `update` on a missing document rejects, and in a
 * batch that rolls back the favourite deletion too — so once the recipe was
 * deleted, the favourite could never be removed (FUN-8). The favourite record is
 * the user's own data and must come off regardless; the counter lives on a doc
 * that may no longer exist, so its decrement is best-effort.
 */
export async function removeCloudFavorite(uid: string, recipeId: string): Promise<void> {
  if (!firestore) return;

  await deleteDoc(doc(firestore, 'favorites', `${uid}_${recipeId}`));

  try {
    await updateDoc(doc(firestore, 'recipes', recipeId), {
      favoriteCount: increment(-1),
    });
  } catch (err) {
    // Expected when the recipe has been deleted; there is no counter to adjust.
    console.error('Could not decrement favoriteCount (recipe may be deleted)', err);
  }
}

export async function isCloudFavorite(
  uid: string,
  recipeId: string
): Promise<boolean> {
  if (!firestore) return false;
  // A query, not getDoc: the rules read `resource.data`, so a get of a missing doc
  // is denied (emulator-verified, RL-026) while a filtered query returns empty.
  const snap = await getDocs(
    query(
      collection(firestore, 'favorites'),
      where('uid', '==', uid),
      where('recipeId', '==', recipeId),
      limit(1)
    )
  );
  return !snap.empty;
}

// --- Suggestions ---

/**
 * Write `data` at `ref` and move writeWindows/{uid}_{action} in one transaction
 * (RL-048, RL-049): the rules deny the content without the window move. Throws
 * RateLimitedError, having written nothing, at the cap. Rejects after 5 s rather
 * than queueing offline as addDoc did; a timed-out transaction may still commit.
 */
async function writeLimited(
  fs: Firestore,
  uid: string,
  action: RateLimitAction,
  ref: DocumentReference,
  data: DocumentData,
  /** When given, `ref` is read first and, if it exists, merged with this instead: no window move. */
  ifExists?: DocumentData
): Promise<boolean> {
  const windowRef = doc(fs, 'writeWindows', `${uid}_${action}`);
  try {
    return await rejectAfter(
      runTransaction(fs, async (tx) => {
        if (ifExists && (await tx.get(ref)).exists()) {
          tx.set(ref, ifExists, { merge: true });
          return false;
        }
        const snap = await tx.get(windowRef);
        const prev = snap.exists()
          ? { windowStartMs: (snap.data().windowStart as Timestamp).toMillis(), count: snap.data().count as number }
          : null;
        const { cap, windowMs } = RATE_LIMITS[action];
        const next = nextWindow(prev, Date.now(), cap, windowMs);
        if (next === 'limited') throw new RateLimitedError(action);
        tx.set(ref, data);
        // A new window stamps windowStart; an increment must leave it as stored,
        // which is what the rules' same-window branch compares against.
        // `last` binds this bump to this one document; the rules check it.
        if (next.count === 1) {
          tx.set(windowRef, { windowStart: serverTimestamp(), count: 1, at: serverTimestamp(), last: ref.path });
        } else {
          tx.update(windowRef, { count: next.count, at: serverTimestamp(), last: ref.path });
        }
        return true;
      }),
      `Sending the ${action}`
    );
  } catch (err) {
    if (err instanceof RateLimitedError) reportError(err, `rate-limited-${action}`);
    throw err;
  }
}

/**
 * Write a notification through the notification window (RL-049), after the
 * action it announces has committed. Fire-and-forget and never throws: a
 * limited, offline, timed-out or denied notification is skipped, so it can never
 * fail the favourite, follow, suggestion, reply or review itself. A limited one
 * is reported once by writeLimited as 'rate-limited-notification'.
 */
function notify(fs: Firestore, data: DocumentData & { fromUid: string }): void {
  writeLimited(fs, data.fromUid, 'notification', doc(collection(fs, 'notifications')), data).catch(() => {});
}

export async function createSuggestion(params: {
  recipeId: string;
  recipeOwnerId: string;
  recipeTitle: string;
  recipeEmoji: string;
  suggestedBy: { uid: string; displayName: string | null };
  message: string;
}): Promise<void> {
  if (!firestore) return;

  await writeLimited(firestore, params.suggestedBy.uid, 'suggestion', doc(collection(firestore, 'suggestions')), {
    recipeId: params.recipeId,
    recipeOwnerId: params.recipeOwnerId,
    recipeTitle: params.recipeTitle,
    // Stored so the approve/reject notification can be built from the
    // suggestion alone, without refetching the recipe.
    recipeEmoji: params.recipeEmoji,
    suggestedBy: params.suggestedBy,
    message: params.message,
    status: 'pending',
    createdAt: Date.now(),
  });

  // Notify recipe owner
  if (params.suggestedBy.uid !== params.recipeOwnerId) {
    notify(firestore, {
      recipientUid: params.recipeOwnerId,
      type: 'suggestion',
      recipeId: params.recipeId,
      recipeTitle: params.recipeTitle,
      recipeEmoji: params.recipeEmoji,
      fromUid: params.suggestedBy.uid,
      fromDisplayName: params.suggestedBy.displayName,
      message: truncateNotificationMessage(params.message),
      read: false,
      createdAt: Date.now(),
    });
  }
}

/**
 * Live suggestions on one recipe that this viewer may read: all of them for the
 * owner, only their own for anyone else. The read rule allows only those two
 * parties, and a `list` is authorised from its filters, not from the documents
 * (docs/decisions.md), so the filter here must be the one the rule checks.
 */
export function subscribeRecipeSuggestions(
  recipeId: string,
  viewerUid: string,
  isOwner: boolean,
  callback: (suggestions: Suggestion[]) => void
): () => void {
  if (!firestore) return () => {};
  const q = query(
    collection(firestore, 'suggestions'),
    where('recipeId', '==', recipeId),
    where(isOwner ? 'recipeOwnerId' : 'suggestedBy.uid', '==', viewerUid),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Suggestion)
    );
  });
}

/**
 * Post a reply on a suggestion thread.
 *
 * Notifies the other participant, whichever side that is: the owner replying
 * notifies the suggester and vice versa, since a reply nobody is told about is
 * a message into the void.
 *
 * Deliberately allowed after approval or rejection. A rejection is exactly when
 * the suggester wants to ask why.
 */
export async function addSuggestionMessage(
  suggestion: Suggestion,
  from: { uid: string; displayName: string | null },
  text: string
): Promise<void> {
  if (!firestore) return;

  await writeLimited(firestore, from.uid, 'reply', doc(collection(firestore, 'suggestions', suggestion.id, 'messages')), {
    fromUid: from.uid,
    fromDisplayName: from.displayName,
    text,
    createdAt: Date.now(),
  });

  const recipientUid = replyRecipient(suggestion, from.uid);

  // Fire-and-forget, matching the other notification writes: a failed
  // notification must not make a sent reply look like it failed.
  if (recipientUid) {
    notify(firestore, {
      recipientUid,
      type: 'suggestion_reply',
      recipeId: suggestion.recipeId,
      recipeTitle: suggestion.recipeTitle,
      recipeEmoji: suggestion.recipeEmoji ?? '🍽️',
      fromUid: from.uid,
      fromDisplayName: from.displayName,
      message: truncateNotificationMessage(text),
      read: false,
      createdAt: Date.now(),
    });
  }
}

/** Live reply thread for one suggestion, oldest first so it reads as a conversation. */
export function subscribeSuggestionMessages(
  suggestionId: string,
  callback: (messages: SuggestionMessage[]) => void,
  onError?: (error: Error) => void
): () => void {
  if (!firestore) return () => {};
  const q = query(
    collection(firestore, 'suggestions', suggestionId, 'messages'),
    orderBy('createdAt', 'asc')
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SuggestionMessage));
    },
    (error) => onError?.(error)
  );
}

/**
 * Approve or reject a suggestion.
 *
 * Returns the collaborator added on approval so the caller can mirror it onto
 * the local Dexie copy — the owner's UI reads that copy first, so a cloud-only
 * write left them unable to see the collaborator they just approved (FUN-7).
 * Approval throws if the collaborator write fails; status is then untouched.
 */
export async function updateSuggestionStatus(
  suggestionId: string,
  status: 'approved' | 'rejected',
  reviewer?: { uid: string; displayName: string | null }
): Promise<{ recipeId: string; collaborator: Collaborator } | null> {
  if (!firestore) return null;

  // Read before writing: the suggester's identity is needed to notify them of
  // either outcome, and a rejection used to return early without ever loading it.
  const suggestionSnap = await getDoc(doc(firestore, 'suggestions', suggestionId));
  if (!suggestionSnap.exists()) return null;
  const suggestion = suggestionSnap.data() as Suggestion;

  // On approval the collaborator goes on first, so a failure leaves the
  // suggestion pending and unannounced instead of "approved" with no
  // collaborator. A retry after this succeeded but the status write failed is
  // safe: arrayUnion of the same object is idempotent.
  let collaborator: Collaborator | null = null;
  if (status === 'approved') {
    collaborator = {
      uid: suggestion.suggestedBy.uid,
      displayName: suggestion.suggestedBy.displayName,
    };
    try {
      await updateDoc(doc(firestore, 'recipes', suggestion.recipeId), {
        collaborators: arrayUnion(collaborator),
      });
    } catch (err) {
      // Throw, not return null: the caller must not mirror locally or move on
      // as if the approval happened.
      console.error('Adding collaborator to the published recipe failed', err);
      reportError(err, 'add-collaborator');
      throw err;
    }
  }

  await updateDoc(doc(firestore, 'suggestions', suggestionId), { status });

  // Close the loop back to the suggester. Fire-and-forget like the other
  // notification writes, so a failure here never blocks the review itself.
  if (reviewer && reviewer.uid !== suggestion.suggestedBy.uid) {
    notify(firestore, {
      recipientUid: suggestion.suggestedBy.uid,
      type: status === 'approved' ? 'suggestion_approved' : 'suggestion_rejected',
      recipeId: suggestion.recipeId,
      recipeTitle: suggestion.recipeTitle,
      recipeEmoji: suggestion.recipeEmoji ?? '🍽️',
      fromUid: reviewer.uid,
      fromDisplayName: reviewer.displayName,
      // Echo the original suggestion so the notification is self-explanatory
      // weeks later, rather than "your suggestion was approved" with no context.
      // The suggestion rule does not require a string message, so fall back to
      // null rather than throw after the status write has already landed.
      message: typeof suggestion.message === 'string' ? truncateNotificationMessage(suggestion.message) : null,
      read: false,
      createdAt: Date.now(),
    });
  }

  return collaborator ? { recipeId: suggestion.recipeId, collaborator } : null;
}

// --- Notifications ---

export function subscribeNotifications(
  uid: string,
  callback: (notifications: AppNotification[]) => void,
  /** Called if the subscription fails, e.g. a missing index or denied read. */
  onError?: (err: Error) => void
): () => void {
  if (!firestore) return () => {};
  const q = query(
    collection(firestore, 'notifications'),
    where('recipientUid', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AppNotification)
      );
    },
    // Without this, a failed subscription was silent and the panel sat on its
    // empty state, which reads as "nobody has interacted with your recipes".
    (err) => {
      console.error('Notification subscription failed', err);
      reportError(err, 'notification-subscription');
      onError?.(err);
    }
  );
}

export async function markNotificationRead(
  notificationId: string
): Promise<void> {
  if (!firestore) return;
  await updateDoc(doc(firestore, 'notifications', notificationId), {
    read: true,
  });
}

// Firestore rejects a batch of more than 500 writes.
const BATCH_LIMIT = 500;

export async function markAllNotificationsRead(uid: string): Promise<void> {
  if (!firestore) return;
  const q = query(
    collection(firestore, 'notifications'),
    where('recipientUid', '==', uid),
    where('read', '==', false)
  );
  const snap = await getDocs(q);
  // A failed later chunk leaves earlier ones committed; a retry only sees what is still unread.
  for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(firestore);
    snap.docs.slice(i, i + BATCH_LIMIT).forEach((d) => batch.update(d.ref, { read: true }));
    await batch.commit();
  }
}

// --- Profiles ---

// --- Terms acceptance (RL-047): owner-only, never on the public profile ---

const CALL_TIMEOUT_MS = 5000;

// Not withTimeout: that swallows the rejection, and a permission-denied is worth reporting as such.
async function rejectAfter<T>(promise: Promise<T>, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out`)), CALL_TIMEOUT_MS);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The Terms version this account accepted, or null when it has no record.
 * Rejects on a failed or slow read; the caller treats that as unknown, not as "not accepted".
 */
export async function getAcceptedTermsVersion(uid: string): Promise<string | null> {
  if (!firestore) throw new Error('Firebase not configured');
  const snap = await rejectAfter(getDoc(doc(firestore, 'termsAcceptance', uid)), 'Reading terms acceptance');
  const version: unknown = snap.exists() ? snap.data().version : null;
  return typeof version === 'string' ? version : null;
}

/**
 * Record acceptance of the current Terms. Rejects on failure or after 5 s, so a dialog never
 * hangs; a timed-out write may still commit later, and repeating it is harmless.
 */
export async function recordTermsAcceptance(uid: string, acceptedAt: number): Promise<void> {
  if (!firestore) throw new Error('Firebase not configured');
  await rejectAfter(
    setDoc(doc(firestore, 'termsAcceptance', uid), {
      version: TERMS_VERSION,
      acceptedAt,
      recordedAt: serverTimestamp(),
    }),
    'Recording terms acceptance'
  );
}

export async function getProfile(uid: string): Promise<UserProfile | null> {
  if (!firestore) return null;
  const snap = await getDoc(doc(firestore, 'profiles', uid));
  if (!snap.exists()) return null;
  return { uid: snap.id, ...snap.data() } as UserProfile;
}

export async function createOrUpdateProfile(
  uid: string,
  data: Partial<Omit<UserProfile, 'uid'>>
): Promise<void> {
  if (!firestore) return;
  const ref = doc(firestore, 'profiles', uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, data);
  } else {
    await setDoc(ref, {
      displayName: null,
      photoType: 'generated',
      photoEmoji: null,
      photoBgColor: null,
      photoURL: null,
      recipeCount: 0,
      followerCount: 0,
      followingCount: 0,
      createdAt: Date.now(),
      ...data,
    });
  }
}

export function subscribeProfile(
  uid: string,
  callback: (profile: UserProfile | null) => void
): () => void {
  if (!firestore) return () => {};
  return onSnapshot(doc(firestore, 'profiles', uid), (snap) => {
    callback(snap.exists() ? { uid: snap.id, ...snap.data() } as UserProfile : null);
  });
}

// --- Follows ---

export async function followUser(
  followerId: string,
  followingId: string,
  followerDisplayName: string | null
): Promise<void> {
  if (!firestore) return;
  const followId = `${followerId}_${followingId}`;
  const batch = writeBatch(firestore);

  batch.set(doc(firestore, 'follows', followId), {
    followerId,
    followingId,
    followerDisplayName,
    createdAt: Date.now(),
  });

  batch.update(doc(firestore, 'profiles', followingId), {
    followerCount: increment(1),
  });

  batch.update(doc(firestore, 'profiles', followerId), {
    followingCount: increment(1),
  });

  await batch.commit();
  // Gaining a follower was the one social event that produced no notification,
  // which is odd given it is the strongest signal a creator gets. Fire-and-forget
  // like the others, so a failed notification never fails the follow itself.
  notify(firestore, {
    recipientUid: followingId,
    type: 'follow',
    fromUid: followerId,
    fromDisplayName: followerDisplayName,
    message: null,
    read: false,
    createdAt: Date.now(),
  });
}

export async function unfollowUser(
  followerId: string,
  followingId: string
): Promise<void> {
  if (!firestore) return;
  const followId = `${followerId}_${followingId}`;
  const batch = writeBatch(firestore);

  batch.delete(doc(firestore, 'follows', followId));

  batch.update(doc(firestore, 'profiles', followingId), {
    followerCount: increment(-1),
  });

  batch.update(doc(firestore, 'profiles', followerId), {
    followingCount: increment(-1),
  });

  await batch.commit();
}

export async function isFollowing(
  followerId: string,
  followingId: string
): Promise<boolean> {
  if (!firestore) return false;
  // A query, not getDoc, for the same reason as isCloudFavorite.
  const snap = await getDocs(
    query(
      collection(firestore, 'follows'),
      where('followerId', '==', followerId),
      where('followingId', '==', followingId),
      limit(1)
    )
  );
  return !snap.empty;
}

export async function getFollowingIds(uid: string): Promise<string[]> {
  if (!firestore) return [];
  const q = query(
    collection(firestore, 'follows'),
    where('followerId', '==', uid)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => (d.data() as Follow).followingId);
}

/**
 * Profiles for already-fetched ids, fetched in parallel and returned in input order.
 * A missing profile is skipped; any failed read rejects, as before.
 */
export async function getFollowingProfiles(ids: string[]): Promise<UserProfile[]> {
  if (!firestore || ids.length === 0) return [];
  const profiles = await Promise.all(ids.map((id) => getProfile(id)));
  return profiles.filter((p): p is UserProfile => p !== null);
}

/** A follower, as recorded on the follow document itself. */
export interface FollowerSummary {
  uid: string;
  displayName: string | null;
  createdAt: number;
}

/**
 * Who follows `uid`.
 *
 * Only ever called for the signed-in user's own profile: the rules allow reading
 * a follow doc only when the caller is one of its two parties, so another user's
 * follower graph is deliberately private and this query would be denied for it.
 *
 * `followerDisplayName` is stored on the follow doc, so a follower list needs no
 * second read per row — unlike the following list, which has to fetch profiles
 * because the doc carries the follower's name rather than the followed user's.
 *
 * Sorted client-side. Adding `orderBy('createdAt')` would require a composite
 * index, and an index deploy is a worse dependency than sorting a short list here.
 */
export async function getFollowers(uid: string): Promise<FollowerSummary[]> {
  if (!firestore) return [];
  const snap = await getDocs(
    query(collection(firestore, 'follows'), where('followingId', '==', uid))
  );
  return snap.docs
    .map((d) => {
      const data = d.data() as Follow & { followerDisplayName?: string | null };
      return {
        uid: data.followerId,
        displayName: data.followerDisplayName ?? null,
        createdAt: (data as { createdAt?: number }).createdAt ?? 0,
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

// --- UID Migration ---

/**
 * What actually happened to the cloud half of a uid migration.
 *
 * Exists because the honest answer is usually "nothing". `firestore.rules`
 * denies every step of this by design — `isOwnerUpdate()` requires
 * `createdBy.uid` to be unchanged, and no client-side rule could safely permit
 * reassigning ownership — so the migration is expected to fail against a
 * rules-enforced project. It used to fail behind `.catch(() => {})`, which is
 * how a user could silently lose their whole published catalog.
 */
export interface UidMigrationOutcome {
  /** True only when every cloud record moved. */
  ok: boolean;
  /** Published recipes left under the old uid. 0 when they moved successfully. */
  strandedRecipes: number;
}

export async function migrateFirestoreUid(
  oldUid: string,
  newUid: string,
  displayName: string | null
): Promise<UidMigrationOutcome> {
  if (!firestore) return { ok: true, strandedRecipes: 0 };

  // Migrate recipes (update createdBy.uid)
  const recipesQ = query(
    collection(firestore, 'recipes'),
    where('createdBy.uid', '==', oldUid)
  );
  // Reading is allowed to anyone, so this count is reliable even when the
  // writes below are not — which is what makes an honest notice possible.
  const recipesSnap = await getDocs(recipesQ);
  // Firestore batches limited to 500
  const recipeDocs = recipesSnap.docs;
  let movedRecipes = 0;
  try {
    for (let i = 0; i < recipeDocs.length; i += 500) {
      const chunk = recipeDocs.slice(i, i + 500);
      const batch = writeBatch(firestore);
      for (const d of chunk) {
        batch.update(d.ref, { 'createdBy.uid': newUid, 'createdBy.displayName': displayName });
      }
      await batch.commit();
      // Tracked per chunk so the count in the user's notice is what is actually
      // stranded. A batch is atomic, but the loop is not: with more than 500
      // recipes an early chunk can commit and a later one be denied, and
      // reporting the full total there would tell the user they lost recipes
      // that in fact moved.
      movedRecipes += chunk.length;
    }
  } catch {
    // Return here rather than pressing on. Every remaining step is denied by
    // the same class of rule — deleting the old favorite needs
    // `resource.data.uid == request.auth.uid`, re-pointing a notification needs
    // `recipientUid == request.auth.uid`, deleting the old profile needs to own
    // it, and un-writing a follow needs to be its follower. All of those read
    // the *old* uid, which the caller no longer is. Attempting them buys a
    // burst of permission-denied noise and moves nothing.
    return { ok: false, strandedRecipes: recipeDocs.length - movedRecipes };
  }

  // Migrate favorites
  const favsQ = query(
    collection(firestore, 'favorites'),
    where('uid', '==', oldUid)
  );
  const favsSnap = await getDocs(favsQ);
  for (const d of favsSnap.docs) {
    const data = d.data();
    const newFavId = `${newUid}_${data.recipeId}`;
    const batch = writeBatch(firestore);
    batch.delete(d.ref);
    batch.set(doc(firestore, 'favorites', newFavId), { ...data, uid: newUid });
    await batch.commit();
  }

  // Migrate notifications (recipientUid)
  const notifsQ = query(
    collection(firestore, 'notifications'),
    where('recipientUid', '==', oldUid)
  );
  const notifsSnap = await getDocs(notifsQ);
  const notifDocs = notifsSnap.docs;
  for (let i = 0; i < notifDocs.length; i += 500) {
    const batch = writeBatch(firestore);
    for (const d of notifDocs.slice(i, i + 500)) {
      batch.update(d.ref, { recipientUid: newUid });
    }
    await batch.commit();
  }

  // Migrate profile: copy old profile data to new UID, delete old
  const oldProfileSnap = await getDoc(doc(firestore, 'profiles', oldUid));
  if (oldProfileSnap.exists()) {
    const newProfileSnap = await getDoc(doc(firestore, 'profiles', newUid));
    if (!newProfileSnap.exists()) {
      // Copy the old profile to new UID
      await setDoc(doc(firestore, 'profiles', newUid), {
        ...oldProfileSnap.data(),
        displayName,
      });
    }
    await deleteDoc(doc(firestore, 'profiles', oldUid));
  }

  // Migrate follows (as follower)
  const followerQ = query(
    collection(firestore, 'follows'),
    where('followerId', '==', oldUid)
  );
  const followerSnap = await getDocs(followerQ);
  for (const d of followerSnap.docs) {
    const data = d.data();
    const newFollowId = `${newUid}_${data.followingId}`;
    const batch = writeBatch(firestore);
    batch.delete(d.ref);
    batch.set(doc(firestore, 'follows', newFollowId), { ...data, followerId: newUid });
    await batch.commit();
  }

  // Migrate follows (as following target) - update followerDisplayName where they follow oldUid
  const followingQ = query(
    collection(firestore, 'follows'),
    where('followingId', '==', oldUid)
  );
  const followingSnap = await getDocs(followingQ);
  for (const d of followingSnap.docs) {
    const data = d.data();
    const newFollowId = `${data.followerId}_${newUid}`;
    const batch = writeBatch(firestore);
    batch.delete(d.ref);
    batch.set(doc(firestore, 'follows', newFollowId), { ...data, followingId: newUid });
    await batch.commit();
  }

  // Recipes are what the notice is about, and they moved. Anything that failed
  // after them is a favourite, notification, follow or profile row — worth
  // knowing about via the error beacon once it exists, but not worth telling the
  // user their catalog is stranded when it is not.
  return { ok: true, strandedRecipes: 0 };
}

// --- Views ---

export async function incrementRecipeViews(recipeId: string): Promise<void> {
  if (!firestore) return;
  await updateDoc(doc(firestore, 'recipes', recipeId), {
    viewCount: increment(1),
  }).catch(() => {});
}

// --- User Recipes ---

export async function getUserRecipes(uid: string): Promise<Array<SharedRecipe & { id: string; favoriteCount: number; viewCount: number; createdAt: number }>> {
  if (!firestore) return [];
  const q = query(
    collection(firestore, 'recipes'),
    where('createdBy.uid', '==', uid)
  );
  const snap = await getDocs(q);
  const results = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SharedRecipe & { id: string; favoriteCount: number; viewCount: number; createdAt: number });
  results.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return results;
}

export async function getRecipesByUsers(uids: string[]): Promise<Array<SharedRecipe & { id: string; favoriteCount: number; viewCount: number; createdAt: number }>> {
  if (!firestore || uids.length === 0) return [];
  // Firestore 'in' supports up to 30 values
  const chunks = [];
  for (let i = 0; i < uids.length; i += 30) {
    chunks.push(uids.slice(i, i + 30));
  }
  const results: Array<SharedRecipe & { id: string; favoriteCount: number; viewCount: number; createdAt: number }> = [];
  for (const chunk of chunks) {
    const q = query(
      collection(firestore, 'recipes'),
      where('createdBy.uid', 'in', chunk),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const snap = await getDocs(q);
    results.push(
      ...snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SharedRecipe & { id: string; favoriteCount: number; viewCount: number; createdAt: number })
    );
  }
  results.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return results;
}

// --- Data export (RL-056) ---
//
// Read only. Every query below filters on the field the read rule checks, because a
// list is authorised from its filters and never sees document data (docs/decisions.md):
// favorites uid, notifications recipientUid, follows followerId and followingId (two
// queries), suggestions suggestedBy.uid and recipeOwnerId (two queries), messages by
// parent path. Recipes and profiles are public. No orderBy, so no composite index.

const EXPORT_SECTION_TIMEOUT_MS = 30000;
const EXPORT_PAGE_SIZE = 500;
/** Per query. Reaching it is reported in the file's errors, never silent. */
const EXPORT_MAX_ROWS = 10000;
/** Reply threads read at once, so a long suggestion list does not open hundreds of queries together. */
const EXPORT_THREAD_CONCURRENCY = 10;

/** Firestore Timestamps become ISO strings, at any depth in plain objects and arrays; everything else is as stored. */
function exportValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(exportValue);
  if (v && typeof v === 'object') {
    if (typeof (v as Timestamp).toDate === 'function') return (v as Timestamp).toDate().toISOString();
    if (Object.getPrototypeOf(v) === Object.prototype) {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, exportValue(x)]));
    }
  }
  return v;
}
const exportFields = (data: DocumentData): DocumentData => exportValue(data) as DocumentData;

const exportDoc = (d: QueryDocumentSnapshot<DocumentData>): CloudDoc => ({ id: d.id, ...exportFields(d.data()) });

async function readAllDocs(
  col: CollectionReference<DocumentData>,
  ...constraints: QueryConstraint[]
): Promise<{ docs: QueryDocumentSnapshot<DocumentData>[]; truncated: boolean }> {
  const docs: QueryDocumentSnapshot<DocumentData>[] = [];
  for (;;) {
    const last = docs[docs.length - 1];
    const atCap = docs.length >= EXPORT_MAX_ROWS;
    const snap = await getDocs(
      query(col, ...constraints, ...(last ? [startAfter(last)] : []), limit(atCap ? 1 : EXPORT_PAGE_SIZE))
    );
    // At the cap, one more row is a peek: exactly EXPORT_MAX_ROWS rows is complete, not truncated.
    if (atCap) return { docs, truncated: snap.docs.length > 0 };
    docs.push(...snap.docs);
    if (snap.docs.length < EXPORT_PAGE_SIZE) return { docs, truncated: false };
  }
}

const truncationWarning = (what: string) =>
  `Stopped after ${EXPORT_MAX_ROWS} ${what}; the file is incomplete. Ask for an operator export for the rest.`;

function mergeById<T extends { id: string }>(lists: T[][]): T[] {
  return [...new Map(lists.flat().map((r) => [r.id, r])).values()];
}

/** Runs one section's read. A rejection or timeout becomes that section's error, never a throw. */
async function exportSection<T>(
  label: string,
  read: () => Promise<Section<T>>,
  /** What to return if the read is still running at the deadline, instead of discarding what it already has. */
  onTimeout?: () => Section<T> | null
): Promise<Section<T>> {
  const guarded = read().catch((err): Section<T> => {
    console.error(`Data export: reading ${label} failed`, err);
    reportError(err, 'data-export');
    const code = (err as { code?: string } | null)?.code;
    return { error: `${code ?? (err instanceof Error ? err.message : String(err))}` };
  });
  return withTimeout(guarded, EXPORT_SECTION_TIMEOUT_MS, null).then(
    (r) => r ?? onTimeout?.() ?? { error: `Reading ${label} timed out` }
  );
}

/** Runs several queries for one section; keeps the rows of those that worked and says so for those that did not. */
async function readMerged<T extends { id: string }>(
  what: string,
  reads: Array<() => Promise<{ rows: T[]; truncated: boolean }>>
): Promise<Section<T[]>> {
  const results = await Promise.allSettled(reads.map((r) => r()));
  const ok = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  const failed = results.flatMap((r) => (r.status === 'rejected' ? [r.reason] : []));
  if (failed.length && !ok.length) throw failed[0];
  const warnings = [
    ...(failed.length ? [`${failed.length} of ${results.length} reads failed, so the ${what} may be incomplete`] : []),
    ...(ok.some((r) => r.truncated) ? [truncationWarning(what)] : []),
  ];
  return { data: mergeById(ok.map((r) => r.rows)), ...(warnings.length ? { warning: warnings.join('; ') } : {}) };
}

/**
 * Everything the signed-in user can read about themselves, for the "Download my data" file.
 * Each section is read independently and bounded by a timeout; a failure is returned as
 * that section's `error` and the rest still arrive. Read only. Never rejects.
 */
export async function fetchCloudDataForExport(uid: string, emailVerified = true): Promise<CloudInput> {
  const fs = firestore;
  if (!fs) {
    const error: Section<never> = { error: 'Firebase is not configured' };
    return { profile: error, recipes: error, favorites: error, follows: error, suggestions: error, notifications: error, termsAcceptance: error, writeWindows: error };
  }
  const byField = (col: string, field: string) => async () => {
    const r = await readAllDocs(collection(fs, col), where(field, '==', uid));
    return { rows: r.docs.map(exportDoc), truncated: r.truncated };
  };

  let partialSuggestions: Section<CloudSuggestion[]> | null = null;
  const readSuggestions = async (): Promise<Section<CloudSuggestion[]>> => {
    const base = await readMerged('suggestions', [byField('suggestions', 'suggestedBy.uid'), byField('suggestions', 'recipeOwnerId')]);
    if ('error' in base) return base;
    const rows = base.data as unknown as Omit<CloudSuggestion, 'messages'>[];
    const out = rows.map((r) => ({ ...r, messages: [] as CloudSuggestion['messages'] }));
    const warnings = base.warning ? [base.warning] : [];
    // Kept current, so a timeout returns the rows and threads read so far rather than nothing.
    partialSuggestions = { data: out, warning: [...warnings, 'Reading suggestions timed out; some replies may be missing'].join('; ') };
    let failedThreads = 0;
    let truncatedThread = false;
    for (let i = 0; i < rows.length; i += EXPORT_THREAD_CONCURRENCY) {
      const batch = await Promise.allSettled(
        rows.slice(i, i + EXPORT_THREAD_CONCURRENCY).map((s) => readAllDocs(collection(fs, 'suggestions', s.id, 'messages')))
      );
      batch.forEach((t, j) => {
        if (t.status === 'rejected') failedThreads++;
        else {
          out[i + j] = { ...out[i + j], messages: t.value.docs.map(exportDoc) as unknown as CloudSuggestion['messages'] };
          truncatedThread ||= t.value.truncated;
        }
      });
      partialSuggestions = { data: out.map((x) => ({ ...x })), warning: [...warnings, 'Reading suggestions timed out; some replies may be missing'].join('; ') };
    }
    if (failedThreads) warnings.push(`${failedThreads} reply thread(s) could not be read and are missing their messages`);
    if (truncatedThread) warnings.push(truncationWarning('replies in a thread'));
    return { data: out, ...(warnings.length ? { warning: warnings.join('; ') } : {}) };
  };

  const [profile, recipes, favorites, follows, suggestions, notifications, termsAcceptance, writeWindows] = await Promise.all([
    exportSection('profile', async () => {
      const snap = await getDoc(doc(fs, 'profiles', uid));
      return { data: snap.exists() ? ({ uid: snap.id, ...exportFields(snap.data()) } as unknown as UserProfile) : null };
    }),
    exportSection<CloudDoc[]>('recipes', () => readMerged('recipes', [byField('recipes', 'createdBy.uid')])),
    exportSection<CloudFavorite[]>('favorites', () => readMerged('favorites', [byField('favorites', 'uid')]) as Promise<Section<CloudFavorite[]>>),
    exportSection<CloudFollow[]>('follows', () =>
      readMerged('follows', [byField('follows', 'followerId'), byField('follows', 'followingId')]) as Promise<Section<CloudFollow[]>>
    ),
    // Suggestions need a verified email under the rules; say so plainly instead of surfacing a denial.
    emailVerified ? exportSection<CloudSuggestion[]>('suggestions', readSuggestions, () => partialSuggestions) : Promise.resolve<Section<CloudSuggestion[]>>({ error: VERIFY_NOTE }),
    exportSection('notifications', () =>
      readMerged('notifications', [byField('notifications', 'recipientUid')]) as Promise<Section<AppNotification[]>>
    ),
    exportSection('termsAcceptance', async () => {
      const snap = await getDoc(doc(fs, 'termsAcceptance', uid));
      return { data: snap.exists() ? ({ id: snap.id, ...exportFields(snap.data()) } as CloudDoc) : null };
    }),
    // Ids are exact and a missing document reads as absent, never denied (RL-026).
    exportSection<CloudDoc[]>('writeWindows', async () => {
      const snaps = await Promise.all(
        (['suggestion', 'reply', 'notification', 'recipe'] as const).map((a) => getDoc(doc(fs, 'writeWindows', `${uid}_${a}`)))
      );
      return { data: snaps.filter((s) => s.exists()).map((s) => ({ id: s.id, ...exportFields(s.data()!) }) as CloudDoc) };
    }),
  ]);
  return { profile, recipes, favorites, follows, suggestions, notifications, termsAcceptance, writeWindows };
}
