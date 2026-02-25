import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  subscribeRecipeSuggestions,
  updateSuggestionStatus,
  createSuggestion,
} from '../services/firestore';
import { trackSuggestionSubmitted, trackSuggestionReviewed } from '../services/analytics';
import type { Suggestion } from '../types/social';

export function useSuggestions(recipeId: string | undefined) {
  const { isConfigured } = useAuth();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  useEffect(() => {
    if (!isConfigured || !recipeId) return;
    return subscribeRecipeSuggestions(recipeId, setSuggestions);
  }, [isConfigured, recipeId]);

  const approve = useCallback(async (id: string) => {
    await updateSuggestionStatus(id, 'approved');
    trackSuggestionReviewed(id, 'approved');
  }, []);

  const reject = useCallback(async (id: string) => {
    await updateSuggestionStatus(id, 'rejected');
    trackSuggestionReviewed(id, 'rejected');
  }, []);

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
