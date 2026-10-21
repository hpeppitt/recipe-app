// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuthContext, type AuthContextType } from '../contexts/AuthContext';
import { fakeUser } from '../test/renderWithProviders';

const listCookbookFollows = vi.fn();
const readFollowedCookbook = vi.fn();
const getProfile = vi.fn(async (..._a: unknown[]) => ({ displayName: 'Ann' }));
const markCookbookSeen = vi.fn(async (..._a: unknown[]) => {});
vi.mock('../services/firestore', () => ({
  listCookbookFollows: (...a: unknown[]) => listCookbookFollows(...a),
  readFollowedCookbook: (...a: unknown[]) => readFollowedCookbook(...a),
  markCookbookSeen: (...a: unknown[]) => markCookbookSeen(...a),
  getProfile: (...a: unknown[]) => getProfile(...a),
}));
vi.mock('../services/telemetry', () => ({ reportError: vi.fn() }));

import { useCookbookUpdates, resetCookbookUpdates } from './useCookbookUpdates';

const noop = async () => {};
const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthContext.Provider
    value={{ user: fakeUser, isLoading: false, isConfigured: true, signInAnonymously: noop, sendEmailLink: noop, linkEmail: noop, signOut: noop, updateDisplayName: noop, linkState: { status: 'idle' }, submitLinkEmail: noop, dismissLinkState: () => {} } as AuthContextType}
  >
    {children}
  </AuthContext.Provider>
);

beforeEach(() => {
  resetCookbookUpdates();
  listCookbookFollows.mockReset();
  readFollowedCookbook.mockReset();
  markCookbookSeen.mockClear();
  getProfile.mockClear();
  listCookbookFollows.mockResolvedValue([
    { collectionId: 'new', lastSeenAt: 100 },
    { collectionId: 'old', lastSeenAt: 500 },
    { collectionId: 'gone', lastSeenAt: 100 },
  ]);
  readFollowedCookbook.mockImplementation(async (id: string) =>
    id === 'new' ? { name: 'Soups', ownerUid: 'ann', lastAddedAt: 300 } : id === 'old' ? { name: 'Old', ownerUid: 'ann', lastAddedAt: 200 } : null
  );
});

describe('useCookbookUpdates', () => {
  it('returns only cookbooks added to since last seen, skipping private or deleted ones, and reads once with a limit', async () => {
    const { result } = renderHook(() => useCookbookUpdates(true), { wrapper });
    await waitFor(() => expect(result.current.updates).toHaveLength(1));
    expect(result.current.updates[0]).toMatchObject({ collectionId: 'new', name: 'Soups', ownerName: 'Ann', lastAddedAt: 300 });
    expect(listCookbookFollows).toHaveBeenCalledWith('test-user', 30);
    expect(readFollowedCookbook).toHaveBeenCalledTimes(3);
  });

  it('reuses the session result for the badge, and never caches an empty one', async () => {
    const first = renderHook(() => useCookbookUpdates(), { wrapper });
    await waitFor(() => expect(first.result.current.updates).toHaveLength(1));
    renderHook(() => useCookbookUpdates(), { wrapper });
    expect(listCookbookFollows).toHaveBeenCalledTimes(1);

    resetCookbookUpdates();
    listCookbookFollows.mockClear();
    listCookbookFollows.mockResolvedValue([]);
    const empty = renderHook(() => useCookbookUpdates(), { wrapper });
    await waitFor(() => expect(empty.result.current.loading).toBe(false));
    empty.unmount();
    renderHook(() => useCookbookUpdates(), { wrapper });
    await Promise.resolve();
    expect(listCookbookFollows).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed load: it reports an error and the next mount reads again', async () => {
    readFollowedCookbook.mockRejectedValue(new Error('unavailable'));
    const first = renderHook(() => useCookbookUpdates(), { wrapper });
    await waitFor(() => expect(first.result.current.error).toBe(true));
    expect(first.result.current.loading).toBe(false);
    first.unmount();
    readFollowedCookbook.mockResolvedValue({ name: 'Soups', ownerUid: 'ann', lastAddedAt: 300 });
    const second = renderHook(() => useCookbookUpdates(), { wrapper });
    await waitFor(() => expect(second.result.current.updates.length).toBeGreaterThan(0));
    expect(second.result.current.error).toBe(false);
  });

  it('skips your own cookbooks and reads each owner profile once', async () => {
    listCookbookFollows.mockResolvedValue([
      { collectionId: 'mine', lastSeenAt: 1 },
      { collectionId: 'x', lastSeenAt: 1 },
      { collectionId: 'y', lastSeenAt: 1 },
    ]);
    readFollowedCookbook.mockImplementation(async (id: string) => ({ name: id, ownerUid: id === 'mine' ? 'test-user' : 'ann', lastAddedAt: 300 }));
    const { result } = renderHook(() => useCookbookUpdates(true), { wrapper });
    await waitFor(() => expect(result.current.updates).toHaveLength(2));
    expect(result.current.updates.map((r) => r.collectionId).sort()).toEqual(['x', 'y']);
    expect(getProfile).toHaveBeenCalledTimes(1);
  });

  it('marking seen drops the row at once and writes lastSeenAt', async () => {
    const { result } = renderHook(() => useCookbookUpdates(true), { wrapper });
    await waitFor(() => expect(result.current.updates).toHaveLength(1));
    act(() => result.current.markSeen('new'));
    expect(result.current.updates).toHaveLength(0);
    expect(markCookbookSeen).toHaveBeenCalledWith('test-user', 'new');
  });

  it('reads nothing for an unverified user', async () => {
    const unverified = ({ children }: { children: ReactNode }) => (
      <AuthContext.Provider value={{ user: { ...fakeUser, emailVerified: false }, isConfigured: true } as AuthContextType}>{children}</AuthContext.Provider>
    );
    renderHook(() => useCookbookUpdates(true), { wrapper: unverified });
    await Promise.resolve();
    expect(listCookbookFollows).not.toHaveBeenCalled();
  });
});
