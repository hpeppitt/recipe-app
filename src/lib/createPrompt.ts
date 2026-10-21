import { pantryItems, type PantryTimeId } from './library';
import { normaliseAvoid } from './taste';
/** The Create tab's sentence builder (Organic 6c, RL-125): three words, three options each. */
export const CREATE_OPTIONS = [
  ['quick', 'one-pan', 'slow-cooked'],
  ['chickpeas', 'salmon', 'mushrooms'],
  ['two', 'a crowd', 'lunchboxes'],
] as const;

/** One index per word, in sentence order. */
export type CreateSelection = readonly [number, number, number];
export type CreateSlot = 0 | 1 | 2;

export const DEFAULT_SELECTION: CreateSelection = [0, 0, 0];

export function cycleWord(selection: CreateSelection, slot: CreateSlot): CreateSelection {
  const next: [number, number, number] = [...selection];
  next[slot] = (next[slot] + 1) % CREATE_OPTIONS[slot].length;
  return next;
}

export const selectedWords = (s: CreateSelection) => [0, 1, 2].map((i) => CREATE_OPTIONS[i][s[i]]);

/** Appends the kept profile terms (RL-235): "Something quick with chickpeas for two, no peanuts, under 30 min". */
export function buildCreatePrompt(selection: CreateSelection, terms: readonly string[] = []): string {
  const [a, b, c] = selectedWords(selection);
  return `Something ${a} with ${b} for ${c}${terms.map((t) => `, ${t}`).join('')}`;
}

/** A taste term on the Create sentence. `avoid` is the stored avoid it came from, if any. */
export interface CreateTerm {
  label: string;
  avoid: string | null;
}

/** The sentence's profile terms (RL-235): each avoid as "no <avoid>", then "under 30 min" when the user tends to make things quicker. */
export function createTerms(avoids: readonly string[], tendToChange: readonly string[]): CreateTerm[] {
  const terms: CreateTerm[] = avoids.map((a) => ({ label: `no ${a.toLowerCase()}`, avoid: a }));
  if (tendToChange.some((t) => t.toLowerCase() === 'quicker')) terms.push({ label: 'under 30 min', avoid: null });
  return terms;
}

/**
 * The avoids a chat session uses after the Create tab's drops (RL-235). `drop` arrives in navigation
 * state, so it is untrusted: only strings that match a stored avoid (case-insensitive, normalised) remove it.
 */
export function keptAvoids(avoids: readonly string[], drop: unknown): string[] {
  if (!Array.isArray(drop)) return [...avoids];
  const dropped = new Set(drop.filter((d): d is string => typeof d === 'string').map((d) => normaliseAvoid(d).toLowerCase()));
  return avoids.filter((a) => !dropped.has(normaliseAvoid(a).toLowerCase()));
}

const PANTRY_SUFFIX: Record<PantryTimeId, string> = { '15': ' in under 15 minutes', '30': ' in under 30 minutes', '60': ' in under an hour', any: '' };

/** The Pantry sheet's "write one with these" prompt (RL-168). */
export function buildPantryPrompt(items: readonly string[], timeId: PantryTimeId): string {
  const list = pantryItems(items);
  const joined = list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list[0];
  return `Something with ${joined ?? 'what I have'}${PANTRY_SUFFIX[timeId]}`;
}
