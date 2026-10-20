// Priority order: the first label whose tag is present wins (vegan beats vegetarian).
const DIETS: [key: string, label: string][] = [
  ['vegan', 'Vegan'],
  ['vegetarian', 'Vegetarian'],
  ['pescatarian', 'Pescatarian'],
  ['glutenfree', 'Gluten-free'],
  ['dairyfree', 'Dairy-free'],
  ['keto', 'Keto'],
  ['paleo', 'Paleo'],
];

const norm = (t: string) => t.toLowerCase().replace(/[\s-]/g, '');

export function dietLabel(tags: string[]): string | null {
  const keys = new Set(tags.map(norm));
  return DIETS.find(([key]) => keys.has(key))?.[1] ?? null;
}
