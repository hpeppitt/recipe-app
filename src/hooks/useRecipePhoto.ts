import { useCallback, useEffect, useState } from 'react';
import { isFirebaseConfigured } from '../services/firebase';
import { getRecipePhoto, type RecipePhoto } from '../services/firestore';
import { reportError } from '../services/telemetry';
import type { Cook } from '../types/social';

/**
 * The recipe's newest cook photo (RL-206), read once per visit and again after
 * `refresh` (a removal). `ready` holds the read until the cook summary has
 * answered, so the cook's name is usually found there instead of read again.
 * Loading, failure and no photo are all null: the emoji layout stays.
 */
export function useRecipePhoto(recipeId: string | undefined, knownCooks: Cook[], ready: boolean) {
  const [state, setState] = useState<{ recipeId: string; photo: RecipePhoto | null } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!recipeId || !ready || !isFirebaseConfigured) return;
    let cancelled = false;
    getRecipePhoto(recipeId, knownCooks).then(
      (photo) => !cancelled && setState({ recipeId, photo }),
      (err) => {
        reportError(err, 'recipe-photo');
        if (!cancelled) setState((prev) => (prev?.recipeId === recipeId ? prev : { recipeId, photo: null }));
      }
    );
    return () => {
      cancelled = true;
    };
    // knownCooks is read at the moment `ready` flips; a later summary refresh must not cost another read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeId, ready, attempt]);

  // A removal clears at once, so a failed re-read never shows the removed photo.
  const refresh = useCallback(() => {
    setState((prev) => (prev ? { ...prev, photo: null } : prev));
    setAttempt((n) => n + 1);
  }, []);
  return { photo: state && state.recipeId === recipeId ? state.photo : null, refresh };
}
