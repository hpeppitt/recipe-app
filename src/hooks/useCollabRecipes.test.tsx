// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const getCollabRecipes = vi.fn();
vi.mock('../services/firestore', () => ({ getCollabRecipes: (...a: unknown[]) => getCollabRecipes(...a) }));
const reportError = vi.fn();
vi.mock('../services/telemetry', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));

import { useCollabRecipes, clearCollabCache } from './useCollabRecipes';

const recipe = (id: string) => ({ id });
beforeEach(() => {
  vi.clearAllMocks();
  clearCollabCache();
});
const read = (...ids: string[]) => ({ recipes: ids.map(recipe), truncated: false });
afterEach(() => vi.useRealTimers());

describe('useCollabRecipes', () => {
  it('is loading, then ready, and reads once', async () => {
    getCollabRecipes.mockResolvedValue(read('a'));
    const { result, rerender } = renderHook(() => useCollabRecipes('u'));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.recipes.map((r) => r.id)).toEqual(['a']);
    rerender();
    expect(getCollabRecipes).toHaveBeenCalledTimes(1);
  });

  it('is ready and empty for no collabs, which is not an error', async () => {
    getCollabRecipes.mockResolvedValue(read());
    const { result } = renderHook(() => useCollabRecipes('u'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.recipes).toEqual([]);
  });

  it('reports a failure as error, and retry reads again', async () => {
    getCollabRecipes.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(read('a'));
    const { result } = renderHook(() => useCollabRecipes('u'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'collab-recipes');
    act(() => result.current.retry());
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('times out at 6 s as an error', async () => {
    vi.useFakeTimers();
    getCollabRecipes.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useCollabRecipes('u'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(result.current.status).toBe('error');
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'collab-recipes');
  });

  it('never shows profile A under profile B', async () => {
    let resolveA!: (v: unknown) => void;
    getCollabRecipes.mockImplementation((u: string) =>
      u === 'A' ? new Promise((r) => (resolveA = r)) : Promise.resolve(read('b1'))
    );
    const { result, rerender } = renderHook(({ uid }) => useCollabRecipes(uid), { initialProps: { uid: 'A' } });
    rerender({ uid: 'B' });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => resolveA(read('a1')));
    expect(result.current.recipes.map((r) => r.id)).toEqual(['b1']);
  });

  it('reads nothing when disabled', () => {
    renderHook(() => useCollabRecipes('u', false));
    expect(getCollabRecipes).not.toHaveBeenCalled();
  });

  it('serves a return visit from the 5 minute cache, and reads again after it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    getCollabRecipes.mockResolvedValue({ recipes: [recipe('a')], truncated: true });
    const first = renderHook(() => useCollabRecipes('u'));
    await waitFor(() => expect(first.result.current.status).toBe('ready'));
    expect(first.result.current.truncated).toBe(true);
    first.unmount();
    const second = renderHook(() => useCollabRecipes('u'));
    expect(second.result.current.status).toBe('ready');
    expect(getCollabRecipes).toHaveBeenCalledTimes(1);
    second.unmount();
    vi.setSystemTime(Date.now() + 5 * 60 * 1000 + 1);
    const third = renderHook(() => useCollabRecipes('u'));
    expect(third.result.current.status).toBe('loading');
    await waitFor(() => expect(getCollabRecipes).toHaveBeenCalledTimes(2));
  });

  it('does not cache a failure', async () => {
    getCollabRecipes.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(read('a'));
    const first = renderHook(() => useCollabRecipes('u'));
    await waitFor(() => expect(first.result.current.status).toBe('error'));
    first.unmount();
    const second = renderHook(() => useCollabRecipes('u'));
    await waitFor(() => expect(second.result.current.status).toBe('ready'));
  });
});
