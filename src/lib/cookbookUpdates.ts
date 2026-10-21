/** Followed cookbooks read per Activity visit (RL-259); the follows query is capped at this, so a visit costs at most 1 + this many reads. */
export const COOKBOOK_FOLLOW_LIMIT = 30;

/** A followed cookbook that gained recipes since the follower last looked. `createdAt` is `lastAddedAt`, so rows group by day with notifications. */
export interface CookbookUpdate {
  collectionId: string;
  name: string;
  ownerUid: string;
  ownerName: string | null;
  lastAddedAt: number;
  createdAt: number;
}

/** "New since you last looked": the cookbook gained recipes after the follow's `lastSeenAt`. No `lastAddedAt` means nothing was added. */
export function isNewSince(lastAddedAt: number | null | undefined, lastSeenAt: number | null | undefined): boolean {
  return typeof lastAddedAt === 'number' && lastAddedAt > (lastSeenAt ?? 0);
}

/** Newest first. */
export const sortUpdates = (rows: CookbookUpdate[]): CookbookUpdate[] => [...rows].sort((a, b) => b.lastAddedAt - a.lastAddedAt);
