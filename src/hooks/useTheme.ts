import { useState, useEffect, useCallback } from 'react';
import { getTheme, setTheme as persistTheme } from '../services/storage';

type Theme = 'system' | 'light' | 'dark';

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getTheme);

  const applyTheme = useCallback((t: Theme) => {
    const root = document.documentElement;
    if (t === 'dark') {
      root.classList.add('dark');
    } else if (t === 'light') {
      root.classList.remove('dark');
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', prefersDark);
    }
  }, []);

  useEffect(() => {
    applyTheme(theme);

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme('system');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [theme, applyTheme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    persistTheme(t);
  }, []);

  return { theme, setTheme };
}
