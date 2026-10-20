import type { Collaborator, CreatedBy, Ingredient, Instruction, Recipe } from '../types/recipe';
import type { Suggestion, SuggestionEdit } from '../types/social';
import { formatAmount } from './amount';

/** Client-side caps. The rules set no size limit on a suggestion message, so these are the only ones. */
export const MAX_WHY = 200;
export const MAX_NOTE = 1000;
export const MAX_MESSAGE = 2000;

export interface IngredientEdit {
  name: string;
  /** The amount and unit as shown, e.g. "1 cup". May be empty for an ingredient with no amount. */
  oldAmount: string;
  newAmount: string;
  why?: string;
}

/**
 * Turns edits into the free-text message a suggestion also carries, so old clients,
 * notifications and exports keep reading text. Accepts suggest-mode ingredient edits
 * or structured ones. An edit whose new text is blank or unchanged says nothing and is
 * dropped. Empty string when nothing remains.
 */
export function composeSuggestionMessage(edits: (IngredientEdit | SuggestionEdit)[], note?: string): string {
  const notes: string[] = [];
  const lines = edits.flatMap((e) => {
    const from = ('kind' in e ? e.from : e.oldAmount).trim();
    const to = ('kind' in e ? e.to : e.newAmount).trim();
    if (!to || to === from) return [];
    if ('kind' in e && e.kind === 'general') {
      notes.push(to);
      return [];
    }
    const why = e.why?.trim();
    const tail = why ? ` ${why}` : '';
    if ('kind' in e && e.kind === 'step') return [`Change step ${(e.index ?? 0) + 1} to: ${to}.${tail}`];
    const subject = [from, e.name?.trim()].filter(Boolean).join(' ');
    return [`Change ${subject} to ${to}.${tail}`];
  });
  const n = note?.trim();
  return [lines.join('\n'), ...notes, n].filter(Boolean).join('\n\n');
}

const GLYPHS: Record<string, number> = { '½': 1 / 2, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 1 / 4, '¾': 3 / 4, '⅛': 1 / 8 };
const NUM = /^(?:(\d+)\s*([½⅓⅔¼¾⅛])|([½⅓⅔¼¾⅛])|(\d+)\s+(\d+)\/(\d+)|(\d+)\/(\d+)|(\d+(?:\.\d+)?|\.\d+))/;

/** Reads "100 g", "1/2 cup", "½ tsp", "1 1/2 cups", "2". Null when no leading number. */
export function parseAmountText(text: string): { amount: number | null; unit: string | null } | null {
  const t = text.trim();
  const m = NUM.exec(t);
  if (!m) return null;
  if ((m[6] && !Number(m[6])) || (m[8] && !Number(m[8]))) return null;
  const amount = m[2]
    ? Number(m[1]) + GLYPHS[m[2]]
    : m[3]
      ? GLYPHS[m[3]]
      : m[4]
        ? Number(m[4]) + Number(m[5]) / Number(m[6])
        : m[7]
          ? Number(m[7]) / Number(m[8])
          : Number(m[9]);
  const unit = t.slice(m[0].length).trim();
  if (/^[\d-]/.test(unit)) return null;
  return { amount, unit: unit || null };
}

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function describeEdit(edit: SuggestionEdit): string {
  if (edit.kind === 'step') return `Step ${(edit.index ?? 0) + 1}: ${cut(edit.to, 60)}`;
  if (edit.kind === 'general') return cut(edit.to, 80);
  return `${[edit.from.trim(), edit.name?.trim()].filter(Boolean).join(' ')} → ${edit.to.trim()}`;
}

export function describeEdits(edits: SuggestionEdit[]): string {
  if (edits.length === 0) return '';
  const rest = edits.length - 1;
  return describeEdit(edits[0]) + (rest > 0 ? ` and ${rest} more` : '');
}

export function hasApplicableEdits(edits: SuggestionEdit[]): boolean {
  return edits.some((e) => e.kind === 'ingredient' || e.kind === 'step');
}

const shownAmount = (i: Ingredient) =>
  [i.amount == null ? '' : formatAmount(i.amount), i.unit ?? ''].filter(Boolean).join(' ');
const norm = (s: string | undefined) => (s ?? '').trim().toLowerCase();

export type ApplyResult =
  | { ok: true; patch: { ingredients: Ingredient[]; instructions: Instruction[] } }
  | { ok: false; stale: number[] };

/** All or nothing: any edit that no longer matches the recipe makes the whole set stale. */
export function applySuggestionEdits(
  recipe: Pick<Recipe, 'ingredients' | 'instructions'>,
  edits: SuggestionEdit[]
): ApplyResult {
  const ingredients = recipe.ingredients.map((i) => ({ ...i }));
  const instructions = recipe.instructions.map((i) => ({ ...i }));
  const stale: number[] = [];
  edits.forEach((e, pos) => {
    if (e.kind === 'step') {
      const step = e.index == null ? undefined : instructions[e.index];
      if (!step || norm(step.text) !== norm(e.from)) stale.push(pos);
      else step.text = e.to;
    } else if (e.kind === 'ingredient') {
      let ing = e.index == null ? undefined : ingredients[e.index];
      if (!ing || norm(ing.name) !== norm(e.name)) {
        const named = ingredients.filter((i) => norm(i.name) === norm(e.name));
        ing = named.length === 1 ? named[0] : undefined;
      }
      if (!ing || norm(shownAmount(ing)) !== norm(e.from)) {
        stale.push(pos);
        return;
      }
      if (!e.to.trim()) return; // blank is ignored, as in composeSuggestionMessage
      const parsed = parseAmountText(e.to);
      ing.amount = parsed?.amount ?? null;
      ing.unit = parsed?.unit ?? null;
      // An amount with no number ("a pinch") is kept as the ingredient's note rather than lost.
      if (!parsed) ing.notes = [ing.notes, e.to.trim()].filter(Boolean).join('; ');
    }
  });
  return stale.length ? { ok: false, stale } : { ok: true, patch: { ingredients, instructions } };
}

/** The branch Keep as branch creates: owned by the recipe owner, suggester as collaborator, no AI. */
export function buildBranchFromSuggestion(
  parent: Recipe,
  suggestion: Pick<Suggestion, 'suggestedBy' | 'edits'>,
  owner: CreatedBy,
  id: string,
  now: number
): Recipe {
  const edits = suggestion.edits ?? [];
  if (!hasApplicableEdits(edits)) throw new Error('Suggestion has no ingredient or step edits');
  const applied = applySuggestionEdits(parent, edits);
  if (!applied.ok) throw new Error(`Suggestion edits are stale: ${applied.stale.join(', ')}`);
  const collaborator: Collaborator = { uid: suggestion.suggestedBy.uid, displayName: suggestion.suggestedBy.displayName };
  return {
    id,
    parentId: parent.id,
    rootId: parent.rootId,
    depth: parent.depth + 1,
    createdBy: owner,
    collaborators: collaborator.uid === owner.uid ? [] : [collaborator],
    title: parent.title,
    description: parent.description,
    ingredients: applied.patch.ingredients,
    instructions: applied.patch.instructions,
    notes: [...parent.notes],
    prepTime: parent.prepTime,
    cookTime: parent.cookTime,
    totalTime: parent.totalTime,
    servings: parent.servings,
    difficulty: parent.difficulty,
    tags: [...parent.tags],
    emoji: parent.emoji,
    ...(parent.nutrition ? { nutrition: { ...parent.nutrition } } : {}),
    prompt: describeEdits(edits),
    chatHistory: [],
    createdAt: now,
    updatedAt: now,
  };
}
