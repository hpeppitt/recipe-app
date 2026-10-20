/** Chip ordering and the tried / untried split for the quick-change chips. */

const SYNONYMS: Record<string, string[]> = {
  'less sugar': ['lower sugar', 'reduced sugar'],
  quicker: ['faster', 'quick'],
  'gluten-free': ['gluten free'],
  spicier: ['spicy', 'more heat'],
};

/** True when the chip label, or a listed synonym, appears in the prompt. */
export function promptMatchesChip(prompt: string, chip: string): boolean {
  const p = prompt.toLowerCase();
  const label = chip.toLowerCase();
  return [label, ...(SYNONYMS[label] ?? [])].some((t) => p.includes(t));
}

/** Most-used chips by this family's prompts first; ties keep the input order. */
export function orderChips(chips: readonly string[], familyPrompts: string[]): string[] {
  const count = (c: string) => familyPrompts.filter((p) => promptMatchesChip(p, c)).length;
  return chips
    .map((chip, i) => ({ chip, i, n: count(chip) }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map((x) => x.chip);
}

/** Split chips into those no direct child did and those a child already did (first child wins). */
export function splitChips(
  chips: readonly string[],
  children: { id: string; prompt: string }[]
): { untried: string[]; tried: { chip: string; childId: string }[] } {
  const untried: string[] = [];
  const tried: { chip: string; childId: string }[] = [];
  const prompts = children.map((c) => c.prompt);
  for (const chip of orderChips(chips, prompts)) {
    const child = children.find((c) => promptMatchesChip(c.prompt, chip));
    if (child) tried.push({ chip, childId: child.id });
    else untried.push(chip);
  }
  return { untried, tried };
}
