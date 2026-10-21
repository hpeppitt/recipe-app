import { cacheRecipe } from '../db/recipes';
import { publishRecipe } from './firestore';
import { reportError } from './telemetry';
import { withTimeout } from '../lib/utils';
import { rateLimitMessage, type FriendlyError } from '../lib/errors';
import type { Recipe } from '../types/recipe';

/** How long a save waits for the cloud publish before reporting a failure. */
export const PUBLISH_TIMEOUT_MS = 4000;

/**
 * The cloud-first save (decision 1b, RL-082) shared by the chat and link import (RL-186).
 *
 * Cloud first because the sync removes own rows the server lacks, so a Dexie row
 * written before a failed publish would vanish later. A failed or timed-out publish
 * writes nothing and resolves to the error to show; a failed cache still counts as
 * saved. `onPublished` runs between the two, for fire-and-forget follow-ups.
 */
export async function publishThenCache(recipe: Recipe, onPublished?: () => void): Promise<FriendlyError | null> {
  // Bounded because an unreachable Firestore retries instead of rejecting.
  const failure = await withTimeout<{ err: unknown } | null>(
    publishRecipe(recipe).then(
      () => null,
      (err: unknown) => ({ err })
    ),
    PUBLISH_TIMEOUT_MS,
    { err: new Error('Publishing the recipe timed out') }
  );
  if (failure) {
    console.error('Publishing recipe to the cloud failed; nothing was saved', failure.err);
    return {
      message:
        rateLimitMessage(failure.err) ??
        "Couldn't save the recipe. Check your connection and try again.",
    };
  }

  try {
    onPublished?.();
  } catch (err) {
    // A follow-up must not undo a save that is already in the cloud.
    console.error('Post-publish step failed', err);
    reportError(err, 'save-recipe-notify');
  }

  try {
    await cacheRecipe(recipe);
  } catch (err) {
    // The recipe is in the cloud, so the save is done; the own-recipe
    // listener (RL-078) fills the row.
    console.error('Caching the saved recipe locally failed', err);
    reportError(err, 'save-recipe-cache');
  }
  return null;
}
