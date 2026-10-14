// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const getPublishedRecipe = vi.fn();
vi.mock('../services/firestore', () => ({
  getPublishedRecipe: (...a: unknown[]) => getPublishedRecipe(...a),
}));
vi.mock('../services/firebase', () => ({ isFirebaseConfigured: true }));
vi.mock('../services/telemetry', () => ({ reportError: vi.fn() }));
vi.mock('../db/recipes', () => ({ getRecipe: async () => undefined }));
vi.mock('./useRecipeTree', () => ({ useRecipeTree: () => ({ recipes: [], isLoading: false }) }));

import { useRecipe } from './useRecipe';

beforeEach(() => {
  getPublishedRecipe.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useRecipe cloud fallback', () => {
  it('reports a cloud error, not absence, when the read times out, and retry re-reads', async () => {
    getPublishedRecipe.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useRecipe('r1'));
    await waitFor(() => expect(getPublishedRecipe).toHaveBeenCalledTimes(1));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.cloudError).toBe(false);

    await waitFor(() => expect(result.current.cloudError).toBe(true), { timeout: 8000 });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.recipe).toBeUndefined();

    getPublishedRecipe.mockResolvedValue(null);
    act(() => result.current.retry());
    await waitFor(() => expect(getPublishedRecipe).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.cloudError).toBe(false);
  }, 15000);

  it('reports a cloud error when the read rejects', async () => {
    getPublishedRecipe.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useRecipe('r1'));
    await waitFor(() => expect(result.current.cloudError).toBe(true));
  });

  it('is plain absence (no error) when the read completes with no document', async () => {
    getPublishedRecipe.mockResolvedValue(null);
    const { result } = renderHook(() => useRecipe('r1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.cloudError).toBe(false);
    expect(result.current.recipe).toBeUndefined();
  });
});
