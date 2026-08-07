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

Project `recipe-lab-3832b` (`.firebaserc`). Seven top-level collections plus one
subcollection. Recipe documents use the same UUID as the IndexedDB row, which is what makes
the dual store addressable by one id.

| Collection | Document id | Shape | Notes |
|---|---|---|---|
| `recipes/{recipeId}` | recipe UUID | `SharedRecipe` (`lib/share.ts`) plus `favoriteCount`, `viewCount`, `collaborators`, `createdAt` | The published feed. Read by anyone, signed in or not. |
| `favorites/{uid}_{recipeId}` | composite | `{ uid, recipeId, createdAt }` | Global favourite records. Existence drives the owner's notification. |
| `suggestions/{autoId}` | auto | `Suggestion` (`types/social.ts`) | `status: pending \| approved \| rejected`, `recipeOwnerId` denormalised so rules can check ownership without a lookup. |
| `suggestions/{id}/messages/{autoId}` | auto | `SuggestionMessage` | The reply thread. A subcollection rather than an array on the parent, so the parent's owner-only, status-only update rule stays intact. |
| `notifications/{autoId}` | auto | `AppNotification` | Six types (see [capabilities.md](capabilities.md)). `recipeId`/`recipeTitle`/`recipeEmoji` are optional because `follow` is about a person, not a recipe. |
| `profiles/{uid}` | user uid | `UserProfile` (`types/profile.ts`) | Public read. Holds avatar settings and the three counters. Uploaded avatars live here as base64 JPEG. |
| `follows/{followerId}_{followingId}` | composite | `Follow` | Readable only by the two parties. |
| `clientErrors/{autoId}` | auto | `ErrorReport` plus `uid`, `receivedAt`, `userAgent` | Write-only drop box for the error beacon. Creatable by **anyone, including signed-out visitors**, because a failure during sign-in is exactly the kind that was invisible. No client read, update or delete. Shape is constrained in rules (known keys only, typed, length-capped) because it is an unauthenticated write path. |
| `rateLimits/{uid}` | user uid | fixed-window counter | Written **only** by the undeployed `generateRecipe` Cloud Function via the Admin SDK, which bypasses rules. Closed to clients entirely, which is what stops a user resetting their own quota. |

### Composite indexes

Both live in `firestore.indexes.json`; each exists for exactly one query.

| Index | Needed by |
|---|---|
| `notifications`: `recipientUid` ASC, `createdAt` DESC | the notification bell's `onSnapshot` subscription |
| `suggestions`: `recipeId` ASC, `createdAt` DESC | `subscribeRecipeSuggestions` on the detail page |

Missing an index shows up as a Firestore error containing a console link that creates it —
but create it *here* and deploy, not in the console, or it exists in production and not in
the repo.

### What the rules permit, in plain language

`firestore.rules` is the security boundary; the client-side ownership check is UI polish.
The full ruleset is commented — this is the summary.

**recipes** — anyone may read, including signed-out visitors, deliberately: the library feed
and shared links work without an account. Publishing requires being signed in and stamping
your own uid as `createdBy.uid`, with both counters starting at zero. Updates are allowed
only in three exact shapes: a `viewCount` +1 by anyone, a `favoriteCount` ±1 by any signed-in
user, or an owner update that changes anything *except* `createdBy.uid`. Deleting requires
being the owner.

**favorites** — you may read, create, and delete only your own, and the document id must
match `{your uid}_{recipeId}`. No updates.

**suggestions** — any signed-in user may create one for someone else's recipe, and it must
be stamped with their own uid and `status: 'pending'`. Only the recipe owner may update, and
only the `status` field, and only to `approved` or `rejected`. Deletion is forbidden
outright, which is why testing suggestions against the live project leaves permanent
records — use the emulator (see [operations.md](operations.md)). Reads are any-signed-in
because the client subscribes by `recipeId` alone; tightening that needs a query change
first.

**suggestions/{id}/messages** — creatable only by the two participants (checked with a
`get()` on the parent, so a reply costs 2 document reads), only with your own `fromUid`, and
immutable once sent. Replies stay allowed after approval or rejection on purpose.

**notifications** — the *acting* user writes the notification and the recipient reads it.
Creation requires your own `fromUid` and `read: false`. The recipient may flip `read` and
nothing else, and may delete.

**profiles** — public read. You own your document. Anyone else may change exactly one thing:
a `followerCount` ±1 bump.

**follows** — readable by the follower or the followed. The follower creates and deletes,
and the id must be `{their uid}_{followingId}`. No updates.

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
