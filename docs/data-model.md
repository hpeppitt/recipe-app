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

Adding a version means adding a `this.version(n).stores({...})` block and, if existing rows
need new fields, an `.upgrade()`. Never edit a released version's block: users have that
version on disk.

### Gotcha: no `update()`

Dexie's `update()` is not used anywhere in this codebase. `ChatMessage.recipe` makes
`Recipe` circular through `chatHistory`, which breaks Dexie's update typing. The pattern is
`get()` then `put()` instead. Keep it.

## Firestore

Project `recipe-lab-3832b` (`.firebaserc`). Ten top-level collections (`recipes`, `favorites`,
`suggestions`, `notifications`, `profiles`, `termsAcceptance`, `writeWindows`, `clientErrors`,
`rateLimits`, `follows`) plus one subcollection (`suggestions/{id}/messages`). Recipe documents use the same UUID as the IndexedDB row, which is what makes
the dual store addressable by one id.

**Write order of a new recipe** (RL-082, decision 1b): for a configured app the chat save
publishes to Firestore first and only then `put`s the same record in Dexie. Nothing is written
locally when the publish fails or times out, so a verified user never has a local-only own
recipe; the retry reuses the record's id, which `publishRecipe`'s in-transaction re-read turns
into a merge if the earlier attempt landed. Local-only mode still adds to Dexie alone.

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
| `recipes/{recipeId}` | recipe UUID | `SharedRecipe` (`lib/share.ts`) plus `favoriteCount`, `viewCount`, `collaborators`, `createdAt` | The published feed. Read by anyone, signed in or not. |
| `favorites/{uid}_{recipeId}` | composite | `{ uid, recipeId, recipeOwnerId, createdAt }` | Global favourite records. Existence drives the owner's notification. |
| `suggestions/{autoId}` | auto | `Suggestion` (`types/social.ts`) | `status: pending \| approved \| rejected`, `recipeOwnerId` denormalised so the update rule can check ownership without a lookup; create verifies it against the recipe once. |
| `suggestions/{id}/messages/{autoId}` | auto | `SuggestionMessage` | The reply thread. A subcollection rather than an array on the parent, so the parent's owner-only, status-only update rule stays intact. |
| `notifications/{autoId}` | auto | `AppNotification` | Six types (see [capabilities.md](capabilities.md)). `recipeId`/`recipeTitle`/`recipeEmoji` are optional because `follow` is about a person, not a recipe. |
| `profiles/{uid}` | user uid | `UserProfile` (`types/profile.ts`) | Public read. Holds avatar settings and the maintained counters `followerCount` and `followingCount` (`recipeCount` is stored but no longer bumped, RL-032). Uploaded avatars live here as base64 JPEG. `photoURL` must be absent, null, or a `data:image/` string of at most 100000 characters (checked on create and on updates that touch it, RL-019): a third-party-hosted URL would leak the IP and user agent of every viewer, and `Avatar` renders only `data:image/` values. |
| `termsAcceptance/{uid}` | user uid | `{ version, acceptedAt, recordedAt }` | The account's latest acceptance of the Terms of Service (RL-047). **Private**: owner-only read, never on the public profile and never in analytics. `version` is `TERMS_VERSION` (`lib/legal.ts`), `acceptedAt` the client's ms when the link was sent with the box ticked (or Accept was pressed in `TermsUpdateDialog`), `recordedAt` a server timestamp. Only the latest acceptance is kept; there is no history. |
| `writeWindows/{uid}_{action}` | composite, `action` is `suggestion`, `reply`, `notification` or `recipe` | `{ windowStart, count, at, last }` (two timestamps, an int, and the path of the last document counted) | Per-user fixed-window counter for the rules-only write limits (RL-048 and RL-049, in the repo 2026-10-15, deployed by RL-051). Moved in the same transaction as the suggestion, message, notification or recipe create it counts, and `last` names that document. Owner read only, derived from the id. Clients can never delete one; the operator's erase script (RL-055, Admin SDK) does. |
| `follows/{followerId}_{followingId}` | composite | `Follow` | Readable only by the two parties. |
| `clientErrors/{autoId}` | auto | `ErrorReport` plus `uid`, `receivedAt`, `userAgent` | Write-only drop box for the error beacon. Creatable by **anyone, including signed-out visitors**, because a failure during sign-in is exactly the kind that was invisible. No client read, update or delete. Shape is constrained in rules (known keys only, typed, length-capped) because it is an unauthenticated write path. If `receivedAt` is present it must equal the server request time (RL-020). |
| `rateLimits/{uid}` | user uid | fixed-window counter | Written **only** by the undeployed `generateRecipe` Cloud Function via the Admin SDK, which bypasses rules. Closed to clients entirely, which is what stops a user resetting their own quota. |

### Composite indexes

All live in `firestore.indexes.json`; each exists for exactly one query.

| Index | Needed by |
|---|---|
| `recipes`: `createdBy.uid` ASC, `createdAt` DESC | `getRecipesByUsers`, the Following filter (RL-021): `createdBy.uid in` a 30-uid chunk, `orderBy createdAt desc`, `limit 50` |
| `recipes`: `tags` arrayConfig CONTAINS, `createdAt` DESC | `getPublishedRecipesPage` with a tag, the Explore tag chips (RL-009): `where tags array-contains`, `orderBy createdAt desc`, `limit 31`. The rule is `allow read: if true`, so the added where clause changes nothing there. Guarded by `src/lib/indexes.test.ts`. `tags` are stored trimmed, lower case and de-duplicated by `publishRecipe` (`normalizeTags`, RL-059); the Dexie copy keeps the case as generated |
| `notifications`: `recipientUid` ASC, `createdAt` DESC | the notification bell's `onSnapshot` subscription |
| `suggestions`: `recipeId` ASC, `recipeOwnerId` ASC, `createdAt` DESC | `subscribeRecipeSuggestions`, owner query (RL-018) |
| `suggestions`: `recipeId` ASC, `suggestedBy.uid` ASC, `createdAt` DESC | `subscribeRecipeSuggestions`, everyone else's query (RL-018) |
| `suggestions`: `recipeId` ASC, `createdAt` DESC | the pre-RL-018 client's unfiltered query; kept until that client is gone, then removable |

The Following filter queries newest-first: each 30-uid chunk returns its own newest 50 and the
client merges the chunks and re-sorts by `createdAt` descending. The merged list is not capped
overall, so it can reach 50 per chunk.

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
stamping your own uid as `createdBy.uid`, with both counters starting at zero. A re-publish
is an update and needs no window. Updates are
allowed only in three exact shapes: a `viewCount` +1 by anyone, a `favoriteCount` ±1 by a
verified user, or a verified owner update that changes anything *except* `createdBy.uid` and `createdAt`.
Delete needs a verified owner. Recipes published anonymously before the 2026-08-10 gate can
no longer be edited or deleted by their anonymous owner; RL-042 wipes them. Since RL-023 the
client attempts the cloud delete only for users with `emailVerified`, which matches the rule.
Since RL-080 that delete runs before the local one, and the local subtree is kept when it fails.
Since RL-016 a create also needs `createdAt` to be an integer (milliseconds) no more than 60
seconds ahead of server time, an owner update may not change `createdAt`, and both require
`title` to be a string of at most 200 characters and `ingredients` and `instructions` to be
lists of at most 100 entries each, checked on the document as it would be after the write. The
reason: the feed is ordered by `createdAt` descending, so a far-future value would pin a
recipe to the top of everyone's feed, and an oversized document is read on every first paint.
Past `createdAt` values stay allowed because imports keep their original date. The caps are
named in a comment above the recipe rules. Array elements are not checked; rules cannot
iterate a list. A client clock more than a minute fast cannot publish.

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
Only the recipe owner, with a verified email, may update, and
only the `status` field, and only to `approved` or `rejected`. On approval the client adds the
suggester to the recipe's `collaborators` first, then writes `status`, then notifies, so a
failed collaborator write leaves the suggestion pending. That `arrayUnion` is the only write
that changes a published `collaborators` array: `publishRecipe` writes it on create only and
leaves it out of a re-publish, because a merge replaces arrays wholesale and the local copy may
be stale (RL-037). Deletion is forbidden
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
`getAfter()`) plus the client's window read in its transaction. Replies stay allowed after approval or rejection on purpose.
Readable by the same two parties, with a verified email, checked with the same `get()` on
the parent, so opening a thread costs one extra document read on top of its messages.

**notifications** — the *acting* user writes the notification and the recipient reads it.
Every write needs a verified email. Creation requires your own `fromUid` and `read: false`,
and only the keys `recipientUid`, `type`, `recipeId`, `recipeTitle`, `recipeEmoji`, `fromUid`,
`fromDisplayName`, `message`, `read`, `createdAt` (any may be absent, which `follow` needs).
Since RL-049 a create also needs a notification-window move (at most 60 per hour per
sender, see writeWindows below), so a notification costs 2 extra document reads.
`type` must be one of the six: `favorite` and `follow` require `message` null; the four
suggestion types allow null or a string of at most 500 characters, counted as UTF-16 units
(an emoji is two). Suggestion and reply text has no length cap of its own, so the client cuts the
notification copy with `truncateNotificationMessage` in `src/lib/notifications.ts`; the
suggestion and message documents keep the full text.
The recipient may flip `read` and nothing else, and may delete.

**profiles** are publicly readable, and every write needs a verified email. You own your
document. Anyone else may change exactly one thing: a `followerCount` ±1 bump. Since RL-041 the
client creates the document only for a verified account, including on an anonymous account's
upgrade to an email, so an anonymous account has no profile document.

**follows** — readable by the follower or the followed. The follower creates and deletes,
with a verified email,
and the id must be `{their uid}_{followingId}`. No updates.

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
| `suggestion` | 10 | 1 hour | suggestion create | message in the suggest dialog |
| `reply` | 30 | 1 hour | message create | message under the reply box |
| `notification` | 60 | 1 hour | every notification create (favourite, follow, suggestion, reply, approve, reject) | skipped silently, reported |
| `recipe` | 30 | 1 day | recipe create only (a re-publish is an update and is not limited) | "You've published a lot today. Try again tomorrow." |

`createSuggestion`, `addSuggestionMessage`, the create branch of `publishRecipe` and every
notification writer (through `notify()` in `services/firestore.ts`, after the action it
announces has committed) run a transaction that reads `writeWindows/{uid}_{action}`, decides with `nextWindow`
(`src/lib/rateLimit.ts`), and writes the content and the window together. The suggestion and
message create rules additionally require `existsAfter()` and `getAfter()` of that window
with `at == request.time`, which proves the window moved in the same request, so a create
without it is denied. The window rule: read by its owner only, decided from the document id
(`{your uid}_` plus one of the four actions), never from `resource.data`, because the
client reads a missing window on its first write and a rule that dereferences
`resource.data` would deny that (RL-026). Create and update need a verified email, that exact
id, only the keys `windowStart`, `count`, `at` and `last`, an int `count`, a timestamp
`windowStart`, `at` equal to the request time, and `last` a string of at most 300 characters.
`last` is the path of the document this bump counts (`suggestions/{id}`,
`suggestions/{id}/messages/{id}`, `notifications/{id}` or `recipes/{id}`), and each create requires the window's `last` after the
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
create touches only the window (1); the window write itself touches none. Emulator-checked
2026-10-15 with every guard present (tickets RL-048 and RL-049 Notes). The caps and windows
live in the rules as `suggestionCap()`, `replyCap()`, `notificationCap()`, `recipeCap()`,
`windowMs()` and `recipeWindowMs()`, and `src/lib/rateLimit.test.ts` fails when they differ
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
