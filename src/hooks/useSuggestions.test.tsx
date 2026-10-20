// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuthContext, type AuthContextType } from '../contexts/AuthContext';
import { fakeUser } from '../test/renderWithProviders';
import { makeRecipe } from '../test/factories';
import type { AppUser } from '../types/recipe';
import type { Suggestion } from '../types/social';

const subscribe = vi.fn();
const subscribeMessages = vi.fn();
const updateStatus = vi.fn();
const applySuggestion = vi.fn();
const keepSuggestionAsBranch = vi.fn();
const trackReviewed = vi.fn();
vi.mock('../services/firestore', () => ({
  subscribeRecipeSuggestions: (...a: unknown[]) => subscribe(...a),
  subscribeSuggestionMessages: (...a: unknown[]) => subscribeMessages(...a),
  addSuggestionMessage: vi.fn(),
  updateSuggestionStatus: (...a: unknown[]) => updateStatus(...a),
  applySuggestion: (...a: unknown[]) => applySuggestion(...a),
  keepSuggestionAsBranch: (...a: unknown[]) => keepSuggestionAsBranch(...a),
  createSuggestion: vi.fn(),
}));
vi.mock('../services/analytics', () => ({
  trackSuggestionSubmitted: vi.fn(),
  trackSuggestionReviewed: (...a: unknown[]) => trackReviewed(...a),
}));

import { useSuggestions, useSuggestionThread } from './useSuggestions';

const noop = async () => {};
function authValue(user: AppUser | null) {
  return {
    user, isLoading: false, isConfigured: true, signInAnonymously: noop, sendEmailLink: noop,
    linkEmail: noop, signOut: noop, updateDisplayName: noop, linkState: { status: 'idle' },
    submitLinkEmail: noop, dismissLinkState: () => {},
  } as AuthContextType;
}
function wrapperFor(user: AppUser | null) {
  const value = authValue(user);
  return ({ children }: { children: ReactNode }) => (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}
const item = { id: 's1' } as Suggestion;

describe('useSuggestions gating', () => {
  let unsub: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    subscribe.mockReset();
    unsub = vi.fn();
    subscribe.mockReturnValue(unsub);
  });

  it('does not subscribe while signed out', () => {
    const { result } = renderHook(() => useSuggestions('r1', 'owner-uid'), { wrapper: wrapperFor(null) });
    expect(subscribe).not.toHaveBeenCalled();
    expect(result.current.suggestions).toEqual([]);
  });

  it('does not subscribe for an anonymous or unverified account', () => {
    for (const user of [
      { ...fakeUser, isAnonymous: true, email: null, emailVerified: false },
      { ...fakeUser, emailVerified: false },
    ]) {
      const { result } = renderHook(() => useSuggestions('r1', 'owner-uid'), { wrapper: wrapperFor(user) });
      expect(result.current.suggestions).toEqual([]);
    }
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('waits for the recipe creator before choosing a query', () => {
    renderHook(() => useSuggestions('r1', undefined), { wrapper: wrapperFor(fakeUser) });
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('uses the owner query only when the viewer created the recipe', () => {
    renderHook(() => useSuggestions('r1', fakeUser.uid), { wrapper: wrapperFor(fakeUser) });
    renderHook(() => useSuggestions('r1', 'someone-else'), { wrapper: wrapperFor(fakeUser) });
    expect(subscribe.mock.calls.map((c) => c.slice(0, 3))).toEqual([
      ['r1', fakeUser.uid, true],
      ['r1', fakeUser.uid, false],
    ]);
  });
});

describe('useSuggestionThread gating', () => {
  beforeEach(() => {
    subscribeMessages.mockReset();
    subscribeMessages.mockReturnValue(() => {});
  });

  it('subscribes for a verified user and not for an unverified one', () => {
    renderHook(() => useSuggestionThread(item), {
      wrapper: wrapperFor({ ...fakeUser, isAnonymous: true, emailVerified: false }),
    });
    renderHook(() => useSuggestionThread(item), { wrapper: wrapperFor(null) });
    expect(subscribeMessages).not.toHaveBeenCalled();

    const { result } = renderHook(() => useSuggestionThread(item), { wrapper: wrapperFor(fakeUser) });
    expect(subscribeMessages).toHaveBeenCalledTimes(1);
    expect(subscribeMessages.mock.calls[0][0]).toBe('s1');
    expect(result.current.error).toBeNull();
  });
});

describe('useSuggestions teardown and keying', () => {
  it('subscribes when signed in, tears down on sign-out, keys on uid:recipeId', () => {
    let deliver: (s: Suggestion[]) => void = () => {};
    const unsub = vi.fn();
    subscribe.mockReset();
    subscribe.mockImplementation((_id: string, _uid: string, _owner: boolean, cb: (s: Suggestion[]) => void) => {
      deliver = cb;
      return unsub;
    });
    let user: AppUser | null = fakeUser;
    const Wrapper = ({ children }: { children: ReactNode }) => {
      return <AuthContext.Provider value={authValue(user)}>{children}</AuthContext.Provider>;
    };
    const { result, rerender } = renderHook(() => useSuggestions('r1', 'owner-uid'), { wrapper: Wrapper });
    expect(subscribe).toHaveBeenCalledTimes(1);
    act(() => deliver([item]));
    expect(result.current.suggestions).toEqual([item]);

    user = null;
    rerender();
    expect(unsub).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(result.current.suggestions).toEqual([]);

    // A different account on the same recipe must not inherit the first one's list.
    user = { ...fakeUser, uid: 'other' };
    rerender();
    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(result.current.suggestions).toEqual([]);
  });
});

describe('useSuggestions review actions (RL-148)', () => {
  const s1 = { id: 's1' } as Suggestion;
  const recipe = makeRecipe({ id: 'r1' });
  const reviewer = { uid: fakeUser.uid, displayName: fakeUser.displayName };
  beforeEach(() => {
    subscribe.mockReset();
    subscribe.mockReturnValue(() => {});
    applySuggestion.mockReset();
    keepSuggestionAsBranch.mockReset();
    updateStatus.mockReset();
    trackReviewed.mockClear();
  });
  const hook = () => renderHook(() => useSuggestions('r1', 'owner-uid'), { wrapper: wrapperFor(fakeUser) }).result;

  it('apply passes the reviewer and records applied', async () => {
    applySuggestion.mockResolvedValue(undefined);
    await hook().current.apply(s1, recipe);
    expect(applySuggestion).toHaveBeenCalledWith(s1, recipe, reviewer);
    expect(trackReviewed).toHaveBeenCalledWith('s1', 'applied');
  });

  it('keepAsBranch returns the branch id and records branched', async () => {
    keepSuggestionAsBranch.mockResolvedValue('b1');
    await expect(hook().current.keepAsBranch(s1, recipe)).resolves.toBe('b1');
    expect(keepSuggestionAsBranch).toHaveBeenCalledWith(s1, recipe, reviewer);
    expect(trackReviewed).toHaveBeenCalledWith('s1', 'branched');
  });

  it('reject declines and records rejected', async () => {
    await hook().current.reject('s1');
    expect(updateStatus).toHaveBeenCalledWith('s1', 'rejected', reviewer);
    expect(trackReviewed).toHaveBeenCalledWith('s1', 'rejected');
  });

  it('records nothing when the write throws', async () => {
    applySuggestion.mockRejectedValue(new Error('permission-denied'));
    await expect(hook().current.apply(s1, recipe)).rejects.toThrow('permission-denied');
    expect(trackReviewed).not.toHaveBeenCalled();
  });
});
