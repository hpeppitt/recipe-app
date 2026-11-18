// Self-service account deletion (RL-057, TASK-149). Pure: the order, the re-auth check, the
// shared-kitchen block and the orchestration. The Firestore and Auth calls are injected.

import type { PantryItem } from './kitchen';

/**
 * The order deleteAccountData runs in. Photos before cooks (a photo's rules read its cook),
 * replies before their suggestions (the replies read rule reads the parent's parties), the
 * pantry rewrite before leaving a shared kitchen, and the profile last.
 */
export const DELETION_STEPS = [
  'cookPhotos',
  'cooks',
  'favorites',
  'followsAsFollower',
  'followsAsFollowed',
  'cookbookFollows',
  'suggestionReplies',
  'suggestions',
  'notificationsReceived',
  'notificationsSent',
  'kitchenInvites',
  'kitchenPantry',
  'kitchens',
  'collections',
  'recipes',
  'feedback',
  'notificationPrefs',
  'tasteProfile',
  'termsAcceptance',
  'profile',
] as const;

export type DeletionStep = (typeof DELETION_STEPS)[number];

export interface StepCount {
  done: number;
  failed: number;
}

export interface StepResult extends StepCount {
  step: DeletionStep;
  /** True only for the profile, when an earlier step failed, so Try again still finds the account. */
  skipped?: true;
}

export type DeletionDataResult =
  /** Nothing was touched: the user owns a kitchen other people are in. */
  | { status: 'blocked'; reason: 'shared-kitchen' }
  | { status: 'ran'; steps: StepResult[]; failed: number };

/** The id that replaces a deleted user's uid where the record stays (suggestions, replies, pantry). */
export const DELETED_USER = 'deleted-user';

/** Firebase asks for a sign-in within about 5 minutes; 2 leaves room for the data steps. */
export const REAUTH_MAX_AGE_MS = 120_000;

/** True when the last sign-in is unknown or older than REAUTH_MAX_AGE_MS. */
export function needsReauth(authTimeMs: number | null, nowMs: number): boolean {
  return authTimeMs == null || !Number.isFinite(authTimeMs) || nowMs - authTimeMs > REAUTH_MAX_AGE_MS;
}

/** True when `uid` owns a kitchen that has any other member. */
export function ownsSharedKitchen(
  uid: string,
  kitchens: ReadonlyArray<{ ownerUid: string; memberUids: readonly string[] }>
): boolean {
  return kitchens.some((k) => k.ownerUid === uid && k.memberUids.some((m) => m !== uid));
}

/** The pantry with `uid`'s lines credited to DELETED_USER; null when there is nothing to change. */
export function anonymisePantry(pantry: readonly PantryItem[], uid: string): PantryItem[] | null {
  if (!pantry.some((p) => p.addedBy === uid)) return null;
  return pantry.map((p) => (p.addedBy === uid ? { ...p, addedBy: DELETED_USER } : p));
}

/**
 * Runs every step in DELETION_STEPS order, one at a time. A rejected step counts as one
 * failure and the next step still runs. The profile is skipped after any failure. Never rejects.
 */
export async function runDeletionSteps(run: (step: DeletionStep) => Promise<StepCount>): Promise<{ steps: StepResult[]; failed: number }> {
  const steps: StepResult[] = [];
  let failed = 0;
  for (const step of DELETION_STEPS) {
    if (step === 'profile' && failed > 0) {
      steps.push({ step, done: 0, failed: 0, skipped: true });
      continue;
    }
    let count: StepCount;
    try {
      count = await run(step);
    } catch {
      count = { done: 0, failed: 1 };
    }
    failed += count.failed;
    steps.push({ step, done: count.done, failed: count.failed });
  }
  return { steps, failed };
}

export type AuthDeleteResult = 'deleted' | 'needs-reauth' | 'failed';

export interface DeleteAccountDeps {
  /** When the current user last signed in (the ID token's auth_time), or null when unknown. */
  authTimeMs: () => Promise<number | null>;
  now: () => number;
  deleteData: () => Promise<DeletionDataResult>;
  deleteAuthUser: () => Promise<AuthDeleteResult>;
  /** Clears this device, PREVIOUS_UIDS included, so the deleted uid is not carried over again. */
  clearLocal: () => Promise<void>;
  /** setAnalyticsUserId(null), so the next session is not tied to the deleted person. */
  resetAnalytics: () => void;
}

export type DeleteAccountOutcome =
  | { status: 'needs-reauth' }
  | { status: 'blocked'; reason: 'shared-kitchen' }
  /** Some cloud data is left; the Auth user is kept so Try again can finish. */
  | { status: 'partial'; steps: StepResult[]; failed: number }
  /** All cloud data is gone but the Auth user could not be deleted. */
  | { status: 'auth-failed'; steps: StepResult[] }
  | { status: 'deleted'; steps: StepResult[] };

/**
 * The whole deletion: re-auth check, cloud data, then the Auth user only at zero failures,
 * then this device. Never rejects; a throwing dependency becomes `partial` or `auth-failed`.
 */
export async function deleteAccount(deps: DeleteAccountDeps): Promise<DeleteAccountOutcome> {
  const authTime = await deps.authTimeMs().catch(() => null);
  if (needsReauth(authTime, deps.now())) return { status: 'needs-reauth' };

  const data = await deps.deleteData().catch((): DeletionDataResult => ({ status: 'ran', steps: [], failed: 1 }));
  if (data.status === 'blocked') return data;
  if (data.failed > 0) return { status: 'partial', steps: data.steps, failed: data.failed };

  const auth = await deps.deleteAuthUser().catch((): AuthDeleteResult => 'failed');
  if (auth === 'needs-reauth') return { status: 'needs-reauth' };
  if (auth === 'failed') return { status: 'auth-failed', steps: data.steps };

  await deps.clearLocal().catch(() => {});
  try {
    deps.resetAnalytics();
  } catch {
    // The account is gone; a stale analytics id is not worth failing over.
  }
  return { status: 'deleted', steps: data.steps };
}
