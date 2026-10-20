/**
 * What a signed-out visitor was doing when they asked for a sign-in link (RL-135), so the
 * app can pick it up after the link brings them back. Stored on the device that asked; a
 * link opened elsewhere returns to the page but finds no intent.
 */
export type PendingAction = (
  | { kind: 'save' | 'branch' | 'suggest'; recipeId: string; at: number }
  | { kind: 'follow'; uid: string; at: number }
) & {
  /**
   * The uid this device's sign-in link signed in, stamped when the link completes (RL-136).
   * Only that user may run the action, so another account on a shared device never does.
   */
  by?: string;
};

/** What a caller passes: the time is stamped when the link is sent. */
export type PendingIntent =
  | { kind: 'save' | 'branch' | 'suggest'; recipeId: string }
  | { kind: 'follow'; uid: string };

/**
 * Where a sign-in link returns: the current path, never the query. The hash is kept only on
 * `/shared`, where a self-contained recipe lives in it (`#r=...`); anywhere else it is dropped.
 */
export function linkReturnPath(pathname: string, hash: string): string {
  return pathname === '/shared' ? pathname + hash : pathname;
}

/** Magic links expire within the hour too, so an older intent belongs to a dead link. */
export const PENDING_ACTION_TTL_MS = 60 * 60 * 1000;

const RECIPE_KINDS: readonly string[] = ['save', 'branch', 'suggest'];

const isId = (v: unknown): v is string => typeof v === 'string' && v !== '';

/** Null for anything unusable: wrong shape, missing id, expired, or stamped in the future. */
export function parsePendingAction(raw: unknown, now: number): PendingAction | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { kind, recipeId, uid, at, by } = raw as Record<string, unknown>;
  if (typeof at !== 'number' || !Number.isFinite(at) || at > now || now - at > PENDING_ACTION_TTL_MS) {
    return null;
  }
  const owner = isId(by) ? { by } : {};
  if (typeof kind === 'string' && RECIPE_KINDS.includes(kind) && isId(recipeId)) {
    return { kind: kind as 'save' | 'branch' | 'suggest', recipeId, at, ...owner };
  }
  if (kind === 'follow' && isId(uid)) return { kind, uid, at, ...owner };
  return null;
}
