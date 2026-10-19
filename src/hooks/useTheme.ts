import { useState, useEffect, useCallback } from 'react';
import { getTheme, setTheme as persistTheme } from '../services/storage';

type Theme = 'system' | 'light' | 'dark';

const DARK_QUERY = '(prefers-color-scheme: dark)';

// index.html runs the same logic before first paint; keep the two in step (and its storage key).
function applyTheme(t: Theme) {
  const dark = t === 'dark' || (t === 'system' && typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches);
  document.documentElement.classList.toggle('dark', dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1e1915' : '#f5ead8');
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getTheme);

  useEffect(() => {
    applyTheme(theme);
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(DARK_QUERY);
    // Always listen and read the store, not this instance's state: App and Settings each hold
    // a copy, and App's must follow the OS after Settings switches to System.
    const onChange = () => applyTheme(getTheme());
    // Safari before 14 has only the deprecated addListener/removeListener.
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    persistTheme(t);
  }, []);

  return { theme, setTheme };
}
