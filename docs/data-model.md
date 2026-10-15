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

Project `recipe-lab-3832b` (`.firebaserc`). Nine top-level collections (`recipes`, `favorites`,
`suggestions`, `notifications`, `profiles`, `termsAcceptance`, `clientErrors`, `rateLimits`,
`follows`) plus one subcollection (`suggestions/{id}/messages`). Recipe documents use the same UUID as the IndexedDB row, which is what makes
the dual store addressable by one id.

| Collection | Document id | Shape | Notes |
|---|---|---|---|
| `recipes/{recipeId}` | recipe UUID | `SharedRecipe` (`lib/share.ts`) plus `favoriteCount`, `viewCount`, `collaborators`, `createdAt` | The published feed. Read by anyone, signed in or not. |
| `favorites/{uid}_{recipeId}` | composite | `{ uid, recipeId, recipeOwnerId, createdAt }` | Global favourite records. Existence drives the owner's notification. |
| `suggestions/{autoId}` | auto | `Suggestion` (`types/social.ts`) | `status: pending \| approved \| rejected`, `recipeOwnerId` denormalised so the update rule can check ownership without a lookup; create verifies it against the recipe once. |
| `suggestions/{id}/messages/{autoId}` | auto | `SuggestionMessage` | The reply thread. A subcollection rather than an array on the parent, so the parent's owner-only, status-only update rule stays intact. |
| `notifications/{autoId}` | auto | `AppNotification` | Six types (see [capabilities.md](capabilities.md)). `recipeId`/`recipeTitle`/`recipeEmoji` are optional because `follow` is about a person, not a recipe. |
| `profiles/{uid}` | user uid | `UserProfile` (`types/profile.ts`) | Public read. Holds avatar settings and the three counters. Uploaded avatars live here as base64 JPEG. `photoURL` must be absent, null, or a `data:image/` string of at most 100000 characters (checked on create and on updates that touch it, RL-019): a third-party-hosted URL would leak the IP and user agent of every viewer, and `Avatar` renders only `data:image/` values. |
| `termsAcceptance/{uid}` | user uid | `{ version, acceptedAt, recordedAt }` | The account's latest acceptance of the Terms of Service (RL-047). **Private**: owner-only read, never on the public profile and never in analytics. `version` is `TERMS_VERSION` (`lib/legal.ts`), `acceptedAt` the client's ms when the link was sent with the box ticked (or Accept was pressed in `TermsUpdateDialog`), `recordedAt` a server timestamp. Only the latest acceptance is kept; there is no history. |
| `follows/{followerId}_{followingId}` | composite | `Follow` | Readable only by the two parties. |
| `clientErrors/{autoId}` | auto | `ErrorReport` plus `uid`, `receivedAt`, `userAgent` | Write-only drop box for the error beacon. Creatable by **anyone, including signed-out visitors**, because a failure during sign-in is exactly the kind that was invisible. No client read, update or delete. Shape is constrained in rules (known keys only, typed, length-capped) because it is an unauthenticated write path. If `receivedAt` is present it must equal the server request time (RL-020). |
| `rateLimits/{uid}` | user uid | fixed-window counter | Written **only** by the undeployed `generateRecipe` Cloud Function via the Admin SDK, which bypasses rules. Closed to clients entirely, which is what stops a user resetting their own quota. |

### Composite indexes

All live in `firestore.indexes.json`; each exists for exactly one query.

| Index | Needed by |
|---|---|
| `recipes`: `createdBy.uid` ASC, `createdAt` DESC | `getRecipesByUsers`, the Following filter (RL-021): `createdBy.uid in` a 30-uid chunk, `orderBy createdAt desc`, `limit 50` |
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
**current Terms acceptance** (`acceptedTerms()`, RL-047, one extra document read), and
stamping your own uid as `createdBy.uid`, with both counters starting at zero. Updates are
allowed only in three exact shapes: a `viewCount` +1 by anyone, a `favoriteCount` ±1 by a
verified user, or a verified owner update that changes anything *except* `createdBy.uid` and `createdAt`.
Delete needs a verified owner. Recipes published anonymously before the 2026-08-10 gate can
no longer be edited or deleted by their anonymous owner; RL-042 wipes them. Since RL-023 the
client attempts the cloud delete only for users with `emailVerified`, which matches the rule.
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

**suggestions**: any user **with a verified email and a current Terms acceptance** (RL-047)
may create one for someone else's recipe, and it must be stamped with their own uid and `status: 'pending'`. Its `recipeOwnerId` must
match the recipe's `createdBy.uid`, checked with a `get()` on the recipe, so each create costs
two extra document reads (the recipe, and the `termsAcceptance` document for `acceptedTerms()`); a wrong owner would leave a suggestion nobody can review or delete.
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
`get()` on the parent, so a reply costs 2 document reads by the rules comment's count, now 3
with the sender's `termsAcceptance` read), only with your own `fromUid`, with a verified email
and a current Terms acceptance (RL-047), and immutable once sent. Replies stay allowed after approval or rejection on purpose.
Readable by the same two parties, with a verified email, checked with the same `get()` on
the parent, so opening a thread costs one extra document read on top of its messages.

**notifications** — the *acting* user writes the notification and the recipient reads it.
Every write needs a verified email. Creation requires your own `fromUid` and `read: false`,
and only the keys `recipientUid`, `type`, `recipeId`, `recipeTitle`, `recipeEmoji`, `fromUid`,
`fromDisplayName`, `message`, `read`, `createdAt` (any may be absent, which `follow` needs).
`type` must be one of the six: `favorite` and `follow` require `message` null; the four
suggestion types allow null or a string of at most 500 characters, counted as UTF-16 units
(an emoji is two). Suggestions and replies have no cap of their own, so the client cuts the
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

**rateLimits** — closed to everyone.

### Known rules limitation

`migrateFirestoreUid` (`services/firestore.ts`) tries to reassign recipes from an anonymous
uid to an email uid after account upgrade. The rules correctly forbid it: `isOwnerUpdate()`
requires `createdBy.uid` to be unchanged, and no client-side rule could safely allow the
reassignment. **Every** step of that migration is denied for the same reason, not just the
recipes one — deleting the old favourite needs `resource.data.uid == request.auth.uid`,
re-pointing a notification needs `recipientUid == request.auth.uid`, deleting the old profile
needs to own it, and un-writing a follow needs to be its follower. All read the *old* uid,
which the caller no longer is. So the function short-circuits after the recipes step rather
than generating a burst of permission-denied noise for nothing.

It no longer fails silently: it returns a `UidMigrationOutcome` with a count of recipes left
behind (reads are open, so the count is reliable even when the writes are not), and
`AuthContext` records it for the stranded-identity notice. 4.2 is the real fix and needs the
Admin SDK; the notice is the permanent answer until then.

## Counter integrity

`favoriteCount`, `viewCount`, `followerCount`, and `followingCount` are denormalised
counters maintained with `increment()`. Rules constrain foreign writes to exact ±1 bumps,
which is the strongest guarantee available without a server. They can still drift if a
client dies between a batch's two halves. Nothing reconciles them; treat them as approximate
and never as the source of truth for a decision.
