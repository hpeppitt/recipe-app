import posthog from 'posthog-js';
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

/** Public client configuration. Read at call time so tests can stub it. */
export const getPostHogKey = (): string => import.meta.env.VITE_POSTHOG_KEY ?? '';
export const getPostHogHost = (): string => import.meta.env.VITE_POSTHOG_HOST ?? '';
export const isPostHogConfigured = (): boolean =>
  getPostHogKey() !== '' && getPostHogHost() !== '';

let posthogInitialised = false;

const posthogLog = {
  info(message: string, attributes?: Params): void {
    posthog.logger.info(message, attributes);
  },
};

/**
 * The sole PostHog initializer. It intentionally runs only after consent, while
 * still running before React renders when stored consent has already been granted.
 */
export function initialisePostHog(): boolean {
  const key = getPostHogKey();
  const host = getPostHogHost();
  if (!key || !host) return false;

  if (!isGranted(getConsent())) return false;
  if (posthogInitialised) return true;

  posthog.init(key, {
    api_host: host,
    defaults: '2026-05-30',
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
    logs: {
      serviceName: 'recipe-app-web',
      environment: import.meta.env.MODE,
    },
  });
  posthogInitialised = true;
  posthogLog.info('posthog_log_capture_initialized', { runtime: 'browser' });
  return true;
}

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

  if (granted && initialisePostHog()) {
    posthog.opt_in_capturing();
    posthogLog.info('analytics_consent_granted', { source: 'settings' });
  } else if (posthogInitialised) {
    posthogLog.info('analytics_consent_revoked', { source: 'settings' });
    posthog.opt_out_capturing();
  }

  listeners.forEach((l) => l(granted));
}

export const analyticsProvider = {
  send(name: string, params?: Params): void {
    if (initialisePostHog()) posthog.capture(name, params);
  },
  identify(uid: string | null): void {
    if (!initialisePostHog()) return;
    if (uid) posthog.identify(uid);
    else posthog.reset();
  },
};

function logEvent(name: string, params?: Params) {
  if (isGranted(getConsent())) analyticsProvider.send(name, params);
}

export function setAnalyticsUserId(uid: string | null) {
  if (isGranted(getConsent())) analyticsProvider.identify(uid);
}

/** Records a Firebase AI Logic generation without prompt or response content. */
export function captureAiGeneration({
  model,
  sessionId,
  traceId,
  latency,
}: {
  model: string;
  sessionId: string;
  traceId: string;
  latency: number;
}): void {
  if (!isGranted(getConsent()) || !initialisePostHog()) return;

  posthog.capture('$ai_generation', {
    $ai_provider: 'google',
    $ai_model: model,
    $ai_session_id: sessionId,
    $ai_trace_id: traceId,
    $ai_latency: latency,
  });
  posthogLog.info('ai_generation_completed', {
    provider: 'google',
    model,
    latency_ms: latency,
  });
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
