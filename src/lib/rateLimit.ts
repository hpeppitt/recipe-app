/**
 * Per-user write limits enforced by firestore.rules alone (RL-048, RL-049). The
 * rules hold the same numbers in suggestionCap(), replyCap(), notificationCap(),
 * recipeCap(), cookCap(), cookbookCap(), feedbackCap(), windowMs() and recipeWindowMs(); rateLimit.test.ts fails the
 * build when they differ.
 */

export type RateLimitAction = 'suggestion' | 'reply' | 'notification' | 'recipe' | 'cook' | 'cookbook' | 'feedback';

export const SUGGESTION_CAP = 10;
export const REPLY_CAP = 30;
export const NOTIFICATION_CAP = 60;
/** Recipe creates only; a re-publish is an update and is not counted. */
export const RECIPE_CAP = 30;
/** "I made this" records (RL-194), on the same day window as recipes. */
export const COOK_CAP = 20;
/** Cookbook publishes (RL-265): a collection becoming public, on the day window. */
export const COOKBOOK_CAP = 5;
/** Beta feedback items (RL-285), on the day window. */
export const FEEDBACK_CAP = 10;
export const WINDOW_MS = 60 * 60 * 1000;
export const RECIPE_WINDOW_MS = 24 * WINDOW_MS;

export const RATE_LIMITS: Record<RateLimitAction, { cap: number; windowMs: number }> = {
  suggestion: { cap: SUGGESTION_CAP, windowMs: WINDOW_MS },
  reply: { cap: REPLY_CAP, windowMs: WINDOW_MS },
  notification: { cap: NOTIFICATION_CAP, windowMs: WINDOW_MS },
  recipe: { cap: RECIPE_CAP, windowMs: RECIPE_WINDOW_MS },
  cook: { cap: COOK_CAP, windowMs: RECIPE_WINDOW_MS },
  cookbook: { cap: COOKBOOK_CAP, windowMs: RECIPE_WINDOW_MS },
  feedback: { cap: FEEDBACK_CAP, windowMs: RECIPE_WINDOW_MS },
};

/**
 * How long past the window's end the client waits before starting a new one.
 * The rules allow a reset only once server time passes windowStart + window;
 * a client clock running fast would otherwise try to reset early and be denied.
 * Within the margin the client increments instead, which the rules accept while
 * count <= cap. A slow client clock only makes the user wait a little longer.
 */
export const RESET_MARGIN_MS = 60 * 1000;

export interface WindowState {
  windowStartMs: number;
  count: number;
}

/**
 * The window after one more write, or 'limited' when the write must not happen.
 * count 1 means a new window (first write or reset). A windowStart in the future
 * (bad data or a slow client clock) counts as an open window. Never throws.
 */
export function nextWindow(
  prev: WindowState | null,
  nowMs: number,
  cap: number,
  windowMs: number
): WindowState | 'limited' {
  if (!prev || nowMs > prev.windowStartMs + windowMs + RESET_MARGIN_MS) {
    return { windowStartMs: nowMs, count: 1 };
  }
  if (prev.count >= cap) return 'limited';
  return { windowStartMs: prev.windowStartMs, count: prev.count + 1 };
}
