import type { Cook } from '../types/social';

export function madeByLine(total: number, again: number): string | null {
  if (total <= 0) return null;
  const made = total === 1 ? 'Made once' : `Made ${total} times`;
  if (again <= 0) return made;
  return `${made} · ${total === 1 ? 'would' : `${again} would`} make again`;
}

/** Distinct cooks by uid, newest first, for the avatar stack. */
export function recentCooks(cooks: Cook[], max = 3): Cook[] {
  const seen = new Set<string>();
  const out: Cook[] = [];
  for (const c of [...cooks].sort((a, b) => b.createdAt - a.createdAt)) {
    if (seen.has(c.uid)) continue;
    seen.add(c.uid);
    out.push(c);
    if (out.length === max) break;
  }
  return out;
}

export function cookLogSummary(cooks: Cook[]): string {
  const recipes = new Set(cooks.map((c) => c.recipeId)).size;
  const branches = cooks.filter((c) => c.branchId).length;
  const parts = [
    `${cooks.length} ${cooks.length === 1 ? 'cook' : 'cooks'}`,
    `${recipes} ${recipes === 1 ? 'recipe' : 'recipes'}`,
  ];
  if (branches > 0) {
    parts.push(branches === 1 ? '1 branch grew from a note' : `${branches} branches grew from notes`);
  }
  return parts.join(' · ');
}

export type CookTag = 'branched' | 'again' | 'tweak';

export const COOK_TAGS: Record<CookTag, { label: string; icon: string }> = {
  branched: { label: 'Branched', icon: 'GitBranch' },
  again: { label: 'Again', icon: 'Repeat' },
  tweak: { label: 'Tweak', icon: 'Wrench' },
};

export function cookTag(cook: Pick<Cook, 'branchId' | 'vote'>): CookTag {
  return cook.branchId ? 'branched' : cook.vote;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Local calendar days between two instants, so late-night cooks do not slip a day. */
function daysAgo(createdAt: number, now: number): number {
  const a = new Date(createdAt);
  const b = new Date(now);
  const da = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const db = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((db - da) / 86_400_000);
}

export function cookWhen(createdAt: number, now: number): string {
  const n = daysAgo(createdAt, now);
  const d = new Date(createdAt);
  if (n <= 6) return DAYS[d.getDay()];
  if (n <= 13) return 'Last week';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "Sunday · would make again" / "Sunday · needs a tweak". */
export function cookWhenLine(cook: Pick<Cook, 'createdAt' | 'vote'>, now: number): string {
  const vote = cook.vote === 'again' ? 'would make again' : 'needs a tweak';
  return `${cookWhen(cook.createdAt, now)} · ${vote}`;
}

export function noteToBranchPrompt(note: string): string | null {
  const t = note.trim().replace(/\s+/g, ' ');
  if (!t) return null;
  if (t.length <= 200) return t;
  const cut = t.slice(0, 200);
  // Keep the whole word when the cut lands exactly on a boundary.
  if (t[200] === ' ') return cut;
  const i = cut.lastIndexOf(' ');
  return i > 0 ? cut.slice(0, i) : cut;
}
