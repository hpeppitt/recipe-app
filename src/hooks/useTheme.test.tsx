// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTheme } from './useTheme';
import { STORAGE_KEYS } from '../lib/constants';

describe('useTheme (light only, RL-065)', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    document.documentElement.classList.remove('dark');
    window.matchMedia = (() => ({ matches: true, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  });

  it.each(['dark', 'system'])('never applies the dark class when %s is stored', (stored) => {
    store.set(STORAGE_KEYS.THEME, stored);
    document.documentElement.classList.add('dark');
    renderHook(() => useTheme());
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(store.get(STORAGE_KEYS.THEME)).toBe(stored);
  });
});
