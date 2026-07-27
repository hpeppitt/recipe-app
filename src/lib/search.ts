/**
 * Shared prompt-similarity scoring used by dedup checks.
 *
 * Deliberately simple: a query word "hits" if it appears as a substring of the
 * item's haystack, and the score is the fraction of query words that hit. This
 * handles case and word order but not plurals, stemming, or semantics — see the
 * dedup notes in AUDIT.md for the known gaps.
 */

/** Split a prompt into scoreable words, dropping noise words of 2 chars or fewer. */
export function queryWords(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

/** Structural shape a recipe needs to be dedup-scoreable, local or published. */
export type ScorableRecipe = {
  title: string;
  description: string;
  tags: string[];
  ingredients: { name: string }[];
};

/** Fields a new-recipe dedup check scores against. */
export function recipeHaystack(r: ScorableRecipe): string {
  return [
    r.title,
    r.description,
    ...(r.tags ?? []),
    ...(r.ingredients ?? []).map((i) => i.name),
  ].join(' ');
}

/**
 * Variations score against the prompt that produced them instead of the
 * ingredient list, since a variation is described by how it differs.
 */
export function variationHaystack(r: ScorableRecipe & { prompt?: string }): string {
  return [r.title, r.description, r.prompt ?? '', ...(r.tags ?? [])].join(' ');
}

/**
 * Merge two ranked lists, dropping any secondary entry whose id already appears
 * in the primary list. Used to merge cloud dedup matches into local ones without
 * reporting a recipe the user owns twice.
 *
 * `maxFromSecondary` reserves slots for the secondary list so that a plain
 * concatenate-then-truncate can't hide every cloud match behind a full page of
 * local ones — that would silently defeat the point of checking the cloud.
 */
export function mergeDedupById<T extends { id: string }>(
  primary: T[],
  secondary: T[],
  options: { limit: number; maxFromSecondary?: number }
): T[] {
  const seen = new Set(primary.map((r) => r.id));
  const fresh = secondary.filter((r) => !seen.has(r.id));

  const fromSecondary = fresh.slice(0, options.maxFromSecondary ?? options.limit);
  const fromPrimary = primary.slice(0, Math.max(0, options.limit - fromSecondary.length));

  return [...fromPrimary, ...fromSecondary];
}

export function rankByQuery<T>(
  items: T[],
  query: string,
  options: {
    haystack: (item: T) => string;
    threshold: number;
    limit: number;
  }
): T[] {
  const words = queryWords(query);
  if (words.length === 0) return [];

  return items
    .map((item) => {
      const haystack = options.haystack(item).toLowerCase();
      const hits = words.filter((w) => haystack.includes(w)).length;
      return { item, score: hits / words.length };
    })
    .filter((s) => s.score >= options.threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit)
    .map((s) => s.item);
}
