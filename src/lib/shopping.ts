import type { Recipe } from '../types/recipe';
import { formatAmount } from './amount';
import {
  ITEM_NAME_MAX,
  ITEM_SOURCES_MAX,
  SOURCE_TITLE_MAX,
  type Item,
  type ItemSource,
  type PantryItem,
} from './kitchen';
import { scaleIngredients } from './scale';
import { canonicalUnit, formatUnit } from './units';

export const AISLES = ['Produce', 'Dairy', 'Meat and fish', 'Bakery', 'Pantry', 'Frozen', 'Other'] as const;
export type Aisle = (typeof AISLES)[number];

/** Same key as ingredient diffs (spec §3): before the first comma, lower case, plural folded. */
export function itemKey(name: string): string {
  return name.split(',')[0].trim().toLowerCase().split(/\s+/).map(fold).join(' ');
}

function fold(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith('oes')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !/(ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}

// Heuristic: a keyword table, not knowledge. Unknown words land in Other; extend the table, not the code.
const KEYWORDS: Record<Exclude<Aisle, 'Other'>, string> = {
  Produce:
    'banana apple lemon lime orange onion shallot garlic ginger spinach kale lettuce rocket cabbage carrot potato tomato cucumber pepper chilli courgette zucchini aubergine eggplant broccoli cauliflower mushroom avocado celery leek herb parsley coriander cilantro basil mint thyme rosemary dill berry grape mango pear peach pumpkin squash beetroot radish asparagus corn pea',
  Dairy:
    'butter milk egg cheese yoghurt yogurt cream parmesan mozzarella feta cheddar ricotta halloumi buttermilk',
  'Meat and fish':
    'chicken beef pork lamb mince bacon sausage ham steak turkey salmon tuna cod prawn shrimp fish anchovy chorizo',
  Bakery: 'bread bun roll baguette tortilla pitta pita naan bagel wrap croissant',
  Pantry:
    'flour sugar miso rice pasta noodle oil salt vinegar honey stock broth spice cumin paprika cinnamon oat lentil bean chickpea soy sauce yeast cocoa chocolate nut almond tahini syrup mustard ketchup',
  Frozen: 'frozen',
};
const AISLE_OF = new Map<string, Aisle>(
  (Object.entries(KEYWORDS) as [Aisle, string][]).flatMap(([aisle, words]) =>
    words.split(' ').map((w) => [w, aisle] as const),
  ),
);
AISLE_OF.set('peanut butter', 'Pantry');
AISLE_OF.set('coconut milk', 'Pantry');

export function aisleFor(name: string): Aisle {
  const key = itemKey(name);
  const whole = AISLE_OF.get(key);
  if (whole) return whole;
  // The last word is usually the noun ("egg noodles"), so look there first.
  for (const word of key.split(' ').reverse()) {
    const hit = AISLE_OF.get(word);
    if (hit) return hit;
  }
  return 'Other';
}

const round = (n: number) => Math.round(n * 100) / 100;
const unitKey = (unit: string | null) => canonicalUnit(unit) ?? unit?.trim().toLowerCase() ?? null;

function total(sources: ItemSource[]): number | null {
  const amounts = sources.flatMap((s) => (s.amount === null ? [] : [s.amount]));
  return amounts.length ? round(amounts.reduce((a, b) => a + b, 0)) : null;
}

/**
 * Add a recipe's ingredients, scaled to `servings`. A line holds at most ITEM_SOURCES_MAX
 * sources; past that a new line with the same key starts, so no source is dropped and
 * removeSource can still subtract every one.
 */
export function addRecipe(list: Item[], recipe: Recipe, servings: number): Item[] {
  const factor = recipe.servings > 0 ? servings / recipe.servings : 1;
  const next = list.map((l) => ({ ...l, sources: [...l.sources] }));
  for (const ing of scaleIngredients(recipe.ingredients, factor)) {
    const key = itemKey(ing.name);
    if (!key) continue;
    const uk = unitKey(ing.unit);
    const same = next.filter(
      (l) => itemKey(l.name) === key && (ing.amount === null || unitKey(l.unit) === uk),
    );
    const target =
      same.find((l) => l.sources.some((s) => s.recipeId === recipe.id)) ??
      same.find((l) => l.sources.length < ITEM_SOURCES_MAX);
    const own = target?.sources.find((s) => s.recipeId === recipe.id);
    if (target && own) {
      own.amount = ing.amount === null ? own.amount : round((own.amount ?? 0) + ing.amount);
      target.amount = total(target.sources);
    } else if (target) {
      target.sources.push(sourceOf(recipe, ing.amount));
      target.amount = total(target.sources);
    } else {
      const name = ing.name.split(',')[0].trim().slice(0, ITEM_NAME_MAX);
      const sources = [sourceOf(recipe, ing.amount)];
      next.push({
        id: crypto.randomUUID(),
        name,
        amount: total(sources),
        unit: ing.unit,
        aisle: aisleFor(name),
        sources,
        done: false,
      });
    }
  }
  return next;
}

function sourceOf(recipe: Recipe, amount: number | null): ItemSource {
  return {
    recipeId: recipe.id,
    emoji: recipe.emoji,
    title: recipe.title.trim().slice(0, SOURCE_TITLE_MAX),
    amount,
  };
}

/** Subtract a recipe's contribution; a line with no sources left is dropped. */
export function removeSource(list: Item[], recipeId: string): Item[] {
  return list.flatMap((l) => {
    const sources = l.sources.filter((s) => s.recipeId !== recipeId);
    if (sources.length === l.sources.length) return [l];
    return sources.length ? [{ ...l, sources, amount: total(sources) }] : [];
  });
}

export function splitByPantry(list: Item[], pantry: PantryItem[]): { toBuy: Item[]; inPantry: Item[] } {
  const have = new Set(pantry.map((p) => itemKey(p.name)));
  return {
    toBuy: list.filter((l) => !have.has(itemKey(l.name))),
    inPantry: list.filter((l) => have.has(itemKey(l.name))),
  };
}

export function listSummary({ toBuy, inPantry }: { toBuy: Item[]; inPantry: Item[] }): string {
  const buy = toBuy.length ? `${toBuy.length} to buy` : 'Nothing to buy';
  return inPantry.length ? `${buy} · ${inPantry.length} already in the pantry` : buy;
}

export function groupByAisle(lines: Item[]): { aisle: string; lines: Item[] }[] {
  return AISLES.map((aisle) => ({
    aisle,
    lines: lines
      .filter((l) => (AISLES.includes(l.aisle as Aisle) ? l.aisle : 'Other') === aisle)
      .sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((g) => g.lines.length);
}

const FRESH: string[] = ['Produce', 'Dairy', 'Meat and fish', 'Bakery'];

/** Empty the list into the pantry, skipping keys the pantry already has. */
export function boughtItAll(
  list: Item[],
  pantry: PantryItem[],
  now: number,
  uid: string,
): { list: Item[]; pantry: PantryItem[] } {
  const have = new Set(pantry.map((p) => itemKey(p.name)));
  const added: PantryItem[] = [];
  for (const l of list) {
    const key = itemKey(l.name);
    if (have.has(key)) continue;
    have.add(key);
    added.push({
      id: crypto.randomUUID(),
      name: l.name,
      group: FRESH.includes(l.aisle) ? 'fresh' : 'cupboard',
      addedBy: uid,
      addedAt: now,
    });
  }
  return { list: [], pantry: [...pantry, ...added] };
}

export function formatLineAmount(line: Pick<Item, 'amount' | 'unit'>): string {
  if (line.amount === null) return '';
  const unit = formatUnit(line.unit, line.amount);
  return unit ? `${formatAmount(line.amount)} ${unit}` : formatAmount(line.amount);
}

/** The plain-text list for sharing; nothing but the list. */
export function shareText(toBuy: Item[]): string {
  const body = groupByAisle(toBuy).map(
    (g) =>
      `${g.aisle.toUpperCase()}\n${g.lines
        .map((l) => {
          const amt = formatLineAmount(l);
          return `- ${l.name}${amt ? `, ${amt}` : ''}`;
        })
        .join('\n')}`
  );
  return ['Shopping list', ...body].join('\n\n');
}
