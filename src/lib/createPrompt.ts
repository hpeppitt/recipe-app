import { pantryItems, type PantryTimeId } from './library';
import { normaliseAvoid } from './taste';
/** The Create tab's sentence builder (Organic 6c, RL-125): three words, three options each, plus three optional extras (RL-276). */
export const CREATE_OPTIONS = [
  ['quick', 'one-pan', 'slow-cooked'],
  ['chickpeas', 'salmon', 'mushrooms'],
  ['two', 'a crowd', 'lunchboxes'],
  ['spinach', 'peppers', 'courgette', 'broccoli', 'sweet potato', 'carrots'],
  ['in 15 minutes', 'in 30 minutes', 'in an hour'],
  ['on the stove', 'in the oven', 'in the air fryer', 'in the pressure cooker'],
] as const;

type Optional = number | null;
/** One index per word. Slots 3 to 5 (extra veg, time, method) are optional: absent or null means not added. */
export type CreateSelection = readonly [number, number, number, Optional?, Optional?, Optional?];
export type CreateSlot = 0 | 1 | 2 | 3 | 4 | 5;

export const DEFAULT_SELECTION: CreateSelection = [0, 0, 0];

function withSlot(s: CreateSelection, slot: CreateSlot, value: Optional): CreateSelection {
  const next: Optional[] = [s[0], s[1], s[2], s[3] ?? null, s[4] ?? null, s[5] ?? null];
  next[slot] = value;
  return next as unknown as CreateSelection;
}

/** Cycles a slot to its next option, wrapping. An unset optional slot starts at its first option. */
export function cycleWord(selection: CreateSelection, slot: CreateSlot): CreateSelection {
  const cur = selection[slot];
  return withSlot(selection, slot, cur == null ? 0 : (cur + 1) % CREATE_OPTIONS[slot].length);
}

export const addSlot = (s: CreateSelection, slot: CreateSlot): CreateSelection => (s[slot] == null ? withSlot(s, slot, 0) : s);
export const removeSlot = (s: CreateSelection, slot: CreateSlot): CreateSelection => withSlot(s, slot, null);

const word = (s: CreateSelection, slot: CreateSlot) => (s[slot] == null ? null : CREATE_OPTIONS[slot][s[slot]]);

/** The chosen words per slot, in slot order; an unset optional slot is null. */
export const selectedWords = (s: CreateSelection) => ([0, 1, 2, 3, 4, 5] as CreateSlot[]).map((i) => word(s, i));

/** Appends the kept profile terms (RL-235): "Something quick with chickpeas and spinach in the oven, ready in 30 minutes for two, no peanuts". */
export function buildCreatePrompt(selection: CreateSelection, terms: readonly string[] = []): string {
  const [a, b, c, veg, time, method] = selectedWords(selection);
  return `Something ${a} with ${b}${veg ? ` and ${veg}` : ''}${method ? ` ${method}` : ''}${time ? `, ready ${time}` : ''} for ${c}${terms.map((t) => `, ${t}`).join('')}`;
}

/** A taste term on the Create sentence. `avoid` is the stored avoid it came from, if any. */
export interface CreateTerm {
  label: string;
  avoid: string | null;
}

/** The sentence's profile terms (RL-235): each avoid as "no <avoid>", then "under 30 min" when the user tends to make things quicker, unless a time word is already in the sentence (RL-276). */
export function createTerms(avoids: readonly string[], tendToChange: readonly string[], hasTimeSlot = false): CreateTerm[] {
  const terms: CreateTerm[] = avoids.map((a) => ({ label: `no ${a.toLowerCase()}`, avoid: a }));
  if (!hasTimeSlot && tendToChange.some((t) => t.toLowerCase() === 'quicker')) terms.push({ label: 'under 30 min', avoid: null });
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
