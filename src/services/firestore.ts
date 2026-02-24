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

// --- Recipes ---

export async function publishRecipe(recipe: Recipe): Promise<void> {
  if (!firestore) return;
  const { chatHistory, ...data } = recipe;
  await setDoc(doc(firestore, 'recipes', recipe.id), {
    ...data,
    collaborators: data.collaborators ?? [],
    favoriteCount: 0,
  });
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
