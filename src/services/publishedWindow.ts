import { getAllPublishedRecipes, type PublishedRecipe } from './firestore';

/** How long the dedup window is reused across chats before a fresh read. */
export const PUBLISHED_WINDOW_TTL_MS = 5 * 60 * 1000;

// Module state for the page session, so repeat chats and abandoned drafts share one
// 200-doc read (RL-178). Only successes are kept: a failure is retried by the next caller.
let cached: { at: number; read: Promise<PublishedRecipe[] | null> } | undefined;

/** Dropped on sign-out, and between tests. */
export function clearPublishedWindow() {
  cached = undefined;
}

/** The newest published window for new-recipe dedup; null when the read failed. */
export function readPublishedWindow(): Promise<PublishedRecipe[] | null> {
  if (!cached || Date.now() - cached.at > PUBLISHED_WINDOW_TTL_MS) {
    const read: Promise<PublishedRecipe[] | null> = getAllPublishedRecipes().catch(() => {
      if (cached?.read === read) cached = undefined;
      return null;
    });
    cached = { at: Date.now(), read };
  }
  return cached.read;
}
