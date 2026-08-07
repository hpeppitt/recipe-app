import { STORAGE_KEYS } from '../lib/constants';
import type { UnitSystem } from '../lib/units';
import type { StrandedIdentity } from '../lib/migration';
import { parseIntroState, type IntroState } from '../lib/onboarding';

export function getTheme(): 'system' | 'light' | 'dark' {
  return (localStorage.getItem(STORAGE_KEYS.THEME) as 'system' | 'light' | 'dark') ?? 'system';
}

export function setTheme(theme: 'system' | 'light' | 'dark'): void {
  localStorage.setItem(STORAGE_KEYS.THEME, theme);
}

/**
 * Display unit preference. 'original' shows whatever the recipe stored, which is
 * the honest default — the app should not silently convert until asked.
 */
export function getUnitSystem(): UnitSystem {
  return (localStorage.getItem(STORAGE_KEYS.UNIT_SYSTEM) as UnitSystem) ?? 'original';
}

export function setUnitSystem(system: UnitSystem): void {
  localStorage.setItem(STORAGE_KEYS.UNIT_SYSTEM, system);
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

// --- One-time explainers ---
//
// Parsing and the show/hide rules live in lib/onboarding.ts; this is only the
// read and write.

export function getIntroState(): IntroState {
  return parseIntroState(localStorage.getItem(STORAGE_KEYS.INTRO_STATE));
}

export function setIntroState(state: IntroState): void {
  localStorage.setItem(STORAGE_KEYS.INTRO_STATE, JSON.stringify(state));
}

// --- Stranded identity notice ---
//
// Persisted rather than held in memory because the migration is attempted during
// page load, on the same load that consumes the email link. A notice kept only in
// React state would be lost to the `history.replaceState` and re-render that
// follow, i.e. exactly the silent loss this is meant to end.

export function getStrandedIdentity(): StrandedIdentity | null {
  const raw = localStorage.getItem(STORAGE_KEYS.STRANDED_IDENTITY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StrandedIdentity;
    // Guard against a hand-edited or half-written value rendering "undefined
    // recipes stayed under null".
    if (typeof parsed?.oldUid !== 'string' || typeof parsed?.recipeCount !== 'number') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setStrandedIdentity(stranded: StrandedIdentity): void {
  localStorage.setItem(STORAGE_KEYS.STRANDED_IDENTITY, JSON.stringify(stranded));
}

/** Called when the user dismisses the notice; it is shown once. */
export function clearStrandedIdentity(): void {
  localStorage.removeItem(STORAGE_KEYS.STRANDED_IDENTITY);
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
