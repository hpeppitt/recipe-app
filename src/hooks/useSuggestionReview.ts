import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { rateLimitMessage, StaleSuggestionError, SuggestionClosedError } from '../lib/errors';
import type { Recipe } from '../types/recipe';
import type { Suggestion } from '../types/social';

export const APPLY_ERROR = "Couldn't apply that suggestion. Please try again.";
export const STALE_ERROR = 'That recipe changed since the suggestion. Open it and edit by hand.';
export const BRANCH_ERROR = "Couldn't keep that as a branch. Please try again.";
export const CLOSED_ERROR = 'This suggestion was already reviewed. Refresh to see it.';
export const DECLINE_ERROR = "Couldn't decline that suggestion. Please try again.";

const reviewMessage = (err: unknown) =>
  err instanceof StaleSuggestionError ? STALE_ERROR : err instanceof SuggestionClosedError ? CLOSED_ERROR : null;

interface ReviewActions {
  apply: (suggestion: Suggestion, recipe: Recipe) => Promise<void>;
  keepAsBranch: (suggestion: Suggestion, recipe: Recipe) => Promise<string>;
  reject: (id: string) => Promise<void>;
}

/**
 * Apply, keep as branch or decline one suggestion (RL-148), shared by the
 * recipe page and the thread page (RL-106) so both behave the same. The
 * actions come from `useSuggestions`. Apply stays on the page, which shows the
 * edited recipe from the cached write; Keep as branch opens the new branch.
 */
export function useSuggestionReview(
  recipe: Recipe | null | undefined,
  suggestions: Suggestion[],
  actions: ReviewActions
) {
  const navigate = useNavigate();
  // Which suggestion is mid-review. Every review button disables while one is
  // in flight: a slow link previously allowed a double-tap, or applying one
  // suggestion while declining another.
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  // State updates are async, so two taps in one tick both see reviewingId null; the ref does not.
  const inFlight = useRef(false);

  const run = async (id: string, what: string, action: () => Promise<void>, errorFor: (err: unknown) => string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setReviewingId(id);
    setReviewError(null);
    try {
      await action();
    } catch (err) {
      console.error(`Reviewing the suggestion (${what}) failed`, err);
      setReviewError(errorFor(err));
    } finally {
      inFlight.current = false;
      setReviewingId(null);
    }
  };

  const loaded = (id: string) => {
    const suggestion = suggestions.find((s) => s.id === id);
    if (!suggestion || !recipe) throw new Error('The suggestion or its recipe is not loaded');
    return [suggestion, recipe] as const;
  };

  const apply = (id: string) =>
    run(
      id,
      'apply',
      () => actions.apply(...loaded(id)),
      (err) => reviewMessage(err) ?? APPLY_ERROR
    );

  const keepAsBranch = (id: string) =>
    run(
      id,
      'branch',
      async () => {
        const branchId = await actions.keepAsBranch(...loaded(id));
        navigate(`/recipe/${branchId}`, { state: { saved: 'cloud' } });
      },
      (err) => rateLimitMessage(err) ?? reviewMessage(err) ?? BRANCH_ERROR
    );

  const decline = (id: string) => run(id, 'decline', () => actions.reject(id), () => DECLINE_ERROR);

  return { reviewingId, reviewError, apply, keepAsBranch, decline };
}
