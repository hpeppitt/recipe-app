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
