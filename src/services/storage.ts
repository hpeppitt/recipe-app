import { STORAGE_KEYS } from '../lib/constants';
import type { UnitSystem } from '../lib/units';
import { parseIntroState, type IntroState } from '../lib/onboarding';
import { parseConsent, serialiseConsent, type ConsentChoice } from '../lib/consent';
import { parseLibraryTab, type LibraryTab } from '../lib/library';

// Storage can throw on access (blocked cookies raise SecurityError from merely
// touching `localStorage`), on read, and on write (quota, private modes). Nothing
// here is worth a crash, so every touch goes through these three.
function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    console.warn(`Could not save "${key}" to local storage`);
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    console.warn(`Could not remove "${key}" from local storage`);
  }
}

type Theme = 'system' | 'light' | 'dark';
const THEMES: readonly string[] = ['system', 'light', 'dark'];
const UNIT_SYSTEMS: readonly string[] = ['original', 'metric', 'imperial'];

export function getTheme(): Theme {
  const v = safeGet(STORAGE_KEYS.THEME);
  return v !== null && THEMES.includes(v) ? (v as Theme) : 'system';
}

export function setTheme(theme: Theme): void {
  safeSet(STORAGE_KEYS.THEME, theme);
}

/**
 * Display unit preference. 'original' shows whatever the recipe stored, which is
 * the honest default — the app should not silently convert until asked.
 */
export function getUnitSystem(): UnitSystem {
  const v = safeGet(STORAGE_KEYS.UNIT_SYSTEM);
  return v !== null && UNIT_SYSTEMS.includes(v) ? (v as UnitSystem) : 'original';
}

export function setUnitSystem(system: UnitSystem): void {
  safeSet(STORAGE_KEYS.UNIT_SYSTEM, system);
}

/**
 * The Library tab last selected. Wrapped because storage can throw (private
 * modes, quota, blocked cookies) and a remembered tab is not worth a crash.
 */
export function getLibraryTab(): LibraryTab {
  return parseLibraryTab(safeGet(STORAGE_KEYS.LIBRARY_TAB));
}

export function setLibraryTab(tab: LibraryTab): void {
  safeSet(STORAGE_KEYS.LIBRARY_TAB, tab);
}

// --- Device + Anonymous Identity Persistence ---

// Held in memory too, so with blocked storage one session still has one id.
// Never persisted by this fallback.
let sessionDeviceId: string | null = null;

// randomUUID exists only in secure contexts (not plain http, e.g. a LAN dev
// server), so fall back to getRandomValues, then Math.random. Nothing parses the
// id (AuthContext only calls getDeviceId), so it only needs to be a unique string.
function newId(): string {
  try {
    if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
    if (typeof crypto?.getRandomValues === 'function') {
      return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join('');
    }
  } catch {
    // fall through
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

export function getDeviceId(): string {
  const stored = safeGet(STORAGE_KEYS.DEVICE_ID);
  if (stored) return stored;
  if (!sessionDeviceId) {
    sessionDeviceId = newId();
    safeSet(STORAGE_KEYS.DEVICE_ID, sessionDeviceId);
  }
  return sessionDeviceId;
}

export function getAnonymousUid(): string | null {
  return safeGet(STORAGE_KEYS.ANONYMOUS_UID);
}

export function setAnonymousUid(uid: string): void {
  safeSet(STORAGE_KEYS.ANONYMOUS_UID, uid);
  addPreviousUid(uid);
}

export function clearAnonymousUid(): void {
  safeRemove(STORAGE_KEYS.ANONYMOUS_UID);
}

export function getPreviousUids(): string[] {
  const raw = safeGet(STORAGE_KEYS.PREVIOUS_UIDS);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((u): u is string => typeof u === 'string') : [];
  } catch {
    return [];
  }
}

export function addPreviousUid(uid: string): void {
  const uids = getPreviousUids();
  if (!uids.includes(uid)) {
    uids.push(uid);
    safeSet(STORAGE_KEYS.PREVIOUS_UIDS, JSON.stringify(uids));
  }
}

// --- One-time explainers ---
//
// Parsing and the show/hide rules live in lib/onboarding.ts; this is only the
// read and write.

export function getIntroState(): IntroState {
  return parseIntroState(safeGet(STORAGE_KEYS.INTRO_STATE));
}

export function setIntroState(state: IntroState): void {
  safeSet(STORAGE_KEYS.INTRO_STATE, JSON.stringify(state));
}

export function getEmailForLinking(): string | null {
  return safeGet(STORAGE_KEYS.EMAIL_FOR_LINKING);
}

export function setEmailForLinking(email: string): void {
  safeSet(STORAGE_KEYS.EMAIL_FOR_LINKING, email);
}

export function clearEmailForLinking(): void {
  safeRemove(STORAGE_KEYS.EMAIL_FOR_LINKING);
}

// --- Terms acceptance (RL-047) ---
//
// Ticked on the email form, but only recordable once the link makes the account
// verified, possibly after a reload, so it waits here until AuthContext writes it.

export interface StoredTermsAcceptance {
  version: string;
  /** Client ms when the link was sent with the box ticked. */
  acceptedAt: number;
  /** Who ticked it, normalised, so another account on this device never inherits it. */
  email: string;
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Null for anything unusable, including entries from before the email was stored. */
export function getTermsAcceptance(): StoredTermsAcceptance | null {
  const raw = safeGet(STORAGE_KEYS.TERMS_ACCEPTANCE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredTermsAcceptance> | null;
    if (
      typeof parsed?.version !== 'string' ||
      !Number.isInteger(parsed.acceptedAt) ||
      typeof parsed.email !== 'string' ||
      parsed.email === ''
    ) {
      return null;
    }
    return { version: parsed.version, acceptedAt: parsed.acceptedAt as number, email: parsed.email };
  } catch {
    return null;
  }
}

export function setTermsAcceptance(acceptance: StoredTermsAcceptance): void {
  safeSet(
    STORAGE_KEYS.TERMS_ACCEPTANCE,
    JSON.stringify({ ...acceptance, email: normaliseEmail(acceptance.email) })
  );
}

export function clearTermsAcceptance(): void {
  safeRemove(STORAGE_KEYS.TERMS_ACCEPTANCE);
}

// --- Analytics consent (RL-052) ---

export function getConsentChoice(): ConsentChoice | null {
  return parseConsent(safeGet(STORAGE_KEYS.ANALYTICS_CONSENT));
}

export function setConsentChoice(granted: boolean, at: number): void {
  safeSet(STORAGE_KEYS.ANALYTICS_CONSENT, serialiseConsent(granted, at));
}

/** One-time flag for the leftover GA4 cookie cleanup. */
export function getGaCookiesCleared(): boolean {
  return safeGet(STORAGE_KEYS.GA_COOKIES_CLEARED) === '1';
}

export function setGaCookiesCleared(): void {
  safeSet(STORAGE_KEYS.GA_COOKIES_CLEARED, '1');
}
