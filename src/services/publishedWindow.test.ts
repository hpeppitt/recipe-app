import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const getAll = vi.hoisted(() => vi.fn());
vi.mock('./firestore', () => ({ getAllPublishedRecipes: () => getAll() }));

import { clearPublishedWindow, PUBLISHED_WINDOW_TTL_MS, readPublishedWindow } from './publishedWindow';

beforeEach(() => {
  getAll.mockReset();
  clearPublishedWindow();
  vi.useFakeTimers({ toFake: ['Date'] });
});
afterEach(() => vi.useRealTimers());

describe('readPublishedWindow', () => {
  it('reads once within the TTL and again after it', async () => {
    getAll.mockResolvedValue([{ id: 'a' }]);
    expect(await readPublishedWindow()).toEqual([{ id: 'a' }]);
    await readPublishedWindow();
    expect(getAll).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(PUBLISHED_WINDOW_TTL_MS + 1);
    await readPublishedWindow();
    expect(getAll).toHaveBeenCalledTimes(2);
  });

  it('resolves null on failure and does not keep it', async () => {
    getAll.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([]);
    expect(await readPublishedWindow()).toBeNull();
    expect(await readPublishedWindow()).toEqual([]);
    expect(getAll).toHaveBeenCalledTimes(2);
  });

  it('clearPublishedWindow forces a fresh read', async () => {
    getAll.mockResolvedValue([]);
    await readPublishedWindow();
    clearPublishedWindow();
    await readPublishedWindow();
    expect(getAll).toHaveBeenCalledTimes(2);
  });
});
