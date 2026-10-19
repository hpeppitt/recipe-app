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
 * Turns suggest-mode edits into the free-text message a suggestion already is,
 * so the write path needs no new fields. An edit whose new amount is blank or
 * equal to the old one says nothing and is dropped. Empty string when nothing remains.
 */
export function composeSuggestionMessage(edits: IngredientEdit[], note?: string): string {
  const lines = edits.flatMap((e) => {
    const from = e.oldAmount.trim();
    const to = e.newAmount.trim();
    if (!to || to === from) return [];
    const why = e.why?.trim();
    const subject = [from, e.name.trim()].filter(Boolean).join(' ');
    return [`Change ${subject} to ${to}.${why ? ` ${why}` : ''}`];
  });
  const n = note?.trim();
  return [lines.join('\n'), n].filter(Boolean).join('\n\n');
}
