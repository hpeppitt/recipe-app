import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Approve or decline one suggestion, shared by the recipe page and the thread
 * page (RL-106) so both behave the same. `approve` and `reject` come from
 * `useSuggestions`. Approving carries the owner into the variation composer
 * with the suggestion prefilled (RL-017).
 */
export function useSuggestionReview(
  recipeId: string | undefined,
  approve: (id: string) => Promise<unknown>,
  reject: (id: string) => Promise<void>
) {
  const navigate = useNavigate();
  // Which suggestion is mid-review. Every review button disables while one is
  // in flight: a slow link previously allowed a double-tap, or approving one
  // suggestion while declining another.
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const review = async (suggestionId: string, action: 'approve' | 'reject', message: string) => {
    if (reviewingId) return;
    setReviewingId(suggestionId);
    setReviewError(null);
    try {
      if (action === 'approve') {
        // null means nothing was approved (no Firestore, or the suggestion is
        // gone), so it is a failure, not a reason to open the variation flow.
        if (!(await approve(suggestionId))) throw new Error('Approval returned no collaborator');
        navigate(`/recipe/${recipeId}/vary`, { state: { suggestion: message } });
        return;
      }
      await reject(suggestionId);
    } catch (err) {
      console.error(`Reviewing the suggestion (${action}) failed`, err);
      setReviewError(
        action === 'approve'
          ? "Couldn't approve that suggestion. Please try again."
          : "Couldn't decline that suggestion. Please try again."
      );
    } finally {
      // Left set on the approve path only if navigation did not happen; the
      // early return above means a successful approve unmounts the page anyway.
      setReviewingId(null);
    }
  };

  return { reviewingId, reviewError, review };
}
