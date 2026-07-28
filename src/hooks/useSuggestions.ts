import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  subscribeRecipeSuggestions,
  updateSuggestionStatus,
  createSuggestion,
} from '../services/firestore';
import { addLocalCollaborator } from '../db/recipes';
import { trackSuggestionSubmitted, trackSuggestionReviewed } from '../services/analytics';
import type { Suggestion } from '../types/social';

export function useSuggestions(recipeId: string | undefined) {
  const { isConfigured, user } = useAuth();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  useEffect(() => {
    if (!isConfigured || !recipeId) return;
    return subscribeRecipeSuggestions(recipeId, setSuggestions);
  }, [isConfigured, recipeId]);

  // The reviewer is passed through so the suggester can be told the outcome;
  // Firestore rules require the notification's fromUid to be the writer.
  // Memoised because a fresh object each render would invalidate both callbacks.
  const reviewer = useMemo(
    () => (user ? { uid: user.uid, displayName: user.displayName } : undefined),
    [user]
  );

  const approve = useCallback(async (id: string) => {
    const approved = await updateSuggestionStatus(id, 'approved', reviewer);
    // Dual-write, as with favourites: the owner's UI reads the local copy first,
    // so a cloud-only collaborator would be invisible on their own device.
    if (approved) {
      await addLocalCollaborator(approved.recipeId, approved.collaborator);
    }
    trackSuggestionReviewed(id, 'approved');
    return approved;
  }, [reviewer]);

  const reject = useCallback(async (id: string) => {
    await updateSuggestionStatus(id, 'rejected', reviewer);
    trackSuggestionReviewed(id, 'rejected');
  }, [reviewer]);

  return { suggestions, approve, reject };
}

export function useSubmitSuggestion() {
  const { user } = useAuth();

  const submit = useCallback(
    async (params: {
      recipeId: string;
      recipeOwnerId: string;
      recipeTitle: string;
      recipeEmoji: string;
      message: string;
    }) => {
      if (!user) return;
      await createSuggestion({
        ...params,
        suggestedBy: {
          uid: user.uid,
          displayName: user.displayName,
        },
      });
      trackSuggestionSubmitted(params.recipeId);
    },
    [user]
  );

  return { submit };
}
