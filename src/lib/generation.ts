import type { AppUser } from '../types/recipe';

/**
 * Whether the recipe composer may be offered.
 *
 * Generation never touches Firestore, so no rule backs this up: it is the only
 * thing between an unverified visitor and the shared Gemini quota. True only for
 * a configured app with a verified email, or for local-only mode, where there is
 * no gate to show because the composer is already disabled (no AI backend).
 */
export function canGenerate({
  isConfigured,
  user,
}: {
  isConfigured: boolean;
  user: Pick<AppUser, 'emailVerified'> | null;
}): boolean {
  if (!isConfigured) return true;
  return user?.emailVerified === true;
}
