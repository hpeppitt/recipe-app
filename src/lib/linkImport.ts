import { z } from 'zod';
import { GeneratedRecipeSchema, ImportedFromSchema, IngredientSchema } from '../schemas/recipe.schema';
import type { Ingredient } from '../types/recipe';
import type { GeneratedRecipe } from '../types/api';

/** The one message every import failure shows (RL-185). */
export const IMPORT_ERROR_MESSAGE = "Couldn't read that page. Check the link, or try a photo of it.";

/** The one message every photo import failure shows (RL-251). */
export const PHOTO_IMPORT_ERROR_MESSAGE = "Couldn't read a recipe in those photos. Try a closer, brighter photo of the page.";

/**
 * A photo import's draft `importedFrom` (RL-251). It is not stored: the rules and
 * ImportedFromSchema accept only http(s) URLs (backlog/DECISIONS.md, RL-251).
 */
export const PHOTO_SOURCE = 'photo';

// Hostnames that only resolve on a private network, never on the public web.
const PRIVATE_SUFFIXES = ['localhost', 'local', 'internal', 'intranet', 'lan', 'home', 'corp', 'home.arpa', 'test', 'invalid', 'example'];

/**
 * A public http(s) URL from what the user typed, or null.
 *
 * URL context cannot read localhost or private-network pages anyway; refusing
 * them here keeps the request from being spent on one.
 */
export function normalizeImportUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  // "mailto:a@b.com" becomes "https://mailto:a@b.com", which parses with credentials.
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  // WHATWG URL rewrites hex, octal and integer IPv4 forms to dotted decimal, so this catches them all.
  if (host.startsWith('[') || /^\d+(\.\d+){3}$/.test(host)) return null;
  if (!host.includes('.')) return null;
  if (PRIVATE_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`))) return null;
  return url.href;
}

/** The site a URL belongs to, for display and telemetry: "seriouseats.com". */
export function importHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * A recipe read from storage with `importedFrom` kept only when it is a bounded http(s)
 * URL (ImportedFromSchema), so nothing downstream can render an unchecked link.
 */
export function withBoundedImportedFrom<T extends object>(recipe: T): T {
  if (!('importedFrom' in recipe)) return recipe;
  const importedFrom = ImportedFromSchema.parse(recipe.importedFrom);
  if (importedFrom !== undefined) return { ...recipe, importedFrom };
  const { importedFrom: _dropped, ...rest } = recipe;
  return rest as T;
}

export type ImportedIngredient = Ingredient & { uncertain?: boolean };

export type ImportDraftRecipe = Omit<GeneratedRecipe, 'ingredients'> & {
  ingredients: ImportedIngredient[];
  importedFrom: string;
};

export interface ImportDraft {
  recipe: ImportDraftRecipe | null;
  uncertainCount: number;
  error: string | null;
}

// The caps match hasBoundedContent() in firestore.rules, so a draft that passes
// here cannot be refused silently when RL-186 publishes it.
export const IMPORT_LIMITS = { title: 200, ingredients: 100, instructions: 100 } as const;

const ImportedRecipeOutputSchema = GeneratedRecipeSchema.extend({
  title: z.string().max(IMPORT_LIMITS.title),
  ingredients: z.array(IngredientSchema.extend({ uncertain: z.boolean().optional() })).max(IMPORT_LIMITS.ingredients),
  instructions: GeneratedRecipeSchema.shape.instructions.max(IMPORT_LIMITS.instructions),
});

function failed(): ImportDraft {
  return { recipe: null, uncertainCount: 0, error: IMPORT_ERROR_MESSAGE };
}

/**
 * Validates the model's text for a link import and turns it into a draft.
 *
 * An uncertain amount is forced to null even if the model filled one in: the
 * contract is "flagged, never guessed". A page with no ingredients or no steps
 * is treated as a page with no recipe.
 */
export function toImportDraft(response: string, url: string): ImportDraft {
  let parsed: unknown;
  try {
    // Same repair as parseRecipeJson: code fences and trailing commas.
    const cleaned = response
      .replace(/```(?:json)?\s*/g, '')
      .replace(/```\s*/g, '')
      .trim()
      .replace(/,\s*([}\]])/g, '$1');
    parsed = JSON.parse(cleaned);
  } catch {
    return failed();
  }
  const result = ImportedRecipeOutputSchema.safeParse(parsed);
  if (!result.success) return failed();
  const data = result.data;
  if (data.ingredients.length === 0 || data.instructions.length === 0) return failed();

  const ingredients = data.ingredients.map((i) => (i.uncertain ? { ...i, amount: null, uncertain: true } : i));
  return {
    recipe: { ...data, ingredients, importedFrom: url },
    uncertainCount: ingredients.filter((i) => i.uncertain).length,
    error: null,
  };
}
