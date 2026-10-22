import type { Recipe, Favorite } from '../types/recipe';
import type { Suggestion, SuggestionMessage, AppNotification, Cook } from '../types/social';
import type { UserProfile, Follow } from '../types/profile';

/** Bump when the shape of the file changes. */
export const DATA_EXPORT_VERSION = 1;

export const VERIFY_NOTE = 'Verify your email to include all your online data';

export const ANONYMOUS_NOTE = 'Anonymous accounts keep recipes and bookmarks on this device only';

/** A cloud document: its id plus its fields. */
export type CloudDoc = { id: string; [field: string]: unknown };
export type CloudFollow = Follow & { id: string };
export type CloudSuggestion = Suggestion & { messages: SuggestionMessage[] };
export type CloudFavorite = CloudDoc & { uid: string; recipeId: string; recipeOwnerId?: string };
/** A cook photo (RL-205): `url` is a JPEG data URL of up to 200000 characters. */
export type CloudCookPhoto = CloudDoc & { uid: string; recipeId: string; url: string };

/**
 * One section's read result. `warning` means the rows are present but incomplete
 * (a truncated or partly failed read); it lands in `errors` so nothing is silent.
 */
export type Section<T> = { data: T; warning?: string } | { error: string };

export interface CloudInput {
  profile: Section<UserProfile | null>;
  recipes: Section<CloudDoc[]>;
  favorites: Section<CloudFavorite[]>;
  follows: Section<CloudFollow[]>;
  suggestions: Section<CloudSuggestion[]>;
  notifications: Section<AppNotification[]>;
  termsAcceptance: Section<CloudDoc | null>;
  notificationPrefs: Section<CloudDoc | null>;
  /** tasteProfiles/{uid} (RL-231): stated avoids and hidden learned terms. Null when none exists. */
  tasteProfile: Section<CloudDoc | null>;
  writeWindows: Section<CloudDoc[]>;
  cooks: Section<Cook[]>;
  cookPhotos: Section<CloudCookPhoto[]>;
  /** kitchens/{uid} (RL-226): shopping list and pantry. Null when none exists. */
  kitchen: Section<CloudDoc | null>;
  /** Kitchens whose memberUids hold the user (RL-238), own included; summarised, not copied. */
  kitchenMemberships: Section<CloudDoc[]>;
  collections: Section<CloudDoc[]>;
  /** cookbookFollows (RL-260): the user's own follows, readable only by them. */
  cookbookFollows: Section<CloudDoc[]>;
  /** feedback (RL-290): the user's own notes, readable only by them; a screenshot is a JPEG data URL. */
  feedback: Section<CloudDoc[]>;
}

/** One kitchen the user belongs to (RL-238). `kitchenId` and `memberUids` are aliased when another person's. */
export interface KitchenMembership {
  kitchenId: string;
  role: 'owner' | 'member';
  memberCount: number;
  memberUids: string[];
}

export interface DataExportInput {
  uid: string;
  exportedAt: string;
  local: { recipes: Recipe[]; bookmarks: Favorite[] };
  /** Absent for an anonymous or signed-out user. */
  cloud?: CloudInput;
}

export interface DataExportError {
  section: string;
  message: string;
}

export interface DataExport {
  version: number;
  exportedAt: string;
  uid: string;
  local: { recipes: Recipe[]; bookmarks: Favorite[]; bookmarksOfOtherAccountsOmitted: number };
  cloud: {
    profile: UserProfile | null;
    recipes: CloudDoc[];
    favorites: CloudFavorite[];
    follows: CloudFollow[];
    suggestions: CloudSuggestion[];
    notifications: AppNotification[];
    termsAcceptance: CloudDoc | null;
    notificationPrefs: CloudDoc | null;
    tasteProfile: CloudDoc | null;
    writeWindows: CloudDoc[];
    cooks: Cook[];
    cookPhotos: CloudCookPhoto[];
    kitchen: CloudDoc | null;
    kitchenMemberships: KitchenMembership[];
    collections: CloudDoc[];
    cookbookFollows: CloudDoc[];
    feedback: CloudDoc[];
  } | null;
  note?: string;
  redaction: string;
  errors: DataExportError[];
}

type Person = { uid: string; displayName: string | null };

const byCreatedAt = <T extends { createdAt?: unknown; id?: string }>(a: T, b: T) =>
  (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0) || (a.id ?? '').localeCompare(b.id ?? '');

/** Keeps only the listed keys, so a field the app does not know about cannot carry another user's identity into the file. */
const pick = <T extends object>(o: T, keys: readonly string[]): T =>
  Object.fromEntries(Object.entries(o).filter(([k, v]) => keys.includes(k) && v !== undefined)) as T;

const FAVORITE_KEYS = ['id', 'uid', 'recipeId', 'recipeOwnerId', 'createdAt'];
const FOLLOW_KEYS = ['id', 'followerId', 'followingId', 'followerDisplayName', 'createdAt'];
const SUGGESTION_KEYS = ['id', 'recipeId', 'recipeOwnerId', 'recipeTitle', 'recipeEmoji', 'suggestedBy', 'message', 'status', 'createdAt', 'messages'];
const MESSAGE_KEYS = ['id', 'fromUid', 'fromDisplayName', 'text', 'createdAt'];
const COOK_KEYS = ['id', 'uid', 'displayName', 'recipeId', 'rootId', 'recipeOwnerId', 'vote', 'note', 'branchId', 'createdAt'];
const COOK_PHOTO_KEYS = ['id', 'uid', 'recipeId', 'url', 'createdAt'];
const KITCHEN_KEYS = ['id', 'memberUids', 'ownerUid', 'shopping', 'pantry', 'updatedAt'];
const COLLECTION_KEYS = ['id', 'ownerUid', 'name', 'visibility', 'recipeIds', 'description', 'lastAddedAt', 'followerCount', 'createdAt', 'updatedAt'];
const COOKBOOK_FOLLOW_KEYS = ['id', 'uid', 'collectionId', 'createdAt', 'lastSeenAt'];
const FEEDBACK_KEYS = ['id', 'uid', 'displayName', 'note', 'path', 'appVersion', 'viewport', 'theme', 'userAgent', 'screenshot', 'createdAt'];
const NOTIFICATION_KEYS = ['id', 'recipientUid', 'type', 'recipeId', 'recipeTitle', 'recipeEmoji', 'fromUid', 'fromDisplayName', 'message', 'read', 'createdAt'];

const sorted = <T extends { createdAt?: unknown; id?: string }>(rows: T[]): T[] => [...rows].sort(byCreatedAt);

/**
 * Builds the export file. Pure: never throws on a failed section, never mutates
 * its input. Other people's uids become `other-user-N` (numbered in the order they
 * are met, over rows sorted by createdAt then id, so the same data always gives the
 * same file) and their display names are dropped; text content is kept.
 */
export function assembleDataExport(input: DataExportInput): DataExport {
  const { uid } = input;
  const errors: DataExportError[] = [];
  const ids = new Map<string, string>();
  // 'local' is the placeholder for "no account", not a person.
  const alias = (u: string): string => {
    if (u === uid || u === 'local') return u;
    if (!ids.has(u)) ids.set(u, `other-user-${ids.size + 1}`);
    return ids.get(u)!;
  };
  const person = <P extends Person | null | undefined>(p: P): P =>
    p && p.uid !== uid && p.uid !== 'local' ? ({ ...p, uid: alias(p.uid), displayName: null } as P) : p;
  const name = (n: string | null, from: string) => (from === uid ? n : null);

  const take = <T>(section: string, s: Section<T>, empty: T): T => {
    if ('error' in s) {
      errors.push({ section, message: s.error });
      return empty;
    }
    if (s.warning) errors.push({ section, message: s.warning });
    return s.data;
  };

  // A recipe nests whole recipes in chatHistory[].recipe, each with its own credit, so recurse.
  type Nested = {
    createdBy?: Person;
    collaborators?: Person[];
    collaboratorUids?: string[];
    chatHistory?: Array<{ recipe?: Nested }>;
  };
  const recipeRedact = <T extends Nested>(r: T): T => ({
    ...r,
    ...(r.createdBy ? { createdBy: person(r.createdBy) } : {}),
    ...(r.collaborators ? { collaborators: r.collaborators.map(person) } : {}),
    ...(Array.isArray(r.collaboratorUids) ? { collaboratorUids: r.collaboratorUids.map(alias) } : {}),
    ...(Array.isArray(r.chatHistory)
      ? { chatHistory: r.chatHistory.map((m) => (m && m.recipe ? { ...m, recipe: recipeRedact(m.recipe) } : m)) }
      : {}),
  });

  // Dexie is not partitioned per account: rows of an earlier account on this browser are not this user's bookmarks.
  const ownBookmarks = input.local.bookmarks.filter((b) => b.uid === uid || b.uid === 'local');
  const localRecipes = sorted(input.local.recipes as (Recipe & { id: string })[]).map(recipeRedact);
  const local = {
    recipes: localRecipes,
    bookmarks: [...ownBookmarks].sort(byCreatedAt),
    bookmarksOfOtherAccountsOmitted: input.local.bookmarks.length - ownBookmarks.length,
  };

  // Another member's uid (RL-238) becomes an alias, in the member list, the owner and who added a pantry item.
  const kitchenRedact = (k: CloudDoc | null): CloudDoc | null => {
    if (!k) return k;
    const a = (x: unknown) => (typeof x === 'string' ? alias(x) : x);
    return pick(
      {
        ...k,
        ownerUid: a(k.ownerUid),
        ...(Array.isArray(k.memberUids) ? { memberUids: k.memberUids.map(a) } : {}),
        ...(Array.isArray(k.pantry)
          ? { pantry: k.pantry.map((p) => (p && typeof p === 'object' ? { ...p, addedBy: a((p as { addedBy?: unknown }).addedBy) } : p)) }
          : {}),
      },
      KITCHEN_KEYS
    );
  };

  let cloud: DataExport['cloud'] = null;
  if (input.cloud) {
    const c = input.cloud;
    const profile = take('profile', c.profile, null);
    const recipes = sorted(take('recipes', c.recipes, [])).map((r) => recipeRedact(r as CloudDoc & Nested));
    const favorites = sorted(take('favorites', c.favorites, [])).map((f) =>
      pick(f.recipeOwnerId === undefined ? f : { ...f, recipeOwnerId: alias(f.recipeOwnerId) }, FAVORITE_KEYS)
    );
    const follows = sorted(take('follows', c.follows, [])).map((f) =>
      pick({ ...f, followerDisplayName: name(f.followerDisplayName, f.followerId), followerId: alias(f.followerId), followingId: alias(f.followingId) }, FOLLOW_KEYS)
    );
    const suggestions = sorted(take('suggestions', c.suggestions, [])).map((s) =>
      pick(
        {
          ...s,
          recipeOwnerId: alias(s.recipeOwnerId),
          suggestedBy: person(s.suggestedBy ? pick(s.suggestedBy, ['uid', 'displayName']) : s.suggestedBy),
          messages: sorted(s.messages).map((m) =>
            pick({ ...m, fromDisplayName: name(m.fromDisplayName, m.fromUid), fromUid: alias(m.fromUid) }, MESSAGE_KEYS)
          ),
        },
        SUGGESTION_KEYS
      )
    );
    const notifications = sorted(take('notifications', c.notifications, [])).map((n) =>
      pick({ ...n, fromDisplayName: name(n.fromDisplayName, n.fromUid), fromUid: alias(n.fromUid), recipientUid: alias(n.recipientUid) }, NOTIFICATION_KEYS)
    );
    cloud = {
      profile,
      recipes,
      favorites,
      follows,
      suggestions,
      notifications,
      termsAcceptance: take('termsAcceptance', c.termsAcceptance, null),
      notificationPrefs: take('notificationPrefs', c.notificationPrefs, null),
      tasteProfile: take('tasteProfile', c.tasteProfile, null),
      writeWindows: sorted(take('writeWindows', c.writeWindows, [])),
      // Both are read where uid == the user, so the only other person is the recipe's owner.
      cooks: sorted(take('cooks', c.cooks, [])).map((k) =>
        pick(typeof k.recipeOwnerId === 'string' ? { ...k, recipeOwnerId: alias(k.recipeOwnerId) } : k, COOK_KEYS)
      ),
      cookPhotos: sorted(take('cookPhotos', c.cookPhotos, [])).map((p) => pick(p, COOK_PHOTO_KEYS)),
      kitchen: kitchenRedact(take('kitchen', c.kitchen, null)),
      kitchenMemberships: [...take('kitchenMemberships', c.kitchenMemberships, [])]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((k) => {
          const members = Array.isArray(k.memberUids) ? k.memberUids.filter((m): m is string => typeof m === 'string') : [];
          return { kitchenId: alias(k.id), role: k.ownerUid === uid ? 'owner' : 'member', memberCount: members.length, memberUids: members.map(alias) };
        }),
      collections: sorted(take('collections', c.collections, [])).map((k) => pick(k, COLLECTION_KEYS)),
      // Own rows only (read where uid == the user), so no other person's id appears.
      cookbookFollows: sorted(take('cookbookFollows', c.cookbookFollows, [])).map((k) => pick(k, COOKBOOK_FOLLOW_KEYS)),
      feedback: sorted(take('feedback', c.feedback, [])).map((k) => pick(k, FEEDBACK_KEYS)),
    };
    // Document ids that embed a uid (follows, favourites) are rewritten last,
    // once every other uid has an alias.
    const fixId = (id: string) => id.split('_').map((x) => ids.get(x) ?? x).join('_');
    cloud.favorites = cloud.favorites.map((f) => ({ ...f, id: fixId(f.id) }));
    cloud.follows = cloud.follows.map((f) => ({ ...f, id: fixId(f.id) }));
  }

  return {
    version: DATA_EXPORT_VERSION,
    exportedAt: input.exportedAt,
    uid,
    local,
    cloud,
    ...(cloud ? {} : { note: ANONYMOUS_NOTE }),
    redaction:
      "Other people's account ids are replaced with other-user-N and their display names removed. Content is kept.",
    errors,
  };
}
