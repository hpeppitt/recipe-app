// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuthContext, type AuthContextType } from '../contexts/AuthContext';
import { fakeUser } from '../test/renderWithProviders';
import type { AppUser } from '../types/recipe';

const getRecipeCookSummary = vi.fn();
const logCook = vi.fn();
const subscribeOwnCooks = vi.fn();
vi.mock('../services/firestore', () => ({
  getRecipeCookSummary: (...a: unknown[]) => getRecipeCookSummary(...a),
  logCook: (...a: unknown[]) => logCook(...a),
  subscribeOwnCooks: (...a: unknown[]) => subscribeOwnCooks(...a),
  newCookId: () => `id${++ids}`,
}));
let ids = 0;
vi.mock('../services/firebase', () => ({ isFirebaseConfigured: true }));
const reportError = vi.fn();
vi.mock('../services/telemetry', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));

import { useOwnCooks, useRecipeCooks } from './useCooks';

const summary = (total: number) => ({ total, again: 0, recent: [] });
const wrapperFor = (user: AppUser | null) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AuthContext.Provider value={{ user, isLoading: false, isConfigured: true } as AuthContextType}>
        {children}
      </AuthContext.Provider>
    );
  };

beforeEach(() => vi.clearAllMocks());

describe('useRecipeCooks', () => {
  it('reads once per recipe and re-reads after logging a cook', async () => {
    getRecipeCookSummary.mockResolvedValueOnce(summary(1)).mockResolvedValueOnce(summary(2));
    logCook.mockResolvedValue('c1');
    const { result, rerender } = renderHook(() => useRecipeCooks('r1'));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.summary.total).toBe(1));
    rerender();
    expect(getRecipeCookSummary).toHaveBeenCalledTimes(1);

    let id: string | undefined;
    await act(async () => {
      id = await result.current.log({} as never);
    });
    expect(id).toBe('c1');
    await waitFor(() => expect(result.current.summary.total).toBe(2));
    expect(getRecipeCookSummary).toHaveBeenCalledTimes(2);
  });

  it('reports a failed read as recipe-cooks and shows error, not zero', async () => {
    getRecipeCookSummary.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useRecipeCooks('r1'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'recipe-cooks');
  });

  it('keeps the shown summary when a refresh fails', async () => {
    getRecipeCookSummary.mockResolvedValueOnce(summary(1)).mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useRecipeCooks('r1'));
    await waitFor(() => expect(result.current.summary.total).toBe(1));
    act(() => result.current.refresh());
    await waitFor(() => expect(reportError).toHaveBeenCalled());
    expect(result.current.status).toBe('ready');
    expect(result.current.summary.total).toBe(1);
  });

  it('retries a timed-out log under the same id, and a new log after a plain failure gets a new id', async () => {
    getRecipeCookSummary.mockResolvedValue(summary(1));
    const { result } = renderHook(() => useRecipeCooks('r1'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    logCook
      .mockRejectedValueOnce(new Error('Sending the cook timed out'))
      .mockResolvedValueOnce('done')
      .mockRejectedValueOnce(new Error('denied'))
      .mockResolvedValueOnce('done');
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        await result.current.log({} as never).catch(() => {});
      });
      ids.push(logCook.mock.calls[i][0].cookId);
    }
    expect(ids[1]).toBe(ids[0]);
    expect(ids[2]).not.toBe(ids[1]);
    expect(ids[3]).not.toBe(ids[2]);
  });

  it('never shows recipe A under recipe B', async () => {
    let resolveA!: (v: unknown) => void;
    getRecipeCookSummary.mockImplementation((id: string) =>
      id === 'A' ? new Promise((r) => (resolveA = r)) : Promise.resolve(summary(5))
    );
    const { result, rerender } = renderHook(({ id }) => useRecipeCooks(id), { initialProps: { id: 'A' } });
    rerender({ id: 'B' });
    await waitFor(() => expect(result.current.summary.total).toBe(5));
    await act(async () => resolveA(summary(9)));
    expect(result.current.summary.total).toBe(5);
  });
});

describe('useOwnCooks', () => {
  it('subscribes for a verified user', () => {
    subscribeOwnCooks.mockImplementation((_uid: string, next: (c: unknown[]) => void) => {
      next([{ id: 'c1' }]);
      return () => {};
    });
    const { result } = renderHook(() => useOwnCooks(), { wrapper: wrapperFor(fakeUser) });
    expect(subscribeOwnCooks).toHaveBeenCalledWith(fakeUser.uid, expect.any(Function), expect.any(Function));
    expect(result.current.cooks).toEqual([{ id: 'c1' }]);
  });

  it.each([
    ['signed out', null],
    ['unverified', { ...fakeUser, emailVerified: false }],
  ])('returns an empty list without reading when %s', (_label, user) => {
    const { result } = renderHook(() => useOwnCooks(), { wrapper: wrapperFor(user) });
    expect(subscribeOwnCooks).not.toHaveBeenCalled();
    expect(result.current).toEqual({ status: 'ready', cooks: [] });
  });
});
