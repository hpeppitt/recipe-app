import { useState, useEffect, useCallback } from 'react';
import { getTheme, setTheme as persistTheme } from '../services/storage';

type Theme = 'system' | 'light' | 'dark';

// Light only since RL-065 (Organic has no dark palette). The preference is still stored so a
// later dark Organic needs no migration, but nothing applies it: the dark class is always removed.
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getTheme);

  useEffect(() => {
    document.documentElement.classList.remove('dark');
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    persistTheme(t);
  }, []);

  return { theme, setTheme };
}
