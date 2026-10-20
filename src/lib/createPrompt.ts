import { pantryItems, type PantryTimeId } from './library';
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

export function buildCreatePrompt(selection: CreateSelection): string {
  const [a, b, c] = selectedWords(selection);
  return `Something ${a} with ${b} for ${c}`;
}

const PANTRY_SUFFIX: Record<PantryTimeId, string> = { '15': ' in under 15 minutes', '30': ' in under 30 minutes', '60': ' in under an hour', any: '' };

/** The Pantry sheet's "write one with these" prompt (RL-168). */
export function buildPantryPrompt(items: readonly string[], timeId: PantryTimeId): string {
  const list = pantryItems(items);
  const joined = list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list[0];
  return `Something with ${joined ?? 'what I have'}${PANTRY_SUFFIX[timeId]}`;
}
