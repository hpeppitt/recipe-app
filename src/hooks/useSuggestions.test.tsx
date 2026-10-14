// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuthContext, type AuthContextType } from '../contexts/AuthContext';
import { fakeUser } from '../test/renderWithProviders';
import type { AppUser } from '../types/recipe';
import type { Suggestion } from '../types/social';

const subscribe = vi.fn();
vi.mock('../services/firestore', () => ({
  subscribeRecipeSuggestions: (...a: unknown[]) => subscribe(...a),
  subscribeSuggestionMessages: vi.fn(),
  addSuggestionMessage: vi.fn(),
  updateSuggestionStatus: vi.fn(),
  createSuggestion: vi.fn(),
}));

import { useSuggestions } from './useSuggestions';

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
    const { result } = renderHook(() => useSuggestions('r1'), { wrapper: wrapperFor(null) });
    expect(subscribe).not.toHaveBeenCalled();
    expect(result.current.suggestions).toEqual([]);
  });
});

describe('useSuggestions teardown and keying', () => {
  it('subscribes when signed in, tears down on sign-out, keys on uid:recipeId', () => {
    let deliver: (s: Suggestion[]) => void = () => {};
    const unsub = vi.fn();
    subscribe.mockReset();
    subscribe.mockImplementation((_id: string, cb: (s: Suggestion[]) => void) => {
      deliver = cb;
      return unsub;
    });
    let user: AppUser | null = fakeUser;
    const Wrapper = ({ children }: { children: ReactNode }) => {
      return <AuthContext.Provider value={authValue(user)}>{children}</AuthContext.Provider>;
    };
    const { result, rerender } = renderHook(() => useSuggestions('r1'), { wrapper: Wrapper });
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
