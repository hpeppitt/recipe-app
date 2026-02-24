import { STORAGE_KEYS } from '../lib/constants';

export function getApiKey(): string {
  return localStorage.getItem(STORAGE_KEYS.API_KEY) ?? '';
}

export function setApiKey(key: string): void {
  localStorage.setItem(STORAGE_KEYS.API_KEY, key);
}

export function getTheme(): 'system' | 'light' | 'dark' {
  return (localStorage.getItem(STORAGE_KEYS.THEME) as 'system' | 'light' | 'dark') ?? 'system';
}

export function setTheme(theme: 'system' | 'light' | 'dark'): void {
  localStorage.setItem(STORAGE_KEYS.THEME, theme);
}
