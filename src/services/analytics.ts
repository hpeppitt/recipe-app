import {
  expiryCookieStrings,
  gaCookieNames,
  isGranted,
  parseConsent,
  serialiseConsent,
  type ConsentChoice,
} from '../lib/consent';
import {
  getConsentChoice,
  getGaCookiesCleared,
  setConsentChoice,
  setGaCookiesCleared,
} from './storage';

type Params = Record<string, string | number | boolean>;

/**
 * VITE_POSTHOG_KEY is a public project key, not a secret. Read at call time so
 * tests can stub it. RL-054 reuses this to initialise PostHog.
 */
export const getPostHogKey = (): string => import.meta.env.VITE_POSTHOG_KEY ?? '';
export const isPostHogConfigured = (): boolean => getPostHogKey() !== '';

// --- Consent gate. Nothing below the gate runs unless the user said yes. ---

let choice: ConsentChoice | null | undefined; // undefined: not loaded yet
const listeners = new Set<(granted: boolean) => void>();

export function getConsent(): ConsentChoice | null {
  if (choice === undefined) choice = getConsentChoice();
  return choice;
}

/** Re-reads storage. For tests, and nothing else. */
export function reloadConsent(): void {
  choice = undefined;
}

/** RL-054's one hook: opt PostHog in or out here. No provider reads consent itself. */
export function onConsentChange(listener: (granted: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setAnalyticsConsent(granted: boolean): void {
  const at = Date.now();
  setConsentChoice(granted, at);
  // Held in memory too, so blocked storage still honours the choice this session.
  choice = parseConsent(serialiseConsent(granted, at));
  listeners.forEach((l) => l(granted));
}

/** RL-054 fills these in with posthog-js. Called only after consent is granted. */
export const analyticsProvider = {
  send(_name: string, _params?: Params): void {},
  identify(_uid: string | null): void {},
};

function logEvent(name: string, params?: Params) {
  if (isGranted(getConsent())) analyticsProvider.send(name, params);
}

export function setAnalyticsUserId(uid: string | null) {
  if (isGranted(getConsent())) analyticsProvider.identify(uid);
}

/** Deletes leftover GA4 cookies once per browser, whatever the consent choice. */
export function clearLeftoverGaCookies(): void {
  if (getGaCookiesCleared()) return;
  try {
    for (const name of gaCookieNames(document.cookie)) {
      for (const c of expiryCookieStrings(name, location.hostname)) document.cookie = c;
    }
  } catch {
    // Cookies blocked: nothing to clear.
  }
  setGaCookiesCleared();
}

// Auth events
export const trackSignIn = (method: 'anonymous' | 'email') =>
  logEvent('sign_in', { method });

export const trackSignOut = () =>
  logEvent('sign_out');

// Recipe events
export const trackRecipeCreated = (recipeId: string, isVariation: boolean) =>
  logEvent('recipe_created', { recipe_id: recipeId, is_variation: isVariation });

/** A manual owner edit, as distinct from an AI variation (`recipe_created`). */
export const trackRecipeUpdated = (recipeId: string) =>
  logEvent('recipe_updated', { recipe_id: recipeId });

export const trackRecipeViewed = (recipeId: string) =>
  logEvent('recipe_viewed', { recipe_id: recipeId });

export const trackRecipeShared = (recipeId: string) =>
  logEvent('recipe_shared', { recipe_id: recipeId });

export const trackRecipeDeleted = (recipeId: string) =>
  logEvent('recipe_deleted', { recipe_id: recipeId });

// Social events
export const trackFavoriteToggled = (recipeId: string, isFavorite: boolean) =>
  logEvent(isFavorite ? 'recipe_favorited' : 'recipe_unfavorited', { recipe_id: recipeId });

export const trackSuggestionSubmitted = (recipeId: string) =>
  logEvent('suggestion_submitted', { recipe_id: recipeId });

export const trackSuggestionReviewed = (suggestionId: string, action: 'approved' | 'rejected') =>
  logEvent('suggestion_reviewed', { suggestion_id: suggestionId, action });

// Profile events
export const trackProfileUpdated = (field: string) =>
  logEvent('profile_updated', { field });

export const trackFollowToggled = (targetUid: string, isFollowing: boolean) =>
  logEvent(isFollowing ? 'user_followed' : 'user_unfollowed', { target_uid: targetUid });
