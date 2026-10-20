// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useTheme } from './useTheme';
import { STORAGE_KEYS } from '../lib/constants';

describe('useTheme', () => {
  let store: Map<string, string>;
  let osDark: boolean;
  let listeners: Array<() => void>;
  const isDark = () => document.documentElement.classList.contains('dark');
  const themeColor = () => document.querySelector('meta[name="theme-color"]')?.getAttribute('content');

  beforeEach(() => {
    store = new Map();
    osDark = false;
    listeners = [];
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    document.documentElement.classList.remove('dark');
    document.head.innerHTML = '<meta name="theme-color" content="#f5ead8">';
    window.matchMedia = (() => ({
      get matches() { return osDark; },
      addEventListener: (_: string, fn: () => void) => listeners.push(fn),
      removeEventListener: (_: string, fn: () => void) => (listeners = listeners.filter((l) => l !== fn)),
    })) as unknown as typeof window.matchMedia;
  });

  it('defaults to system when nothing is stored and follows the OS', () => {
    // jsdom has no stylesheet, so stand in for the --color-surface token per theme.
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      () => ({ getPropertyValue: () => (isDark() ? ' #1e1915' : '#f5ead8') }) as unknown as CSSStyleDeclaration,
    );
    osDark = true;
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('system');
    expect(isDark()).toBe(true);
    expect(themeColor()).toBe('#1e1915');
    osDark = false;
    act(() => listeners.forEach((l) => l()));
    expect(isDark()).toBe(false);
    expect(themeColor()).toBe('#f5ead8');
  });

  it.each([
    ['dark', false, true],
    ['light', true, false],
  ])('applies a stored %s whatever the OS says', (stored, os, expected) => {
    store.set(STORAGE_KEYS.THEME, stored);
    osDark = os;
    renderHook(() => useTheme());
    expect(isDark()).toBe(expected);
    act(() => listeners.forEach((l) => l()));
    expect(isDark()).toBe(expected);
  });

  it('removes its OS listener on unmount', () => {
    const { unmount } = renderHook(() => useTheme());
    expect(listeners).toHaveLength(1);
    unmount();
    expect(listeners).toHaveLength(0);
  });

  it('falls back to addListener and removeListener where addEventListener is missing', () => {
    osDark = true;
    window.matchMedia = (() => ({
      get matches() { return osDark; },
      addListener: (fn: () => void) => listeners.push(fn),
      removeListener: (fn: () => void) => (listeners = listeners.filter((l) => l !== fn)),
    })) as unknown as typeof window.matchMedia;
    const { unmount } = renderHook(() => useTheme());
    expect(isDark()).toBe(true);
    osDark = false;
    act(() => listeners.forEach((l) => l()));
    expect(isDark()).toBe(false);
    unmount();
    expect(listeners).toHaveLength(0);
  });

  it('stays light without matchMedia', () => {
    // @ts-expect-error jsdom has no matchMedia; simulate that
    delete window.matchMedia;
    renderHook(() => useTheme());
    expect(isDark()).toBe(false);
  });

  it('applies and persists a new choice', () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme('dark'));
    expect(isDark()).toBe(true);
    expect(store.get(STORAGE_KEYS.THEME)).toBe('dark');
  });
});
