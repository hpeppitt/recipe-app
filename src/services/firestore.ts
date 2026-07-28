import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  increment,
  writeBatch,
} from 'firebase/firestore';
import { firestore } from './firebase';
import { arrayUnion } from 'firebase/firestore';
import { rankByQuery, recipeHaystack, variationHaystack } from '../lib/search';
import { collectSubtreeIds } from '../lib/tree';
import type { Recipe, Collaborator } from '../types/recipe';
import type { SharedRecipe } from '../lib/share';
import type { Suggestion, AppNotification } from '../types/social';
import type { UserProfile, Follow } from '../types/profile';

// --- Recipes ---

/**
 * Publish (or re-publish) a recipe to the shared library.
 *
 * Distinguishes create from update, which the previous unconditional `setDoc`
 * did not. On a re-publish it must NOT write `favoriteCount`/`viewCount`: those
 * belong to other people's favourites and views, and resetting them to 0 silently
 * destroys that data. The profile `recipeCount` is likewise only bumped on first
 * publish, or a retry would inflate it.
 */
export async function publishRecipe(recipe: Recipe): Promise<void> {
  if (!firestore) return;

  const { chatHistory, ...data } = recipe;
  const ref = doc(firestore, 'recipes', recipe.id);
  const content = { ...data, collaborators: data.collaborators ?? [] };

  const existing = await getDoc(ref);
  if (existing.exists()) {
    await setDoc(ref, content, { merge: true });
    return;
  }

  // Rules require both counters present and zero on create.
  await setDoc(ref, { ...content, favoriteCount: 0, viewCount: 0 });

  // Increment the creator's recipeCount on their profile
  if (recipe.createdBy.uid && recipe.createdBy.uid !== 'local') {
    updateDoc(doc(firestore, 'profiles', recipe.createdBy.uid), {
      recipeCount: increment(1),
    }).catch((err) => {
      console.error('Incrementing profile recipeCount failed', err);
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

export async function getAllPublishedRecipes(): Promise<PublishedRecipe[]> {
  if (!firestore) return [];
  const q = query(
    collection(firestore, 'recipes'),
    orderBy('createdAt', 'desc'),
    limit(200)
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
 */
export async function deletePublishedRecipeTree(
  id: string,
  rootId: string,
  extraIds: string[] = []
): Promise<{ deleted: number; failed: number }> {
  if (!firestore) return { deleted: 0, failed: 0 };

  let subtreeIds: string[];
  try {
    const snap = await getDocs(
      query(collection(firestore, 'recipes'), where('rootId', '==', rootId))
    );
    const nodes = snap.docs.map((d) => ({
      id: d.id,
      parentId: (d.data().parentId as string | null) ?? null,
    }));
    subtreeIds = collectSubtreeIds(nodes, id);
  } catch {
    // Tree query failed — still make a best effort on what the caller knows.
    subtreeIds = [id];
  }

  const targets = [...new Set([...subtreeIds, ...extraIds])];
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
    addDoc(collection(firestore, 'notifications'), {
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
    }).catch(() => {});
  }
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
  const snap = await getDoc(doc(firestore, 'favorites', `${uid}_${recipeId}`));
  return snap.exists();
}

// --- Suggestions ---

export async function createSuggestion(params: {
  recipeId: string;
  recipeOwnerId: string;
  recipeTitle: string;
  recipeEmoji: string;
  suggestedBy: { uid: string; displayName: string | null };
  message: string;
}): Promise<void> {
  if (!firestore) return;

  await addDoc(collection(firestore, 'suggestions'), {
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
    addDoc(collection(firestore, 'notifications'), {
      recipientUid: params.recipeOwnerId,
      type: 'suggestion',
      recipeId: params.recipeId,
      recipeTitle: params.recipeTitle,
      recipeEmoji: params.recipeEmoji,
      fromUid: params.suggestedBy.uid,
      fromDisplayName: params.suggestedBy.displayName,
      message: params.message,
      read: false,
      createdAt: Date.now(),
    }).catch(() => {});
  }
}

export function subscribeRecipeSuggestions(
  recipeId: string,
  callback: (suggestions: Suggestion[]) => void
): () => void {
  if (!firestore) return () => {};
  const q = query(
    collection(firestore, 'suggestions'),
    where('recipeId', '==', recipeId),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Suggestion)
    );
  });
}

/**
 * Approve or reject a suggestion.
 *
 * Returns the collaborator added on approval so the caller can mirror it onto
 * the local Dexie copy — the owner's UI reads that copy first, so a cloud-only
 * write left them unable to see the collaborator they just approved (FUN-7).
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

  await updateDoc(doc(firestore, 'suggestions', suggestionId), { status });

  // Close the loop back to the suggester. Fire-and-forget like the other
  // notification writes, so a failure here never blocks the review itself.
  if (reviewer && reviewer.uid !== suggestion.suggestedBy.uid) {
    addDoc(collection(firestore, 'notifications'), {
      recipientUid: suggestion.suggestedBy.uid,
      type: status === 'approved' ? 'suggestion_approved' : 'suggestion_rejected',
      recipeId: suggestion.recipeId,
      recipeTitle: suggestion.recipeTitle,
      recipeEmoji: suggestion.recipeEmoji ?? '🍽️',
      fromUid: reviewer.uid,
      fromDisplayName: reviewer.displayName,
      // Echo the original suggestion so the notification is self-explanatory
      // weeks later, rather than "your suggestion was approved" with no context.
      message: suggestion.message,
      read: false,
      createdAt: Date.now(),
    }).catch(() => {});
  }

  if (status !== 'approved') return null;

  // When approved, add the suggester as a collaborator on the recipe
  const collaborator: Collaborator = {
    uid: suggestion.suggestedBy.uid,
    displayName: suggestion.suggestedBy.displayName,
  };

  try {
    await updateDoc(doc(firestore, 'recipes', suggestion.recipeId), {
      collaborators: arrayUnion(collaborator),
    });
  } catch (err) {
    // Don't mirror locally if the cloud write was rejected, or the two stores
    // would disagree about who collaborated.
    console.error('Adding collaborator to the published recipe failed', err);
    return null;
  }

  return { recipeId: suggestion.recipeId, collaborator };
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

export async function markAllNotificationsRead(uid: string): Promise<void> {
  if (!firestore) return;
  const q = query(
    collection(firestore, 'notifications'),
    where('recipientUid', '==', uid),
    where('read', '==', false)
  );
  const snap = await getDocs(q);
  const batch = writeBatch(firestore);
  snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
  await batch.commit();
}

// --- Profiles ---

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
  addDoc(collection(firestore, 'notifications'), {
    recipientUid: followingId,
    type: 'follow',
    fromUid: followerId,
    fromDisplayName: followerDisplayName,
    message: null,
    read: false,
    createdAt: Date.now(),
  }).catch(() => {});
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
  const snap = await getDoc(doc(firestore, 'follows', `${followerId}_${followingId}`));
  return snap.exists();
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

export async function getFollowingProfiles(uid: string): Promise<UserProfile[]> {
  if (!firestore) return [];
  const ids = await getFollowingIds(uid);
  if (ids.length === 0) return [];
  const profiles: UserProfile[] = [];
  for (const id of ids) {
    const p = await getProfile(id);
    if (p) profiles.push(p);
  }
  return profiles;
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

export async function getRecipeStats(recipeIds: string[]): Promise<Map<string, { viewCount: number; favoriteCount: number }>> {
  const statsMap = new Map<string, { viewCount: number; favoriteCount: number }>();
  if (!firestore || recipeIds.length === 0) return statsMap;
  // Fetch each recipe doc for its stats
  const results = await Promise.allSettled(
    recipeIds.map((id) => getDoc(doc(firestore!, 'recipes', id)))
  );
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.exists()) {
      const data = result.value.data();
      statsMap.set(result.value.id, {
        viewCount: data.viewCount || 0,
        favoriteCount: data.favoriteCount || 0,
      });
    }
  }
  return statsMap;
}

// --- UID Migration ---

export async function migrateFirestoreUid(
  oldUid: string,
  newUid: string,
  displayName: string | null
): Promise<void> {
  if (!firestore) return;

  // Migrate recipes (update createdBy.uid)
  const recipesQ = query(
    collection(firestore, 'recipes'),
    where('createdBy.uid', '==', oldUid)
  );
  const recipesSnap = await getDocs(recipesQ);
  // Firestore batches limited to 500
  const recipeDocs = recipesSnap.docs;
  for (let i = 0; i < recipeDocs.length; i += 500) {
    const batch = writeBatch(firestore);
    for (const d of recipeDocs.slice(i, i + 500)) {
      batch.update(d.ref, { 'createdBy.uid': newUid, 'createdBy.displayName': displayName });
    }
    await batch.commit();
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
