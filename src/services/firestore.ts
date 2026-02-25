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
import type { Recipe } from '../types/recipe';
import type { SharedRecipe } from '../lib/share';
import type { Suggestion, AppNotification } from '../types/social';
import type { UserProfile, Follow } from '../types/profile';

// --- Recipes ---

export async function publishRecipe(recipe: Recipe): Promise<void> {
  if (!firestore) return;
  const { chatHistory, ...data } = recipe;
  await setDoc(doc(firestore, 'recipes', recipe.id), {
    ...data,
    collaborators: data.collaborators ?? [],
    favoriteCount: 0,
    viewCount: 0,
  });

  // Increment the creator's recipeCount on their profile
  if (recipe.createdBy.uid && recipe.createdBy.uid !== 'local') {
    updateDoc(doc(firestore, 'profiles', recipe.createdBy.uid), {
      recipeCount: increment(1),
    }).catch(() => {});
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

export async function deletePublishedRecipe(id: string): Promise<void> {
  if (!firestore) return;
  await deleteDoc(doc(firestore, 'recipes', id));
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

export async function removeCloudFavorite(
  uid: string,
  recipeId: string
): Promise<void> {
  if (!firestore) return;

  const batch = writeBatch(firestore);
  const favoriteId = `${uid}_${recipeId}`;

  batch.delete(doc(firestore, 'favorites', favoriteId));
  batch.update(doc(firestore, 'recipes', recipeId), {
    favoriteCount: increment(-1),
  });

  await batch.commit();
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

export async function updateSuggestionStatus(
  suggestionId: string,
  status: 'approved' | 'rejected'
): Promise<void> {
  if (!firestore) return;
  await updateDoc(doc(firestore, 'suggestions', suggestionId), { status });

  // When approved, add the suggester as a collaborator on the recipe
  if (status === 'approved') {
    const suggestionSnap = await getDoc(doc(firestore, 'suggestions', suggestionId));
    if (suggestionSnap.exists()) {
      const suggestion = suggestionSnap.data() as Suggestion;
      const collaborator = {
        uid: suggestion.suggestedBy.uid,
        displayName: suggestion.suggestedBy.displayName,
      };
      await updateDoc(doc(firestore, 'recipes', suggestion.recipeId), {
        collaborators: arrayUnion(collaborator),
      }).catch(() => {});
    }
  }
}

// --- Notifications ---

export function subscribeNotifications(
  uid: string,
  callback: (notifications: AppNotification[]) => void
): () => void {
  if (!firestore) return () => {};
  const q = query(
    collection(firestore, 'notifications'),
    where('recipientUid', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AppNotification)
    );
  });
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
