import { ImportedRecipeSchema } from '../schemas/recipe.schema';
import type { Recipe } from '../types/recipe';

export interface ParsedImport {
  recipes: Recipe[];
  /** Records that failed validation and were left out. */
  skipped: number;
  /** Duplicate ids within the file itself; the last occurrence wins. */
  duplicatesInFile: number;
}

/**
 * Validate and normalise the contents of an export file.
 *
 * Previously the parsed JSON went straight to `bulkPut`, so anything shaped
 * wrongly was persisted and only blew up later inside a query. Bad records are
 * now dropped and counted so the UI can report them.
 */
export function parseImportedRecipes(raw: unknown, now = Date.now()): ParsedImport {
  if (!Array.isArray(raw)) {
    return { recipes: [], skipped: 0, duplicatesInFile: 0 };
  }

  const byId = new Map<string, Recipe>();
  let skipped = 0;
  let duplicatesInFile = 0;

  for (const entry of raw) {
    const result = ImportedRecipeSchema.safeParse(entry);
    if (!result.success) {
      skipped++;
      continue;
    }

    const parsed = result.data;
    const createdAt = parsed.createdAt ?? now;
    const recipe: Recipe = {
      ...parsed,
      // A root recipe is its own root; older exports may omit the field.
      rootId: parsed.rootId ?? parsed.id,
      createdAt,
      updatedAt: parsed.updatedAt ?? createdAt,
      chatHistory: parsed.chatHistory as Recipe['chatHistory'],
    };

    if (byId.has(recipe.id)) duplicatesInFile++;
    byId.set(recipe.id, recipe);
  }

  return { recipes: [...byId.values()], skipped, duplicatesInFile };
}

/** Human-readable summary of an import, for display after the fact. */
export function describeImport(counts: {
  added: number;
  replaced: number;
  skipped: number;
  duplicatesInFile: number;
}): string {
  const skippedNote =
    counts.skipped > 0 ? ` ${counts.skipped} record(s) were skipped as invalid.` : '';

  // Nothing actually landed, so don't lead with "Import complete".
  if (counts.added + counts.replaced === 0) {
    return `Nothing to import — no valid recipes found in that file.${skippedNote}`;
  }

  const parts: string[] = [];
  if (counts.added > 0) parts.push(`${counts.added} added`);
  if (counts.replaced > 0) parts.push(`${counts.replaced} updated`);
  if (counts.duplicatesInFile > 0) {
    parts.push(
      `${counts.duplicatesInFile} duplicate${counts.duplicatesInFile === 1 ? '' : 's'} merged`
    );
  }
  if (counts.skipped > 0) parts.push(`${counts.skipped} skipped as invalid`);

  return `Import complete: ${parts.join(', ')}.`;
}
