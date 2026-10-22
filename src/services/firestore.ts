import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getCountFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  documentId,
  startAfter,
  type QueryConstraint,
  type CollectionReference,
  type QueryDocumentSnapshot,
  type DocumentData,
  onSnapshot,
  increment,
  arrayUnion,
  arrayRemove,
  deleteField,
  writeBatch,
  serverTimestamp,
  runTransaction,
  type DocumentReference,
  type Firestore,
  type Transaction,
  type Timestamp,
} from 'firebase/firestore';
import { EXPLORE_TAG_FIELD, FEED_ORDER_FIELD } from '../lib/constants';
import { auth, firestore } from './firebase';
import { rankByQuery, variationHaystack } from '../lib/search';
import { collectSubtreeIds, MAX_FAMILY_MOVE, MAX_MOVED_CHILDREN, planFamilyMove, type FamilyMoveResult } from '../lib/tree';
import { replyRecipient } from '../lib/suggestions';
import { normaliseAvoids, normaliseHidden, type TasteProfile } from '../lib/taste';
import { truncateNotificationMessage, type NotificationPrefs } from '../lib/notifications';
import { selectFavoritesToPush, type CloudFavoriteRow } from '../lib/favoritesMigration';
import { withTimeout } from '../lib/utils';
import type { RecentCook } from '../lib/cookRanking';
import { COOK_PHOTO_MAX_URL_LENGTH, JPEG_DATA_URL_PREFIX } from '../lib/imageAttachments';
import { normalizeTags } from '../lib/library';
import { KitchenFullError, kitchenFits, KITCHEN_INVITE_DAYS, KITCHEN_MEMBER_CAP, newInviteCode, pickKitchenId, checkCollectionRecipeId, checkCollectionRoom, collectionName, CollectionRefusedError, COLLECTION_GONE_MESSAGE, type KitchenLists } from '../lib/kitchen';
import { TERMS_VERSION } from '../lib/legal';
import { nextWindow, RATE_LIMITS, type RateLimitAction } from '../lib/rateLimit';
import { FamilyMoveRefusedError, RateLimitedError, StaleSuggestionError, SuggestionClosedError, RecipeNotPublishedError, TermsNotAcceptedError, TooManyMovedBranchesError } from '../lib/errors';
import { db } from '../db/database';
import type { Recipe, Collaborator, AppUser } from '../types/recipe';
import type { SharedRecipe } from '../lib/share';
import type { Suggestion, SuggestionEdit, SuggestionMessage, AppNotification, Cook } from '../types/social';
import {
  applySuggestionEdits,
  buildBranchFromSuggestion,
  describeEdits,
  hasApplicableEdits,
  suggestionBranchId,
} from '../lib/suggestion';
import { toLocalRecipe, type CloudRecipeDoc } from '../lib/recipeSync';
import { cacheRecipe } from '../db/recipes';
import type { UserProfile, Follow } from '../types/profile';
import { VERIFY_NOTE } from '../lib/dataExport';
import { withBoundedImportedFrom } from '../lib/linkImport';
import type { CloudInput, CloudDoc, CloudFavorite, CloudFollow, CloudSuggestion, CloudCookPhoto, Section } from '../lib/dataExport';
import { reportError } from './telemetry';

// --- Recipes ---

/**
 * Publish (or re-publish) a recipe to the shared library.
 *
 * Distinguishes create from update, which the previous unconditional `setDoc`
 * did not. On a re-publish it must NOT write `favoriteCount`/`viewCount`: those
 * belong to other people's favourites and views, and resetting them to 0 silently
 * destroys that data.
 *
 * A re-publish also omits `collaborators`. A merge replaces arrays wholesale, and
 * the cloud array is maintained by applySuggestion (and, before RL-148, the
 * approval `arrayUnion`), so writing a stale local copy here would erase credit.
 * `collaboratorUids` (RL-172) follows the same rule: written on create from the
 * credited uids, never on a re-publish. The local Recipe does not carry it.
 */
export async function publishRecipe(recipe: Recipe): Promise<void> {
  if (!firestore) return;

  const { chatHistory, ...data } = recipe;
  const ref = doc(firestore, 'recipes', recipe.id);
  const { collaborators, ...rest } = data;
  // Published tags are lower case so the Explore chips match (RL-059). Dexie keeps its case.
  const content = { ...rest, tags: normalizeTags(rest.tags) };

  const existing = await getDoc(ref);
  if (existing.exists()) {
    await setDoc(ref, content, { merge: true });
    return;
  }

  // The rules deny a create whose createdBy.uid is not the caller (the 'local'
  // placeholder, signed out, or a copy saved from someone else's link), so
  // reject as that denial did, before reading or moving any window.
  if (auth && auth.currentUser?.uid !== recipe.createdBy.uid) {
    throw new Error('Publishing needs the signed-in creator');
  }

  // Rules require both counters present and zero on create, and the recipe
  // window moved in the same request (RL-049). Throws RateLimitedError at the
  // daily cap, having written nothing; the caller keeps the Dexie copy. The
  // transaction re-reads the recipe: if it exists by then (a stale read above,
  // or an earlier publish that landed after its caller timed out), it writes
  // the re-publish merge instead, with no counters or window.
  await writeLimited(
    firestore,
    recipe.createdBy.uid,
    'recipe',
    ref,
    {
      ...content,
      collaborators: collaborators ?? [],
      collaboratorUids: [...new Set((collaborators ?? []).map((c) => c.uid))],
      favoriteCount: 0,
      viewCount: 0,
    },
    content
  );
}

export async function getPublishedRecipe(
  id: string
): Promise<(SharedRecipe & { id: string; favoriteCount: number }) | null> {
  if (!firestore) return null;
  const snap = await getDoc(doc(firestore, 'recipes', id));
  if (!snap.exists()) return null;
  return withBoundedImportedFrom({ id: snap.id, ...snap.data() }) as SharedRecipe & {
    id: string;
    favoriteCount: number;
  };
}

/**
 * Live view of a user's own recipes (RL-078). Only server snapshots with no pending local
 * writes are passed on: the sync treats each one as complete, so an empty answer from the
 * cache would delete every own row in Dexie. Metadata changes are included so the server's
 * confirmation of a cached or pending result still arrives (it costs no reads).
 */
export function subscribeOwnRecipes(
  uid: string,
  onDocs: (docs: DocumentData[]) => void,
  onError: (err: Error) => void
): () => void {
  if (!firestore) return () => {};
  const q = query(collection(firestore, 'recipes'), where('createdBy.uid', '==', uid));
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => {
      if (snap.metadata.fromCache || snap.metadata.hasPendingWrites) return;
      onDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    },
    onError
  );
}

export type PublishedRecipe = SharedRecipe & {
  id: string;
  parentId: string | null;
  rootId: string;
  depth: number;
  favoriteCount: number;
  viewCount: number;
  createdAt: number;
  /**
   * `publishRecipe` strips only `chatHistory`, so published docs do carry the
   * originating prompt. Optional because older docs may predate it.
   */
  prompt?: string;
  collaborators?: Collaborator[];
  /**
   * RL-172: the credited uids, queryable with `array-contains` where `collaborators`
   * (objects with a display name) is not. Absent on recipes credited before it shipped.
   */
  collaboratorUids?: string[];
  /** RL-162: set only on an original made with "Create New Recipe Anyway". */
  relatedFamilyId?: string | null;
};

/** Page size for the shared feed. Small enough that a first paint is cheap. */
export const FEED_PAGE_SIZE = 30;

/**
 * An opaque cursor. Deliberately the Firestore snapshot rather than a `createdAt`
 * value: two recipes published in the same millisecond would make a value-based
 * cursor either skip one or repeat one, and `createdAt` is a client clock, so
 * collisions are not hypothetical when someone imports a batch.
 */
export type FeedCursor = QueryDocumentSnapshot<DocumentData>;

export interface PublishedRecipePage {
  recipes: PublishedRecipe[];
  /** Pass to the next call. Null when the end has been reached. */
  cursor: FeedCursor | null;
  hasMore: boolean;
}

/**
 * One page of the shared library, newest first.
 *
 * Replaces a hard `limit(200)` with no way past it: beyond 200 published recipes
 * the rest of the library was simply invisible, and every visit re-read all 200
 * whether or not the user scrolled. This is roadmap 3.1's correctness half.
 */
export async function getPublishedRecipesPage(
  cursor?: FeedCursor | null,
  pageSize = FEED_PAGE_SIZE,
  tag?: string | null
): Promise<PublishedRecipePage> {
  if (!firestore) return { recipes: [], cursor: null, hasMore: false };

  // The tag filter needs the `tags` ARRAY_CONTAINS + `createdAt` DESC composite
  // index in firestore.indexes.json (RL-009).
  const q = query(
    collection(firestore, 'recipes'),
    ...(tag ? [where(EXPLORE_TAG_FIELD, 'array-contains', tag)] : []),
    orderBy(FEED_ORDER_FIELD, 'desc'),
    ...(cursor ? [startAfter(cursor)] : []),
    // One extra row is fetched purely to answer "is there a next page?" without a
    // second round trip, then dropped before returning.
    limit(pageSize + 1)
  );

  const snap = await getDocs(q);
  const hasMore = snap.docs.length > pageSize;
  const docs = hasMore ? snap.docs.slice(0, pageSize) : snap.docs;

  return {
    recipes: docs.map((d) => withBoundedImportedFrom({ id: d.id, ...d.data() }) as PublishedRecipe),
    cursor: docs.length > 0 ? docs[docs.length - 1] : null,
    hasMore,
  };
}

/**
 * The newest slice of the shared library, for new-recipe dedup. Its one caller is
 * `services/publishedWindow.ts`, which shares it across chats for 5 minutes (RL-178).
 *
 * Still bounded, and still an accepted limit: dedup scores this window client-side
 * (Firestore has no full-text search), so recipes past it are not considered.
 */
export async function getAllPublishedRecipes(limitTo = 200): Promise<PublishedRecipe[]> {
  if (!firestore) return [];
  const q = query(
    collection(firestore, 'recipes'),
    orderBy('createdAt', 'desc'),
    limit(limitTo)
  );
  const snap = await getDocs(q);
  return snap.docs.map(
    (d) => withBoundedImportedFrom({ id: d.id, ...d.data() }) as PublishedRecipe
  );
}

/**
 * Published recipes created at or after `sinceMs`, newest first (RL-126). One range filter and
 * `orderBy` on the same field, so the automatic single-field `createdAt` index serves it and
 * no composite index is needed. Read only.
 *
 * shortcut: a week with more than `max` new recipes counts only the newest `max`. Originals share
 * that cap with branches, so counts run low in a week with many originals; upgrade to a
 * server-side counter.
 */
export async function getRecentPublishedRecipes(sinceMs: number, max = 100): Promise<PublishedRecipe[]> {
  if (!firestore) return [];
  const snap = await getDocs(
    query(collection(firestore, 'recipes'), where('createdAt', '>=', sinceMs), orderBy('createdAt', 'desc'), limit(max))
  );
  return snap.docs.map((d) => withBoundedImportedFrom({ id: d.id, ...d.data() }) as PublishedRecipe);
}

/**
 * Every published recipe in one variation tree.
 *
 * The tree UI and variation dedup previously read local Dexie only, so viewing or
 * varying someone else's recipe showed an empty tree and detected no duplicates.
 */
export async function getPublishedRecipeTree(rootId: string): Promise<PublishedRecipe[]> {
  if (!firestore) return [];
  const snap = await getDocs(
    query(collection(firestore, 'recipes'), where('rootId', '==', rootId))
  );
  return snap.docs.map((d) => withBoundedImportedFrom({ id: d.id, ...d.data() }) as PublishedRecipe);
}

/** RL-180: direct children read for the 6b chip split, and family prompts read for ordering only. */
export const BRANCH_CHILDREN_READ = 50;
export const BRANCH_ORDER_READ = 40;

/**
 * RL-180: the parent's children (limit 50) and up to 40 family docs for chip ordering. No count and
 * no root read. Only `id`, `prompt` and `parentId` are used by the caller. Single-field queries, so
 * no new index.
 */
export async function getBranchChipFamily(
  rootId: string,
  parentId: string
): Promise<{ id: string; prompt: string; parentId: string | null }[]> {
  if (!firestore) return [];
  const recipes = collection(firestore, 'recipes');
  const [kids, family] = await Promise.all([
    getDocs(query(recipes, where('parentId', '==', parentId), limit(BRANCH_CHILDREN_READ))),
    getDocs(query(recipes, where('rootId', '==', rootId), limit(BRANCH_ORDER_READ))),
  ]);
  const byId = new Map<string, { id: string; prompt: string; parentId: string | null }>();
  for (const d of [...family.docs, ...kids.docs]) {
    const x = d.data();
    byId.set(d.id, { id: d.id, prompt: x.prompt ?? '', parentId: x.parentId ?? null });
  }
  return [...byId.values()];
}

/** Most versions of one family the Forest view reads (RL-175). */
export const FOREST_FAMILY_READ = 40;

/**
 * RL-175: one family for a Forest tile, bounded. At most `FOREST_FAMILY_READ` documents (no
 * orderBy, so no new index; which ones come back is arbitrary when the family is larger) plus one
 * count query. `count` falls back to the documents read when the count fails.
 */
export async function getForestFamily(rootId: string): Promise<{ recipes: PublishedRecipe[]; count: number }> {
  if (!firestore) return { recipes: [], count: 0 };
  const q = query(collection(firestore, 'recipes'), where('rootId', '==', rootId));
  // The root is read by id too (1 read) so a family larger than the cap is never drawn without it.
  const [snap, count, rootSnap] = await Promise.all([
    getDocs(query(q, limit(FOREST_FAMILY_READ))),
    getCountFromServer(q).then((n) => n.data().count, () => null),
    getDoc(doc(firestore, 'recipes', rootId)).catch(() => null),
  ]);
  const recipes = snap.docs.map((d) => withBoundedImportedFrom({ id: d.id, ...d.data() }) as PublishedRecipe);
  if (rootSnap?.exists() && !recipes.some((r) => r.id === rootId)) recipes.push(withBoundedImportedFrom({ id: rootId, ...rootSnap.data() }) as PublishedRecipe);
  return { recipes, count: Math.max(count ?? 0, recipes.length) };
}

/** RL-143: how many recipes (the original included) share this rootId. */
export async function getFamilyCount(rootId: string): Promise<number> {
  if (!firestore) return 0;
  const n = await getCountFromServer(query(collection(firestore, 'recipes'), where('rootId', '==', rootId)));
  return n.data().count;
}

export type RelatedFamily = {
  id: string;
  emoji: string;
  title: string;
  createdBy?: { uid: string; displayName: string | null };
  /** Absent when the count read failed. */
  versions?: number;
};

const RELATED_FAMILY_LIMIT = 3;
const RELATED_FAMILY_FETCH = 20;

async function toRelated(r: { id: string; emoji: string; title: string; createdBy?: RelatedFamily['createdBy'] }): Promise<RelatedFamily> {
  const row: RelatedFamily = { id: r.id, emoji: r.emoji, title: r.title, createdBy: r.createdBy };
  try {
    const n = await getCountFromServer(query(collection(firestore!, 'recipes'), where('rootId', '==', r.id)));
    row.versions = Math.max(1, n.data().count);
  } catch (err) {
    reportError(err, 'related-families');
  }
  return row;
}

/**
 * RL-163: a recipe with relatedFamilyId gets that family's original; an original gets up to 3
 * recipes that point at it, newest first. The equality query has no orderBy (that would need a
 * composite index), so it reads a bounded page and sorts here.
 * shortcut: "newest" is among the first 20 matches, upgrade with an index if cousins pass 20.
 */
export async function getRelatedFamilies(recipe: {
  depth: number;
  relatedFamilyId?: string | null;
  id: string;
}): Promise<RelatedFamily[]> {
  if (!firestore) return [];
  if (recipe.relatedFamilyId) {
    let r = (await getPublishedRecipe(recipe.relatedFamilyId)) as (Partial<PublishedRecipe> & RelatedFamily) | null;
    // RL-164: the linked original may since have moved into another family; show that family's original.
    if (r?.parentId != null && typeof r.rootId === 'string' && r.rootId !== r.id) {
      r = (await getPublishedRecipe(r.rootId)) as (Partial<PublishedRecipe> & RelatedFamily) | null;
    }
    // A link into this recipe's own family (it was moved under it) is not a related family.
    if (!r || r.id === recipe.id || r.rootId === recipe.id) return [];
    return [await toRelated(r)];
  }
  if (recipe.depth !== 0) return [];
  const snap = await getDocs(
    query(collection(firestore, 'recipes'), where('relatedFamilyId', '==', recipe.id), limit(RELATED_FAMILY_FETCH))
  );
  const docs = snap.docs
    .map((d) => withBoundedImportedFrom({ id: d.id, ...d.data() }) as PublishedRecipe)
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .slice(0, RELATED_FAMILY_LIMIT);
  return Promise.all(docs.map(toRelated));
}

/** Dedup check for a new variation, against the published siblings in its tree. */
export async function searchPublishedVariations(
  rootId: string,
  prompt: string,
  excludeId?: string,
  maxResults = 3
): Promise<PublishedRecipe[]> {
  if (!firestore) return [];
  const tree = await getPublishedRecipeTree(rootId);
  return rankByQuery(
    tree.filter((r) => r.id !== excludeId),
    prompt,
    { haystack: variationHaystack, threshold: 0.4, limit: maxResults }
  );
}

/**
 * Delete a published recipe and every published descendant of it.
 *
 * The cloud tree is queried rather than derived from the local one, so variations
 * published from another device (or by another user) are still found. Deletes run
 * individually, not in a `writeBatch`: the rules only permit deleting your own
 * recipes, and one denied descendant would abort an atomic batch and leave the
 * whole subtree published.
 *
 * `extraIds` covers ids known to be part of the subtree locally but missing from
 * the cloud query, e.g. when a doc's rootId was never backfilled.
 *
 * Only documents created by `uid` are attempted: the rules deny the rest by design,
 * so counting them would report another user's copy as a failure of this delete.
 * Ids the query did not return are read first: a missing doc (never published, or
 * already deleted by an earlier attempt) is skipped, because the rules deny a delete
 * of a nonexistent doc and it would count as a failure that "Try again" can never
 * clear. If that read itself fails, the delete is still attempted.
 *
 * Since RL-159 it deletes originals only, and an original stays while another
 * cook has a version in its family (decision RL-157 3b): when any candidate is
 * another cook's, nothing is deleted and `skipped` counts them.
 */
export async function deletePublishedRecipeTree(
  uid: string,
  id: string,
  rootId: string,
  extraIds: string[] = []
): Promise<{ deleted: number; failed: number; skipped: number }> {
  if (!firestore) return { deleted: 0, failed: 0, skipped: 0 };

  let subtreeIds: string[];
  const ownerById = new Map<string, string | undefined>();
  try {
    const snap = await getDocs(
      query(collection(firestore, 'recipes'), where('rootId', '==', rootId))
    );
    const nodes = snap.docs.map((d) => {
      const data = d.data();
      ownerById.set(d.id, (data.createdBy as { uid?: string } | undefined)?.uid);
      return { id: d.id, parentId: (data.parentId as string | null) ?? null };
    });
    subtreeIds = collectSubtreeIds(nodes, id);
  } catch {
    // Without the family read the "other cooks' versions" guard cannot run, so
    // nothing is deleted and the page offers Try again (RL-159).
    return { deleted: 0, failed: 1, skipped: 0 };
  }

  const candidates = [...new Set([...subtreeIds, ...extraIds])];
  const owners = await Promise.all(
    candidates.map(async (target): Promise<string | null | undefined> => {
      if (ownerById.has(target)) return ownerById.get(target);
      try {
        const snap = await getDoc(doc(firestore!, 'recipes', target));
        if (!snap.exists()) return null;
        return (snap.data().createdBy as { uid?: string } | undefined)?.uid;
      } catch {
        return uid; // Unreadable: ownership unknown, so try the delete anyway.
      }
    })
  );
  const skipped = owners.filter((o) => o != null && o !== uid).length;
  if (skipped > 0) return { deleted: 0, failed: 0, skipped };
  const targets = candidates.filter((_, i) => owners[i] === uid);
  const results = await Promise.allSettled(
    targets.map((target) => deleteDoc(doc(firestore!, 'recipes', target)))
  );

  const failed = results.filter((r) => r.status === 'rejected').length;
  return { deleted: results.length - failed, failed, skipped: 0 };
}

/**
 * True only when the server says the recipe no longer exists (RL-159: after a
 * timed-out version delete). Asks the server, not the cache, which may already
 * show a pending delete; any failure counts as not gone.
 */
export async function isRecipeGoneOnServer(id: string): Promise<boolean> {
  if (!firestore) return false;
  try {
    return !(await getDocFromServer(doc(firestore, 'recipes', id))).exists();
  } catch {
    return false;
  }
}

/** The cloud's direct children of `parentId`, plus any of `knownIds` the query missed. */
async function readVersionChildren(fs: Firestore, parentId: string, knownIds: string[]) {
  const snap = await getDocs(query(collection(fs, 'recipes'), where('parentId', '==', parentId)));
  const found = new Map(snap.docs.map((d) => [d.id, d.data()]));
  for (const id of knownIds) {
    if (found.has(id)) continue;
    const s = await getDoc(doc(fs, 'recipes', id));
    if (s.exists() && s.data().parentId === parentId) found.set(id, s.data());
  }
  return [...found].map(([id, d]) => ({
    id,
    // The rules compare against the stored depth; a missing or non-numeric one may be set to 0 (RL-159).
    depth: Number.isInteger(d.depth) ? (d.depth as number) - 1 : 0,
    uid: (d.createdBy as { uid?: unknown } | undefined)?.uid,
    title: d.title as string,
    emoji: d.emoji as string,
  }));
}

/**
 * Delete one published version and move its direct children up to its parent
 * in one batch (RL-157, RL-159; rules RL-158). Each other cook's child also
 * gets a `moved` notice in the same batch; the rules exempt those from the
 * notification window and bind them to id `moved_{childId}_{deletedId}`. The children's
 * stored depth is what the rules compare, so it is read from the cloud, not the
 * device. Throws TooManyMovedBranchesError, having written nothing, above
 * MAX_MOVED_CHILDREN other cooks' children. A failed commit is retried once,
 * only when a fresh read finds a different set of children (or the version
 * gone); there is no fallback to a plain delete, which would orphan them. A
 * version with no cloud doc has nothing to move. A child whose author is not a
 * string uid gets no notice.
 */
export async function deletePublishedVersion(uid: string, recipe: Recipe, childIds: string[]): Promise<void> {
  const fs = firestore;
  const parentId = recipe.parentId;
  if (!fs) return;
  if (!parentId) throw new Error('An original is deleted with deletePublishedRecipeTree');
  const ref = doc(fs, 'recipes', recipe.id);
  let readIds: string | null = null;
  const attempt = async (retry?: unknown) => {
    if (!(await getDoc(ref)).exists()) return;
    const children = await readVersionChildren(fs, recipe.id, childIds);
    const ids = children.map((c) => c.id).sort().join(',');
    if (retry !== undefined && ids === readIds) throw retry;
    readIds = ids;
    const others = children.filter((c): c is typeof c & { uid: string } => typeof c.uid === 'string' && c.uid !== uid);
    if (others.length > MAX_MOVED_CHILDREN) throw new TooManyMovedBranchesError(others.length);
    const batch = writeBatch(fs);
    batch.delete(ref);
    for (const c of children) batch.update(doc(fs, 'recipes', c.id), { parentId, depth: c.depth });
    for (const c of others) {
      batch.set(doc(fs, 'notifications', `moved_${c.id}_${recipe.id}`), {
        recipientUid: c.uid,
        type: 'moved',
        recipeId: c.id,
        recipeTitle: c.title,
        recipeEmoji: c.emoji,
        fromUid: uid,
        fromDisplayName: recipe.createdBy.displayName ?? null,
        message: recipe.title.slice(0, 200),
        read: false,
        createdAt: Date.now(),
      });
    }
    await batch.commit();
  };
  try {
    await attempt();
  } catch (err) {
    if (err instanceof TooManyMovedBranchesError) throw err;
    await attempt(err);
  }
}

/** Shown when another cook has a version in the family being moved (decision RL-161). */
export const FAMILY_MOVE_OTHERS_MESSAGE = "This can't be moved because another cook has a version in it.";

const intOr0 = (n: unknown) => (Number.isInteger(n) ? (n as number) : 0);

/**
 * Move `uid`'s original `originalId`, with its branches, under `targetId` in
 * another family (RL-164, decision RL-161). One transaction of owner updates:
 * it re-reads the target and every family document and refuses with
 * FamilyMoveRefusedError, writing nothing, when the target is gone or invalid,
 * any version is another cook's or has left the family, the original is not
 * the caller's original, or there are more than MAX_FAMILY_MOVE versions. An
 * original already under the target (a late commit after a timeout) returns
 * its current placement with no second notice. After the commit the target's
 * author gets the RL-153 `branch` notice (never the mover), and the old family
 * is re-read: a branch another cook made mid-move stays behind and is counted.
 */
export async function moveIntoFamily(
  uid: string,
  displayName: string | null,
  originalId: string,
  targetId: string
): Promise<FamilyMoveResult> {
  const fs = firestore;
  if (!fs) throw new FamilyMoveRefusedError('Moving needs the cloud.');
  const [target, original] = await Promise.all([getPublishedRecipe(targetId), getPublishedRecipe(originalId)]);
  const placeOf = (t: Partial<PublishedRecipe> & { id: string }) => {
    // A branch without a rootId cannot say which family it is in.
    if (t.parentId != null && typeof t.rootId !== 'string') throw new FamilyMoveRefusedError('That family is no longer there.');
    return { id: t.id, rootId: typeof t.rootId === 'string' ? t.rootId : t.id, depth: intOr0(t.depth) };
  };
  if (!target) throw new FamilyMoveRefusedError('That family is no longer there.');
  const place = placeOf(target as Partial<PublishedRecipe> & { id: string });
  const orig = original as (Partial<PublishedRecipe> & { id: string }) | null;
  if (!orig || orig.createdBy?.uid !== uid) throw new FamilyMoveRefusedError('This recipe cannot be moved.');
  if (orig.parentId === place.id && orig.rootId === place.rootId) {
    const tree = await getPublishedRecipeTree(place.rootId);
    const ids = new Set(collectSubtreeIds(tree.map((r) => ({ id: r.id, parentId: r.parentId ?? null })), originalId));
    const changes = tree
      .filter((r) => ids.has(r.id))
      .map((r) => ({ id: r.id, parentId: r.parentId as string, rootId: place.rootId, depth: intOr0(r.depth) }));
    return { changes, leftBehind: 0 };
  }
  if (orig.parentId != null || place.rootId === originalId) throw new FamilyMoveRefusedError('This recipe cannot be moved.');
  const family = await getPublishedRecipeTree(originalId);
  if (family.some((r) => r.createdBy?.uid !== uid)) throw new FamilyMoveRefusedError(FAMILY_MOVE_OTHERS_MESSAGE);
  if (family.length > MAX_FAMILY_MOVE) {
    throw new FamilyMoveRefusedError(`This family has too many versions to move at once (most is ${MAX_FAMILY_MOVE}).`);
  }

  const changes = await runTransaction(fs, async (tx) => {
    const [t, ...snaps] = await Promise.all([doc(fs, 'recipes', targetId), ...family.map((r) => doc(fs, 'recipes', r.id))].map((ref) => tx.get(ref)));
    if (!t.exists()) throw new FamilyMoveRefusedError('That family is no longer there.');
    const now = placeOf({ id: t.id, ...t.data() });
    if (now.rootId === originalId) throw new FamilyMoveRefusedError('This recipe cannot be moved.');
    const rows = snaps.map((snap) => {
      const d = snap.data();
      if (!d || d.rootId !== originalId) throw new FamilyMoveRefusedError('The family changed while moving. Try again.');
      if ((d.createdBy as { uid?: unknown } | undefined)?.uid !== uid) throw new FamilyMoveRefusedError(FAMILY_MOVE_OTHERS_MESSAGE);
      return { id: snap.id, parentId: (d.parentId as string | null | undefined) ?? null, depth: intOr0(d.depth) };
    });
    const plan = planFamilyMove(rows, now);
    for (const { id, ...move } of plan) tx.update(doc(fs, 'recipes', id), { ...move, relatedFamilyId: null });
    return plan;
  });

  const targetUid = target.createdBy?.uid;
  if (typeof targetUid === 'string' && targetUid !== uid) {
    notifyBranched({ branch: { id: originalId, prompt: orig.prompt ?? '' }, parent: target, from: { uid, displayName } });
  }
  let leftBehind = 0;
  try {
    leftBehind = (await getPublishedRecipeTree(originalId)).length;
  } catch (err) {
    reportError(err, 'family-move-check');
  }
  if (leftBehind > 0) reportError(new Error(`Family move left ${leftBehind} version(s) behind`), 'family-move-left-behind');
  return { changes, leftBehind };
}

// --- Cloud Favorites ---

export async function addCloudFavorite(
  uid: string,
  recipeId: string,
  recipeOwnerId: string,
  recipeTitle: string,
  recipeEmoji: string,
  fromDisplayName: string | null
): Promise<void> {
  if (!firestore) return;

  const batch = writeBatch(firestore);
  const favoriteId = `${uid}_${recipeId}`;

  batch.set(doc(firestore, 'favorites', favoriteId), {
    uid,
    recipeId,
    recipeOwnerId,
    createdAt: Date.now(),
  });

  batch.update(doc(firestore, 'recipes', recipeId), {
    favoriteCount: increment(1),
  });

  await batch.commit();

  // Notify recipe owner (don't block on this, don't notify self)
  if (uid !== recipeOwnerId) {
    notify(firestore, {
      recipientUid: recipeOwnerId,
      type: 'favorite',
      recipeId,
      recipeTitle,
      recipeEmoji,
      fromUid: uid,
      fromDisplayName,
      message: null,
      read: false,
      createdAt: Date.now(),
    });
  }
}

/** Same bound as the favourite toggles, so a hung network cannot hang an upgrade. */
const FAVORITE_PUSH_TIMEOUT_MS = 5000;

export interface FavoritesPushSummary {
  attempted: number;
  pushed: number;
  skipped: number;
}

/**
 * Carry this device's local favourites of `uid` into cloud favourites after an
 * anonymous account upgrades to a verified email (RL-034).
 *
 * One batch per favourite (create + favoriteCount +1), run one at a time. A
 * failed, denied or timed-out batch is skipped and counted, never retried. The
 * rules make this idempotent: a favourite that already exists is an update,
 * which is denied, so the batch rolls back and the count is never bumped twice.
 * A recipe that is not in the cloud fails on the bump, so that bookmark stays
 * local. No notifications, and Dexie is never modified.
 */
export async function pushLocalFavoritesToCloud(uid: string): Promise<FavoritesPushSummary> {
  if (!firestore) return { attempted: 0, pushed: 0, skipped: 0 };
  const rows = selectFavoritesToPush(await db.favorites.where('uid').equals(uid).toArray(), uid);

  let pushed = 0;
  for (const fav of rows) {
    // Nothing reads recipeOwnerId today; same fallback as the toggle callers.
    const recipeOwnerId = (await db.recipes.get(fav.recipeId))?.createdBy?.uid ?? 'local';
    const batch = writeBatch(firestore);
    batch.set(doc(firestore, 'favorites', `${uid}_${fav.recipeId}`), {
      uid,
      recipeId: fav.recipeId,
      recipeOwnerId,
      createdAt: fav.createdAt,
    });
    batch.update(doc(firestore, 'recipes', fav.recipeId), { favoriteCount: increment(1) });
    // shortcut: a timed-out batch may still commit later; it is atomic, so the count stays right.
    const ok = await withTimeout(
      batch.commit().then(
        () => true,
        () => false
      ),
      FAVORITE_PUSH_TIMEOUT_MS,
      false
    );
    if (ok) pushed += 1;
  }
  return { attempted: rows.length, pushed, skipped: rows.length - pushed };
}

/** Bound on the one sign-in read of the user's cloud favourites. */
const FAVORITE_HYDRATE_TIMEOUT_MS = 8000;

/**
 * Every cloud favourite of `uid`, read once per session to fill this device's
 * Dexie favourites (RL-043). Read only. Never throws: a failure is reported and,
 * like a timeout, returns null, so the caller tries again next session.
 */
export async function getCloudFavorites(uid: string): Promise<CloudFavoriteRow[] | null> {
  if (!firestore) return null;
  const read = getDocs(query(collection(firestore, 'favorites'), where('uid', '==', uid))).then(
    (snap) => snap.docs.map((d) => d.data() as CloudFavoriteRow),
    (err) => {
      console.error('Reading cloud favourites failed', err);
      reportError(err, 'favorites-hydrate');
      return null;
    }
  );
  return withTimeout(read, FAVORITE_HYDRATE_TIMEOUT_MS, null);
}

/**
 * Unfavourite a recipe.
 *
 * Deliberately NOT a batch. `update` on a missing document rejects, and in a
 * batch that rolls back the favourite deletion too — so once the recipe was
 * deleted, the favourite could never be removed (FUN-8). The favourite record is
 * the user's own data and must come off regardless; the counter lives on a doc
 * that may no longer exist, so its decrement is best-effort.
 */
export async function removeCloudFavorite(uid: string, recipeId: string): Promise<void> {
  if (!firestore) return;

  await deleteDoc(doc(firestore, 'favorites', `${uid}_${recipeId}`));

  try {
    await updateDoc(doc(firestore, 'recipes', recipeId), {
      favoriteCount: increment(-1),
    });
  } catch (err) {
    // Expected when the recipe has been deleted; there is no counter to adjust.
    console.error('Could not decrement favoriteCount (recipe may be deleted)', err);
  }
}

export async function isCloudFavorite(
  uid: string,
  recipeId: string
): Promise<boolean> {
  if (!firestore) return false;
  // A query, not getDoc: the rules read `resource.data`, so a get of a missing doc
  // is denied (emulator-verified, RL-026) while a filtered query returns empty.
  const snap = await getDocs(
    query(
      collection(firestore, 'favorites'),
      where('uid', '==', uid),
      where('recipeId', '==', recipeId),
      limit(1)
    )
  );
  return !snap.empty;
}

// --- Suggestions ---

/**
 * Write `data` at `ref` and move writeWindows/{uid}_{action} in one transaction
 * (RL-048, RL-049): the rules deny the content without the window move. Throws
 * RateLimitedError, having written nothing, at the cap. Rejects after 5 s rather
 * than queueing offline as addDoc did; a timed-out transaction may still commit.
 */
async function writeLimited(
  fs: Firestore,
  uid: string,
  action: RateLimitAction,
  ref: DocumentReference,
  /** A function reads what it needs in the transaction (after the window read) and returns the content. */
  data: DocumentData | ((tx: Transaction) => Promise<DocumentData>),
  /**
   * When given, `ref` is read first and, if it exists, merged with this instead: no window move.
   * 'skip' leaves an existing `ref` as it is, so a retry under the same id writes nothing.
   */
  ifExists?: DocumentData | 'skip'
): Promise<boolean> {
  const windowRef = doc(fs, 'writeWindows', `${uid}_${action}`);
  try {
    return await rejectAfter(
      runTransaction(fs, async (tx) => {
        if (ifExists && (await tx.get(ref)).exists()) {
          if (ifExists !== 'skip') tx.set(ref, ifExists, { merge: true });
          return false;
        }
        const snap = await tx.get(windowRef);
        const prev = snap.exists()
          ? { windowStartMs: (snap.data().windowStart as Timestamp).toMillis(), count: snap.data().count as number }
          : null;
        const { cap, windowMs } = RATE_LIMITS[action];
        const next = nextWindow(prev, Date.now(), cap, windowMs);
        if (next === 'limited') throw new RateLimitedError(action);
        tx.set(ref, typeof data === 'function' ? await data(tx) : data);
        // A new window stamps windowStart; an increment must leave it as stored,
        // which is what the rules' same-window branch compares against.
        // `last` binds this bump to this one document; the rules check it.
        if (next.count === 1) {
          tx.set(windowRef, { windowStart: serverTimestamp(), count: 1, at: serverTimestamp(), last: ref.path });
        } else {
          tx.update(windowRef, { count: next.count, at: serverTimestamp(), last: ref.path });
        }
        return true;
      }),
      `Sending the ${action}`
    );
  } catch (err) {
    if (err instanceof RateLimitedError) reportError(err, `rate-limited-${action}`);
    throw err;
  }
}

/**
 * Write a notification through the notification window (RL-049), after the
 * action it announces has committed. Fire-and-forget and never throws: a
 * limited, offline, timed-out or denied notification is skipped, so it can never
 * fail the favourite, follow, suggestion, reply or review itself. A limited one
 * is reported once by writeLimited as 'rate-limited-notification'.
 */
function notify(fs: Firestore, data: DocumentData & { fromUid: string }): void {
  writeLimited(fs, data.fromUid, 'notification', doc(collection(fs, 'notifications')), data).catch(() => {});
}

/**
 * Tells the parent's author that `from` branched it (RL-153). Call only after
 * `branch` is published: the rules read it to check the sender and the parent's
 * owner. The caller skips its own and 'local' parents. Never throws (notify).
 */
export function notifyBranched({ branch, parent, from }: {
  branch: Pick<Recipe, 'id' | 'prompt'>;
  parent: Pick<Recipe, 'title' | 'emoji'> & { createdBy: { uid: string } };
  from: { uid: string; displayName: string | null };
}): void {
  if (!firestore) return;
  notify(firestore, {
    recipientUid: parent.createdBy.uid,
    type: 'branch',
    recipeId: branch.id,
    recipeTitle: parent.title,
    recipeEmoji: parent.emoji,
    fromUid: from.uid,
    fromDisplayName: from.displayName,
    message: branch.prompt ? truncateNotificationMessage(branch.prompt) : null,
    read: false,
    createdAt: Date.now(),
  });
}

export async function createSuggestion(params: {
  recipeId: string;
  recipeOwnerId: string;
  recipeTitle: string;
  recipeEmoji: string;
  suggestedBy: { uid: string; displayName: string | null };
  message: string;
  edits?: SuggestionEdit[];
}): Promise<void> {
  if (!firestore) return;

  await writeLimited(firestore, params.suggestedBy.uid, 'suggestion', doc(collection(firestore, 'suggestions')), {
    recipeId: params.recipeId,
    recipeOwnerId: params.recipeOwnerId,
    recipeTitle: params.recipeTitle,
    // Stored so the approve/reject notification can be built from the
    // suggestion alone, without refetching the recipe.
    recipeEmoji: params.recipeEmoji,
    suggestedBy: params.suggestedBy,
    message: params.message,
    ...(params.edits?.length ? { edits: params.edits } : {}),
    status: 'pending',
    createdAt: Date.now(),
  });

  // Notify recipe owner
  if (params.suggestedBy.uid !== params.recipeOwnerId) {
    notify(firestore, {
      recipientUid: params.recipeOwnerId,
      type: 'suggestion',
      recipeId: params.recipeId,
      recipeTitle: params.recipeTitle,
      recipeEmoji: params.recipeEmoji,
      fromUid: params.suggestedBy.uid,
      fromDisplayName: params.suggestedBy.displayName,
      message: truncateNotificationMessage(params.edits?.length ? describeEdits(params.edits) : params.message),
      read: false,
      createdAt: Date.now(),
    });
  }
}

/**
 * Live suggestions on one recipe that this viewer may read: all of them for the
 * owner, only their own for anyone else. The read rule allows only those two
 * parties, and a `list` is authorised from its filters, not from the documents
 * (docs/decisions.md), so the filter here must be the one the rule checks.
 */
export function subscribeRecipeSuggestions(
  recipeId: string,
  viewerUid: string,
  isOwner: boolean,
  callback: (suggestions: Suggestion[]) => void
): () => void {
  if (!firestore) return () => {};
  const q = query(
    collection(firestore, 'suggestions'),
    where('recipeId', '==', recipeId),
    where(isOwner ? 'recipeOwnerId' : 'suggestedBy.uid', '==', viewerUid),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Suggestion)
    );
  });
}

/**
 * Post a reply on a suggestion thread.
 *
 * Notifies the other participant, whichever side that is: the owner replying
 * notifies the suggester and vice versa, since a reply nobody is told about is
 * a message into the void.
 *
 * Deliberately allowed after approval or rejection. A rejection is exactly when
 * the suggester wants to ask why.
 */
export async function addSuggestionMessage(
  suggestion: Suggestion,
  from: { uid: string; displayName: string | null },
  text: string
): Promise<void> {
  if (!firestore) return;

  await writeLimited(firestore, from.uid, 'reply', doc(collection(firestore, 'suggestions', suggestion.id, 'messages')), {
    fromUid: from.uid,
    fromDisplayName: from.displayName,
    text,
    createdAt: Date.now(),
  });

  const recipientUid = replyRecipient(suggestion, from.uid);

  // Fire-and-forget, matching the other notification writes: a failed
  // notification must not make a sent reply look like it failed.
  if (recipientUid) {
    notify(firestore, {
      recipientUid,
      type: 'suggestion_reply',
      recipeId: suggestion.recipeId,
      recipeTitle: suggestion.recipeTitle,
      recipeEmoji: suggestion.recipeEmoji ?? '🍽️',
      fromUid: from.uid,
      fromDisplayName: from.displayName,
      message: truncateNotificationMessage(text),
      read: false,
      createdAt: Date.now(),
    });
  }
}

/** Live reply thread for one suggestion, oldest first so it reads as a conversation. */
export function subscribeSuggestionMessages(
  suggestionId: string,
  callback: (messages: SuggestionMessage[]) => void,
  onError?: (error: Error) => void
): () => void {
  if (!firestore) return () => {};
  const q = query(
    collection(firestore, 'suggestions', suggestionId, 'messages'),
    orderBy('createdAt', 'asc')
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SuggestionMessage));
    },
    (error) => onError?.(error)
  );
}

type Reviewer = { uid: string; displayName: string | null };

/** Tells the suggester what happened, after the review has committed. Never throws (notify). */
function notifyReview(
  fs: Firestore,
  suggestion: Suggestion,
  reviewer: Reviewer | undefined,
  type: 'suggestion_applied' | 'suggestion_branched' | 'suggestion_rejected',
  recipeId: string,
  message: string | null
): void {
  if (!reviewer || reviewer.uid === suggestion.suggestedBy.uid) return;
  notify(fs, {
    recipientUid: suggestion.suggestedBy.uid,
    type,
    recipeId,
    recipeTitle: suggestion.recipeTitle,
    recipeEmoji: suggestion.recipeEmoji ?? '🍽️',
    fromUid: reviewer.uid,
    fromDisplayName: reviewer.displayName,
    // The suggestion rule does not require a string message, so fall back to
    // null rather than throw after the status write has already landed.
    message: typeof message === 'string' && message ? truncateNotificationMessage(message) : null,
    read: false,
    createdAt: Date.now(),
  });
}

/** What the outcome notification echoes: the edits when there are any, else the free text. */
const reviewMessage = (s: Suggestion) => describeEdits(s.edits ?? []) || s.message;

/**
 * Apply a suggestion (RL-148). With ingredient or step edits, one transaction
 * reads the recipe and the suggestion, requires the suggestion still pending,
 * checks the edits against the recipe as read (StaleSuggestionError, nothing
 * written, when any no longer matches), and writes the edited recipe with the
 * suggester added to `collaborators` and `collaboratorUids` together with
 * `status: 'applied'`. So the
 * recipe never changes with the suggestion left open, or the reverse. The
 * cache and the notification follow the commit. Without such edits ("Mark
 * applied") only the status and the notification.
 */
export async function applySuggestion(suggestion: Suggestion, recipe: Recipe, reviewer: Reviewer): Promise<void> {
  if (!firestore) throw new Error('Firestore is not configured');
  const fs = firestore;
  const edits = suggestion.edits ?? [];
  const suggestionRef = doc(fs, 'suggestions', suggestion.id);

  if (hasApplicableEdits(edits)) {
    const recipeRef = doc(fs, 'recipes', recipe.id);
    // Bounded: a transaction fails offline rather than queueing, but may stall.
    const edited = await rejectAfter(
      runTransaction(fs, async (tx) => {
        const recipeSnap = await tx.get(recipeRef);
        const suggestionSnap = await tx.get(suggestionRef);
        if (!suggestionSnap.exists() || suggestionSnap.data().status !== 'pending') throw new SuggestionClosedError();
        // Never creates a cloud copy: a missing one was deleted on another device.
        if (!recipeSnap.exists()) throw new Error('The recipe is not in the cloud');
        const cloud = { ...recipeSnap.data(), id: recipe.id } as CloudRecipeDoc;
        const result = applySuggestionEdits(cloud, edits);
        if (!result.ok) throw new StaleSuggestionError(result.stale);
        const existing = cloud.collaborators ?? [];
        const { uid, displayName } = suggestion.suggestedBy;
        const collaborators =
          uid === cloud.createdBy?.uid || existing.some((c) => c.uid === uid)
            ? existing
            : [...existing, { uid, displayName }];
        // Every credited uid, so a recipe credited before RL-172 gains the whole list.
        const creditedUids = [...new Set(collaborators.map((c) => c.uid))].filter((u) => u !== cloud.createdBy?.uid);
        const updatedAt = Date.now();
        // An update, not publishRecipe, whose re-publish omits both credit fields.
        tx.update(recipeRef, {
          ...result.patch,
          collaborators,
          ...(creditedUids.length ? { collaboratorUids: arrayUnion(...creditedUids) } : {}),
          updatedAt,
        });
        tx.update(suggestionRef, { status: 'applied' });
        return toLocalRecipe({ ...cloud, ...result.patch, collaborators, updatedAt }, recipe);
      }),
      'Applying the suggestion'
    );
    try {
      await cacheRecipe(edited);
    } catch (err) {
      // The edit is in the cloud; the own-recipe sync (RL-078) fills the row.
      console.error('Caching the applied recipe locally failed', err);
      reportError(err, 'apply-suggestion-cache');
    }
  } else {
    await updateDoc(suggestionRef, { status: 'applied' });
  }

  notifyReview(fs, suggestion, reviewer, 'suggestion_applied', suggestion.recipeId, reviewMessage(suggestion));
}

/**
 * Keep a suggestion as a new branch of the recipe owned by `owner`, crediting
 * the suggester (RL-148). Requires the suggestion still pending, builds the
 * branch from the cloud parent under an id derived from the suggestion, and
 * publishes it (create, recipe window; a RateLimitedError writes nothing else)
 * unless an earlier attempt already did, so a retry never makes a second
 * branch. Then caches it, writes `branched` with its id, and notifies.
 * Returns the branch id.
 */
export async function keepSuggestionAsBranch(suggestion: Suggestion, recipe: Recipe, owner: Reviewer): Promise<string> {
  if (!firestore) throw new Error('Firestore is not configured');
  const fs = firestore;
  const edits = suggestion.edits ?? [];
  if (!hasApplicableEdits(edits)) throw new Error('Suggestion has no ingredient or step edits');
  const branchId = await suggestionBranchId(suggestion.id);

  const branch = await rejectAfter(
    (async () => {
      const suggestionSnap = await getDoc(doc(fs, 'suggestions', suggestion.id));
      if (!suggestionSnap.exists() || suggestionSnap.data().status !== 'pending') throw new SuggestionClosedError();
      const parentSnap = await getDoc(doc(fs, 'recipes', recipe.id));
      if (!parentSnap.exists()) throw new Error('The recipe is not in the cloud');
      const parent = toLocalRecipe({ ...parentSnap.data(), id: recipe.id } as CloudRecipeDoc, recipe);
      const check = applySuggestionEdits(parent, edits);
      if (!check.ok) throw new StaleSuggestionError(check.stale);

      // A previous attempt published it and failed later: reuse it. Re-publishing
      // would move createdAt, which the owner-update rule denies.
      const existing = await getDoc(doc(fs, 'recipes', branchId));
      if (existing.exists()) {
        // The id is guessable, so anyone could have created it first: reuse only our own branch of this recipe.
        const data = existing.data();
        if (data.createdBy?.uid !== owner.uid || data.parentId !== recipe.id) {
          throw new Error(`Branch id ${branchId} is taken by another recipe`);
        }
        return toLocalRecipe({ ...data, id: branchId } as CloudRecipeDoc);
      }
      const built = buildBranchFromSuggestion(parent, suggestion, owner, branchId, Date.now());
      await publishRecipe(built);
      return built;
    })(),
    'Keeping the suggestion as a branch'
  );
  try {
    await cacheRecipe(branch);
  } catch (err) {
    // The branch is in the cloud; the own-recipe sync (RL-078) fills the row.
    console.error('Caching the new branch locally failed', err);
    reportError(err, 'branch-suggestion-cache');
  }

  await updateDoc(doc(fs, 'suggestions', suggestion.id), { status: 'branched', branchId });
  notifyReview(fs, suggestion, owner, 'suggestion_branched', branchId, reviewMessage(suggestion));
  return branchId;
}

/** Decline a suggestion: the status, then the notification. */
export async function updateSuggestionStatus(
  suggestionId: string,
  status: 'rejected',
  reviewer?: Reviewer
): Promise<void> {
  if (!firestore) return;

  // Read before writing: the suggester's identity is needed to notify them.
  const suggestionSnap = await getDoc(doc(firestore, 'suggestions', suggestionId));
  // Throw, not return: a silent return would read as a successful decline.
  if (!suggestionSnap.exists()) throw new Error('The suggestion no longer exists');
  const suggestion = { id: suggestionId, ...suggestionSnap.data() } as Suggestion;

  await updateDoc(doc(firestore, 'suggestions', suggestionId), { status });

  // Echo the original suggestion so the notification is self-explanatory weeks later.
  notifyReview(firestore, suggestion, reviewer, 'suggestion_rejected', suggestion.recipeId, suggestion.message);
}

// --- Notifications ---

export function subscribeNotifications(
  uid: string,
  callback: (notifications: AppNotification[]) => void,
  /** Called if the subscription fails, e.g. a missing index or denied read. */
  onError?: (err: Error) => void
): () => void {
  if (!firestore) return () => {};
  const q = query(
    collection(firestore, 'notifications'),
    where('recipientUid', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AppNotification)
      );
    },
    // Without this, a failed subscription was silent and the panel sat on its
    // empty state, which reads as "nobody has interacted with your recipes".
    (err) => {
      console.error('Notification subscription failed', err);
      reportError(err, 'notification-subscription');
      onError?.(err);
    }
  );
}

/** The owner's "Notify me when" document; `null` when it does not exist (all on). */
export function subscribeNotificationPrefs(
  uid: string,
  callback: (prefs: NotificationPrefs | null) => void,
  onError?: (err: Error) => void
): () => void {
  if (!firestore) {
    // Nothing to read: report "no document" so the caller is not left waiting.
    queueMicrotask(() => callback(null));
    return () => {};
  }
  return onSnapshot(
    doc(firestore, 'notificationPrefs', uid),
    (snap) => {
      const d = snap.data();
      callback(
        d && typeof d.branch === 'boolean' && typeof d.suggestion === 'boolean' && typeof d.follow === 'boolean'
          ? { branch: d.branch, suggestion: d.suggestion, follow: d.follow }
          : null
      );
    },
    // Not deployed until RL-156: a denied read leaves everything on.
    (err) => onError?.(err)
  );
}

/** Writes the whole document; the rules require exactly these keys and a server `updatedAt`. */
export async function setNotificationPrefs(uid: string, prefs: NotificationPrefs): Promise<void> {
  if (!firestore) throw new Error('Firebase is not configured');
  await setDoc(doc(firestore, 'notificationPrefs', uid), { ...prefs, updatedAt: serverTimestamp() });
}

const TASTE_TIMEOUT_MS = 5000;

const toTasteProfile = (d: DocumentData | undefined): TasteProfile => ({
  avoids: normaliseAvoids(d?.avoids),
  hidden: normaliseHidden(d?.hidden),
  askedAt: typeof d?.askedAt === 'number' ? Math.min(Math.floor(d.askedAt), Date.now()) : null,
});

/** The owner's taste profile (RL-231); empty when the document does not exist. Rejects after 5 s. */
export async function getTasteProfile(uid: string): Promise<TasteProfile> {
  if (!firestore) throw new Error('Firebase not configured');
  const snap = await rejectAfter(getDoc(doc(firestore, 'tasteProfiles', uid)), 'Reading your taste profile', TASTE_TIMEOUT_MS);
  return toTasteProfile(snap.data());
}

/**
 * Applies `update` to the freshly read taste profile and returns what was stored, so two devices (or two quick
 * calls) cannot drop each other's change. `update` may throw to refuse. The rules need all four keys on every
 * write, so the document is written whole in one transaction; values are normalised and `askedAt` is not future.
 * Rejects after 5 s; a timed-out transaction may still commit.
 */
export async function saveTasteProfile(uid: string, update: (cur: TasteProfile) => Partial<TasteProfile>): Promise<TasteProfile> {
  if (!firestore) throw new Error('Firebase not configured');
  const fs = firestore;
  const ref = doc(fs, 'tasteProfiles', uid);
  return rejectAfter(
    runTransaction(fs, async (tx) => {
      const cur = toTasteProfile((await tx.get(ref)).data());
      const patch = update(cur);
      const asked = patch.askedAt === undefined ? cur.askedAt : patch.askedAt;
      const next: TasteProfile = {
        avoids: normaliseAvoids(patch.avoids ?? cur.avoids),
        hidden: normaliseHidden(patch.hidden ?? cur.hidden),
        askedAt: asked === null ? null : Math.min(Math.floor(asked), Date.now()),
      };
      tx.set(ref, { ...next, updatedAt: serverTimestamp() });
      return next;
    }),
    'Saving your taste profile',
    TASTE_TIMEOUT_MS
  );
}

export async function markNotificationRead(
  notificationId: string
): Promise<void> {
  if (!firestore) return;
  await updateDoc(doc(firestore, 'notifications', notificationId), {
    read: true,
  });
}

// Firestore rejects a batch of more than 500 writes.
const BATCH_LIMIT = 500;

export async function markAllNotificationsRead(uid: string): Promise<void> {
  if (!firestore) return;
  const q = query(
    collection(firestore, 'notifications'),
    where('recipientUid', '==', uid),
    where('read', '==', false)
  );
  const snap = await getDocs(q);
  // A failed later chunk leaves earlier ones committed; a retry only sees what is still unread.
  for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(firestore);
    snap.docs.slice(i, i + BATCH_LIMIT).forEach((d) => batch.update(d.ref, { read: true }));
    await batch.commit();
  }
}

// --- Cooks (RL-196): public "I made this" records, cloud only ---

const COOK_SUMMARY_TIMEOUT_MS = 6000;
// A 1000-row family read can outrun 6 s (RL-266).
const FAMILY_COOKS_TIMEOUT_MS = 12_000;
const COOK_SUMMARY_RECENT = 20;
const OWN_COOKS_MAX = 200;
const COOK_PHOTO_TIMEOUT_MS = 15_000;

function toCook(d: QueryDocumentSnapshot): Cook {
  // 'estimate' so the user's own pending cook has a time before the server stamps it.
  const data = d.data({ serverTimestamps: 'estimate' });
  const at = data.createdAt as Timestamp | null | undefined;
  return { ...data, id: d.id, createdAt: at?.toMillis?.() ?? 0 } as Cook;
}

/** A fresh cook id, so a caller can retry logCook under the same id. */
export function newCookId(): string {
  if (!firestore) throw new Error('Firebase not configured');
  return doc(collection(firestore, 'cooks')).id;
}

/**
 * Log that `user` cooked recipe `recipeId` and return the cook's id. Writes the
 * cook and the 'cook' window in one transaction (writeLimited), so it throws
 * RateLimitedError at 20 a day and rejects after 5 s. `rootId` and
 * `recipeOwnerId` are read from `recipes/{recipeId}` in that transaction, never
 * taken from the caller; a missing recipe or one without a rootId throws
 * RecipeNotPublishedError. Pass the same `cookId` to retry after a timeout: an
 * existing cook is left alone and the window does not move. The name is the
 * account's own (AppUser), never typed input; the rules do not tie it.
 * A permission denial from stale Terms becomes TermsNotAcceptedError; that
 * check is one more read bounded at 5 s, so a denial can take about 10 s.
 */
export async function logCook({ recipeId, vote, note, user, cookId }: {
  recipeId: string;
  vote: Cook['vote'];
  note: string | null;
  user: Pick<AppUser, 'uid' | 'displayName'>;
  cookId?: string;
}): Promise<string> {
  if (!firestore) throw new Error('Firebase not configured');
  const fs = firestore;
  const ref = cookId ? doc(fs, 'cooks', cookId) : doc(collection(fs, 'cooks'));
  const trimmed = note?.trim() ?? '';
  try {
    await writeLimited(
      fs,
      user.uid,
      'cook',
      ref,
      async (tx) => {
        const recipe = await tx.get(doc(fs, 'recipes', recipeId));
        const rootId: unknown = recipe.exists() ? recipe.data().rootId : null;
        if (typeof rootId !== 'string') throw new RecipeNotPublishedError();
        return {
          uid: user.uid,
          displayName: user.displayName ? user.displayName.slice(0, 100) : null,
          recipeId,
          rootId,
          recipeOwnerId: recipe.data()?.createdBy?.uid ?? null,
          vote,
          note: trimmed ? trimmed.slice(0, 500) : null,
          branchId: null,
          createdAt: serverTimestamp(),
        };
      },
      'skip'
    );
  } catch (err) {
    if ((err as { code?: unknown } | null)?.code === 'permission-denied') {
      // The rules give no reason, so ask: a stale or missing acceptance is the one denial the user can fix.
      const version = await getAcceptedTermsVersion(user.uid).catch(() => TERMS_VERSION);
      if (version !== TERMS_VERSION) throw new TermsNotAcceptedError();
    }
    throw err;
  }
  return ref.id;
}

export interface RecipeCookSummary {
  total: number;
  again: number;
  /** The newest 20, newest first. */
  recent: Cook[];
}

/**
 * Counts and the newest 20 cooks of one recipe, for the Made-by row and recent
 * notes. Readable signed out. Costs 2 count reads plus one per cook returned.
 * Rejects after 6 s.
 */
export async function getRecipeCookSummary(recipeId: string): Promise<RecipeCookSummary> {
  if (!firestore) return { total: 0, again: 0, recent: [] };
  const cooks = collection(firestore, 'cooks');
  const ofRecipe = where('recipeId', '==', recipeId);
  const [total, again, snap] = await rejectAfter(
    Promise.all([
      getCountFromServer(query(cooks, ofRecipe)),
      getCountFromServer(query(cooks, ofRecipe, where('vote', '==', 'again'))),
      getDocs(query(cooks, ofRecipe, orderBy('createdAt', 'desc'), limit(COOK_SUMMARY_RECENT))),
    ]),
    'Reading cooks',
    COOK_SUMMARY_TIMEOUT_MS
  );
  return { total: total.data().count, again: again.data().count, recent: snap.docs.map(toCook) };
}

/**
 * Cooks created at or after `sinceMs`, newest first, reduced to the four fields the ranking helpers
 * need (RL-242). One range filter and `orderBy` on `createdAt`, so the automatic single-field index
 * serves it and no composite index is needed. Costs one read per cook returned (at most `max`).
 * Local-only returns empty. Rejects after 6 s.
 *
 * shortcut: counts only the newest 500 cooks in 90 days, upgrade to a counter
 */
export async function getRecentCooks(sinceMs: number, max = 500): Promise<RecentCook[]> {
  if (!firestore) return [];
  const snap = await rejectAfter(
    getDocs(query(collection(firestore, 'cooks'), where('createdAt', '>=', new Date(sinceMs)), orderBy('createdAt', 'desc'), limit(max))),
    'Reading recent cooks',
    COOK_SUMMARY_TIMEOUT_MS
  );
  return snap.docs.map((d) => {
    const c = toCook(d);
    return { recipeId: c.recipeId, rootId: c.rootId, uid: c.uid, createdAt: c.createdAt };
  });
}

/**
 * The newest `max` cooks of one family (RL-245), reduced to the four slim fields. Equality on
 * `rootId` plus `orderBy createdAt desc` needs the (rootId asc, createdAt desc) composite index.
 * One read per cook returned. Local-only returns empty. Rejects after 12 s.
 *
 * shortcut: counts only the newest 1000 cooks of a family, upgrade to a counter
 */
export async function getFamilyCooks(rootId: string, max = 1000): Promise<RecentCook[]> {
  if (!firestore) return [];
  const snap = await rejectAfter(
    getDocs(query(collection(firestore, 'cooks'), where('rootId', '==', rootId), orderBy('createdAt', 'desc'), limit(max))),
    'Reading family cooks',
    FAMILY_COOKS_TIMEOUT_MS
  );
  return snap.docs.map((d) => {
    const c = toCook(d);
    return { recipeId: c.recipeId, rootId: c.rootId, uid: c.uid, createdAt: c.createdAt };
  });
}

/** How many cooks a person has logged: one count read (single-field, public read). Null when Firebase is off. Rejects after 6 s. */
export async function countUserCooks(uid: string): Promise<number | null> {
  if (!firestore) return null;
  const n = await rejectAfter(
    getCountFromServer(query(collection(firestore, 'cooks'), where('uid', '==', uid))),
    'Counting cooks',
    COOK_SUMMARY_TIMEOUT_MS
  );
  return n.data().count;
}

/** The user's own newest 200 cooks, live, for the cook log and the Cooked stat. One read per cook. */
export function subscribeOwnCooks(
  uid: string,
  onChange: (cooks: Cook[]) => void,
  onError?: (err: Error) => void
): () => void {
  if (!firestore) return () => {};
  const q = query(collection(firestore, 'cooks'), where('uid', '==', uid), orderBy('createdAt', 'desc'), limit(OWN_COOKS_MAX));
  return onSnapshot(q, (snap) => onChange(snap.docs.map(toCook)), onError);
}

/** The user's cooks inside one family, for the "you made this" tag (RL-219): one equality-only query, no composite index. Rejects after 6 s. */
export async function getOwnCooksInFamily(uid: string, rootId: string, max = 30): Promise<Cook[]> {
  if (!firestore) return [];
  const snap = await rejectAfter(
    getDocs(query(collection(firestore, 'cooks'), where('uid', '==', uid), where('rootId', '==', rootId), limit(max))),
    'Reading cooks',
    COOK_SUMMARY_TIMEOUT_MS
  );
  return snap.docs.map(toCook);
}

/** Credit the branch grown from a cook's note. The rules allow this once, to the cook's own published recipe. */
export async function setCookBranch(cookId: string, branchId: string): Promise<void> {
  if (!firestore) return;
  await updateDoc(doc(firestore, 'cooks', cookId), { branchId });
}

/**
 * Deletes the cook's photo first (the rules cannot cascade, and the photo's
 * create rule reads the cook), then the cook. Any failure, offline included,
 * stops before the cook is deleted, so no photo is left without its cook.
 */
export async function deleteCook(cookId: string): Promise<void> {
  if (!firestore) return;
  await deleteCookPhoto(cookId);
  await deleteDoc(doc(firestore, 'cooks', cookId));
}

/**
 * The cook photo (RL-205): one public JPEG data URL per cook, written after the
 * cook because the rules read it. Replacing is delete then add (no update rule).
 * The URL is never logged; callers redact errors before reporting them.
 */
export async function addCookPhoto(cookId: string, recipeId: string, url: string): Promise<void> {
  if (!firestore) throw new Error('Firebase not configured');
  if (!url.startsWith(JPEG_DATA_URL_PREFIX) || url.length > COOK_PHOTO_MAX_URL_LENGTH) {
    throw new Error('The cook photo is not a JPEG data URL within the size cap');
  }
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error('Sign in to add a photo');
  // 15 s, not the usual bound: up to 200 KB on a phone connection. A timed-out write may still land later.
  await rejectAfter(
    setDoc(doc(firestore, 'cookPhotos', cookId), { uid, recipeId, url, createdAt: serverTimestamp() }),
    'Saving the cook photo',
    COOK_PHOTO_TIMEOUT_MS
  );
}

/**
 * Deletes the cook's photo if it has one. Reads it first (public read): deleting
 * a missing photo is denied, since the rule reads the missing doc's uid.
 */
export async function deleteCookPhoto(cookId: string): Promise<void> {
  if (!firestore) return;
  const ref = doc(firestore, 'cookPhotos', cookId);
  if ((await getDoc(ref)).exists()) await deleteDoc(ref);
}

export interface RecipePhoto {
  cookId: string;
  url: string;
  /** The cook's name, never typed with the photo; "A cook" when the account has none. */
  name: string;
}

const RECIPE_PHOTO_CANDIDATES = 3;

/**
 * The newest cook photo of a recipe whose cook still exists (RL-206), derived on
 * read, never written to the recipe. Reads one photo at a time, up to 3 (a photo whose
 * cook is gone is skipped, so one orphan hides nothing), and one cook doc per photo not
 * already in `knownCooks`. Public read. Null when there is none. Rejects after 6 s.
 */
export async function getRecipePhoto(recipeId: string, knownCooks: Cook[] = []): Promise<RecipePhoto | null> {
  const fs = firestore;
  if (!fs) return null;
  return rejectAfter(
    (async () => {
      let last: QueryDocumentSnapshot | undefined;
      // One photo doc per read: a normal visit reads one; a skipped photo costs one more, up to 3.
      for (let i = 0; i < RECIPE_PHOTO_CANDIDATES; i++) {
        const snap = await getDocs(
          query(collection(fs, 'cookPhotos'), where('recipeId', '==', recipeId), orderBy('createdAt', 'desc'), ...(last ? [startAfter(last)] : []), limit(1))
        );
        const d = snap.docs[0];
        if (!d) return null;
        last = d;
        const url = d.data().url;
        if (typeof url !== 'string' || !url.startsWith(JPEG_DATA_URL_PREFIX)) continue;
        const known = knownCooks.find((c) => c.id === d.id);
        if (known) return { cookId: d.id, url, name: known.displayName?.trim() || 'A cook' };
        const cook = await getDoc(doc(fs, 'cooks', d.id));
        if (cook.exists()) return { cookId: d.id, url, name: (cook.data().displayName as string | null)?.trim() || 'A cook' };
      }
      return null;
    })(),
    'Reading the recipe photo',
    COOK_SUMMARY_TIMEOUT_MS
  );
}

// --- Kitchens (RL-213): one private document per user, kitchens/{uid} in Phase 2 ---

export interface Kitchen extends KitchenLists {
  memberUids: string[];
  ownerUid: string;
  /** Epoch ms; estimated while a write is pending. */
  updatedAt: number | null;
}

const KITCHEN_WRITE_TIMEOUT_MS = 5000;

function toKitchen(data: DocumentData): Kitchen {
  return {
    memberUids: Array.isArray(data.memberUids) ? data.memberUids : [],
    ownerUid: typeof data.ownerUid === 'string' ? data.ownerUid : '',
    shopping: Array.isArray(data.shopping) ? data.shopping : [],
    pantry: Array.isArray(data.pantry) ? data.pantry : [],
    updatedAt: (data.updatedAt as Timestamp | null | undefined)?.toMillis?.() ?? null,
  };
}

/** One kitchen document, live; null while it does not exist. One read per change. */
export function subscribeKitchen(
  kitchenId: string,
  onChange: (kitchen: Kitchen | null) => void,
  onError?: (err: Error) => void
): () => void {
  if (!firestore) return () => {};
  return onSnapshot(
    doc(firestore, 'kitchens', kitchenId),
    (snap) => onChange(snap.exists() ? toKitchen(snap.data({ serverTimestamps: 'estimate' })) : null),
    onError
  );
}

/** The kitchen document once, without a listener (RL-219); null when it does not exist or Firebase is off. Rejects after 6 s. */
export async function getKitchenOnce(kitchenId: string): Promise<Kitchen | null> {
  if (!firestore) return null;
  const snap = await rejectAfter(getDoc(doc(firestore, 'kitchens', kitchenId)), 'Reading your kitchen', COOK_SUMMARY_TIMEOUT_MS);
  return snap.exists() ? toKitchen(snap.data()) : null;
}

/**
 * Read-modify-write of a kitchen's lists in a transaction, so two devices do not
 * drop each other's lines. Creates the document on first write as the rules
 * require (own uid, sole member). Throws KitchenFullError before writing past a
 * cap or the size guard. Rejects after 5 s; a timed-out transaction may still commit.
 */
export async function updateKitchen(kitchenId: string, fn: (lists: KitchenLists) => KitchenLists): Promise<void> {
  if (!firestore) throw new Error('Firebase not configured');
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error('Sign in to update your kitchen');
  const fs = firestore;
  const ref = doc(fs, 'kitchens', kitchenId);
  await rejectAfter(
    runTransaction(fs, async (tx) => {
      const snap = await tx.get(ref);
      const current = snap.exists() ? toKitchen(snap.data()) : null;
      // Only the own kitchen may be created; a shared one that is gone is not recreated (RL-238).
      if (!current && kitchenId !== uid) throw new Error('That kitchen no longer exists');
      const before = { shopping: current?.shopping ?? [], pantry: current?.pantry ?? [] };
      const { shopping, pantry } = fn(before);
      if (!kitchenFits({ shopping, pantry }, before)) throw new KitchenFullError();
      // Update leaves memberUids, ownerUid and joinCode untouched; the rules refuse any change to them.
      if (current) tx.update(ref, { shopping, pantry, updatedAt: serverTimestamp() });
      else tx.set(ref, { memberUids: [uid], ownerUid: uid, shopping, pantry, updatedAt: serverTimestamp() });
    }),
    'Updating the kitchen',
    KITCHEN_WRITE_TIMEOUT_MS
  );
}

// --- Household sharing (RL-238): membership, invites and member profiles ---

/** A join the rules refused; the hook works out why (expired, already a member, or full). */
export class KitchenJoinDeniedError extends Error {
  constructor() {
    super('Kitchen join refused');
    this.name = 'KitchenJoinDeniedError';
  }
}

export interface KitchenInvite {
  code: string;
  kitchenId: string;
  ownerUid: string;
  /** Epoch ms. */
  expiresAt: number;
}

export interface KitchenMember {
  uid: string;
  name: string | null;
  /** Spread into `<Avatar>`; null when the profile is missing. */
  avatar: Pick<UserProfile, 'photoType' | 'photoEmoji' | 'photoBgColor' | 'photoURL'> | null;
}

/**
 * The kitchen the user is in: a kitchen whose memberUids hold them, other than their own if
 * there is one, else their own id. Limit 2, since under one kitchen per person they are in at
 * most their own (left unused after a join, RL-236) and one shared kitchen. Rejects after 6 s.
 */
export async function findKitchenId(uid: string): Promise<string> {
  if (!firestore) return uid;
  const snap = await rejectAfter(
    getDocs(query(collection(firestore, 'kitchens'), where('memberUids', 'array-contains', uid), limit(2))),
    'Finding your kitchen',
    COOK_SUMMARY_TIMEOUT_MS
  );
  return pickKitchenId(uid, snap.docs.map((d) => d.id));
}

/** Creates a reusable invite to the caller's kitchen, expiring in just under KITCHEN_INVITE_DAYS. Returns the code. */
export async function createKitchenInvite(kitchenId: string, ownerName: string): Promise<string> {
  if (!firestore) throw new Error('Firebase not configured');
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error('Sign in to invite');
  const code = newInviteCode();
  // An hour short of the rules' limit, so a client clock running a little fast is not refused.
  const expiresAt = new Date(Date.now() + KITCHEN_INVITE_DAYS * 86_400_000 - 3_600_000);
  await rejectAfter(
    setDoc(doc(firestore, 'kitchenInvites', code), { kitchenId, ownerUid: uid, ownerName: ownerName.slice(0, 80), expiresAt, createdAt: serverTimestamp() }),
    'Creating the invite',
    KITCHEN_WRITE_TIMEOUT_MS
  );
  return code;
}

/** The invite for a code, or null when it does not exist. Rejects after 6 s. */
export async function getKitchenInvite(code: string): Promise<KitchenInvite | null> {
  if (!firestore) return null;
  const snap = await rejectAfter(getDoc(doc(firestore, 'kitchenInvites', code)), 'Reading the invite', COOK_SUMMARY_TIMEOUT_MS);
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    code,
    kitchenId: typeof d.kitchenId === 'string' ? d.kitchenId : '',
    ownerUid: typeof d.ownerUid === 'string' ? d.ownerUid : '',
    expiresAt: (d.expiresAt as Timestamp | undefined)?.toMillis?.() ?? 0,
  };
}

/**
 * Adds the caller to the invite's kitchen: arrayUnion of their uid and joinCode '<uid>:<code>',
 * nothing else, as the join rule requires (a non-member cannot read the kitchen, so no
 * transaction). A denial, including a missing kitchen, throws KitchenJoinDeniedError.
 */
export async function joinKitchenWithInvite(invite: KitchenInvite): Promise<void> {
  if (!firestore) throw new Error('Firebase not configured');
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error('Sign in to join a kitchen');
  try {
    await rejectAfter(
      updateDoc(doc(firestore, 'kitchens', invite.kitchenId), { memberUids: arrayUnion(uid), joinCode: `${uid}:${invite.code}` }),
      'Joining the kitchen',
      KITCHEN_WRITE_TIMEOUT_MS
    );
  } catch (err) {
    if ((err as { code?: unknown }).code === 'permission-denied') throw new KitchenJoinDeniedError();
    throw err;
  }
}

/** Deletes the caller's own live invites to one kitchen (the rules let the owner list them by ownerUid). */
async function deleteOwnInvites(fs: Firestore, uid: string, kitchenId: string): Promise<void> {
  const snap = await getDocs(query(collection(fs, 'kitchenInvites'), where('ownerUid', '==', uid)));
  const mine = snap.docs.filter((d) => d.data().kitchenId === kitchenId);
  if (!mine.length) return;
  const batch = writeBatch(fs);
  mine.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

/** Deletes the caller's live invites to one kitchen, e.g. their own before they join another (RL-238). */
export async function deleteKitchenInvites(kitchenId: string): Promise<void> {
  if (!firestore) return;
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error('Sign in to manage your kitchen');
  await rejectAfter(deleteOwnInvites(firestore, uid, kitchenId), 'Deleting invites', KITCHEN_WRITE_TIMEOUT_MS);
}

/** The shape the leave and remove rules require: one uid dropped, updatedAt, joinCode cleared so the same person can rejoin. */
const membershipDrop = (uid: string) => ({ memberUids: arrayRemove(uid), updatedAt: serverTimestamp(), joinCode: deleteField() });

/** The caller leaves a kitchen they do not own. */
export async function leaveKitchen(kitchenId: string): Promise<void> {
  if (!firestore) throw new Error('Firebase not configured');
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error('Sign in to leave a kitchen');
  await rejectAfter(updateDoc(doc(firestore, 'kitchens', kitchenId), membershipDrop(uid)), 'Leaving the kitchen', KITCHEN_WRITE_TIMEOUT_MS);
}

/**
 * The owner removes one other member. Their live invites go first, so the removed person
 * cannot walk straight back in with a link they still hold (RL-237).
 */
export async function removeKitchenMember(kitchenId: string, memberUid: string): Promise<void> {
  if (!firestore) throw new Error('Firebase not configured');
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error('Sign in to manage your kitchen');
  if (memberUid === uid) throw new Error('The owner cannot remove themselves');
  const fs = firestore;
  await rejectAfter(
    (async () => {
      await deleteOwnInvites(fs, uid, kitchenId);
      await updateDoc(doc(fs, 'kitchens', kitchenId), membershipDrop(memberUid));
    })(),
    'Removing the member',
    KITCHEN_WRITE_TIMEOUT_MS
  );
}

/** Names and avatars from the public profiles, one read each, at most KITCHEN_MEMBER_CAP. A missing profile gives nulls. */
export async function getKitchenMembers(uids: readonly string[]): Promise<KitchenMember[]> {
  const ids = uids.slice(0, KITCHEN_MEMBER_CAP);
  const profiles = await rejectAfter(Promise.all(ids.map((id) => getProfile(id))), 'Reading kitchen members', COOK_SUMMARY_TIMEOUT_MS);
  return ids.map((uid, i) => {
    const p = profiles[i];
    return {
      uid,
      name: p?.displayName ?? null,
      avatar: p ? { photoType: p.photoType, photoEmoji: p.photoEmoji ?? null, photoBgColor: p.photoBgColor ?? null, photoURL: p.photoURL ?? null } : null,
    };
  });
}

// --- Collections (RL-222): private recipe collections, owner only, collections/{autoId} ---

export interface RecipeCollection {
  id: string;
  ownerUid: string;
  name: string;
  recipeIds: string[];
  /** Absent on RL-211 documents, which are private. */
  visibility: 'private' | 'public';
  /** Cookbook blurb (RL-257); null when none. */
  description: string | null;
  /** Epoch ms; estimated while a write is pending. */
  createdAt: number | null;
  updatedAt: number | null;
}

const COLLECTION_WRITE_TIMEOUT_MS = 5000;

function toCollection(id: string, data: DocumentData): RecipeCollection {
  return {
    id,
    ownerUid: typeof data.ownerUid === 'string' ? data.ownerUid : '',
    name: typeof data.name === 'string' ? data.name : '',
    recipeIds: Array.isArray(data.recipeIds) ? data.recipeIds : [],
    visibility: data.visibility === 'public' ? 'public' : 'private',
    description: typeof data.description === 'string' ? data.description : null,
    createdAt: (data.createdAt as Timestamp | null | undefined)?.toMillis?.() ?? null,
    updatedAt: (data.updatedAt as Timestamp | null | undefined)?.toMillis?.() ?? null,
  };
}

/**
 * The owner's collections, live, newest change first. Equality only, so no composite index;
 * sorted here. One read per document when it attaches, then one per changed document.
 */
export function subscribeCollections(
  uid: string,
  onChange: (collections: RecipeCollection[]) => void,
  onError?: (err: Error) => void
): () => void {
  if (!firestore) return () => {};
  return onSnapshot(
    query(collection(firestore, 'collections'), where('ownerUid', '==', uid)),
    (snap) =>
      onChange(
        snap.docs
          .map((d) => toCollection(d.id, d.data({ serverTimestamps: 'estimate' })))
          .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
      ),
    onError
  );
}

function collectionsDb(): { fs: Firestore; uid: string } {
  if (!firestore) throw new Error('Firebase not configured');
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error('Sign in to use collections');
  return { fs: firestore, uid };
}

/** Creates a private collection with exactly the rules' keys and returns its id. Rejects after 5 s. */
export async function createCollection(name: string, firstRecipeId?: string): Promise<string> {
  const trimmed = collectionName(name);
  if (firstRecipeId !== undefined) checkCollectionRecipeId(firstRecipeId);
  const { fs, uid } = collectionsDb();
  const ref = doc(collection(fs, 'collections'));
  await rejectAfter(
    setDoc(ref, {
      ownerUid: uid,
      name: trimmed,
      visibility: 'private',
      recipeIds: firstRecipeId === undefined ? [] : [firstRecipeId],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
    'Creating the collection',
    COLLECTION_WRITE_TIMEOUT_MS
  );
  return ref.id;
}

export async function renameCollection(id: string, name: string): Promise<void> {
  const trimmed = collectionName(name);
  const { fs } = collectionsDb();
  await rejectAfter(
    updateDoc(doc(fs, 'collections', id), { name: trimmed, updatedAt: serverTimestamp() }),
    'Renaming the collection',
    COLLECTION_WRITE_TIMEOUT_MS
  );
}

/**
 * Turns Share as a cookbook on or off and stores its description (null when blank). Publishing
 * needs the current Terms, which the caller checks first, and moves the 'cookbook' write window
 * (RL-265, 5 a day): at the cap it throws RateLimitedError('cookbook') having written nothing.
 * Stopping sharing is a plain update. Never touches followerCount: a publish rewrites the
 * document as read in the transaction, so a concurrent follow bump retries it rather than being lost.
 */
export async function setCookbookSharing(id: string, visibility: 'private' | 'public', description: string | null): Promise<void> {
  const { fs, uid } = collectionsDb();
  const ref = doc(fs, 'collections', id);
  if (visibility === 'private') {
    await rejectAfter(
      updateDoc(ref, { visibility, description, updatedAt: serverTimestamp() }),
      'Updating the cookbook',
      COLLECTION_WRITE_TIMEOUT_MS
    );
    return;
  }
  // shortcut: the caller only publishes a private collection, so an already public one still counts once; check stored visibility first if a public-to-public save is ever added.
  await writeLimited(fs, uid, 'cookbook', ref, async (tx) => {
    const snap = await tx.get(ref);
    // Same code as a denied update of a missing document, so the hook reports it as gone.
    if (!snap.exists()) throw Object.assign(new Error('Collection not found'), { code: 'not-found' });
    return { ...snap.data(), visibility, description, updatedAt: serverTimestamp() };
  });
}

export async function deleteCollection(id: string): Promise<void> {
  const { fs } = collectionsDb();
  await rejectAfter(deleteDoc(doc(fs, 'collections', id)), 'Deleting the collection', COLLECTION_WRITE_TIMEOUT_MS);
}

/**
 * Adds a recipe with arrayUnion inside a transaction, so the cap is checked against the stored
 * list rather than a stale snapshot. Already there: no write. Gone: CollectionRefusedError. Full: CollectionRefusedError
 * "This collection is full." before writing. Rejects after 5 s; a timed-out transaction may still commit.
 */
export async function addToCollection(id: string, recipeId: string): Promise<void> {
  checkCollectionRecipeId(recipeId);
  const { fs } = collectionsDb();
  const ref = doc(fs, 'collections', id);
  await rejectAfter(
    runTransaction(fs, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new CollectionRefusedError(COLLECTION_GONE_MESSAGE);
      const { recipeIds, visibility } = toCollection(id, snap.data());
      if (recipeIds.includes(recipeId)) return;
      checkCollectionRoom(recipeIds);
      // The rules accept lastAddedAt only in a write that grows recipeIds, so it is set here and never on a no-op.
      tx.update(ref, {
        recipeIds: arrayUnion(recipeId),
        updatedAt: serverTimestamp(),
        ...(visibility === 'public' && { lastAddedAt: serverTimestamp() }),
      });
    }),
    'Adding to the collection',
    COLLECTION_WRITE_TIMEOUT_MS
  );
}

export async function removeFromCollection(id: string, recipeId: string): Promise<void> {
  const { fs } = collectionsDb();
  await rejectAfter(
    updateDoc(doc(fs, 'collections', id), { recipeIds: arrayRemove(recipeId), updatedAt: serverTimestamp() }),
    'Removing from the collection',
    COLLECTION_WRITE_TIMEOUT_MS
  );
}

// --- Profiles ---

// --- Terms acceptance (RL-047): owner-only, never on the public profile ---

const CALL_TIMEOUT_MS = 5000;

// Not withTimeout: that swallows the rejection, and a permission-denied is worth reporting as such.
async function rejectAfter<T>(promise: Promise<T>, what: string, ms = CALL_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The Terms version this account accepted, or null when it has no record.
 * Rejects on a failed or slow read; the caller treats that as unknown, not as "not accepted".
 */
export async function getAcceptedTermsVersion(uid: string): Promise<string | null> {
  if (!firestore) throw new Error('Firebase not configured');
  const snap = await rejectAfter(getDoc(doc(firestore, 'termsAcceptance', uid)), 'Reading terms acceptance');
  const version: unknown = snap.exists() ? snap.data().version : null;
  return typeof version === 'string' ? version : null;
}

/**
 * Record acceptance of the current Terms. Rejects on failure or after 5 s, so a dialog never
 * hangs; a timed-out write may still commit later, and repeating it is harmless.
 */
export async function recordTermsAcceptance(uid: string, acceptedAt: number): Promise<void> {
  if (!firestore) throw new Error('Firebase not configured');
  await rejectAfter(
    setDoc(doc(firestore, 'termsAcceptance', uid), {
      version: TERMS_VERSION,
      acceptedAt,
      recordedAt: serverTimestamp(),
    }),
    'Recording terms acceptance'
  );
}

export async function getProfile(uid: string): Promise<UserProfile | null> {
  if (!firestore) return null;
  const snap = await getDoc(doc(firestore, 'profiles', uid));
  if (!snap.exists()) return null;
  return { uid: snap.id, ...snap.data() } as UserProfile;
}

/**
 * `defaultCountry` (RL-282) fills `country` only when the document is new or has no
 * `country` key; an existing code or null ("No flag") is never changed by it.
 */
export async function createOrUpdateProfile(
  uid: string,
  data: Partial<Omit<UserProfile, 'uid'>>,
  options: { defaultCountry?: string | null } = {}
): Promise<void> {
  if (!firestore) return;
  const ref = doc(firestore, 'profiles', uid);
  const snap = await getDoc(ref);
  if (options.defaultCountry !== undefined && !(snap.exists() && 'country' in snap.data())) {
    data = { country: options.defaultCountry, ...data };
  }
  if (snap.exists()) {
    await updateDoc(ref, data);
  } else {
    await setDoc(ref, {
      displayName: null,
      photoType: 'generated',
      photoEmoji: null,
      photoBgColor: null,
      photoURL: null,
      recipeCount: 0,
      followerCount: 0,
      followingCount: 0,
      createdAt: Date.now(),
      ...data,
    });
  }
}

export function subscribeProfile(
  uid: string,
  callback: (profile: UserProfile | null) => void
): () => void {
  if (!firestore) return () => {};
  return onSnapshot(doc(firestore, 'profiles', uid), (snap) => {
    callback(snap.exists() ? { uid: snap.id, ...snap.data() } as UserProfile : null);
  });
}

// --- Cookbooks (RL-258): reading and following a public collection ---

export type PublicCookbookResult =
  | { status: 'ready'; cookbook: RecipeCollection & { followerCount: number } }
  /** Missing and private both answer permission-denied, so the page cannot and must not tell them apart. */
  | { status: 'unavailable' };

/** One read of a public collection. Permission-denied (missing or private) is `unavailable`; anything else rejects. */
export async function getPublicCookbook(id: string): Promise<PublicCookbookResult> {
  if (!firestore) return { status: 'unavailable' };
  try {
    const snap = await getDoc(doc(firestore, 'collections', id));
    if (!snap.exists()) return { status: 'unavailable' };
    const data = snap.data();
    // An owner can read their own private collection; it is still not a cookbook.
    if (data.visibility !== 'public') return { status: 'unavailable' };
    return { status: 'ready', cookbook: { ...toCollection(snap.id, data), followerCount: typeof data.followerCount === 'number' ? data.followerCount : 0 } };
  } catch (err) {
    if ((err as { code?: string }).code === 'permission-denied') return { status: 'unavailable' };
    throw err;
  }
}

/** Whether `uid` follows the cookbook: one get on the follow document, which answers not-found when absent. */
export async function isFollowingCookbook(uid: string, collectionId: string): Promise<boolean> {
  if (!firestore) return false;
  return (await getDoc(doc(firestore, 'cookbookFollows', `${uid}_${collectionId}`))).exists();
}

/**
 * Follows or unfollows in one batch with the follower count, as the rules require. Unfollow
 * skips the -1 when the count shown is already 0 (the rules refuse going below 0).
 * shortcut: the count is the page's copy, so a stale 0 leaves the stored count one high, fine until counts are audited.
 */
export async function setCookbookFollow(uid: string, collectionId: string, follow: boolean, currentCount: number): Promise<void> {
  if (!firestore) throw new Error('Firebase not configured');
  const batch = writeBatch(firestore);
  const followRef = doc(firestore, 'cookbookFollows', `${uid}_${collectionId}`);
  if (follow) batch.set(followRef, { uid, collectionId, createdAt: serverTimestamp(), lastSeenAt: serverTimestamp() });
  else batch.delete(followRef);
  if (follow || currentCount > 0) batch.update(doc(firestore, 'collections', collectionId), { followerCount: increment(follow ? 1 : -1) });
  await rejectAfter(batch.commit(), 'Following the cookbook', COLLECTION_WRITE_TIMEOUT_MS);
}

/** A follow with the collection it points at; `lastSeenAt` is epoch ms (estimated while pending). */
export interface CookbookFollowRead {
  collectionId: string;
  lastSeenAt: number | null;
}

/** The viewer's cookbook follows, one-shot: one read per follow, capped at `max`, in id order so the cap is deterministic without a new index (orderBy lastSeenAt would need one). The rules need the `uid ==` filter. */
export async function listCookbookFollows(uid: string, max: number): Promise<CookbookFollowRead[]> {
  if (!firestore) return [];
  const snap = await getDocs(query(collection(firestore, 'cookbookFollows'), where('uid', '==', uid), orderBy(documentId()), limit(max)));
  return snap.docs.map((d) => {
    const data = d.data({ serverTimestamps: 'estimate' });
    return {
      collectionId: String(data.collectionId ?? ''),
      lastSeenAt: (data.lastSeenAt as Timestamp | null | undefined)?.toMillis?.() ?? null,
    };
  });
}

/** A followed cookbook's name, owner and `lastAddedAt`, or null when it is private or deleted (permission-denied, skipped silently). Other errors reject. */
export async function readFollowedCookbook(id: string): Promise<{ name: string; ownerUid: string; lastAddedAt: number | null } | null> {
  if (!firestore) return null;
  try {
    const snap = await getDoc(doc(firestore, 'collections', id));
    const data = snap.data();
    if (!data || data.visibility !== 'public') return null;
    return {
      name: typeof data.name === 'string' ? data.name : '',
      ownerUid: typeof data.ownerUid === 'string' ? data.ownerUid : '',
      lastAddedAt: (data.lastAddedAt as Timestamp | null | undefined)?.toMillis?.() ?? null,
    };
  } catch (err) {
    if ((err as { code?: string }).code === 'permission-denied') return null;
    throw err;
  }
}

/** Marks a followed cookbook seen: one update of `lastSeenAt` to the server time, the only field the rules allow. */
export async function markCookbookSeen(uid: string, collectionId: string): Promise<void> {
  if (!firestore) return;
  await updateDoc(doc(firestore, 'cookbookFollows', `${uid}_${collectionId}`), { lastSeenAt: serverTimestamp() });
}

// --- Follows ---

export async function followUser(
  followerId: string,
  followingId: string,
  followerDisplayName: string | null
): Promise<void> {
  if (!firestore) return;
  const followId = `${followerId}_${followingId}`;
  const batch = writeBatch(firestore);

  batch.set(doc(firestore, 'follows', followId), {
    followerId,
    followingId,
    followerDisplayName,
    createdAt: Date.now(),
  });

  batch.update(doc(firestore, 'profiles', followingId), {
    followerCount: increment(1),
  });

  batch.update(doc(firestore, 'profiles', followerId), {
    followingCount: increment(1),
  });

  await batch.commit();
  // Gaining a follower was the one social event that produced no notification,
  // which is odd given it is the strongest signal a creator gets. Fire-and-forget
  // like the others, so a failed notification never fails the follow itself.
  notify(firestore, {
    recipientUid: followingId,
    type: 'follow',
    fromUid: followerId,
    fromDisplayName: followerDisplayName,
    message: null,
    read: false,
    createdAt: Date.now(),
  });
}

export async function unfollowUser(
  followerId: string,
  followingId: string
): Promise<void> {
  if (!firestore) return;
  const followId = `${followerId}_${followingId}`;
  const batch = writeBatch(firestore);

  batch.delete(doc(firestore, 'follows', followId));

  batch.update(doc(firestore, 'profiles', followingId), {
    followerCount: increment(-1),
  });

  batch.update(doc(firestore, 'profiles', followerId), {
    followingCount: increment(-1),
  });

  await batch.commit();
}

export async function isFollowing(
  followerId: string,
  followingId: string
): Promise<boolean> {
  if (!firestore) return false;
  // A query, not getDoc, for the same reason as isCloudFavorite.
  const snap = await getDocs(
    query(
      collection(firestore, 'follows'),
      where('followerId', '==', followerId),
      where('followingId', '==', followingId),
      limit(1)
    )
  );
  return !snap.empty;
}

export async function getFollowingIds(uid: string): Promise<string[]> {
  if (!firestore) return [];
  const q = query(
    collection(firestore, 'follows'),
    where('followerId', '==', uid)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => (d.data() as Follow).followingId);
}

/**
 * Profiles for already-fetched ids, fetched in parallel and returned in input order.
 * A missing profile is skipped; any failed read rejects, as before.
 */
export async function getFollowingProfiles(ids: string[]): Promise<UserProfile[]> {
  if (!firestore || ids.length === 0) return [];
  const profiles = await Promise.all(ids.map((id) => getProfile(id)));
  return profiles.filter((p): p is UserProfile => p !== null);
}

/** A follower, as recorded on the follow document itself. */
export interface FollowerSummary {
  uid: string;
  displayName: string | null;
  createdAt: number;
}

/**
 * Who follows `uid`.
 *
 * Only ever called for the signed-in user's own profile: the rules allow reading
 * a follow doc only when the caller is one of its two parties, so another user's
 * follower graph is deliberately private and this query would be denied for it.
 *
 * `followerDisplayName` is stored on the follow doc, so a follower list needs no
 * second read per row — unlike the following list, which has to fetch profiles
 * because the doc carries the follower's name rather than the followed user's.
 *
 * Sorted client-side. Adding `orderBy('createdAt')` would require a composite
 * index, and an index deploy is a worse dependency than sorting a short list here.
 */
export async function getFollowers(uid: string): Promise<FollowerSummary[]> {
  if (!firestore) return [];
  const snap = await getDocs(
    query(collection(firestore, 'follows'), where('followingId', '==', uid))
  );
  return snap.docs
    .map((d) => {
      const data = d.data() as Follow & { followerDisplayName?: string | null };
      return {
        uid: data.followerId,
        displayName: data.followerDisplayName ?? null,
        createdAt: (data as { createdAt?: number }).createdAt ?? 0,
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

// --- Views ---

export async function incrementRecipeViews(recipeId: string): Promise<void> {
  if (!firestore) return;
  await updateDoc(doc(firestore, 'recipes', recipeId), {
    viewCount: increment(1),
  }).catch(() => {});
}

// --- User Recipes ---

export async function getUserRecipes(uid: string, max?: number): Promise<Array<SharedRecipe & { id: string; favoriteCount: number; viewCount: number; createdAt: number }>> {
  if (!firestore) return [];
  const q = query(
    collection(firestore, 'recipes'),
    where('createdBy.uid', '==', uid),
    ...(max ? [limit(max)] : [])
  );
  const snap = await getDocs(q);
  const results = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SharedRecipe & { id: string; favoriteCount: number; viewCount: number; createdAt: number });
  results.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return results;
}

/**
 * Recipes of other cooks that credit `uid` (RL-173), newest first. One single-field
 * array-contains query (automatic index, no orderBy, so no composite index), at most `max + 1`
 * reads; the extra one only tells `truncated`. Recipes the person owns are dropped after the
 * read, so they can use up some of the limit. Legacy documents may lack `collaboratorUids`; they
 * simply never match.
 */
export async function getCollabRecipes(
  uid: string,
  max = 50
): Promise<{ recipes: Array<SharedRecipe & { id: string; createdAt: number }>; truncated: boolean }> {
  if (!firestore) return { recipes: [], truncated: false };
  const snap = await getDocs(query(collection(firestore, 'recipes'), where('collaboratorUids', 'array-contains', uid), limit(max + 1)));
  const recipes = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as SharedRecipe & { id: string; createdAt: number })
    .filter((r) => r.createdBy?.uid !== uid)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return { recipes: recipes.slice(0, max), truncated: snap.size > max };
}

export async function getRecipesByUsers(uids: string[]): Promise<Array<SharedRecipe & { id: string; favoriteCount: number; viewCount: number; createdAt: number }>> {
  if (!firestore || uids.length === 0) return [];
  // Firestore 'in' supports up to 30 values
  const chunks = [];
  for (let i = 0; i < uids.length; i += 30) {
    chunks.push(uids.slice(i, i + 30));
  }
  const results: Array<SharedRecipe & { id: string; favoriteCount: number; viewCount: number; createdAt: number }> = [];
  for (const chunk of chunks) {
    const q = query(
      collection(firestore, 'recipes'),
      where('createdBy.uid', 'in', chunk),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const snap = await getDocs(q);
    results.push(
      ...snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SharedRecipe & { id: string; favoriteCount: number; viewCount: number; createdAt: number })
    );
  }
  results.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return results;
}

// --- Data export (RL-056) ---
//
// Read only. Every query below filters on the field the read rule checks, because a
// list is authorised from its filters and never sees document data (docs/decisions.md):
// favorites uid, notifications recipientUid, follows followerId and followingId (two
// queries), suggestions suggestedBy.uid and recipeOwnerId (two queries), messages by
// parent path, cooks and cookPhotos uid (both public read; RL-207), collections ownerUid, kitchens/{uid} by id (RL-226) and kitchens by memberUids array-contains (RL-238). Recipes and profiles
// are public. No orderBy, so no composite index. A cook photo row carries its data URL
// (up to 200000 characters), so it is never logged: a failed read logs the error only.

const EXPORT_SECTION_TIMEOUT_MS = 30000;
const EXPORT_PAGE_SIZE = 500;
/** Per query. Reaching it is reported in the file's errors, never silent. */
const EXPORT_MAX_ROWS = 10000;
/** Reply threads read at once, so a long suggestion list does not open hundreds of queries together. */
const EXPORT_THREAD_CONCURRENCY = 10;

/** Firestore Timestamps become ISO strings, at any depth in plain objects and arrays; everything else is as stored. */
function exportValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(exportValue);
  if (v && typeof v === 'object') {
    if (typeof (v as Timestamp).toDate === 'function') return (v as Timestamp).toDate().toISOString();
    if (Object.getPrototypeOf(v) === Object.prototype) {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, exportValue(x)]));
    }
  }
  return v;
}
const exportFields = (data: DocumentData): DocumentData => exportValue(data) as DocumentData;

const exportDoc = (d: QueryDocumentSnapshot<DocumentData>): CloudDoc => ({ id: d.id, ...exportFields(d.data()) });

async function readAllDocs(
  col: CollectionReference<DocumentData>,
  constraints: QueryConstraint[] = [],
  /** Filled page by page, so a caller can keep what arrived if the read is cut off. */
  docs: QueryDocumentSnapshot<DocumentData>[] = []
): Promise<{ docs: QueryDocumentSnapshot<DocumentData>[]; truncated: boolean }> {
  for (;;) {
    const last = docs[docs.length - 1];
    const atCap = docs.length >= EXPORT_MAX_ROWS;
    const snap = await getDocs(
      query(col, ...constraints, ...(last ? [startAfter(last)] : []), limit(atCap ? 1 : EXPORT_PAGE_SIZE))
    );
    // At the cap, one more row is a peek: exactly EXPORT_MAX_ROWS rows is complete, not truncated.
    if (atCap) return { docs, truncated: snap.docs.length > 0 };
    docs.push(...snap.docs);
    if (snap.docs.length < EXPORT_PAGE_SIZE) return { docs, truncated: false };
  }
}

const truncationWarning = (what: string) =>
  `Stopped after ${EXPORT_MAX_ROWS} ${what}; the file is incomplete. Ask for an operator export for the rest.`;

function mergeById<T extends { id: string }>(lists: T[][]): T[] {
  return [...new Map(lists.flat().map((r) => [r.id, r])).values()];
}

/** Runs one section's read. A rejection or timeout becomes that section's error, never a throw. */
async function exportSection<T>(
  label: string,
  read: () => Promise<Section<T>>,
  /** What to return if the read is still running at the deadline, instead of discarding what it already has. */
  onTimeout?: () => Section<T> | null
): Promise<Section<T>> {
  const guarded = read().catch((err): Section<T> => {
    console.error(`Data export: reading ${label} failed`, err);
    reportError(err, 'data-export');
    const code = (err as { code?: string } | null)?.code;
    return { error: `${code ?? (err instanceof Error ? err.message : String(err))}` };
  });
  return withTimeout(guarded, EXPORT_SECTION_TIMEOUT_MS, null).then(
    (r) => r ?? onTimeout?.() ?? { error: `Reading ${label} timed out` }
  );
}

/** Runs several queries for one section; keeps the rows of those that worked and says so for those that did not. */
async function readMerged<T extends { id: string }>(
  what: string,
  reads: Array<() => Promise<{ rows: T[]; truncated: boolean }>>
): Promise<Section<T[]>> {
  const results = await Promise.allSettled(reads.map((r) => r()));
  const ok = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  const failed = results.flatMap((r) => (r.status === 'rejected' ? [r.reason] : []));
  if (failed.length && !ok.length) throw failed[0];
  const warnings = [
    ...(failed.length ? [`${failed.length} of ${results.length} reads failed, so the ${what} may be incomplete`] : []),
    ...(ok.some((r) => r.truncated) ? [truncationWarning(what)] : []),
  ];
  return { data: mergeById(ok.map((r) => r.rows)), ...(warnings.length ? { warning: warnings.join('; ') } : {}) };
}

/**
 * Everything the signed-in user can read about themselves, for the "Download my data" file.
 * Each section is read independently and bounded by a timeout; a failure is returned as
 * that section's `error` and the rest still arrive. Read only. Never rejects.
 */
export async function fetchCloudDataForExport(uid: string, emailVerified = true): Promise<CloudInput> {
  const fs = firestore;
  if (!fs) {
    const error: Section<never> = { error: 'Firebase is not configured' };
    return { profile: error, recipes: error, favorites: error, follows: error, suggestions: error, notifications: error, termsAcceptance: error, notificationPrefs: error, tasteProfile: error, writeWindows: error, cooks: error, cookPhotos: error, kitchen: error, kitchenMemberships: error, collections: error, cookbookFollows: error };
  }
  const byField = (col: string, field: string) => async () => {
    const r = await readAllDocs(collection(fs, col), [where(field, '==', uid)]);
    return { rows: r.docs.map(exportDoc), truncated: r.truncated };
  };

  const photoDocs: QueryDocumentSnapshot<DocumentData>[] = [];
  let partialSuggestions: Section<CloudSuggestion[]> | null = null;
  const readSuggestions = async (): Promise<Section<CloudSuggestion[]>> => {
    const base = await readMerged('suggestions', [byField('suggestions', 'suggestedBy.uid'), byField('suggestions', 'recipeOwnerId')]);
    if ('error' in base) return base;
    const rows = base.data as unknown as Omit<CloudSuggestion, 'messages'>[];
    const out = rows.map((r) => ({ ...r, messages: [] as CloudSuggestion['messages'] }));
    const warnings = base.warning ? [base.warning] : [];
    // Kept current, so a timeout returns the rows and threads read so far rather than nothing.
    partialSuggestions = { data: out, warning: [...warnings, 'Reading suggestions timed out; some replies may be missing'].join('; ') };
    let failedThreads = 0;
    let truncatedThread = false;
    for (let i = 0; i < rows.length; i += EXPORT_THREAD_CONCURRENCY) {
      const batch = await Promise.allSettled(
        rows.slice(i, i + EXPORT_THREAD_CONCURRENCY).map((s) => readAllDocs(collection(fs, 'suggestions', s.id, 'messages')))
      );
      batch.forEach((t, j) => {
        if (t.status === 'rejected') failedThreads++;
        else {
          out[i + j] = { ...out[i + j], messages: t.value.docs.map(exportDoc) as unknown as CloudSuggestion['messages'] };
          truncatedThread ||= t.value.truncated;
        }
      });
      partialSuggestions = { data: out.map((x) => ({ ...x })), warning: [...warnings, 'Reading suggestions timed out; some replies may be missing'].join('; ') };
    }
    if (failedThreads) warnings.push(`${failedThreads} reply thread(s) could not be read and are missing their messages`);
    if (truncatedThread) warnings.push(truncationWarning('replies in a thread'));
    return { data: out, ...(warnings.length ? { warning: warnings.join('; ') } : {}) };
  };

  const [profile, recipes, favorites, follows, suggestions, notifications, termsAcceptance, notificationPrefs, tasteProfile, writeWindows, cooks, cookPhotos, kitchen, kitchenMemberships, collections, cookbookFollows] = await Promise.all([

    exportSection('profile', async () => {
      const snap = await getDoc(doc(fs, 'profiles', uid));
      return { data: snap.exists() ? ({ uid: snap.id, ...exportFields(snap.data()) } as unknown as UserProfile) : null };
    }),
    exportSection<CloudDoc[]>('recipes', () => readMerged('recipes', [byField('recipes', 'createdBy.uid')])),
    exportSection<CloudFavorite[]>('favorites', () => readMerged('favorites', [byField('favorites', 'uid')]) as Promise<Section<CloudFavorite[]>>),
    exportSection<CloudFollow[]>('follows', () =>
      readMerged('follows', [byField('follows', 'followerId'), byField('follows', 'followingId')]) as Promise<Section<CloudFollow[]>>
    ),
    // Suggestions need a verified email under the rules; say so plainly instead of surfacing a denial.
    emailVerified ? exportSection<CloudSuggestion[]>('suggestions', readSuggestions, () => partialSuggestions) : Promise.resolve<Section<CloudSuggestion[]>>({ error: VERIFY_NOTE }),
    exportSection('notifications', () =>
      readMerged('notifications', [byField('notifications', 'recipientUid')]) as Promise<Section<AppNotification[]>>
    ),
    exportSection('termsAcceptance', async () => {
      const snap = await getDoc(doc(fs, 'termsAcceptance', uid));
      return { data: snap.exists() ? ({ id: snap.id, ...exportFields(snap.data()) } as CloudDoc) : null };
    }),
    // Owner read needs a verified email under the rules, like suggestions.
    emailVerified
      ? exportSection('notificationPrefs', async () => {
          const snap = await getDoc(doc(fs, 'notificationPrefs', uid));
          return { data: snap.exists() ? ({ id: snap.id, ...exportFields(snap.data()) } as CloudDoc) : null };
        })
      : Promise.resolve<Section<CloudDoc | null>>({ error: VERIFY_NOTE }),
    emailVerified
      ? exportSection('tasteProfile', async () => {
          const snap = await getDoc(doc(fs, 'tasteProfiles', uid));
          return { data: snap.exists() ? ({ id: snap.id, ...exportFields(snap.data()) } as CloudDoc) : null };
        })
      : Promise.resolve<Section<CloudDoc | null>>({ error: VERIFY_NOTE }),
    // Ids are exact and a missing document reads as absent, never denied (RL-026).
    exportSection<CloudDoc[]>('writeWindows', async () => {
      const snaps = await Promise.all(
        (['suggestion', 'reply', 'notification', 'recipe', 'cook', 'cookbook'] as const).map((a) => getDoc(doc(fs, 'writeWindows', `${uid}_${a}`)))
      );
      return { data: snaps.filter((s) => s.exists()).map((s) => ({ id: s.id, ...exportFields(s.data()!) }) as CloudDoc) };
    }),
    exportSection('cooks', () => readMerged('cooks', [byField('cooks', 'uid')]) as Promise<Section<Cook[]>>),
    // Up to 200 KB a row, so a slow phone may hit the deadline: keep the pages that arrived.
    exportSection<CloudCookPhoto[]>(
      'cookPhotos',
      () => readMerged('cook photos', [async () => {
        const r = await readAllDocs(collection(fs, 'cookPhotos'), [where('uid', '==', uid)], photoDocs);
        return { rows: r.docs.map(exportDoc), truncated: r.truncated };
      }]) as Promise<Section<CloudCookPhoto[]>>,
      () => ({ data: photoDocs.map(exportDoc) as CloudCookPhoto[], warning: 'Reading cookPhotos timed out; some photos may be missing' })
    ),
    // Kitchen and collections need a verified email under the rules (RL-226).
    emailVerified
      ? exportSection('kitchen', async () => {
          const snap = await getDoc(doc(fs, 'kitchens', uid));
          return { data: snap.exists() ? ({ id: snap.id, ...exportFields(snap.data()) } as CloudDoc) : null };
        })
      : Promise.resolve<Section<CloudDoc | null>>({ error: VERIFY_NOTE }),
    // The read rule checks memberUids, so the query filters on it (RL-238).
    emailVerified
      ? exportSection<CloudDoc[]>('kitchenMemberships', () =>
          readMerged('kitchen memberships', [async () => {
            const r = await readAllDocs(collection(fs, 'kitchens'), [where('memberUids', 'array-contains', uid)]);
            return { rows: r.docs.map(exportDoc), truncated: r.truncated };
          }])
        )
      : Promise.resolve<Section<CloudDoc[]>>({ error: VERIFY_NOTE }),
    emailVerified
      ? exportSection<CloudDoc[]>('collections', () => readMerged('collections', [byField('collections', 'ownerUid')]))
      : Promise.resolve<Section<CloudDoc[]>>({ error: VERIFY_NOTE }),
    // The list rule asks only for uid == the signed-in user (RL-256), so no verified gate.
    exportSection<CloudDoc[]>('cookbookFollows', () => readMerged('cookbook follows', [byField('cookbookFollows', 'uid')])),
  ]);
  return { profile, recipes, favorites, follows, suggestions, notifications, termsAcceptance, notificationPrefs, tasteProfile, writeWindows, cooks, cookPhotos, kitchen, kitchenMemberships, collections, cookbookFollows };
}
