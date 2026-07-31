import type { Recipe, Ingredient, Instruction } from '../types/recipe';

/**
 * The form state behind manual recipe editing, and the pure normalisation that
 * turns it back into a patch.
 *
 * Numbers are held as strings throughout. A number-typed field bound to a number
 * cannot represent "the user has cleared it and is about to type 250", and
 * coercing on every keystroke fights the person typing. Parsing happens once, at
 * submit, in `draftToPatch`.
 *
 * Edits apply in place, on the same recipe id, preserving the recipe's position
 * in the tree. Edit-as-new-version was rejected: appending a child node for a
 * typo fix burns the tree's legibility, and the tree is reserved for intentional
 * variations. The accepted trade is that in-place edits are not versioned — a
 * favouriter can see the recipe change under them, which is how every recipe site
 * on the internet works.
 */

export interface IngredientDraft {
  amount: string;
  unit: string;
  name: string;
  notes: string;
  group: string;
}

export interface InstructionDraft {
  text: string;
  group: string;
}

export interface RecipeDraft {
  title: string;
  description: string;
  emoji: string;
  servings: string;
  prepTime: string;
  cookTime: string;
  difficulty: Recipe['difficulty'];
  tags: string;
  ingredients: IngredientDraft[];
  instructions: InstructionDraft[];
  notes: string[];
}

/** Field-keyed messages. Empty object means the draft is publishable. */
export type DraftErrors = Partial<Record<'title' | 'ingredients' | 'instructions' | 'servings' | 'prepTime' | 'cookTime', string>>;

export const EMPTY_INGREDIENT: IngredientDraft = {
  amount: '',
  unit: '',
  name: '',
  notes: '',
  group: '',
};

export const EMPTY_INSTRUCTION: InstructionDraft = { text: '', group: '' };

function numberToDraft(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

export function recipeToDraft(recipe: Recipe): RecipeDraft {
  return {
    title: recipe.title,
    description: recipe.description,
    emoji: recipe.emoji,
    servings: numberToDraft(recipe.servings),
    prepTime: numberToDraft(recipe.prepTime),
    cookTime: numberToDraft(recipe.cookTime),
    difficulty: recipe.difficulty,
    // Comma-separated rather than chip-per-tag: tags are short, rarely edited,
    // and a chip editor is a lot of interaction surface for the payoff.
    tags: recipe.tags.join(', '),
    ingredients: recipe.ingredients.map((i) => ({
      amount: numberToDraft(i.amount),
      unit: i.unit ?? '',
      name: i.name,
      notes: i.notes ?? '',
      group: i.group ?? '',
    })),
    instructions: recipe.instructions.map((i) => ({
      text: i.text,
      group: i.group ?? '',
    })),
    notes: [...recipe.notes],
  };
}

/**
 * An empty string means "not specified" and must become null, not 0.
 * "0 minutes prep" is a claim; absence is a gap. Anything unparseable is left to
 * the caller's validation rather than silently becoming null here.
 */
function draftToNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** A row the user started and abandoned is not an error, it is nothing. */
function isBlankIngredient(row: IngredientDraft): boolean {
  return !row.name.trim() && !row.amount.trim() && !row.unit.trim() && !row.notes.trim();
}

export function validateDraft(draft: RecipeDraft): DraftErrors {
  const errors: DraftErrors = {};

  if (!draft.title.trim()) {
    errors.title = 'A recipe needs a title.';
  }

  if (draft.ingredients.every(isBlankIngredient)) {
    errors.ingredients = 'Add at least one ingredient.';
  } else if (draft.ingredients.some((r) => !isBlankIngredient(r) && !r.name.trim())) {
    // An amount with no ingredient name is unusable, and dropping it silently
    // would lose what the user typed.
    errors.ingredients = 'Every ingredient needs a name.';
  } else if (
    draft.ingredients.some(
      (r) => !isBlankIngredient(r) && r.amount.trim() !== '' && draftToNumber(r.amount) === null
    )
  ) {
    errors.ingredients = 'Amounts must be numbers. Put ranges or notes in the notes field.';
  }

  if (draft.instructions.every((r) => !r.text.trim())) {
    errors.instructions = 'Add at least one step.';
  }

  const numeric = [
    ['servings', draft.servings],
    ['prepTime', draft.prepTime],
    ['cookTime', draft.cookTime],
  ] as const;
  for (const [field, raw] of numeric) {
    if (!raw.trim()) continue;
    const parsed = draftToNumber(raw);
    if (parsed === null) {
      errors[field] = 'Must be a number.';
    } else if (parsed < 0) {
      errors[field] = "Can't be negative.";
    } else if (field === 'servings' && parsed === 0) {
      errors.servings = 'Must serve at least one.';
    }
  }

  return errors;
}

/** The subset of a Recipe an edit is allowed to touch. */
export type RecipePatch = Pick<
  Recipe,
  | 'title'
  | 'description'
  | 'emoji'
  | 'servings'
  | 'prepTime'
  | 'cookTime'
  | 'totalTime'
  | 'difficulty'
  | 'tags'
  | 'ingredients'
  | 'instructions'
  | 'notes'
>;

/**
 * Normalises a valid draft into a patch.
 *
 * Deliberately narrow: it names the twelve content fields rather than spreading,
 * so an edit can never reach `createdBy`, `id`, `parentId`, `rootId`, `depth`,
 * `collaborators` or `chatHistory`. Ownership and tree position are not editable
 * content, and `firestore.rules` would reject a `createdBy` change anyway — this
 * is the same boundary stated on the client side.
 *
 * Call `validateDraft` first; this assumes a draft that passed.
 */
export function draftToPatch(draft: RecipeDraft, previous: Recipe): RecipePatch {
  const ingredients: Ingredient[] = draft.ingredients
    .filter((row) => !isBlankIngredient(row))
    .map((row) => ({
      amount: draftToNumber(row.amount),
      unit: blankToNull(row.unit),
      name: row.name.trim(),
      notes: blankToNull(row.notes),
      group: blankToNull(row.group),
    }));

  const instructions: Instruction[] = draft.instructions
    .filter((row) => row.text.trim())
    // Renumbered rather than trusting the form: deleting step 2 of five must not
    // leave the recipe numbered 1, 3, 4, 5.
    .map((row, index) => ({
      step: index + 1,
      text: row.text.trim(),
      group: blankToNull(row.group),
    }));

  const prepTime = draftToNumber(draft.prepTime) ?? 0;
  const cookTime = draftToNumber(draft.cookTime) ?? 0;

  return {
    title: draft.title.trim(),
    description: draft.description.trim(),
    // Falls back to the existing emoji rather than to a default: clearing the
    // field is far more likely to be a slip than a request for 🍽.
    emoji: draft.emoji.trim() || previous.emoji,
    servings: draftToNumber(draft.servings) ?? previous.servings,
    prepTime,
    cookTime,
    // Derived, never taken from the form. Two editable times and an editable
    // total is three fields that can disagree, and the app renders totalTime.
    totalTime: prepTime + cookTime,
    difficulty: draft.difficulty,
    tags: draft.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    ingredients,
    instructions,
    notes: draft.notes.map((n) => n.trim()).filter(Boolean),
  };
}

/**
 * Whether a draft differs from the recipe it came from.
 *
 * Compared through `recipeToDraft` rather than field by field, so it is immune to
 * the string/number asymmetry that makes a naive comparison report a phantom
 * change the moment the form mounts.
 */
export function isDraftDirty(draft: RecipeDraft, recipe: Recipe): boolean {
  return JSON.stringify(draft) !== JSON.stringify(recipeToDraft(recipe));
}
