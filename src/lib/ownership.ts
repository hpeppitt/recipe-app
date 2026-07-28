/**
 * Who may perform owner-only actions on a recipe (delete it, review its
 * suggestions).
 *
 * Kept as a pure function because the interesting cases — a signed-out visitor
 * on someone else's published recipe, a pre-auth 'local' recipe that reached the
 * cloud — only arise with Firebase configured and so are hard to reach by hand.
 *
 * The rules enforce ownership server-side regardless; this decides whether the
 * UI should offer the action at all, so it fails closed on anything unproven.
 */
export function canManageRecipe(params: {
  /** False when Firebase is absent and the app is purely local. */
  isConfigured: boolean;
  /** Which store the recipe was resolved from; undefined while still loading. */
  source: 'local' | 'cloud' | undefined;
  /** Signed-in user's uid, if any. */
  userUid: string | undefined;
  /** The uid stamped on the recipe at creation time. */
  createdByUid: string | undefined;
}): boolean {
  const { isConfigured, source, userUid, createdByUid } = params;

  // Local-only mode: there is no other user, so every recipe is the user's own.
  if (!isConfigured) return true;

  // Present in this device's library, so theirs to remove from it. This is also
  // what covers pre-auth recipes stamped with the 'local' placeholder uid,
  // without trusting that placeholder on a recipe fetched from the cloud.
  if (source === 'local') return true;

  // Cloud recipe: require a signed-in user whose uid matches the creator.
  if (!userUid || !createdByUid) return false;
  return createdByUid === userUid;
}
