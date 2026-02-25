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

// --- Device + Anonymous Identity Persistence ---

export function getDeviceId(): string {
  let id = localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEYS.DEVICE_ID, id);
  }
  return id;
}

export function getAnonymousUid(): string | null {
  return localStorage.getItem(STORAGE_KEYS.ANONYMOUS_UID);
}

export function setAnonymousUid(uid: string): void {
  localStorage.setItem(STORAGE_KEYS.ANONYMOUS_UID, uid);
  addPreviousUid(uid);
}

export function clearAnonymousUid(): void {
  localStorage.removeItem(STORAGE_KEYS.ANONYMOUS_UID);
}

export function getPreviousUids(): string[] {
  const raw = localStorage.getItem(STORAGE_KEYS.PREVIOUS_UIDS);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function addPreviousUid(uid: string): void {
  const uids = getPreviousUids();
  if (!uids.includes(uid)) {
    uids.push(uid);
    localStorage.setItem(STORAGE_KEYS.PREVIOUS_UIDS, JSON.stringify(uids));
  }
}

export function getEmailForLinking(): string | null {
  return localStorage.getItem(STORAGE_KEYS.EMAIL_FOR_LINKING);
}

export function setEmailForLinking(email: string): void {
  localStorage.setItem(STORAGE_KEYS.EMAIL_FOR_LINKING, email);
}

export function clearEmailForLinking(): void {
  localStorage.removeItem(STORAGE_KEYS.EMAIL_FOR_LINKING);
}
