import { useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { isFirebaseConfigured } from '../services/firebase';
import { subscribeOwnRecipes } from '../services/firestore';
import { getPreviousUids } from '../services/storage';
import { reportError } from '../services/telemetry';
import { applyOwnRecipeSync } from '../db/recipes';

/** `off`: no listener. `waiting`: listening, nothing applied yet. `synced`: a server snapshot applied. */
export type OwnRecipesSyncStatus = 'off' | 'waiting' | 'synced' | 'error';

let status: OwnRecipesSyncStatus = 'off';
let listenerErrorReported = false;
const listeners = new Set<() => void>();

function setStatus(next: OwnRecipesSyncStatus) {
  if (next === status) return;
  status = next;
  listeners.forEach((l) => l());
}

function onStatusChange(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Keeps Dexie in step with a verified user's own Firestore recipes (RL-078, decision 1b).
 * Mount once. Read-only towards Firestore; Firestore resumes the listener after a network loss.
 */
export function useOwnRecipesSync(): void {
  const { user, isLoading } = useAuth();
  const uid =
    isFirebaseConfigured && !isLoading && user && !user.isAnonymous && user.emailVerified
      ? user.uid
      : null;

  useEffect(() => {
    if (!uid) {
      setStatus('off');
      return;
    }
    let active = true;
    setStatus('waiting');
    const unsubscribe = subscribeOwnRecipes(
      uid,
      (docs) => {
        if (!active) return;
        applyOwnRecipeSync(uid, docs, getPreviousUids()).then(
          () => {
            if (active) setStatus('synced');
          },
          (err) => {
            console.error('Applying own recipes to this device failed', err);
            reportError(err, 'recipe-sync-local');
          }
        );
      },
      (err) => {
        console.error('Own recipes listener failed', err);
        if (!listenerErrorReported) {
          listenerErrorReported = true;
          reportError(err, 'recipe-sync');
        }
        if (active) setStatus('error');
      }
    );
    return () => {
      active = false;
      unsubscribe();
      setStatus('off');
    };
  }, [uid]);
}

/** The sync's state for the UI (RL-079). */
export function useOwnRecipesSyncStatus(): OwnRecipesSyncStatus {
  return useSyncExternalStore(onStatusChange, () => status);
}
