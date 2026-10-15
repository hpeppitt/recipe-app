/**
 * Per-user write limits enforced by firestore.rules alone (RL-048). The rules
 * hold the same numbers in suggestionCap(), replyCap() and windowMs();
 * rateLimit.test.ts fails the build when they differ.
 */

export type RateLimitAction = 'suggestion' | 'reply';

export const SUGGESTION_CAP = 10;
export const REPLY_CAP = 30;
export const WINDOW_MS = 60 * 60 * 1000;

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
