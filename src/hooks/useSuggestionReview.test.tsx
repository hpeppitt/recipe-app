// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { makeRecipe } from '../test/factories';
import { RateLimitedError, StaleSuggestionError, SuggestionClosedError } from '../lib/errors';
import type { Suggestion } from '../types/social';

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));

import { useSuggestionReview } from './useSuggestionReview';

const recipe = makeRecipe({ id: 'r1' });
const s1 = { id: 's1', recipeId: 'r1', status: 'pending' } as Suggestion;
const apply = vi.fn();
const keepAsBranch = vi.fn();
const reject = vi.fn();

const hook = () =>
  renderHook(() => useSuggestionReview(recipe, [s1], { apply, keepAsBranch, reject })).result;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('useSuggestionReview (RL-148)', () => {
  it('apply passes the suggestion and recipe and stays', async () => {
    apply.mockResolvedValue(undefined);
    const result = hook();
    await act(() => result.current.apply('s1'));
    expect(apply).toHaveBeenCalledWith(s1, recipe);
    expect(navigate).not.toHaveBeenCalled();
    expect(result.current.reviewError).toBeNull();
    expect(result.current.reviewingId).toBeNull();
  });

  it.each([
    ['a failure', new Error('denied'), "Couldn't apply that suggestion. Please try again."],
    ['stale edits', new StaleSuggestionError([0]), 'That recipe changed since the suggestion. Open it and edit by hand.'],
    ['a closed suggestion', new SuggestionClosedError(), 'This suggestion was already reviewed. Refresh to see it.'],
  ])('apply with %s shows its message', async (_label, err, message) => {
    apply.mockRejectedValue(err);
    const result = hook();
    await act(() => result.current.apply('s1'));
    expect(result.current.reviewError).toBe(message);
  });

  it('keepAsBranch opens the new branch as saved to the cloud', async () => {
    keepAsBranch.mockResolvedValue('b1');
    const result = hook();
    await act(() => result.current.keepAsBranch('s1'));
    expect(keepAsBranch).toHaveBeenCalledWith(s1, recipe);
    expect(navigate).toHaveBeenCalledWith('/recipe/b1', { state: { saved: 'cloud' } });
  });

  it.each([
    ['a failure', new Error('offline'), "Couldn't keep that as a branch. Please try again."],
    ['the recipe cap', new RateLimitedError('recipe'), "You've published a lot today. Try again tomorrow."],
    ['stale edits', new StaleSuggestionError([1]), 'That recipe changed since the suggestion. Open it and edit by hand.'],
    ['a closed suggestion', new SuggestionClosedError(), 'This suggestion was already reviewed. Refresh to see it.'],
  ])('keepAsBranch with %s shows its message and stays', async (_label, err, message) => {
    keepAsBranch.mockRejectedValue(err);
    const result = hook();
    await act(() => result.current.keepAsBranch('s1'));
    expect(result.current.reviewError).toBe(message);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('decline rejects by id and shows the decline error on failure', async () => {
    reject.mockRejectedValue(new Error('denied'));
    const result = hook();
    await act(() => result.current.decline('s1'));
    expect(reject).toHaveBeenCalledWith('s1');
    expect(result.current.reviewError).toBe("Couldn't decline that suggestion. Please try again.");
  });

  it('one review at a time: a second action while one is in flight is ignored', async () => {
    let finish!: () => void;
    apply.mockReturnValue(new Promise<void>((r) => (finish = r)));
    const result = hook();
    let first!: Promise<void>;
    act(() => {
      first = result.current.apply('s1');
    });
    expect(result.current.reviewingId).toBe('s1');
    await act(() => result.current.decline('s1'));
    expect(reject).not.toHaveBeenCalled();
    await act(async () => {
      finish();
      await first;
    });
    expect(result.current.reviewingId).toBeNull();
  });

  it('two taps in the same tick start only one review', async () => {
    apply.mockResolvedValue(undefined);
    const result = hook();
    await act(async () => {
      await Promise.all([result.current.apply('s1'), result.current.apply('s1')]);
    });
    expect(apply).toHaveBeenCalledOnce();
  });
});
