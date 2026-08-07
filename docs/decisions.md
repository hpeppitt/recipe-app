# Decisions

Why the app is the way it is, and what was tried and rejected. The most expensive knowledge
in the repo: current state is recoverable from the code, reasoning is not.

Format: what was decided, when, and the consequence that makes it load-bearing. If you want
to reverse one, the "consequence" line is what you are signing up to pay.

---

## Product decisions (2026-07-31)

Six open questions answered by the author. These are standing constraints, not preferences.

### 1. Audience: a private circle

Invite-only, not a public community.

Consequences: reporting and moderation tooling **cut**; browse-by-cuisine chips demoted to
optional; the abuse trigger for a server-side proxy made unlikely. And one new obligation:
the circle is not enforced anywhere today. `firestore.rules` has `allow read: if true` on
every recipe and publishing requires only `signedIn()`, with anonymous auth one tap away —
so any visitor can put a recipe in front of the whole circle. Roadmap 1.6 fixes that in
rules, and it is a **hard gate on the first invite**. Until it lands, the shared library is
world-writable, because it is.

### 2. Blaze: only if abuse appears

Stay on the Spark plan and keep the free Gemini tier.

Consequence: `RISK-1`'s ceiling (App Check plus a model-level `responseSchema`) is the
*accepted* answer, not a pending one. The Cloud Function proxy stays written and undeployed;
assume it never runs. The load-bearing part: because the server-side uid migration in Phase
4 will probably never happen, roadmap 1.3's honest notice is the **permanent** answer to the
identity-orphaning path, so its copy needs a real contact route rather than a placeholder.

### 3. Photos: no, text-first, permanently

Requires Firebase Storage, upload UX, and a moderation story. The base64-in-Firestore trick
that works for 128px avatars categorically does not extend to food photography — 1 MiB
document limit and read bandwidth. The product identity is AI generation plus the branching
tree.

Consequence: do **not** add a speculative `imageUrl` field to the recipe document or the Zod
schema as a hedge. An unused nullable field is a standing invitation to drift into the
decision sideways. If this ever reverses it is a phase of its own, not a field.

### 4. The merged feed was an accident, so split it

`/` currently merges every published cloud recipe with the local library. Roadmap 3.1 splits
My Recipes from Explore with cursor pagination, not tabs over one source.

Consequence: it proceeds regardless of audience size, because the 200-document read ceiling
is a correctness bug, not a scale concern.

### 5. "Clear All Data" stays local-only

Clearing removes local recipes; cloud copies survive. The control was renamed to say so.

Trade accepted with open eyes: a member who wants to withdraw published recipes must delete
them individually, and there is no bulk exit. The honest version of that feature is
account deletion, which is server-side work — it must clean up favourites, suggestions,
notifications, and follows inside *other users'* documents, which client rules correctly
forbid.

### 6. Local-only favourites stay hidden

A synthetic device uid would orphan every favourite on sign-in with no migration path, and
local-only mode already cannot generate recipes, so it is honestly a viewer and importer
rather than a degraded full experience. The hidden control is the correct answer, not a
deferred one.

---

## Architectural decisions

### Firebase AI Logic instead of a direct Gemini call (2026-07-28)

Generation goes through a Google-hosted proxy that holds the API key server-side. The app
previously asked each user for their own key and stored it in localStorage, which made
`getApiKey()` the gate on the entire create flow; both functions were removed.

Consequences: the browser never sees a key, App Check is enforceable on the AI path, and
there is deliberately **no** Gemini env var — `VITE_*` values are inlined into the bundle at
build time, so a key there would be published. The cost is that generation now requires
Firebase at all: local-only mode cannot generate, and the composer is disabled with a
notice.

### Client-side prompt construction, accepted (RISK-1, 2026-07-28)

The browser builds the request, so the system instruction ships in the bundle and someone
running the app can send arbitrary prompts against the project's Gemini quota. App Check
raises the bar — valid app attestation required — but does not remove it, and with no server
hop there is nowhere for per-account rate limiting to run.

Accepted as a deliberate trade for avoiding Blaze. Watch for unexplained quota consumption
or generations that do not look like recipes. Mitigations in order of effort: enforce
`responseSchema` on the model config (**done 2026-07-31**); constrain input to structured
fields (**rejected** — it would gut the app's best interaction to solve an abuse problem the
other two address); route through `functions/` (needs Blaze).

The schema is one object with three consumers rather than three hand-written copies: the
model config enforces it, the system prompt serialises it, and Zod re-describes it as the
trust boundary (necessarily by hand, since `zod-to-json-schema` is incompatible with Zod v4 —
a test asserts the two key sets match). Verified against the live project with two real
generations, including an ingredient with no amount or unit ("salt to taste"), which is the
nullable path a schema mismatch would most likely break.

### Firestore as its own error sink, not Sentry (planned, roadmap 1.2)

Sentry is a heavy dependency in a deliberately dependency-light app, it costs money at
exactly the moment things go wrong, and the app already owns a database. The beacon writes
capped, truncated documents to a `clientErrors` collection with create-only rules.

Consequence: the beacon call sites are the migration seam if volume ever justifies a real
provider.

### Ownership as a snapshot, not a join

Every recipe carries `createdBy: { uid, displayName }` stamped at creation, and
`lib/ownership.ts` is the single decision point. Two fallbacks are intentional: `uid ===
'local'` (recipes predating auth, backfilled by Dexie migration v2) and Firebase not being
configured at all both mean "treat the user as owner".

Consequence: a display name in a recipe can go stale relative to the profile. Accepted —
the alternative is a lookup per card.

### Email-link completion has a required order of operations (2026-08-07)

Three ordering constraints, each learned by watching it fail against the Auth emulator. Change
any of them and anonymous-account upgrade breaks silently.

**1. Wait for `authStateReady()` before reading `currentUser`.** Firebase restores the signed-in
user from IndexedDB asynchronously. `completeEmailSignIn` runs from an effect on mount, inside
that window, so `auth.currentUser` was always `null` and the `currentUser?.isAnonymous` branch
was unreachable. Every upgrade therefore created a *second* account and abandoned the anonymous
one along with everything published under it. The probe read
`{"currentUser":null,"hasLinkingEmail":true}` on every run.

**2. Check for an existing account before attempting to link, not after.** A
`linkWithCredential` that rejects with `credential-already-in-use` has still **consumed the
single-use oobCode**. There is no second attempt: retrying with `signInWithEmailLink`, or even
with the same credential object via `signInWithCredential`, fails `auth/invalid-action-code`,
so the whole collision reported itself as an expired link. Both fallbacks were tried and
observed failing. The check is `fetchSignInMethodsForEmail`, and an empty result is treated as
*probably* new rather than conclusive, because email enumeration protection makes it return `[]`
for addresses that do exist. That residual case gets its own honest `email-taken` message
instead of blaming the link.

**3. Clear the link from the URL on failure as well as success.** Only the success paths used to
do it, so a failed attempt left `oobCode` in the address bar and a reload retried a spent code,
failing again, forever. The one deliberate exception is `needs-email`, where the code is still
needed for the retry.

Consequence worth knowing: the upgrade only works when the link is opened in the **same browser**
that requested it, because that is where the anonymous session lives. Opened elsewhere there is
no anonymous session to upgrade, so the user gets a separate account. That is inherent to
passwordless links, not a bug to fix.

### Serving scaling is a display transform, and scales almost nothing (2026-07-31)

Nothing is persisted. A saved scaled copy would be duplicate-recipe pollution for a view
concern, and would put the same dish in the shared library twice at different sizes.

What deliberately does **not** scale is the interesting part:

- **Times.** Doubling a traybake does not double its roasting time. A recipe that claimed
  otherwise would be wrong in a way that ruins dinner.
- **Nutrition.** Already per serving, so invariant; scaling would double-count.
- **Instruction text.** "Divide into 12 balls" cannot be rewritten safely by arithmetic, and
  a half-rewritten method is worse than one the cook adjusts themselves. A real limit of the
  feature, stated rather than hidden.

Rounding is deliberately coarse and magnitude-dependent, because nobody measures 237.5 g.
Counts (an ingredient with no unit — eggs, onions) round to halves with a floor of ½: a small
factor producing "0 eggs" reads as "omit this ingredient". Amounts under 1 snap to the
fractions the renderer can actually draw, except below an eighth, where honest arithmetic
beats a fraction that overstates.

`RecipeContent` keys its body on the recipe id. Without that, `RecipeDetailPage` stays mounted
across a recipe-to-recipe navigation, so a scale chosen on one recipe would silently carry to
the next — showing amounts for a serving count that recipe never mentioned. Verified by
scaling a variation and then navigating to its parent.

### Edits apply in place, not as a new tree node (2026-07-31)

Manual editing writes to the same recipe id, keeping the recipe's position in the tree.
Edit-as-new-version — appending a child node per edit — was rejected: it burns the tree's
legibility on typo fixes, and the branching tree is reserved for intentional variations.

Consequences, both accepted: in-place edits are **not versioned**, so a favouriter can see a
recipe change under them (as on every recipe site); and there is deliberately no second,
hidden edit history, which would double the data model for an audit trail nobody asked for.

Two boundaries worth knowing. `draftToPatch` names its twelve content fields explicitly
rather than spreading, so an edit can never reach `createdBy`, `id`, `parentId`, `rootId`,
`depth`, `collaborators` or `chatHistory` — identity and tree position are not editable
content, and rules would reject a `createdBy` change anyway. And an edit re-publishes only
when a published copy already exists: `publishRecipe` would otherwise take its create path
and publish a recipe the user never chose to share, since editing is not a decision to
publish.

`totalTime` is derived from prep + cook rather than being a third editable field, because
three independently editable times can disagree and the app renders the total.

### Suggestion replies as a subcollection, not an array (UX-37)

`suggestions/{id}/messages` rather than a `replies` array on the parent, because the
parent's update rule is deliberately narrow: owner only, `status` only. Relaxing it to
permit an array append would also permit rewriting the suggestion body, a much wider grant
than replying needs.

Consequences: messages are immutable in rules and in UI — allowing edits would let one party
silently rewrite a thread the other has already read. Replies stay allowed after approval or
rejection, because a rejection is exactly when the suggester wants to ask why. Each rule
check does a `get()` on the parent, so sending a reply costs 2 document reads.

### Notifications are fire-and-forget

`addDoc` with `.catch(() => {})` so notification creation never slows a favourite or a
suggestion.

Consequence: a dropped notification is invisible. Roadmap 1.2's beacon is what would make it
visible.

### Counters are denormalised and approximate

Rules constrain foreign writes to exact ±1 bumps, which is the strongest guarantee available
without a server. They can still drift if a client dies mid-batch, and nothing reconciles
them. Never use a counter as the source of truth for a decision.

### View counts are raw, not unique

A uniqueness scheme needs per-viewer state for a vanity metric. Raw increments are
rules-constrained and honest enough.

---

## Rejected approaches — do not re-litigate without new evidence

### `createBrowserRouter` + `useBlocker` (attempted and reverted, 2026-07-28)

The goal was blocking browser-back and iOS swipe-back while a generated recipe is unsaved.

What was learned, so the next attempt does not repeat it:

1. The migration itself was clean — flat routes, one `AppShell` layout route, all routes
   verified rendering, `AuthProvider` can stay outside `RouterProvider`.
2. **`useBlocker` did not block.** With react-router 7.13.0 the blocker registered but its
   callback was never invoked on any POP navigation — not the swipe gesture, not
   `history.back()`, not `navigate(-1)`.
3. **Not StrictMode.** Tested by removing it; the callback still never fired. That hypothesis
   is disproven, do not re-spend time there.

Reverted because the migration's only purpose was the blocker. What shipped instead: a
sentinel history entry parked on top of the page while a recipe is unsaved. The first Back
pops the sentinel, the handler re-pushes it so the user stays put, and the discard dialog
opens; `beforeunload` covers reload and tab close. Known measured trade-off: when the guard
disarms because the recipe was *saved*, the sentinel is left behind, so Back from the new
recipe passes through `/create` twice. Two presses, no data loss.

### `zod-to-json-schema`

Incompatible with Zod v4. The JSON schema is hardcoded as a string in `lib/prompts.ts`
instead. This is also why roadmap 1.4 (translating it to the AI Logic SDK's `Schema`
builders) is fiddly rather than mechanical.

### Dexie `update()`

`ChatMessage.recipe` makes `Recipe` circular through `chatHistory`, which breaks Dexie's
update typing. Everything uses `get()` then `put()`. Keep it.

### Draft persistence for unsaved chat recipes

Confirm-on-exit was chosen deliberately. Drafts need a schema decision and a Dexie version
bump for a marginal gain over a working guard.

### Versioned edit history for in-place edits

The branching tree is the versioning story for intentional variations. A second, hidden
history for typo fixes doubles the data model for an audit trail nobody asked for.

### Full-text search (Algolia, Typesense, a search Cloud Function)

Client-side substring search plus a paged Explore is adequate below thousands of recipes,
and every option is a heavy dependency, a bill, or both. Revisit when browse chips
demonstrably fail users.

### Native apps or React Native

The PWA is the mobile bet. Nothing in the product demands app-store distribution.

### A hosted wiki for this documentation (Notion, Confluence)

Cannot be reviewed in the pull request that invalidates it, which is the only mechanism that
keeps documentation true. Generated API docs (TypeDoc) were also rejected: the valuable
knowledge here is capabilities and decisions, not type signatures the code already states.

---

## Documentation maintenance mechanism (2026-07-31)

The roadmap left this open with three candidates. Taken: **the cheapest one** — a pointer
convention in `CLAUDE.md` (no facts there that are duplicated in `docs/`) plus a `docs/`
drift-check step folded into `/preflight`, checked against the contract table in
[README.md](README.md).

Rejected for now: a dedicated `/docs-sync` skill, and a `docs-curator` subagent that reviews
a diff against `docs/` the way `ui-reviewer` reviews UI. Both are strictly better at
catching drift and both are more machinery than a five-file knowledgebase has earned on day
one. The upgrade path is clear if `/preflight`'s check proves too weak: the contract table is
already the specification a curator agent would read.

Noted as an assistant's judgement call rather than the author's, so it is cheap to overrule.
