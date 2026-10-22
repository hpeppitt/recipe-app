/** Beta feedback document bounds (RL-285, firestore.rules isWellFormedFeedback). Keep equal to the rules. */
export const FEEDBACK_NOTE_MAX = 1000;
export const FEEDBACK_PATH_MAX = 300;
export const FEEDBACK_APP_VERSION_MAX = 40;
export const FEEDBACK_VIEWPORT_MAX = 20;
export const FEEDBACK_USER_AGENT_MAX = 400;
export const FEEDBACK_SCREENSHOT_MAX = 200000;

/** Cut to `max` UTF-16 units without leaving half of a surrogate pair. */
export function cutUnits(text: string, max: number): string {
  const cut = text.slice(0, max);
  return /[\uD800-\uDBFF]$/.test(cut) && text.length > max ? cut.slice(0, -1) : cut;
}

/** Secret path segments (a household join code) never leave the device; recipe and cookbook ids are public. */
export function redactPath(path: string): string {
  return path.replace(/^\/join\/[^/]*/, '/join/:code');
}

export const FEEDBACK_SCREENSHOT_PREFIX = 'data:image/jpeg;base64,';

export interface FeedbackContext {
  path: string;
  appVersion: string;
  viewport: string;
  theme: 'light' | 'dark';
  userAgent: string;
}

/** The page, app and device fields of a feedback document, cut to the rule limits. */
export function feedbackContext(input: {
  pathname: string;
  width: number;
  height: number;
  theme: 'light' | 'dark';
  userAgent: string;
  appVersion: string;
}): FeedbackContext {
  const path = redactPath(input.pathname.split(/[?#]/)[0]);
  return {
    path: cutUnits(path.startsWith('/') ? path : `/${path}`, FEEDBACK_PATH_MAX),
    appVersion: cutUnits(input.appVersion, FEEDBACK_APP_VERSION_MAX),
    viewport: `${Math.round(input.width)}x${Math.round(input.height)}`.slice(0, FEEDBACK_VIEWPORT_MAX),
    theme: input.theme,
    userAgent: cutUnits(input.userAgent, FEEDBACK_USER_AGENT_MAX),
  };
}

/** The trimmed note capped at the rule limit; empty means there is nothing to send. */
export function cleanNote(text: string): string {
  return cutUnits(text.trim(), FEEDBACK_NOTE_MAX);
}
