# Data model

What is stored, where, in what shape, and who may touch it. Verified against
`src/db/database.ts`, `src/types/`, `firestore.rules`, and `firestore.indexes.json` on
2026-07-31.

## IndexedDB (Dexie)

Database name `RecipeAppDB`, defined in `src/db/database.ts`. Two tables.

| Table | Primary key | Indexes |
|---|---|---|
| `recipes` | `id` (UUID) | `parentId`, `rootId`, `createdAt`, `*tags` (multi-entry) |
| `favorites` | `[uid+recipeId]` (compound) | `uid` |

### Migrations

| Version | Schema change | Upgrade function |
|---|---|---|
| v1 | `recipes` table | — |
| v2 | adds `favorites` table | backfills `createdBy = { uid: 'local', displayName: null }` on recipes that lack it. This is why `'local'` is a real uid value the ownership check must handle. |
| v3 | no schema change | backfills `collaborators = []` on recipes that lack it. |

Unindexed fields need no version. `relatedFamilyId` (RL-162) is one: optional on `Recipe`, set
only on an original saved after "Create New Recipe Anyway", carrying the `rootId` of the first
match the panel showed. Rows and documents without it are normal. `importedFrom` (the source URL) and `importedVia`
(the importer, a `CreatedBy`) are two more (RL-185, written by `/import` since RL-186): the own-recipe
sync and an export-file restore keep them, and the restore drops an `importedFrom` that is not an
http(s) URL of at most 2048 characters, as do published reads. The recipe create rule has no key
whitelist; `hasBoundedContent` bounds `importedFrom` (below).

Adding a version means adding a `this.version(n).stores({...})` block and, if existing rows
need new fields, an `.upgrade()`. Never edit a released version's block: users have that
version on disk.

### Gotcha: no `update()`

Dexie's `update()` is not used anywhere in this codebase. `ChatMessage.recipe` makes
`Recipe` circular through `chatHistory`, which breaks Dexie's update typing. The pattern is
`get()` then `put()` instead. Keep it.

## Firestore

Project `recipe-lab-3832b` (`.firebaserc`). Sixteen top-level collections (`recipes`, `favorites`,
`suggestions`, `notifications`, `notificationPrefs`, `profiles`, `termsAcceptance`, `writeWindows`, `clientErrors`,
`rateLimits`, `follows`, `cooks`, in the repo since RL-194, and `cookPhotos`, in the repo since RL-204, both deployed by RL-209,
and `kitchens` and `collections`, in the repo since RL-211, deployed by RL-227, and `tasteProfiles`, in the repo since RL-230, deployed by RL-249) plus one subcollection (`suggestions/{id}/messages`). Recipe documents use the same UUID as the IndexedDB row, which is what makes
the dual store addressable by one id.

**Write order of a new recipe** (RL-082, decision 1b): for a configured app the chat save
publishes to Firestore first and only then `put`s the same record in Dexie. Nothing is written
locally when the publish fails or times out, so a verified user never has a local-only own
recipe; the retry reuses the record's id, which `publishRecipe`'s in-transaction re-read turns
into a merge if the earlier attempt landed. Local-only mode still adds to Dexie alone.

**`recipes.relatedFamilyId`** (RL-162, decision "Related families and moving into one"): an
optional string on a new original only, the `rootId` of the first match shown when the user
tapped "Create New Recipe Anyway". Written with the recipe by `publishRecipe` and cached with it;
the cloud-to-local mappings (`toLocalRecipe`, and the `useRecipe` and `useRecipeTree` spreads)
carry it, and a restore from an export keeps it (`ImportedRecipeSchema`). Nobody else's recipe
is written. The recipe rules have no key allowlist; since RL-162 `hasBoundedContent` bounds this
field (absent, null, or a string of at most 128 characters), in the repo until RL-160 deploys. Moving the original into that family (RL-164) sets it to `null` on every moved version, in the same owner-update batch that rewrites their `parentId`, `rootId` and `depth`.

**Write order of an edit** (RL-083): a verified owner's edit checks that the cloud copy exists,
re-publishes the edited record with a fresh `updatedAt` within 5 seconds, and only then
`cacheRecipe`s the same record. On a failure, a timeout or a missing cloud copy nothing is
written to Dexie. Anonymous, signed-out and local-only edits still write Dexie alone.

**Own recipes listener** (RL-078, decision 1b): for a verified user, one `onSnapshot` per
session on `recipes where createdBy.uid == uid`, with no `orderBy` and no limit. An
equality-only query needs no composite index, and `recipes` reads are public, so no rules
change. Cost: every own recipe is read once when the listener attaches, then one read per
changed document; metadata-only events are free. Only server snapshots with no pending writes
are applied. Each one makes Dexie mirror it: own rows are overwritten (the cloud wins every
field but `chatHistory`) and own rows the snapshot lacks are removed. The tidy rule: rows
whose `createdBy.uid` is another uid that signed in on this device (`getPreviousUids`) are
removed. Saved copies of other users' recipes, `'local'` rows and rows with no `createdBy`
are never touched. The listener never writes to Firestore. An import stamps rows owned by the
importer or a `getPreviousUids` entry as `'local'` (display name kept), so neither rule removes
them (RL-086). A verified sign-out deletes the
account's own rows with `clearOwnRecipes(uid)` (RL-085, a `filter` plus delete in one `rw`
transaction); everything else, `favorites` included, stays.

| Collection | Document id | Shape | Notes |
|---|---|---|---|
| `recipes/{recipeId}` | recipe UUID | `SharedRecipe` (`lib/share.ts`) plus `favoriteCount`, `viewCount`, `collaborators`, `collaboratorUids`, `createdAt` | The published feed. Read by anyone, signed in or not. `collaboratorUids` (RL-172) is the plain uid list of `collaborators`, so a profile can find recipes a cook contributed to with `array-contains` (an object match on `collaborators` breaks when a display name changes). Cloud only: the Dexie `Recipe` does not carry it. Not backfilled: recipes credited before RL-172 lack it until a later Apply on them adds the suggester's uid. |
| `favorites/{uid}_{recipeId}` | composite | `{ uid, recipeId, recipeOwnerId, createdAt }` | Global favourite records. Existence drives the owner's notification. |
| `suggestions/{autoId}` | auto | `Suggestion` (`types/social.ts`) | `status: pending \| approved \| rejected \| applied \| branched` (shown Open, Approved on old documents, Declined, Applied, Branched), optional `edits[]` (`SuggestionEdit`: kind, index, name, from, to, why) and `branchId` (RL-145), `recipeOwnerId` denormalised so the update rule can check ownership without a lookup; create verifies it against the recipe once. |
| `suggestions/{id}/messages/{autoId}` | auto | `SuggestionMessage` | The reply thread. A subcollection rather than an array on the parent, so the parent's owner-only, status-only update rule stays intact. |
| `notifications/{autoId}` | auto | `AppNotification` | Nine types, listed below and in [capabilities.md](capabilities.md). `recipeId`/`recipeTitle`/`recipeEmoji` are optional because `follow` is about a person, not a recipe. |
| `profiles/{uid}` | user uid | `UserProfile` (`types/profile.ts`) | Public read. Holds avatar settings (`photoBgColor` is a `var(--color-...)` token reference since RL-140, a legacy raw hex on older profiles, or null for generated and uploaded avatars; the rules do not constrain it) and the maintained counters `followerCount` and `followingCount` (`recipeCount` is stored but no longer bumped, RL-032). Uploaded avatars live here as base64 JPEG. `photoURL` must be absent, null, or a `data:image/` string of at most 100000 characters (checked on create and on updates that touch it, RL-019): a third-party-hosted URL would leak the IP and user agent of every viewer, and `Avatar` renders only `data:image/` values. |
| `notificationPrefs/{uid}` | user uid | `{ branch, suggestion, follow, updatedAt }` (three bools and a server timestamp) | The account's "Notify me when" choices (RL-152 rules, in the repo, deployed by RL-156; RL-155 writes them). **Private**: owner-only read. Applied when the recipient reads Activity, so a writer never reads someone else's preferences. |
| `tasteProfiles/{uid}` | user uid | `{ avoids, hidden, askedAt, updatedAt }` (two string lists, an int ms or null, a server timestamp) | The account's stated avoids (at most 12) and the learned terms they hid (at most 50) (RL-230 rules, in the repo, deployed by RL-249; RL-231 writes them with `getTasteProfile` and `saveTasteProfile`, which read and write the whole document in one transaction because the rules need all four keys on every write; avoids are normalised to one line, sentence case, deduped, 40 characters, 12 at most, and `hidden` is kept to strings of 40 characters or fewer and 50 at most because the rules do not check each element, so a read drops anything else). **Private**: owner-only read. The learned profile itself (`learnTaste`, `lib/taste.ts`) is computed on the device and never stored. |
| `termsAcceptance/{uid}` | user uid | `{ version, acceptedAt, recordedAt }` | The account's latest acceptance of the Terms of Service (RL-047). **Private**: owner-only read, never on the public profile and never in analytics. `version` is `TERMS_VERSION` (`lib/legal.ts`), `acceptedAt` the client's ms when the link was sent with the box ticked (or Accept was pressed in `TermsUpdateDialog`), `recordedAt` a server timestamp. Only the latest acceptance is kept; there is no history. |
| `writeWindows/{uid}_{action}` | composite, `action` is `suggestion`, `reply`, `notification`, `recipe` or `cook` | `{ windowStart, count, at, last }` (two timestamps, an int, and the path of the last document counted) | Per-user fixed-window counter for the rules-only write limits (RL-048 and RL-049, in the repo 2026-10-15, deployed by RL-051). Moved in the same transaction as the suggestion, message, notification or recipe create it counts, and `last` names that document. Owner read only, derived from the id. Clients can never delete one; the operator's erase script (RL-055, Admin SDK) does. |
| `follows/{followerId}_{followingId}` | composite | `Follow` | Readable only by the two parties. |
| `cooks/{autoId}` | auto | `{ uid, displayName, recipeId, rootId, recipeOwnerId, vote, note, branchId, createdAt }` (`vote` is `again` or `tweak`, `note` and `branchId` null or a string, `createdAt` a server timestamp) | "I made this" records (decision "Cooks are public cloud records", RL-192; rules in the repo since RL-194, deployed by RL-209; the client is RL-196). **Public read**, signed out included, so "Made N times" is a `getCountFromServer` on `recipeId ==` (and `vote == 'again'`), equality filters only, no composite index; the newest-20 list and the own log each need one (Composite indexes below). Cloud only: no Dexie table. Each cook is its own document, so cooking twice counts twice. |
| `cookPhotos/{cookId}` | the cook's id | `{ uid, recipeId, url, createdAt }` (`url` a `data:image/jpeg;base64,` string of at most 200000 characters, `createdAt` a server timestamp) | One photo per cook (RL-193's answers; rules in the repo since RL-204, deployed by RL-209; the client is RL-205 and RL-206). **Public read**, signed out included. Keyed by the cook's id, so there is at most one, and a second write is an update, which the rules refuse. Cloud only: no Dexie table. Decision 3's size reasoning (1 MiB document limit, read bandwidth) is met by the 200000 cap, about 150 KB of JPEG, and by the separate collection, so cook reads and counts never carry the photo. |
| `kitchens/{uid}` | the owner's uid (Phase 2) | `{ memberUids, ownerUid, shopping, pantry, updatedAt }` (`memberUids` `[ownerUid]` in Phase 2, `shopping` and `pantry` lists of at most 300 (`KITCHEN_ITEM_CAP`, `lib/kitchen.ts`), `updatedAt` a server timestamp) | One kitchen per user (decision "Kitchen and collections storage", RL-210; rules in the repo since RL-211, deployed by RL-227; client `useKitchen` since RL-213). **Private**: members only, verified. `memberUids` is a list already so RL-237 only adds the invite path. Element shapes are the client's job. |
| `collections/{autoId}` | auto | `{ ownerUid, name, visibility, recipeIds, createdAt, updatedAt }` (`name` 1 to 60 characters, `visibility` always `'private'`, `recipeIds` a list of at most 200 (`COLLECTION_RECIPE_CAP`), two server timestamps) | Private recipe collections (RL-210; rules in the repo since RL-211, deployed by RL-227; client `useCollections` since RL-222). **Private**: owner only, verified. Public cookbooks are RL-256. |
| `clientErrors/{autoId}` | auto | `ErrorReport` plus `uid`, `receivedAt`, `userAgent` | Write-only drop box for the error beacon. Creatable by **anyone, including signed-out visitors**, because a failure during sign-in is exactly the kind that was invisible. No client read, update or delete. Shape is constrained in rules (known keys only, typed, length-capped) because it is an unauthenticated write path. If `receivedAt` is present it must equal the server request time (RL-020). |
| `rateLimits/{uid}` | user uid | fixed-window counter | Written **only** by the undeployed `generateRecipe` Cloud Function via the Admin SDK, which bypasses rules. Closed to clients entirely, which is what stops a user resetting their own quota. |

### Composite indexes

All live in `firestore.indexes.json`; each exists for exactly one query.

| Index | Needed by |
|---|---|
| `recipes`: `createdBy.uid` ASC, `createdAt` DESC | `getRecipesByUsers`, the Following filter (RL-021): `createdBy.uid in` a 30-uid chunk, `orderBy createdAt desc`, `limit 50` |
| `recipes`: `tags` arrayConfig CONTAINS, `createdAt` DESC | `getPublishedRecipesPage` with a tag, the Explore tag chips (RL-009): `where tags array-contains`, `orderBy createdAt desc`, `limit 31`. The rule is `allow read: if true`, so the added where clause changes nothing there. Guarded by `src/lib/indexes.test.ts`. `tags` are stored trimmed, lower case and de-duplicated by `publishRecipe` (`normalizeTags`, RL-059); the Dexie copy keeps the case as generated |
| `notifications`: `recipientUid` ASC, `createdAt` DESC | the `onSnapshot` subscription in `useNotifications` (the nav's Activity badge and `ActivityPage`) |
| `suggestions`: `recipeId` ASC, `recipeOwnerId` ASC, `createdAt` DESC | `subscribeRecipeSuggestions`, owner query (RL-018) |
| `suggestions`: `recipeId` ASC, `suggestedBy.uid` ASC, `createdAt` DESC | `subscribeRecipeSuggestions`, everyone else's query (RL-018) |
| `suggestions`: `recipeId` ASC, `createdAt` DESC | the pre-RL-018 client's unfiltered query; kept until that client is gone, then removable |
| `cooks`: `recipeId` ASC, `createdAt` DESC | `getRecipeCookSummary` (RL-196): a recipe's newest 20 cooks, `limit 20`. In the repo, deployed by RL-209. Guarded by `src/lib/indexes.test.ts` |
| `cookPhotos`: `recipeId` ASC, `createdAt` DESC | `getRecipePhoto` (RL-206): a recipe's newest cook photo, `limit 1` (then `startAfter`, at most 3 reads). In the repo, deployed by RL-209. Guarded by `src/lib/indexes.test.ts` |
| `cooks`: `uid` ASC, `createdAt` DESC | `subscribeOwnCooks` (RL-196): the user's own newest 200 cooks. In the repo, deployed by RL-209. Guarded by `src/lib/indexes.test.ts` |

The Following filter queries newest-first: each 30-uid chunk returns its own newest 50 and the
client merges the chunks and re-sorts by `createdAt` descending. The merged list is not capped
overall, so it can reach 50 per chunk.

`getRecentPublishedRecipes` (RL-126, Explore's Branching fast this week) needs no entry above:
`where createdAt >= since`, `orderBy createdAt desc`, `limit 100` is a range and sort on one
field, served by the automatic single-field `createdAt` index that `getAllPublishedRecipes`
already uses. Branches are told from originals on the device (`parentId`), because filtering on
it in the query would need a composite index. Cost: one read per document returned (at most 100)
per session, plus at most 8 `getDoc` reads for family roots not already loaded. A week with more
than 100 new recipes counts only the newest 100.

New-recipe dedup (RL-178) reads `getAllPublishedRecipes` (`orderBy createdAt desc`, `limit
200`, the same automatic index) through `services/publishedWindow.ts`, a module cache shared by
every chat in the page session for 5 minutes and dropped on sign-out. A chat asks for it on its
first typing pause or first send, whichever comes first, and `useRecipeChat` scores it in memory
for every later pause and for the send check. Cost: at most 200 reads per 5 minutes of
new-recipe chats, however many chats or abandoned drafts, and none per keystroke; a chat that
never pauses on 3 or more characters and never sends reads nothing. Only successes are kept: a
failed read is retried by the chat's next pause or send, once, after which that chat is
local-only. Variation dedup is unchanged (`searchPublishedVariations`, one tree query per send
check).

`useMostBranched` (RL-166, Explore's Most branched) shares one `getRecentPublishedRecipes` read
with Branching fast this week (`hooks/recentPublished.ts`): `createdAt >= 90 days ago`, `limit
100`, the same automatic single-field index, so no new index. The 30 and 90 day windows are ranked
in memory from that result. Cost: at most 100 documents per page load, shared by both sections,
plus one `getDoc` per ranked family root outside the result (at most 6 for Most branched, 8 for
Branching fast, overlapping roots read once), so at most about 114 reads per page load for both,
read only. Only successes are cached; a timeout (10 s) or failure is retried on the next mount.
When the read returns the full 100 the hook reports `coverageStartMs` (the oldest row) and
`capped` for a range that starts before it, because that range is undercounted. There is no all
time read (`allTimeAvailable` is always false). Upgrade path: a server-side branch counter.

Missing an index shows up as a Firestore error containing a console link that creates it —
but create it *here* and deploy, not in the console, or it exists in production and not in
the repo.

### What the rules permit, in plain language

`firestore.rules` is the security boundary; the client-side ownership check is UI polish.
The full ruleset is commented — this is the summary.

**Every client write needs a verified email (RL-040, in the repo 2026-10-14, deployed by
RL-022).** `signedIn()` is any account, including a one-tap anonymous one. `verified()`
additionally requires `request.auth.token.email_verified == true`. Per the 2026-10-14 product
decision ([decisions.md](decisions.md), 1a), anonymous accounts hold local bookmarks only, so
every client write takes `verified()`: publishing, editing and deleting a recipe, favouriting,
following, suggesting and reviewing, replying, notifications (create, mark read, delete), and
the user's own profile. Two writes are exempt because they are not user actions: the recipe
`viewCount` +1 (an implicit page-view metric, open to signed-out visitors) and `clientErrors`
reports (crash telemetry). Reads still use `signedIn()` or are public, unchanged. Both of the
app's routes to a verified email (`linkWithCredential` on an anonymous account, and
`signInWithEmailLink`) mint a fresh ID token carrying the claim, so there is no lag between
verifying and being able to write; confirmed against the Auth emulator on 2026-08-10.

**Contributing also needs the current Terms (RL-047, in the repo 2026-10-15, deployed by
RL-051).** `acceptedTerms()` is `verified()` plus a document read of
`termsAcceptance/{your uid}` whose `version` equals the rules' `termsVersion()` literal. It
checks `exists()` first, so a missing document denies as a plain false rather than an
evaluation error. It guards exactly three writes, on top of their existing checks: recipe
create, suggestion create and message create. It does not guard edits, deletes, favourites,
follows, notifications, profiles or counters. The `exists()` and `get()` of one path bill one
document read per guarded write and count toward the per-request document-access limit (10
for a single write, 20 for a batch). The literal must equal `TERMS_VERSION` in
`src/lib/legal.ts`; `src/lib/legal.test.ts` fails when they differ. Bumping both makes every
contributing write fail for anyone on the old version until they accept again, which is why
the client blocks with `TermsUpdateDialog` (see [decisions.md](decisions.md)).

This replaces the consume/contribute line deployed 2026-08-10, under which favouriting,
following, notifications and profiles stayed open to anonymous accounts.

**recipes** — anyone may read, including signed-out visitors, deliberately: the library feed
and shared links work without an account. Publishing requires a **verified email**, a
**current Terms acceptance** (`acceptedTerms()`, RL-047, one extra document read), a
**recipe-window move** (RL-049, at most 30 creates per day, see writeWindows below), and
stamping your own uid as `createdBy.uid`, with both counters starting at zero. The parent of a
branch need not exist in the cloud: a branch of a locally saved copy of a shared recipe has no
cloud parent (RL-159 tried requiring one and reverted it; see decisions.md). A re-publish
is an update and needs no window. Updates are
allowed only in three exact shapes: a `viewCount` +1 by anyone, a `favoriteCount` ±1 by a
verified user, or a verified owner update that changes anything *except* `createdBy.uid` and `createdAt`
(RL-158 adds a fourth in the repo, the reparent below).
Delete needs a verified owner. Recipes published anonymously before the 2026-08-10 gate can
no longer be edited or deleted by their anonymous owner; RL-042 wipes them. Since RL-023 the
client attempts the cloud delete only for users with `emailVerified`, which matches the rule.
Since RL-080 that delete runs before the local one, and the local subtree is kept when it fails.
Since RL-016 a create also needs `createdAt` to be an integer (milliseconds) no more than 60
seconds ahead of server time, an owner update may not change `createdAt`, and both require
`title` to be a string of at most 200 characters and `ingredients` and `instructions` to be
lists of at most 100 entries each, checked on the document as it would be after the write.
Since RL-172 (in the repo, not deployed; it ships with the rules file through RL-156 or RL-160)
`collaboratorUids` must be absent or a list of at most 50 entries, so null or a string is
denied (emulator-checked 2026-10-21, RL-172 Notes). The
reason: the feed is ordered by `createdAt` descending, so a far-future value would pin a
recipe to the top of everyone's feed, and an oversized document is read on every first paint.
Past `createdAt` values stay allowed because imports keep their original date. The caps are
named in a comment above the recipe rules. Array elements are not checked; rules cannot
iterate a list. A client clock more than a minute fast cannot publish.
Since RL-162 (in the repo, deployed with RL-160) the same check also requires `relatedFamilyId`
to be absent, null, or a string of at most 128 characters. Emulator-probed 2026-10-21: 128
characters 200, 129 characters, a number or a map 403, a normal publish 200.
Since RL-186 (in the repo, not deployed; it rides with the next rules deploy) the check also
requires `importedFrom` to be absent, null, or a string of at most 2048 characters matching
`https?://.*`. Not emulator-checked. The client applies the same bound on every read
(`withBoundedImportedFrom` in `lib/linkImport.ts` for published reads, `toLocalRecipe` for the
own-recipe sync), so a bad value is dropped before anything can render it.
**Moving children up when a version is deleted (RL-158, in the repo, deployed by RL-160).** A
fourth update shape, `isReparentAfterParentDelete()`: a verified user may change only
`parentId` and `depth` of a recipe whose stored `parentId` names a version P, when P's
`createdBy.uid` is theirs, P is deleted in the same batch (`!existsAfter(P)`), P is not an
original (its `parentId` is a string), the new `parentId` equals P's and that recipe exists
(`exists()`, because P's owner controls P's `parentId`), and the new `depth` is one less. So
deleting a version can move its direct children, including other cooks', up one level, and
only in that batch. Only direct children are rewritten: deeper descendants keep their stored
`depth`, which is then stale, so display must not rely on it. Since RL-159 a child whose stored
`depth` is missing or not an integer may be set to `depth` 0 instead, so one malformed child
cannot make its parent undeletable (emulator 2026-10-21: committed). A batch reads P and the new
parent once plus each other cook's child; the emulator passed one batch with 18 other-cook
children (each with its `moved` notice) and one own child, and denied 19. Production may bill `get` and `getAfter` separately, so
`MAX_MOVED_CHILDREN` in `src/lib/tree.ts` is held at 8 until RL-160 re-probes production;
above it the client refuses the cloud delete (RL-159). Accepted risk: P's owner can first set
P's `parentId` to any existing recipe, so other cooks' children can land under an unrelated
recipe; each affected cook gets the `moved` notice (see [decisions.md](decisions.md)). Root deletes are not covered. Emulator-checked 2026-10-21 (ticket RL-158
Notes). RL-159 writes it.

**favorites** are readable only by their owner, and created and deleted only by their owner
with a verified email. The document id must match `{your uid}_{recipeId}`. No updates.
That "no updates" is what makes the anonymous-upgrade carry-over (RL-034,
`pushLocalFavoritesToCloud`) idempotent: each local bookmark is pushed as one batch of the
favourite create plus a `favoriteCount` +1, and if the favourite already exists the set is
an update, the rules deny it, and the whole batch rolls back, so the count cannot bump twice.
A bookmark of a recipe with no cloud document fails on the bump update and stays local only.
The pushed document carries the local `createdAt`, and `recipeOwnerId` from the local recipe's
`createdBy.uid` (or `'local'` when the recipe is not in Dexie). The Dexie half of the
existing-account upgrade, `migrateFavoritesUid`, runs in one `rw` transaction on `favorites`.
The owner read is what lets a verified account pull its favourites back down (RL-043): one
`where('uid','==',uid)` list query, which needs no composite index, and the rows the device
lacks are added to Dexie as `{ uid, recipeId, createdAt }` with the cloud `createdAt`
(`recipeOwnerId` is not kept locally). Emulator-verified 2026-10-15: the owner's query returns
200, another uid's query and a signed-out query return 403.

**suggestions**: any user **with a verified email and a current Terms acceptance** (RL-047)
may create one for someone else's recipe, and it must be stamped with their own uid and `status: 'pending'`. Its `recipeOwnerId` must
match the recipe's `createdBy.uid`, checked with a `get()` on the recipe, so each create costs
three document reads in the rules (the recipe, the `termsAcceptance` document for `acceptedTerms()`, and the `writeWindows` window's `getAfter()` from RL-048) plus the client's window read in its transaction; a wrong owner would leave a suggestion nobody can review or delete.
**Structured edits and outcomes (RL-146, in the repo 2026-10-21, deployed by RL-156).** A
create may hold only the keys `createSuggestion` writes (`recipeId`, `recipeOwnerId`,
`recipeTitle`, `recipeEmoji`, `suggestedBy`, `message`, `status`, `createdAt`) plus `edits`, so
a suggester cannot pre-set `branchId` or any other field. It may carry `edits`: if present, a list of 1 to 10 maps, each with only the keys `kind`,
`index`, `name`, `from`, `to`, `why`; `kind` one of `ingredient`, `step`, `general`; `from` a
string of at most 500 characters; `to` a string of 1 to 1000; optional `index` an integer 0 to
99; optional `name` and `why` strings of at most 200. Rules cannot loop, so each of the ten
indexes is checked explicitly. The text checks use `matches()`, which counts code points, not
`size()`, which counts UTF-16 units: with `size()` a create of 7 or more full edits ran into the
1000-expressions-per-request limit (shared with the window write in the same transaction) and
was denied, so text in emoji may run to twice the cap in UTF-16 units. The caps must equal
`MAX_EDITS` and `MAX_EDIT_*` in `src/lib/suggestion.ts`; `suggestion.test.ts` fails when they
differ. Only the recipe owner, with a verified email, may update, only a `pending` suggestion,
and only `status` and `branchId`: to `rejected` (shown as Declined) or `applied` without
changing `branchId`, or to `branched` with a string `branchId` naming a recipe whose `parentId` is the
suggested recipe and whose `createdBy.uid` is the owner (one extra document read). `approved`
is no longer writable, old approved documents stay as they are, and a closed suggestion cannot
change. Emulator-checked 2026-10-21 (ticket RL-146 Notes). Until RL-156 deploys this the live
rules still allow only `approved` or `rejected`, so the RL-148 client's `applied` and
`branched` status writes are denied there. Since RL-148 the only write that changes a published
`collaborators` array is Apply (`applySuggestion`), which reads the cloud array and writes it
back with the suggester added, deduped by uid, in one transaction with the edits and
`status: 'applied'` (emulator-checked 2026-10-21, RL-148 Notes) (old approvals
used `arrayUnion`). The same update adds the suggester to `collaboratorUids` with
`arrayUnion` (RL-172); neither field changes when the owner applies their own suggestion.
Keep as branch creates the branch with `collaborators: [suggester]` and
`collaboratorUids: [suggester uid]` (emulator-checked 2026-10-21, RL-172 Notes).
`publishRecipe` writes both on create only (`collaboratorUids` derived from the local
`collaborators`, `[]` when there are none) and leaves both out of a re-publish, because a
merge replaces arrays wholesale and the local copy may be stale (RL-037). There is no
backfill of `collaboratorUids`; the 2026-10-18 wipe left almost no credited recipes, and
Apply unions every credited uid of the recipe (not only the new suggester's), so an older
recipe gains its whole list the next time a suggestion is applied to it. **Read cost of the
profile Collabs tab (RL-173):** one `where('collaboratorUids', 'array-contains', uid)` query with
`limit(51)` (the extra one only detects truncation) when the Collabs tab is first opened, cached 5 minutes per uid in memory, one document read per recipe returned (at most 51). It uses the
automatic single-field index (no `orderBy`, so no composite index; sorted on the client), and
the owner's own recipes are dropped after the read. Recipes without the field never match.
Deletion is forbidden
outright, which is why testing suggestions against the live project leaves permanent
records; use the emulator (see [operations.md](operations.md)). Reads (RL-018) need a
verified email and are limited to the two parties: the recipe owner (`recipeOwnerId`) and the
suggester (`suggestedBy.uid`). Anonymous accounts read none. Because a `list` is authorised
from its filters, `subscribeRecipeSuggestions` filters on `recipeId` plus `recipeOwnerId ==
uid` when the viewer created the recipe (`createdBy.uid`), or `suggestedBy.uid == uid`
otherwise; each needs its own composite index above. A query by `recipeId` alone is denied
whole, even for the owner.

**suggestions/{id}/messages** — creatable only by the two participants (checked with a
`get()` on the parent), only with your own `fromUid`, with a verified email, a current Terms
acceptance (RL-047) and a reply-window move (RL-048), and immutable once sent. A reply costs
three document reads in the rules (the parent suggestion, `termsAcceptance`, and the window's
`getAfter()`) plus the client's window read in its transaction. Replies stay allowed after the suggestion is closed on purpose.
Readable by the same two parties, with a verified email, checked with the same `get()` on
the parent, so opening a thread costs one extra document read on top of its messages.

**notifications** — the *acting* user writes the notification and the recipient reads it.
Every write needs a verified email. Creation requires your own `fromUid` and `read: false`,
and only the keys `recipientUid`, `type`, `recipeId`, `recipeTitle`, `recipeEmoji`, `fromUid`,
`fromDisplayName`, `message`, `read`, `createdAt` (any may be absent, which `follow` needs).
Since RL-049 a create also needs a notification-window move (at most 60 per hour per
sender, see writeWindows below), so a notification costs 2 extra document reads.
`type` must be one of the ten: `favorite` and `follow` require `message` null; the six
suggestion types (`suggestion`, `suggestion_reply`, `suggestion_approved`,
`suggestion_rejected`, and since RL-146, in the repo and deployed by RL-156,
`suggestion_applied` and `suggestion_branched`) allow null or a string of at most 500 characters, counted as UTF-16 units
(an emoji is two). Suggestion and reply text has no length cap of its own, so the client cuts the
notification copy with `truncateNotificationMessage` in `src/lib/notifications.ts`; the
suggestion and message documents keep the full text.
The recipient may flip `read` and nothing else, and may delete.
**`branch` (RL-152, in the repo, deployed by RL-156).** A ninth type, "someone branched your
recipe" (RL-153 writes it). `message` null or at most 500 characters, and `recipeId` must be
present and name a branch (its `parentId` a string) whose `createdBy.uid` is the sender, and
`recipientUid` must be the parent recipe's owner and not the sender. So only the branch's
author can announce it, and only to the owner of the recipe branched. That is two more document
reads (the branch and its parent). Emulator-checked 2026-10-21 (ticket RL-152 Notes).
Since RL-153 `saveRecipe` writes it through `notifyBranched` after the branch is published, with
`recipeTitle` and `recipeEmoji` the parent's and `message` the branch's prompt.
**`moved` (RL-158, in the repo, deployed by RL-160).** A tenth type, "your branch was moved up"
after the version it hung from was deleted (RL-159 writes it). `message` must be a string of at
most 200 characters; it is the sender's text (the client sends the deleted version's title), not
checked against P. `recipeId` must name the moved child and the document id must be
`moved_{recipeId}_{deletedId}`, where `deletedId` is the child's stored `parentId` before the
batch (RL-159; it was `moved_{recipeId}` in RL-158, which denied a second move of the same
child). So each child gets at most one notice per deleted version (a second create of the id is
an update, which only the recipient's read flip passes); the `get` is the same child document
`isMovedChildOf` reads, so it costs no extra access. `recipientUid` must be that child's
`createdBy.uid` and not the sender, and the child's `parentId` must change in the same batch
(`getAfter` differs from `get`), which the reparent rule above allows only to the deleted
version's owner. It is the one type **exempt from the notification window**: a window admits one
notification per batch (`last` names one document), and a delete moves several children in one
batch that cannot be split, since each notice must ride with its move. The real move and the id
binding bound it instead. Emulator-checked 2026-10-21 (ticket RL-158 Notes).
Since RL-159 `deletePublishedVersion` writes it in the delete batch with `recipeId`,
`recipeTitle` and `recipeEmoji` the moved child's and `message` the deleted version's title; the
new parent's title has no field, so Activity says the branch "moved up a level".
Emulator-checked 2026-10-21 (ticket RL-159 Notes): a child moved by one delete and then by a
later one commits both times; `moved_{child}`, a wrong deleted id, and a second notice for the
same child and deleted version are denied.

**notificationPrefs** (RL-152, in the repo, deployed by RL-156): read, create and update only
by the owner with a verified email; delete by the signed-in owner (no verified email needed,
like termsAcceptance, so erasure works if verification lapses). Writes take exactly the keys `branch`,
`suggestion`, `follow` (each a bool) and `updatedAt`, which must equal the request time
(`serverTimestamp()`). Nobody else can read or list them; preferences are applied when the
recipient reads Activity, not by the writer. RL-155 writes the whole document with `setDoc` on each toggle, and it is part of Download my data (`cloud.notificationPrefs`, additive, so `DATA_EXPORT_VERSION` stays 1; an unverified user gets the verify note for it, as for suggestions) and of the erase script.

**tasteProfiles** (RL-230 rules, RL-231 client): part of Download my data (`cloud.tasteProfile`, additive, `DATA_EXPORT_VERSION` stays 1; an unverified user gets the verify note, as for notificationPrefs) and of the erase script (`tasteProfiles/{uid}`).

**profiles** are publicly readable, and every write needs a verified email. You own your
document. Anyone else may change exactly one thing: a `followerCount` ±1 bump. Since RL-041 the
client creates the document only for a verified account, including on an anonymous account's
upgrade to an email, so an anonymous account has no profile document.

**follows** — readable by the follower or the followed. The follower creates and deletes,
with a verified email,
and the id must be `{their uid}_{followingId}`. No updates.

**tasteProfiles** (RL-230, in the repo, deployed by RL-249): read, create and update only by
the owner with a verified email; delete by the signed-in owner (no verified email needed, like
termsAcceptance, so erasure works if verification lapses). Writes take exactly the keys `avoids`,
`hidden`, `askedAt` and `updatedAt`. `avoids` is a list of at most `TASTE_AVOID_MAX` (12) and
`hidden` a list of at most `TASTE_HIDDEN_MAX` (50) (`lib/taste.ts`, tied to the rules' literals by
`taste.test.ts`). Rules cannot loop over a list. Avoids are sent to Gemini, so each of the 12
slots is checked by index: a string of at most `TASTE_TERM_MAX` (40) characters. `hidden` only
filters the device's own learned terms, so it gets the cheap bound: its `join('')` must be at
most 50 x 40 characters, which bounds the document but lets one 41-character term or a
non-string element through (join stringifies it). Each hidden term's type and length is the
client's job (RL-231). `askedAt` is null or an int no more
than 60 seconds ahead of server time (the client's clock, bounded like
`termsAcceptance.acceptedAt`), and `updatedAt` must equal the request time
(`serverTimestamp()`). Emulator-checked 2026-10-21 (ticket RL-230 Notes).

**termsAcceptance** (RL-047): readable only by its owner. Created and updated (a `setDoc`
overwrite) only by the owner with a verified email, with exactly the keys `version`,
`acceptedAt` and `recordedAt`: `version` equal to the rules' literal, `acceptedAt` an integer
no more than 60 seconds ahead of server time (it is the client's clock, bounded like a
recipe's `createdAt`), and `recordedAt` equal to the request time, i.e. `serverTimestamp()`.
Deletable by the owner, for account erasure (RL-057); a deleted acceptance just blocks
contributing again. Emulator-checked 2026-10-15 (ticket RL-047 Notes).

**writeWindows** (RL-048 and RL-049, in the repo 2026-10-15, deployed by RL-051): the
per-user limits, enforced by the rules alone because product decision 2 rules out Cloud
Functions:

| Action | Cap | Window | Limited write | When limited |
|---|---|---|---|---|
| `suggestion` | 10 | 1 hour | suggestion create | message in suggest mode on the recipe page and the shared page |
| `reply` | 30 | 1 hour | message create | message under the reply box |
| `notification` | 60 | 1 hour | every notification create (favourite, follow, suggestion, reply, apply, branch, decline) | skipped silently, reported |
| `recipe` | 30 | 1 day | recipe create only (a re-publish is an update and is not limited) | "You've published a lot today. Try again tomorrow." |
| `cook` | 20 | 1 day | cook create (RL-194, in the repo, deployed by RL-209) | "You've logged a lot of cooks today. Try again tomorrow." |

`createSuggestion`, `addSuggestionMessage`, the create branch of `publishRecipe` and every
notification writer (through `notify()` in `services/firestore.ts`, after the action it
announces has committed) run a transaction that reads `writeWindows/{uid}_{action}`, decides with `nextWindow`
(`src/lib/rateLimit.ts`), and writes the content and the window together. The suggestion and
message create rules additionally require `existsAfter()` and `getAfter()` of that window
with `at == request.time`, which proves the window moved in the same request, so a create
without it is denied. The window rule: read by its owner only, decided from the document id
(`{your uid}_` plus one of the five actions), never from `resource.data`, because the
client reads a missing window on its first write and a rule that dereferences
`resource.data` would deny that (RL-026). Create and update need a verified email, that exact
id, only the keys `windowStart`, `count`, `at` and `last`, an int `count`, a timestamp
`windowStart`, `at` equal to the request time, and `last` a string of at most 300 characters.
`last` is the path of the document this bump counts (`suggestions/{id}`,
`suggestions/{id}/messages/{id}`, `notifications/{id}`, `recipes/{id}` or `cooks/{id}`), and each create requires the window's `last` after the
request to equal its own path. The window has one value after a request, so one bump admits
exactly one create: without it, one bump in a batch admitted any number of suggestions or
messages (emulator-proved before the fix, 2026-10-15). Create needs `count == 1` and `windowStart` the request
time. Update is either a new window (only once server time is past `windowStart` plus that
action's window, one hour or one day; `count == 1`, `windowStart` the request time) or the
same window (`windowStart` unchanged, `count` exactly one more, at most that action's cap).
The rules take the action from the id after the underscore (a uid has none) and look up its
cap and window in `capFor()` and `windowMsFor()`. No delete, since that would reset the
limit. A user may move their own window without writing content; that only limits
themselves. **Read cost: 2 extra document reads per limited write** (the window read in the
transaction, and the rules' `getAfter()`; the two `getAfter()` calls on one path bill once),
matching the counts in the suggestion and reply paragraphs above. **Access-call budget**: a transaction commit is a multi-document
request (20 accesses). A suggestion create touches the recipe, `termsAcceptance` and the
window (3 documents); a message create touches the parent suggestion, `termsAcceptance` and
the window (3); a recipe create touches `termsAcceptance` and the window (2); a notification
create touches only the window (1); a cook create touches `termsAcceptance`, the recipe and the window (3); the window write itself touches none. Emulator-checked
2026-10-15 with every guard present (tickets RL-048 and RL-049 Notes). The caps and windows
live in the rules as `suggestionCap()`, `replyCap()`, `notificationCap()`, `recipeCap()`,
`cookCap()`, `windowMs()` and `recipeWindowMs()`, and `src/lib/rateLimit.test.ts` fails when they differ
from `RATE_LIMITS` in `src/lib/rateLimit.ts`.

A notification is written in its own small transaction after the favourite, follow,
suggestion, reply or review has committed, never inside that batch, so a limited or failed
notification can never undo the action. A limited one is skipped and reported once as
`rate-limited-notification`; any other failure (offline, timeout, denied) is skipped
silently as before. No path writes two notifications in one request.

`publishRecipe`'s create branch reads the recipe again inside its transaction, before the
window. If it exists by then (the outer `getDoc` was stale, or an earlier publish that timed
out on the client landed meanwhile), the transaction writes the same merge a re-publish
writes (no counters, no `collaborators`) and no window; a transaction that read the recipe as missing carries that as a precondition, so a
create landing in between cannot be overwritten. **Read cost of a first publish:** the
outer `getDoc`, the transaction's recipe and window reads, and the rules' `termsAcceptance`
and window `getAfter()`: 5 billed reads (a re-publish costs the outer `getDoc` only, or 2
when the transaction finds the recipe). Before this, a create over an existing recipe was
accepted by the rules as an owner update and reset its counters. Checked with the web SDK
against the emulator (ticket RL-049 Notes). `publishRecipe` also rejects, before any read,
when the recipe's `createdBy.uid` is not the signed-in uid (the rules would deny it).

**cooks** (RL-194, in the repo, deployed by RL-209): readable by anyone, signed out included, so
counts, votes, notes and cook names show on the recipe; a count query on `recipeId` alone or with
`vote` is allowed signed out. Create needs a verified email, the current Terms (`acceptedTerms()`, as for recipe,
suggestion and message creates), and exactly the keys `uid`,
`displayName`, `recipeId`, `rootId`, `recipeOwnerId`, `vote`, `note`, `branchId` and `createdAt`:
`uid` the writer's own, `vote` `again` or `tweak`, `note` null or a string of at most 500,
`branchId` null, `createdAt` equal to the request time (`serverTimestamp()`), `displayName` null
or a string of at most 100 (not tied to the profile; the client takes it from there), `recipeId`
a string of at most 128, and `recipeOwnerId` and `rootId` equal to the recipe's `createdBy.uid`
and `rootId` (the recipe must exist and carry a string `rootId`; every published recipe does,
since `Recipe.rootId` is required and `publishRecipe` writes the whole record, but the recipe
rules do not enforce it, so a recipe without one cannot be cooked). The `cook` window must move in the
same request with `last` equal to `cooks/{id}`, so one bump admits one cook (20 a day, see
writeWindows below). A Terms bump (`termsVersion()`) therefore denies every cook until the user
re-accepts; `logCook` (RL-196) turns that denial into `TermsNotAcceptedError` by reading the
user's `termsAcceptance` after a `permission-denied` (one extra read, only on a denial). Update: only the
cook, verified, only `branchId`, once, from null to the id of an existing recipe the cook owns
(at most 128 characters; crediting a branch grown from the note). Delete: only the cook, signed
in (no verified email needed, like termsAcceptance and notificationPrefs, so erasure works if
verification lapses); the recipe owner cannot delete other people's cooks (no moderation, as for
suggestions). Cooks outlive a deleted recipe (no cascade, by decision), so anything that
aggregates cooks over a family must tolerate a `recipeId` whose recipe is gone.
**Access-call budget**: a cook create touches `termsAcceptance`, the recipe (`exists()` and
`get()` of one path count once) and the window's `getAfter()`, so 3 document accesses and 3
billed reads in the rules, plus the client's window read in its transaction; a `branchId`
update touches the branch recipe (1); delete touches none. Emulator-checked 2026-10-21 (ticket RL-194 Notes).
**Client read cost** (RL-196, `services/firestore.ts`): `getRecipeCookSummary` is 2 count reads
(a count costs one read per 1000 matches, minimum one) plus one per cook returned, at most 20,
read once per recipe visit and again after the user logs a cook (`useRecipeCooks`); the own log
(`subscribeOwnCooks` through `useOwnCooks`, verified users only) is one read per cook, at most 200,
plus one per later change while it is open. Each `useOwnCooks` caller opens its own listener,
so mount it once and pass the list down. `logCook` reads `recipes/{recipeId}` in its transaction
for `rootId` and `recipeOwnerId` (one more client read; never the caller's copy) and refuses a
recipe that is missing or has no `rootId` with `RecipeNotPublishedError` ("Publish this recipe
before logging a cook."). It accepts a `cookId` so `useRecipeCooks` can retry a timed-out log under
the same id; an existing cook is left alone and the window does not move. `logCook` takes `displayName` from the signed-in
account (`AppUser.displayName`, kept in step with the profile by `useProfile.updateName`), never
from typed input, and trims it to 100 and the note to 500.

**Recipe photo read cost** (RL-206, `getRecipePhoto` through `useRecipePhoto`): one `cookPhotos` doc (up to about 150 KB; `limit 1`), then `startAfter` reads of one more each only if the previous photo is skipped, at most 3 in all, plus one `cooks/{id}` read per candidate whose cook is not in the page's newest-20 summary. It runs once per recipe visit, after the cook summary answers, and again only after a photo is removed. A photo whose cook is gone is skipped, so an orphan hides nothing older. Bounded at 6 s; a failure is reported as `recipe-photo` and the emoji layout stays.

**cookPhotos** (RL-204, in the repo, deployed by RL-209): readable by anyone, signed out included.
Create needs a verified email and the current Terms (`acceptedTerms()`, public content like cooks),
exactly the keys `uid`, `recipeId`, `url` and `createdAt`, `uid` the writer's own, the cook at
`cooks/{cookId}` (same id) written by the same uid and carrying the same `recipeId`, `url` a string
of at most 200000 characters matching `^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$` (a JPEG
prefix then base64 only; PNG, other prefixes and non-base64 text deny), and `createdAt` equal to the request time. No update, so a second photo for the same cook is
refused (the document exists, so the write is an update; checked against the emulator). Delete: the
cook, signed in only (so erasure works if verification lapses, as for cooks), or the recipe's owner,
verified (moderation of a public photo on their recipe; once the recipe is deleted only the cook can
delete). A cook's deletion does not cascade to its photo (rules cannot cascade): the client deletes
`cookPhotos/{cookId}` before the cook (`deleteCook`, RL-205): it reads the photo (public read) and deletes it only if it exists, because deleting a missing photo is denied. Any error, offline included, stops before the cook is deleted, so a cook is never deleted while its photo might remain. Decision 3's size reasoning is met: the cap
keeps a photo near 150 KB, well inside the 1 MiB document limit, and the separate collection keeps it
out of every cook read and count. **Access-call budget**: a create touches `termsAcceptance` and the
cook (2); the cook's delete touches none, the owner's delete the recipe (1). Emulator-checked
2026-10-21, including a real 200000-character data URL against the regex (ticket RL-204 Notes).

**kitchens** (RL-211, in the repo, deployed by RL-227): read by a member (`request.auth.uid in
memberUids`) with a verified email; a verified user may also read `kitchens/{own uid}`, so a
missing kitchen answers not-found rather than permission-denied. Create: verified, the document id
is the writer's uid, `ownerUid` the writer and `memberUids` exactly `[uid]`. Exactly the keys
`memberUids`, `ownerUid`, `shopping`, `pantry` and `updatedAt`, `shopping` and `pantry` lists of at
most 300 (`kitchenItemCap()`, `KITCHEN_ITEM_CAP`), `updatedAt` equal to the request time, on create
and on every update. Update: a member, verified, the same shape, and `memberUids` and `ownerUid`
unchanged (Phase 2; RL-237 opens the invite path). Delete: the owner, signed in only (so erasure
works if verification lapses, as for cooks). Rules cannot iterate a list, so a list is checked by
size only; a 300-item list costs one `size()` per list. A member's `array-contains` query on
`memberUids` for their own uid is allowed; one for another uid is denied. **Access-call budget**:
none in any rule.

**Kitchen client cost** (RL-213, `subscribeKitchen` and `updateKitchen` in `services/firestore.ts`,
through `useKitchen`): one listener per session for a verified user on `kitchens/{uid}`, shared by
every caller: one read when it attaches (a missing document still bills one read) plus one per
change. Each mutation is one transaction: one document read and one write (the first write creates
the document with `memberUids: [uid]`, later ones update only `shopping`, `pantry` and `updatedAt`,
always `serverTimestamp()`). Before writing, `kitchenFits` (`lib/kitchen.ts`) refuses a list past
300 items or a serialized document past 900 KB (`KITCHEN_DOC_MAX_BYTES`), so Firestore's 1 MiB
limit is never the error the user sees; a change that does not grow the lists always passes, so a
removal is never refused. Bounded at 5 s; cloud only, nothing queued offline. The SDK retries a
transaction that meets a concurrent write, and each attempt bills its read again. A timed-out
transaction may still commit, so the hook tells the user "It may have saved. Check your list before
adding again." rather than inviting a retry. One write runs at a time; a call made meanwhile is
dropped. A failed listener is reported, retried once after 2 s (refreshing the ID token first on
permission-denied), and shows `kitchen: null` until a snapshot arrives.

**collections** (RL-211, in the repo, deployed by RL-227): read and update by the owner
(`ownerUid`), verified, so a `where ownerUid ==` own-uid query is allowed. Create: verified, own
`ownerUid`, `createdAt` equal to the request time. Exactly the keys `ownerUid`, `name`,
`visibility`, `recipeIds`, `createdAt` and `updatedAt`, `visibility` `'private'`, `name` a string
of 1 to 60, `recipeIds` a list of at most 200 (`collectionRecipeCap()`, `COLLECTION_RECIPE_CAP`),
`updatedAt` equal to the request time on create and on every update. Updates may not change
`ownerUid`, `createdAt` or `visibility`. Delete: the owner, signed in only. **Access-call
budget**: none. Both blocks emulator-checked 2026-10-21, including another user's read (403) and
301-item lists (403) (ticket RL-211 Notes). `src/lib/kitchen.test.ts` ties the two caps to the
rules text.

**Collections client cost** (RL-222, `subscribeCollections` and the collection writes in
`services/firestore.ts`, through `useCollections`): one listener per session for a verified user,
shared by every caller, on `where ownerUid == uid` with no `orderBy` (equality only, so no
composite index; sorted on the client by `updatedAt`, newest first). It bills one read per
collection when it attaches (one read minimum when there are none) plus one per changed
collection. The number of collections per user is unbounded in the rules (accepted for now), so
neither is this read; the client refuses a 101st (`COLLECTIONS_PER_USER_MAX`, "You have 100
collections. Delete one first."). `createCollection` is one write with exactly the rules' keys, `visibility`
`'private'` and `createdAt` and `updatedAt` both `serverTimestamp()`; rename and remove are one
write each (`updateDoc` of `name` or `arrayRemove`, plus `updatedAt`); delete is one delete. Add is
one transaction: one document read and at most one write (`arrayUnion` plus `updatedAt`), skipped
when the recipe is already there. The transaction checks the stored list, so two devices cannot
push it past 200 together; the hook refuses from the listener's list first. Names are trimmed and
must be 1 to 60 UTF-16 code units, which is at least the character count the rules measure, and a
recipe id must be 1 to 36 characters (`lib/kitchen.ts`), since the rules check the list's size
only. Every write is bounded at 5 s; cloud only, nothing queued offline. A timeout tells the user
"It may have saved. Check your collections before trying again."; a refused write ("Give it a
name.", "Keep it under 60 characters.", "This collection is full.") rejects with that copy and
sets no page error. A collection the listener no longer has is treated as gone: deleting it
resolves without a write, and a rename, add or remove that is denied or not found rejects with
"That collection no longer exists." (the rules deny an update to a missing document rather than
answering not-found). Removing a recipe the listener's copy does not hold writes nothing. A failed listener is reported, retried once after 2 s (refreshing the ID token
first on permission-denied), and shows "Couldn't load your collections. Check your connection and try
again."

**Cooks and cook photos in data requests** (RL-207): Download my data reads `cooks` and
`cookPhotos` where `uid ==` the user (both public read, single-field queries, no index) into
`cloud.cooks` and `cloud.cookPhotos`, and `writeWindows/{uid}_cook` with the other windows
(additive, so `DATA_EXPORT_VERSION` stays 1). A cook's `recipeOwnerId` becomes `other-user-N`
when it is someone else's recipe; the rest of the cook, the user's own name and note
included, is kept. Each photo row carries its whole data URL, so the file grows by up to about
200 KB per photo (about 150 KB of JPEG in base64; 201.5 KB for one maximum-size photo in the
RL-207 emulator run), for example about 10 MB for 50 photos. The photos are read inside the
same 30 s section timeout as every section; a timeout keeps the photos read so far (pages of
500) with a warning in the file's `errors`, a failure drops only `cookPhotos`, and the operator
export is the fallback. Nothing in the export path logs
a photo's URL. The operator's erase script deletes the user's photos, then their cooks, and
anonymises other people's cooks of the user's recipes (see docs/operations.md, Data requests).

**Kitchen and collections in data requests** (RL-226): Download my data reads `kitchens/{uid}` by
id (`cloud.kitchen`, null when none) and `collections` where `ownerUid ==` the user
(`cloud.collections`), both verified-only reads, additive so `DATA_EXPORT_VERSION` stays 1. Any other
uid in a kitchen (`memberUids`, `ownerUid`, a pantry item's `addedBy`) becomes `other-user-N`
(none in Phase 2). The operator's erase script deletes the collections and the kitchen. It
deletes a kitchen only when the uid is its owner and sole member; otherwise it skips it and
reports it (RL-238 must decide what leaving or erasing means for a shared kitchen).

**rateLimits**: closed to everyone. Unrelated to `writeWindows`: reserved for the undeployed
Cloud Function.

### Uid carry-over is local only

An anonymous account owns no cloud data (RL-040), so when it signs into an email account
that already exists there is nothing in Firestore to move. The cloud migration
(`migrateFirestoreUid`) and the stranded-identity notice were removed in RL-032. What
remains is local: `runMigration` in `AuthContext` re-stamps Dexie recipes
(`migrateRecipesUid`) and bookmarks (`migrateFavoritesUid`) under the new uid.

## Counter integrity

`favoriteCount`, `viewCount`, `followerCount`, and `followingCount` are denormalised
counters maintained with `increment()`. Rules constrain foreign writes to exact ±1 bumps,
which is the strongest guarantee available without a server. They can still drift if a
client dies between a batch's two halves. Nothing reconciles them; treat them as approximate
and never as the source of truth for a decision.
