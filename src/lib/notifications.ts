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

export type ActivityChip = 'all' | 'branches' | 'suggestions' | 'follows';

const CHIP_TYPES: Record<Exclude<ActivityChip, 'all'>, string[]> = {
  branches: ['branch', 'suggestion_branched', 'moved'],
  suggestions: ['suggestion', 'suggestion_reply', 'suggestion_approved', 'suggestion_rejected', 'suggestion_applied'],
  follows: ['follow'],
};

/** Rows for a chip. `favorite` and unknown types appear under All only. */
export function filterByChip<T extends { type: string }>(items: T[], chip: ActivityChip): T[] {
  return chip === 'all' ? items : items.filter((i) => CHIP_TYPES[chip].includes(i.type));
}

export interface NotificationPrefs {
  branch: boolean;
  suggestion: boolean;
  follow: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = { branch: true, suggestion: true, follow: true };

const PREF_TYPES: Record<keyof NotificationPrefs, string[]> = {
  branch: ['branch'],
  suggestion: ['suggestion', 'suggestion_reply'],
  follow: ['follow'],
};

/**
 * Drops the types the person switched off. Outcome types and `favorite` always
 * show. Notifications are still written for every event; this is read-side only,
 * so switching a type back on shows the old ones again.
 */
export function visibleFor<T extends { type: string }>(items: T[], prefs: NotificationPrefs): T[] {
  const hidden = new Set((Object.keys(PREF_TYPES) as (keyof NotificationPrefs)[]).filter((k) => !prefs[k]).flatMap((k) => PREF_TYPES[k]));
  return hidden.size ? items.filter((i) => !hidden.has(i.type)) : items;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Group items under Today, Yesterday, a weekday (2 to 6 days ago), then a date
 * ("12 Oct", with the year when not the current one). Days are local calendar
 * days, counted through Date.UTC of the local Y/M/D so a 23 or 25 hour DST day
 * still counts as one. Input order is kept within and between groups; a future
 * timestamp (clock skew) counts as Today.
 */
export function groupByDays<T extends { createdAt: number }>(
  items: T[],
  now: number = Date.now()
): { label: string; items: T[] }[] {
  const n = new Date(now);
  const today = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const d = new Date(item.createdAt);
    const days = Math.round((today - Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 86400_000);
    const label =
      days <= 0
        ? 'Today'
        : days === 1
          ? 'Yesterday'
          : days <= 6
            ? WEEKDAYS[d.getDay()]
            : `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() === n.getFullYear() ? '' : ` ${d.getFullYear()}`}`;
    const group = groups.get(label);
    if (group) group.push(item);
    else groups.set(label, [item]);
  }
  return [...groups].map(([label, items]) => ({ label, items }));
}
