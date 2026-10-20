/** The `notifications` create rule caps `message` at this many characters. */
export const NOTIFICATION_MESSAGE_MAX = 500;

/**
 * Fit user text into a notification's `message`, ending in an ellipsis when cut.
 *
 * Suggestions and replies have no length cap of their own, and notification
 * writes are fire-and-forget, so an over-long message would be denied by the
 * rules and the notification silently lost. Only the notification copy is cut;
 * the suggestion or reply document keeps the full text.
 *
 * Counts UTF-16 units (`.length`) because that is what the rules' `size()`
 * counts: observed against the emulator, 250 emoji pass and 251 are denied.
 * A cut that would leave half an emoji drops the orphaned high surrogate.
 */
export function truncateNotificationMessage(text: string): string {
  if (text.length <= NOTIFICATION_MESSAGE_MAX) return text;
  let cut = text.slice(0, NOTIFICATION_MESSAGE_MAX - 1);
  if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);
  return cut + '…';
}

// A keyed map rather than a ternary chain; an unknown type falls back instead of
// silently rendering as a suggestion. `fromUid` is required on every notification,
// so there is no icon-only fallback to keep.
export const NOTIF_VERBS: Record<string, string> = {
  favorite: 'saved your recipe',
  suggestion: 'suggested a change to',
  suggestion_approved: 'approved your suggestion on',
  suggestion_rejected: 'passed on your suggestion for',
  suggestion_applied: 'applied your suggestion to',
  suggestion_branched: 'kept your suggestion as a branch of',
  // Works in both directions: the owner and the suggester each receive this when
  // the other replies, so the verb cannot assume which side is reading.
  suggestion_reply: 'replied about',
  follow: 'started following you',
  branch: 'branched your recipe',
};

/** Split items (any order kept) into those created since local midnight of `now` and the rest. */
export function groupByDay<T extends { createdAt: number }>(
  items: T[],
  now: number = Date.now()
): { today: T[]; earlier: T[] } {
  const midnight = new Date(now).setHours(0, 0, 0, 0);
  return {
    today: items.filter((i) => i.createdAt >= midnight),
    earlier: items.filter((i) => i.createdAt < midnight),
  };
}
