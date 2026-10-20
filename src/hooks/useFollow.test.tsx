// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuthContext, type AuthContextType } from '../contexts/AuthContext';
import { fakeUser } from '../test/renderWithProviders';

const isFollowing = vi.fn();
const followUser = vi.fn();
const unfollowUser = vi.fn();
const getFollowingIds = vi.fn();
const getFollowingProfiles = vi.fn();
vi.mock('../services/firestore', () => ({
  isFollowing: (...a: unknown[]) => isFollowing(...a),
  followUser: (...a: unknown[]) => followUser(...a),
  unfollowUser: (...a: unknown[]) => unfollowUser(...a),
  getFollowingIds: (...a: unknown[]) => getFollowingIds(...a),
  getFollowingProfiles: (...a: unknown[]) => getFollowingProfiles(...a),
  getFollowers: vi.fn(async () => []),
}));
vi.mock('../services/firebase', () => ({ isFirebaseConfigured: true }));
vi.mock('../services/analytics', () => ({ trackFollowToggled: vi.fn() }));
const reportError = vi.fn();
vi.mock('../services/telemetry', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));

import { useFollow, useFollowingList } from './useFollow';

const noop = async () => {};
const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthContext.Provider
    value={{
      user: fakeUser, isLoading: false, isConfigured: true, signInAnonymously: noop, sendEmailLink: noop,
      linkEmail: noop, signOut: noop, updateDisplayName: noop, linkState: { status: 'idle' },
      submitLinkEmail: noop, dismissLinkState: () => {},
    } as AuthContextType}
  >
    {children}
  </AuthContext.Provider>
);
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

beforeEach(() => {
  vi.clearAllMocks();
  isFollowing.mockResolvedValue(false);
});

describe('useFollow', () => {
  it('ignores a late response for the previous profile', async () => {
    const a = deferred<boolean>();
    isFollowing.mockImplementation((_u: string, t: string) => (t === 'A' ? a.promise : Promise.resolve(false)));
    const { result, rerender } = renderHook(({ id }) => useFollow(id), { wrapper, initialProps: { id: 'A' } });
    rerender({ id: 'B' });
    await waitFor(() => expect(isFollowing).toHaveBeenCalledWith(fakeUser.uid, 'B'));
    await act(async () => a.resolve(true));
    expect(result.current.isFollowing).toBe(false);
  });

  it('derives not following while the key changes, even after A resolved true', async () => {
    isFollowing.mockImplementation((_u: string, t: string) => Promise.resolve(t === 'A'));
    const b = deferred<boolean>();
    const { result, rerender } = renderHook(({ id }) => useFollow(id), { wrapper, initialProps: { id: 'A' } });
    await waitFor(() => expect(result.current.isFollowing).toBe(true));
    isFollowing.mockImplementation(() => b.promise);
    rerender({ id: 'B' });
    expect(result.current.isFollowing).toBe(false);
  });

  it('reports a lookup failure and settles as not following', async () => {
    isFollowing.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useFollow('A'), { wrapper });
    await waitFor(() => expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'follow-lookup'));
    expect(result.current.isFollowing).toBe(false);
    // A guess is not an answer, so a remembered follow (RL-136) does not act on it.
    expect(result.current.ready).toBe(false);
  });

  it('is ready once the lookup answers', async () => {
    const { result } = renderHook(() => useFollow('A'), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
  });

  it('keeps state and sets an error on a failed toggle, clearing it on the next toggle and on id change', async () => {
    const { result, rerender } = renderHook(({ id }) => useFollow(id), { wrapper, initialProps: { id: 'A' } });
    followUser.mockRejectedValueOnce(new Error('offline'));
    await act(() => result.current.toggleFollow());
    expect(result.current.isFollowing).toBe(false);
    expect(result.current.error).toMatch(/Couldn't update that/);
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'follow-toggle');

    followUser.mockResolvedValueOnce(undefined);
    await act(() => result.current.toggleFollow());
    expect(result.current.error).toBeNull();
    expect(result.current.isFollowing).toBe(true);

    unfollowUser.mockRejectedValueOnce(new Error('offline'));
    await act(() => result.current.toggleFollow());
    expect(result.current.isFollowing).toBe(true);
    expect(result.current.error).not.toBeNull();
    rerender({ id: 'B' });
    expect(result.current.error).toBeNull();
  });
});

describe('useFollowingList', () => {
  it('settles loading and reports when a read fails', async () => {
    getFollowingIds.mockRejectedValue(new Error('boom'));
    getFollowingProfiles.mockResolvedValue([]);
    const { result } = renderHook(() => useFollowingList(), { wrapper });
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'load-following');
  });
});

describe('useFollow toggle races and timeouts', () => {
  it('a toggle that resolves after the id changed does not overwrite the new id lookup', async () => {
    const w = deferred<void>();
    isFollowing.mockImplementation((_u: string, t: string) => Promise.resolve(t === 'B'));
    followUser.mockReturnValue(w.promise);
    const { result, rerender } = renderHook(({ id }) => useFollow(id), { wrapper, initialProps: { id: 'A' } });
    await waitFor(() => expect(isFollowing).toHaveBeenCalledWith(fakeUser.uid, 'A'));
    let p!: Promise<void>;
    act(() => { p = result.current.toggleFollow(); });
    rerender({ id: 'B' });
    await waitFor(() => expect(result.current.isFollowing).toBe(true));
    await act(async () => { w.resolve(); await p; });
    expect(result.current.isFollowing).toBe(true);
  });

  it('times out a write that never resolves, keeps state, sets the error and releases the guard', async () => {
    vi.useFakeTimers();
    try {
      followUser.mockReturnValue(new Promise(() => {}));
      const { result } = renderHook(() => useFollow('A'), { wrapper });
      let p!: Promise<void>;
      act(() => { p = result.current.toggleFollow(); });
      expect(result.current.loading).toBe(true);
      await act(async () => { await vi.advanceTimersByTimeAsync(5001); await p; });
      expect(result.current.loading).toBe(false);
      expect(result.current.isFollowing).toBe(false);
      expect(result.current.error).toMatch(/Couldn't update that/);
      expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'follow-toggle');

      followUser.mockResolvedValue(undefined);
      await act(() => result.current.toggleFollow());
      expect(result.current.isFollowing).toBe(true);
      expect(result.current.error).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('useFollowingList round trips', () => {
  it('reads the follows once and hands the ids to the profile fetch', async () => {
    getFollowingIds.mockResolvedValue(['u1', 'u2']);
    getFollowingProfiles.mockResolvedValue([{ uid: 'u1' }, { uid: 'u2' }]);
    const { result } = renderHook(() => useFollowingList(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getFollowingIds).toHaveBeenCalledTimes(1);
    expect(getFollowingProfiles).toHaveBeenCalledTimes(1);
    expect(getFollowingProfiles).toHaveBeenCalledWith(['u1', 'u2']);
    expect(result.current.followingIds).toEqual(['u1', 'u2']);
  });
});
