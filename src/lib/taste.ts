/**
 * Taste. The learned part (learnTaste) is computed on the device from the user's own cooks and
 * branches and is never stored or sent. The stored profile (avoids, hidden terms) is bounded below.
 */
import { BRANCH_CHIPS } from './constants';
import { promptMatchesChip } from './branchChips';

/** `at` is the cook or branch time in epoch ms; it only breaks ties (most recent wins). */
export interface TasteCooked {
  title: string;
  tags: string[];
  at: number;
}
export interface TastePrompt {
  prompt: string;
  at: number;
}
export interface Taste {
  cookALot: string[];
  tendToChange: string[];
  cookCount: number;
  branchCount: number;
}

/** Stored taste profile bounds. MUST equal tasteAvoidCap(), tasteHiddenCap() and tasteTermMax() in firestore.rules. */
export const TASTE_AVOID_MAX = 12;
export const TASTE_HIDDEN_MAX = 50;
export const TASTE_TERM_MAX = 40;

const MAX_TERMS = 5;
const MIN_COUNT = 2;
const DISH_WORDS = ['noodles', 'baking', 'eggs', 'curry', 'soup', 'salad', 'pasta', 'bread', 'rice', 'pizza', 'stew'];
const CHANGE_PHRASES = [...BRANCH_CHIPS, 'Shorter bake', 'More greens'];

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Terms seen in at least MIN_COUNT items, most frequent first, ties by most recent, then A to Z. */
function top(termsPerItem: { terms: Set<string>; at: number }[], hidden: Set<string>): string[] {
  const stats = new Map<string, { n: number; at: number }>();
  for (const { terms, at } of termsPerItem) {
    for (const t of terms) {
      const s = stats.get(t) ?? { n: 0, at: 0 };
      stats.set(t, { n: s.n + 1, at: Math.max(s.at, at) });
    }
  }
  return [...stats]
    .filter(([t, s]) => s.n >= MIN_COUNT && !hidden.has(t.toLowerCase()))
    .sort((a, b) => b[1].n - a[1].n || b[1].at - a[1].at || a[0].localeCompare(b[0]))
    .slice(0, MAX_TERMS)
    .map(([t]) => sentence(t));
}

export function learnTaste(input: {
  cookedRecipes: TasteCooked[];
  branchPrompts: TastePrompt[];
  hidden: string[];
}): Taste {
  const hidden = new Set(input.hidden.map((h) => h.trim().toLowerCase()));
  const cooked = input.cookedRecipes.map((r) => {
    const words = r.title.toLowerCase().split(/[^a-z]+/);
    const terms = new Set([
      ...r.tags.map((t) => t.trim().toLowerCase()).filter(Boolean),
      ...DISH_WORDS.filter((w) => words.includes(w)),
    ]);
    return { terms, at: r.at };
  });
  const branches = input.branchPrompts.map((b) => ({
    terms: new Set(CHANGE_PHRASES.filter((c) => promptMatchesChip(b.prompt, c)).map((c) => c.toLowerCase())),
    at: b.at,
  }));
  return {
    cookALot: top(cooked, hidden),
    tendToChange: top(branches, hidden),
    cookCount: cooked.length,
    branchCount: branches.length,
  };
}

export function tasteHeadline(cookCount: number, branchCount: number): string {
  if (cookCount === 0 && branchCount === 0) return 'Cook and branch a few recipes and this fills in.';
  const n = (c: number, w: string) => `${c} ${w}${c === 1 ? '' : 's'}`;
  return `Learned from ${n(cookCount, 'cook')} and ${n(branchCount, 'branch').replace('branchs', 'branches')}.`;
}

/** What `tasteProfiles/{uid}` holds. `askedAt` is epoch ms, or null if the user was never asked. */
export interface TasteProfile {
  avoids: string[];
  hidden: string[];
  askedAt: number | null;
}

const clean = (s: string) => s.replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim();
/** Length in code points, which is what the cut below keeps within TASTE_TERM_MAX. */
export const termLength = (s: string) => Array.from(s).length;
const cut = (s: string) => Array.from(s).slice(0, TASTE_TERM_MAX).join('').trim();

const dedupe = (terms: string[]) => {
  const seen = new Set<string>();
  return terms.filter((t) => t && !seen.has(t.toLowerCase()) && !!seen.add(t.toLowerCase()));
};

/** One avoid: case first (lower, then sentence), then one line, then at most 40 code points. Empty when nothing is left. */
export function normaliseAvoid(raw: string): string {
  const [first = '', ...rest] = Array.from(clean(raw.toLowerCase()));
  return cut(first.toUpperCase() + rest.join(''));
}

/** Trimmed, one line, sentence case, deduped without regard to case, 40 code points each, at most 12 (the first win). */
export function normaliseAvoids(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const terms = raw.filter((x): x is string => typeof x === 'string').map(normaliseAvoid);
  return dedupe(terms).slice(0, TASTE_AVOID_MAX);
}

/**
 * Hidden learned terms: strings only, one line, deduped without regard to case, at most 50 (the newest win).
 * The rules do not check each element, so this is the only guard. A term over 40 code points is dropped, not cut,
 * because a cut term would no longer match what `learnTaste` derives.
 */
export function normaliseHidden(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const terms = raw.filter((x): x is string => typeof x === 'string').map(clean);
  return dedupe(terms.filter((t) => termLength(t) <= TASTE_TERM_MAX)).slice(-TASTE_HIDDEN_MAX);
}
