// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuthContext, type AuthContextType } from '../contexts/AuthContext';
import { fakeUser } from '../test/renderWithProviders';

let prefsCb: (p: unknown) => void = () => {};
let prefsErr: () => void = () => {};
let notifCb: (n: unknown[]) => void = () => {};
const subscribePrefs = vi.fn((_uid: string, cb: (p: unknown) => void, err: () => void) => ((prefsCb = cb), (prefsErr = err), () => {}));
const setPrefs = vi.fn(async (..._a: unknown[]) => {});
vi.mock('../services/firestore', () => ({
  subscribeNotificationPrefs: (uid: string, cb: (p: unknown) => void, err: () => void) => subscribePrefs(uid, cb, err),
  setNotificationPrefs: (...a: unknown[]) => setPrefs(...a),
  subscribeNotifications: (_u: string, cb: (n: unknown[]) => void) => ((notifCb = cb), () => {}),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));

import { useNotificationPrefs } from './useNotificationPrefs';
import { useNotifications } from './useNotifications';

const noop = async () => {};
const wrap = (user: typeof fakeUser | null) =>
  ({ children }: { children: ReactNode }) => (
    <AuthContext.Provider
      value={{ user, isLoading: false, isConfigured: true, signInAnonymously: noop, sendEmailLink: noop, linkEmail: noop, signOut: noop, updateDisplayName: noop, linkState: { status: 'idle' }, submitLinkEmail: noop, dismissLinkState: () => {} } as AuthContextType}
    >
      {children}
    </AuthContext.Provider>
  );

beforeEach(() => vi.clearAllMocks());

describe('useNotificationPrefs', () => {
  it('does not subscribe for an unverified user', () => {
    renderHook(() => useNotificationPrefs(), { wrapper: wrap({ ...fakeUser, emailVerified: false }) });
    expect(subscribePrefs).not.toHaveBeenCalled();
  });

  it('defaults all on, then follows the document', async () => {
    const { result } = renderHook(() => useNotificationPrefs(), { wrapper: wrap(fakeUser) });
    expect(result.current.prefs).toEqual({ branch: true, suggestion: true, follow: true });
    act(() => prefsCb({ branch: false, suggestion: true, follow: true }));
    expect(result.current.prefs.branch).toBe(false);
  });

  it('ignores taps until the first snapshot, then writes', async () => {
    const { result } = renderHook(() => useNotificationPrefs(), { wrapper: wrap(fakeUser) });
    expect(result.current.loaded).toBe(false);
    await act(async () => result.current.setPref('follow', false));
    expect(setPrefs).not.toHaveBeenCalled();
    act(() => prefsCb({ branch: false, suggestion: true, follow: true }));
    expect(result.current.loaded).toBe(true);
    await act(async () => result.current.setPref('follow', false));
    expect(setPrefs).toHaveBeenCalledWith(fakeUser.uid, { branch: false, suggestion: true, follow: false });
  });

  it('counts a failed read as loaded but refuses writes over the stored document', async () => {
    const { result } = renderHook(() => useNotificationPrefs(), { wrapper: wrap(fakeUser) });
    act(() => prefsErr());
    expect(result.current.loaded).toBe(true);
    expect(result.current.readFailed).toBe(true);
    await act(async () => result.current.setPref('follow', false));
    expect(setPrefs).not.toHaveBeenCalled();
  });

  it('reverts only the failed key and names it', async () => {
    const { result } = renderHook(() => useNotificationPrefs(), { wrapper: wrap(fakeUser) });
    act(() => prefsCb({ branch: true, suggestion: true, follow: true }));
    setPrefs.mockRejectedValueOnce(new Error('denied'));
    await act(async () => result.current.setPref('follow', false));
    expect(result.current.prefs.follow).toBe(true);
    expect(result.current.failedKey).toBe('follow');
    await act(async () => result.current.setPref('follow', false));
    expect(result.current.prefs.follow).toBe(false);
    expect(result.current.failedKey).toBeNull();
  });

  it('serialises writes: nothing else is written while one is pending', async () => {
    let release!: () => void;
    setPrefs.mockImplementationOnce(() => new Promise<void>((r) => (release = r)));
    const { result } = renderHook(() => useNotificationPrefs(), { wrapper: wrap(fakeUser) });
    act(() => prefsCb({ branch: true, suggestion: true, follow: true }));
    let p!: Promise<void>;
    act(() => { p = result.current.setPref('branch', false); });
    expect(result.current.pending).toEqual(['branch']);
    await act(async () => result.current.setPref('follow', false));
    expect(setPrefs).toHaveBeenCalledTimes(1);
    await act(async () => { release(); await p; });
    expect(result.current.pending).toEqual([]);
  });
});

describe('useNotifications with preferences', () => {
  it('hides switched-off types from the list and the unread count', () => {
    const { result } = renderHook(() => useNotifications(), { wrapper: wrap(fakeUser) });
    act(() => notifCb([
      { id: '1', type: 'follow', read: false },
      { id: '2', type: 'favorite', read: false },
      { id: '3', type: 'suggestion_applied', read: true },
    ]));
    // Not loaded yet: still loading, badge 0, nothing flashes.
    expect(result.current.isLoading).toBe(true);
    expect(result.current.unreadCount).toBe(0);
    act(() => prefsCb({ branch: true, suggestion: true, follow: true }));
    expect(result.current.unreadCount).toBe(2);
    act(() => prefsCb({ branch: true, suggestion: true, follow: false }));
    expect(result.current.notifications.map((n) => n.id)).toEqual(['2', '3']);
    expect(result.current.unreadCount).toBe(1);
  });
});
