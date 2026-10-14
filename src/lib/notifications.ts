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
