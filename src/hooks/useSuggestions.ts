import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  subscribeRecipeSuggestions,
  subscribeSuggestionMessages,
  addSuggestionMessage,
  updateSuggestionStatus,
  createSuggestion,
} from '../services/firestore';
import { addLocalCollaborator } from '../db/recipes';
import { trackSuggestionSubmitted, trackSuggestionReviewed } from '../services/analytics';
import type { Suggestion, SuggestionMessage } from '../types/social';

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

/**
 * Live reply thread for one suggestion, plus a send.
 *
 * Keyed on the suggestion id: the message list is cleared when the id changes so
 * a slow subscription cannot deliver one thread's replies under another's
 * heading, which is the same trap `useRecipe` guards against for cloud recipes.
 */
export function useSuggestionThread(suggestion: Suggestion | null) {
  const { isConfigured, user } = useAuth();
  // Stamped with the id it belongs to, then derived below. Clearing state inside
  // the effect instead is a cascading-render antipattern the linter rejects, and
  // it leaves a window where one thread's replies render under another's id.
  const [thread, setThread] = useState<{
    id: string;
    messages: SuggestionMessage[];
    error: string | null;
  }>({ id: '', messages: [], error: null });
  const suggestionId = suggestion?.id;

  useEffect(() => {
    if (!isConfigured || !suggestionId) return;
    return subscribeSuggestionMessages(
      suggestionId,
      (messages) => setThread({ id: suggestionId, messages, error: null }),
      () =>
        // Most likely cause is the rules not being deployed yet, which is silent
        // otherwise: an empty thread and a working-looking input.
        setThread({ id: suggestionId, messages: [], error: "Couldn't load replies." })
    );
  }, [isConfigured, suggestionId]);

  // A result for a different suggestion is not this one's answer.
  const messages = thread.id === suggestionId ? thread.messages : [];
  const error = thread.id === suggestionId ? thread.error : null;

  const send = useCallback(
    async (text: string) => {
      if (!user || !suggestion) return;
      await addSuggestionMessage(
        suggestion,
        { uid: user.uid, displayName: user.displayName },
        text
      );
    },
    [suggestion, user]
  );

  return { messages, error, send };
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
      // Throw rather than return. A silent resolve reads as success to every
      // caller: SuggestChangeModal would show "Suggestion sent" for a write
      // that never happened. No UI reaches this today, since both callers gate
      // on sign-in and then on sign-up, so this is about what the next caller
      // inherits. Reaching this line is a bug, and a bug should be loud.
      if (!user) throw new Error('Cannot suggest a change while signed out');
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
