import type { Ingredient, Instruction, Recipe } from '../types/recipe';
import { formatAmount } from './amount';
import { canonicalUnit, formatUnit } from './units';

export type IngredientChange =
  | { type: 'unchanged'; ingredient: Ingredient }
  | { type: 'changed'; before: Ingredient; after: Ingredient }
  | { type: 'added'; ingredient: Ingredient }
  | { type: 'removed'; ingredient: Ingredient };

export interface TextSpan {
  type: 'same' | 'insert' | 'delete';
  text: string;
}

export type StepChange =
  | { type: 'unchanged'; step: Instruction }
  | { type: 'changed'; before: Instruction; after: Instruction; spans: TextSpan[] }
  | { type: 'added'; step: Instruction }
  | { type: 'removed'; step: Instruction };

export interface NumberDelta {
  before: number;
  after: number;
  delta: number;
}

export interface RecipeDiff {
  ingredients: IngredientChange[];
  steps: StepChange[];
  totalTime: NumberDelta;
  servings: NumberDelta;
  identical: boolean;
}

/** Lower case, punctuation to spaces, collapsed whitespace. */
function normText(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** Normalised ingredient name with a trailing plural s dropped per word. */
function nameWords(name: string): string[] {
  return normText(name)
    .split(' ')
    .filter(Boolean)
    .map((w) => (w.length > 2 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
}

function normName(name: string): string {
  return nameWords(name).join(' ');
}

function unitKey(unit: string | null): string | null {
  return canonicalUnit(unit) ?? (unit?.trim().toLowerCase() || null);
}

function similarity(a: string, b: string): number {
  const sa = new Set(nameWords(a));
  const sb = new Set(nameWords(b));
  if (sa.size === 0 || sb.size === 0) return 0;
  let shared = 0;
  for (const w of sa) if (sb.has(w)) shared += 1;
  const jaccard = shared / (sa.size + sb.size - shared);
  const contains = shared === sa.size || shared === sb.size;
  return contains ? Math.max(jaccard, 0.5) : jaccard >= 0.5 ? jaccard : 0;
}

/** True when the two paired ingredients differ in name, unit or (both present) amount. */
function ingredientDiffers(a: Ingredient, b: Ingredient): boolean {
  if (normName(a.name) !== normName(b.name)) return true;
  if (unitKey(a.unit) !== unitKey(b.unit)) return true;
  return a.amount != null && b.amount != null && a.amount !== b.amount;
}

/** Returns match[parentIndex] = childIndex, one-to-one, in the three passes of RL-066. */
function matchIngredients(parent: Ingredient[], child: Ingredient[]): Map<number, number> {
  const match = new Map<number, number>();
  const taken = new Set<number>();
  const pass = (ok: (p: Ingredient, c: Ingredient) => boolean) => {
    parent.forEach((p, i) => {
      if (match.has(i)) return;
      const j = child.findIndex((c, k) => !taken.has(k) && ok(p, c));
      if (j >= 0) {
        match.set(i, j);
        taken.add(j);
      }
    });
  };
  pass((p, c) => normName(p.name) === normName(c.name) && p.group === c.group);
  pass((p, c) => normName(p.name) === normName(c.name));

  const pairs: { i: number; j: number; score: number }[] = [];
  parent.forEach((p, i) => {
    if (match.has(i)) return;
    child.forEach((c, j) => {
      if (taken.has(j)) return;
      const score = similarity(p.name, c.name);
      if (score > 0) pairs.push({ i, j, score });
    });
  });
  pairs.sort((x, y) => y.score - x.score || x.i - y.i || x.j - y.j);
  for (const { i, j } of pairs) {
    if (match.has(i) || taken.has(j)) continue;
    match.set(i, j);
    taken.add(j);
  }
  return match;
}

/** Suffix LCS table. O(n*m) memory and time, fine for recipe-sized lists. */
function lcsTable(a: string[], b: string[]): number[][] {
  const t = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
    }
  }
  return t;
}

function pushSpan(spans: TextSpan[], type: TextSpan['type'], text: string) {
  const last = spans[spans.length - 1];
  if (last && last.type === type) last.text += ` ${text}`;
  else spans.push({ type, text });
}

function wordSpans(before: string, after: string): TextSpan[] {
  const a = before.split(/\s+/).filter(Boolean);
  const b = after.split(/\s+/).filter(Boolean);
  const na = a.map(normText);
  const nb = b.map(normText);
  const t = lcsTable(na, nb);
  const spans: TextSpan[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && na[i] === nb[j]) {
      pushSpan(spans, 'same', b[j]);
      i++;
      j++;
    } else if (i < a.length && (j >= b.length || t[i + 1][j] >= t[i][j + 1])) {
      pushSpan(spans, 'delete', a[i++]);
    } else {
      pushSpan(spans, 'insert', b[j++]);
    }
  }
  return spans;
}

function diffSteps(parent: Instruction[], child: Instruction[]): StepChange[] {
  const np = parent.map((s) => normText(s.text));
  const nc = child.map((s) => normText(s.text));
  const t = lcsTable(np, nc);
  const out: StepChange[] = [];
  let i = 0;
  let j = 0;
  // Flush the gap between two anchors: pair by position, then leftovers.
  const flush = (pi: number, cj: number) => {
    const n = Math.min(pi - i, cj - j);
    for (let k = 0; k < n; k++) {
      const before = parent[i + k];
      const after = child[j + k];
      out.push({ type: 'changed', before, after, spans: wordSpans(before.text, after.text) });
    }
    for (let k = i + n; k < pi; k++) out.push({ type: 'removed', step: parent[k] });
    for (let k = j + n; k < cj; k++) out.push({ type: 'added', step: child[k] });
  };
  while (i < np.length && j < nc.length) {
    if (np[i] === nc[j]) {
      out.push({ type: 'unchanged', step: child[j] });
      i++;
      j++;
      continue;
    }
    // Find the next anchor by walking the LCS path to the next equal pair.
    let pi = i;
    let cj = j;
    while (pi < np.length && cj < nc.length && np[pi] !== nc[cj]) {
      if (t[pi + 1][cj] >= t[pi][cj + 1]) pi++;
      else cj++;
    }
    // No further anchor: the rest of both lists is one gap.
    if (pi >= np.length || cj >= nc.length) {
      pi = np.length;
      cj = nc.length;
    }
    flush(pi, cj);
    i = pi;
    j = cj;
  }
  flush(np.length, nc.length);
  return out;
}

const delta = (before: number, after: number): NumberDelta => ({ before, after, delta: after - before });

export function diffRecipes(parent: Recipe, child: Recipe): RecipeDiff {
  const pIng = parent.ingredients ?? [];
  const cIng = child.ingredients ?? [];
  const match = matchIngredients(pIng, cIng);
  const byChild = new Map<number, number>();
  match.forEach((j, i) => byChild.set(j, i));

  const ingredients: IngredientChange[] = cIng.map((after, j) => {
    const i = byChild.get(j);
    if (i === undefined) return { type: 'added', ingredient: after };
    const before = pIng[i];
    return ingredientDiffers(before, after)
      ? { type: 'changed', before, after }
      : { type: 'unchanged', ingredient: after };
  });
  pIng.forEach((ingredient, i) => {
    if (!match.has(i)) ingredients.push({ type: 'removed', ingredient });
  });

  const steps = diffSteps(parent.instructions ?? [], child.instructions ?? []);
  const totalTime = delta(parent.totalTime, child.totalTime);
  const servings = delta(parent.servings, child.servings);
  const identical =
    ingredients.every((c) => c.type === 'unchanged') &&
    steps.every((s) => s.type === 'unchanged') &&
    totalTime.delta === 0 &&
    servings.delta === 0;
  return { ingredients, steps, totalTime, servings, identical };
}

function withUnit(amount: number, unit: string | null): string {
  const u = formatUnit(unit, amount);
  return `${formatAmount(amount)}${u ? ` ${u}` : ''}`;
}

function changedTag(before: Ingredient, after: Ingredient): string {
  if (
    before.amount != null &&
    after.amount != null &&
    before.amount !== after.amount &&
    unitKey(before.unit) === unitKey(after.unit) &&
    normName(before.name) === normName(after.name)
  ) {
    const d = after.amount - before.amount;
    return `${d > 0 ? '+' : '-'}${withUnit(Math.abs(d), after.unit)} ${after.name}`;
  }
  return `~ ${after.name}`;
}

export function summariseChanges(diff: RecipeDiff, max: number): string[] {
  if (max <= 0 || diff.identical) return [];
  const tags: string[] = [];
  for (const c of diff.ingredients) {
    if (c.type === 'added') {
      const { amount, unit, name } = c.ingredient;
      tags.push(`+ ${amount != null ? `${withUnit(amount, unit)} ` : ''}${name}`);
    }
  }
  for (const c of diff.ingredients) if (c.type === 'changed') tags.push(changedTag(c.before, c.after));
  for (const c of diff.ingredients) if (c.type === 'removed') tags.push(`- ${c.ingredient.name}`);
  if (tags.length === 0 && diff.steps.some((s) => s.type !== 'unchanged')) tags.push('~ method');
  if (tags.length <= max) return tags;
  const kept = tags.slice(0, max - 1);
  return [...kept, `+${tags.length - kept.length} more`];
}
