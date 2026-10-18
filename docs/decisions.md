# Decisions

Why the app is the way it is, and what was tried and rejected. The most expensive knowledge
in the repo: current state is recoverable from the code, reasoning is not.

Format: what was decided, when, and the consequence that makes it load-bearing. If you want
to reverse one, the "consequence" line is what you are signing up to pay.

---

## Product decisions (2026-07-31)

Six open questions answered by the author. These are standing constraints, not preferences.

### 1. Audience: a private circle

**Superseded 2026-10-14** by "Anonymous accounts are local-bookmark only" below. The
original text stays for the record.

Invite-only, not a public community.

Consequences: reporting and moderation tooling **cut**; browse-by-cuisine chips demoted to
optional; the abuse trigger for a server-side proxy made unlikely. And one new obligation:
the circle is not enforced anywhere today. `firestore.rules` has `allow read: if true` on
every recipe and publishing requires only `signedIn()`, with anonymous auth one tap away —
so any visitor can put a recipe in front of the whole circle. Roadmap 1.6 fixes that in
rules, and it is a **hard gate on the first invite**. Until it lands, the shared library is
world-writable, because it is.

### 1a. Anonymous accounts are local-bookmark only (2026-10-14, supersedes 1)

The author, 2026-10-14: "For anything anonymous, let's make it easy and say that anon
accounts can ONLY save a bookmark locally, nothing else. I am the only current user, so
anything we push new will be the standard, we can wipe all previous data."

This replaces the consume/contribute split that decision 1 led to (deployed 2026-08-10),
under which anonymous accounts could still favourite, follow, write notifications and keep
a profile in the cloud.

Consequences: anonymous accounts hold local bookmarks only, and every cloud action needs a
verified email. In `firestore.rules` every client write takes `verified()` (RL-040), with
two exemptions that are not user actions: the recipe `viewCount` +1, which signed-out
visitors still make, and `clientErrors` reports. Read rules are unchanged by this decision.
The client stops attempting the writes an anonymous user can no longer make (RL-041, same
release, before RL-022 deploys the rules). Existing data, including recipes published
anonymously before the 2026-08-10 gate, is wiped (RL-042), which is why `isOwnerUpdate` and
recipe delete no longer stay on `signedIn()` for pre-gate owners.

### 1b. A verified user's own recipes live in the cloud (2026-10-18)

The author, 2026-10-18: "the behaviour needs to change where they're stored. Recipes should
be stored in the cloud and retrieved from the cloud on every device so it's always the same.
If this clashes with our previous logic, go with cloud as the source of truth and load from
local if there's no internet connection".

Trigger: a recipe made on a phone was in Firestore and on Explore but missing from My Recipes
and the profile on a computer, because both read Dexie only.

- Firestore is the source of truth for a verified user's own recipes. Dexie is their cache and
  offline fallback.
- Creation needs a verified email (1a), so anonymous and signed-out users only keep local
  bookmarks of other people's recipes.
- Save and edit are cloud first and cached in Dexie on success. A failure is shown as an error
  with a retry. There is no offline create and no queue, because generation needs the network
  anyway (RL-082, RL-083).
- The sync overwrites from every server snapshot and removes own rows the snapshot lacks. Edits
  from two devices are last write wins, with no timestamp comparison (RL-076, wired by RL-078).
- Rows of other accounts that signed in on this device are tidied away, including rows stamped
  with uids from before the 2026-10-18 wipe. Saved copies and `'local'` rows are never touched.
- Imports are Saved copies (author, 2026-10-18): never published, and never stamped with an
  account uid of this device. A row owned by the importer or an earlier account here becomes
  `'local'` with its display name kept, so neither sync rule removes it. A file row whose id is
  already one of the user's own recipes is left as it is and counted (RL-086).
- My Recipes is to be split into Created (own, no parent) and Branched (own variations,
  including of other people's recipes), with other people's recipes only under Saved. The split
  is available in `lib/library.ts` (RL-084); the rebrand's tabs will use it, and no page does yet.
- A live listener is used although RL-043 rejected one for favourites, because "always the
  same" is the requirement and own recipes are one query.
- Synced rows take the cloud's lower-case tags, reversing the RL-059 note that Dexie keeps its
  case.
- Signing out of a verified account removes that account's own recipes from the device. They
  reload on the next sign-in (RL-085). Saved copies, `'local'` rows, other uids' rows and
  bookmarks stay. The AI conversation (`chatHistory`) is never in the cloud, so a signed-out
  account's conversations are gone from that device for good (accepted by the author, 2026-10-18). Accepted trade: after a sign-out made offline, the account's recipes are not
  on the device until it is online and signed in again.
- Imports are Saved copies, never published, and never carry the importer's or another of this
  device's account uids (RL-086).

### 2. Blaze: only if abuse appears

Stay on the Spark plan and keep the free Gemini tier.

Consequence: `RISK-1`'s ceiling (App Check plus a model-level `responseSchema`) is the
*accepted* answer, not a pending one. The Cloud Function proxy stays written and undeployed;
assume it never runs. The load-bearing part: because the server-side uid migration in Phase
4 will probably never happen, roadmap 1.3's honest notice is the **permanent** answer to the
identity-orphaning path, so its copy needs a real contact route rather than a placeholder.

*2026-10-18 (RL-032):* the notice was removed. After RL-040 an anonymous account owns no cloud
data, so nothing can be stranded; only the local carry-over of recipes and bookmarks remains.

### 3. Photos: no, text-first, permanently

Requires Firebase Storage, upload UX, and a moderation story. The base64-in-Firestore trick
that works for 128px avatars categorically does not extend to food photography — 1 MiB
document limit and read bandwidth. The product identity is AI generation plus the branching
tree.

Consequence: do **not** add a speculative `imageUrl` field to the recipe document or the Zod
schema as a hedge. An unused nullable field is a standing invitation to drift into the
decision sideways. If this ever reverses it is a phase of its own, not a field.

### 4. The merged feed was an accident, so split it

`/` used to merge every published cloud recipe with the local library. Roadmap 3.1 split
My Recipes from Explore with cursor pagination, not tabs over one source. **Landed with RL-008
(2026-10-15)** as two tabs over two stores, one source per tab: My Recipes reads Dexie, Explore
reads the paged cloud feed.

*2026-10-18: see 1b. My Recipes still reads Dexie, now filled from the cloud, and RL-084 splits it.*

Consequence: it proceeds regardless of audience size, because the 200-document read ceiling
is a correctness bug, not a scale concern.

### 5. "Clear All Data" stays local-only

Clearing removes local recipes; cloud copies survive. The control was renamed to say so, and is now labelled "Delete Recipes on This Device".

*2026-10-18: see 1b. A verified user's cleared recipes come back from the cloud (copy is RL-081).*

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

### AI path: stay as-is for now (RL-001, 2026-10-17)

Of the three options in `docs/tech-stack-review.md` (A: Blaze plus the existing Cloud
Function, B: a Cloudflare Worker proxy, C: stay as-is), the author chose C. Generation stays
client-side through Firebase AI Logic, capped by App Check and the console limit (RL-050).
Revisit before inviting anyone else; RL-014 (the proxy) stays blocked until then.

### PostHog for product analytics, replacing GA4 (RL-053, 2026-10-17)

Decided 2026-10-14: PostHog replaces GA4, which RL-058 removed. On 2026-10-17 the author
created the project and approved `posthog-js` as a client dependency. It loads only after
analytics consent. The author accepted PostHog's default project settings while they are the
only user. The project is on PostHog US Cloud with PostHog's default retention.
The `clientErrors` beacon above stays; PostHog exception capture is an addition behind consent.

### Ownership as a snapshot, not a join

Every recipe carries `createdBy: { uid, displayName }` stamped at creation, and
`lib/ownership.ts` is the single decision point. Two fallbacks are intentional: `uid ===
'local'` (recipes predating auth, backfilled by Dexie migration v2) and Firebase not being
configured at all both mean "treat the user as owner".

Consequence: a display name in a recipe can go stale relative to the profile. Accepted —
the alternative is a lookup per card.

### Teaching the tree, and when not to (2026-08-07)

The branching tree is the product's identity, and nothing taught it. The library welcome panel
(welcome card removed with RL-008) described it in prose, which the people who most need it skip, and `Create Variation` sat on every
recipe with no hint that it produces a child rather than editing the recipe in front of you. A user
could work through the whole app and never discover the feature it exists for.

Three timing rules, each chosen against a plausible alternative:

- **Not on the first recipe.** On the first one the user is still working out what the page is, and
  a lecture about versioning something they have not decided they like yet is noise. It waits for
  the second.
- **Not on a variation.** A variation is already a working example of the idea, with its lineage
  breadcrumb and parent preview visible. An abstract explainer beside a live example is worse than
  the example alone.
- **Once, with no "remind me later".** Either the idea landed or it did not; re-showing it is
  nagging. Rejected a persistent help affordance for the same reason the app has no tour.

The diagram reuses the real version tree's own borders (`border-l-2 border-border`, `ml-3 pl-3`)
so that recognising it later on `/recipe/:id/tree` is the point rather than a coincidence. It shows
a grandchild, because depth is exactly the part prose fails to convey.

Rejected an interactive tour and a modal: a modal on arrival is the thing everyone dismisses
unread, and a tour is a lot of machinery for one idea.

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

### The upgrade favourites push is sequential, skip-and-count (RL-034, 2026-10-15)

When an anonymous account adds an email, its local bookmarks are pushed as one batch per
bookmark, one batch at a time, each bounded at 5 seconds. A failed batch is skipped and counted,
never retried, and the run reports once as `favorites-upgrade`. Sequential rather than
`Promise.all` so a long list cannot open dozens of concurrent writes on a phone; no retry
because the common failures (favourite already exists, recipe never published) are permanent
and the rules already make a repeat harmless. The push leaves Dexie alone, so nothing is
lost; the upgrade itself moves rows to the new uid on the existing-account path, inside one
transaction, before the push. Skips are reported only on the linked path, where every row is
new; an existing account may already hold some favourites in the cloud, which the rules deny
as updates, so its skips are logged to the console rather than reported.

### Terms acceptance is private, rules-enforced, and blocking on a change (RL-047, 2026-10-15)

Author decisions of 2026-10-14: acceptance is private, enforcement is by rules, and a changed
version blocks with a minimal dialog where declining signs out.

**Where.** `termsAcceptance/{uid}`, owner-only read, with `version`, `acceptedAt` and
`recordedAt`. Not on the public profile, and nothing in analytics carries it. Only the latest
acceptance is kept.

**How it gets there.** Acceptance is given on a form but can only be recorded once the
account is verified, which happens when the link is opened, possibly after a reload or on
another device. So the form stores `{ version, acceptedAt, email }` in local storage just
before it sends the link (stored first because the link can be opened before the send
promise settles), and `AuthContext` writes it once the account is verified. The entry is
bound to the address it was ticked for (trimmed, lower-cased) and is only used when the
verified user's email matches, case-insensitively. Otherwise person A's tick on a shared
device, with a send that failed or a link never opened, would be silently recorded for
person B's account with A's time. A mismatched or email-less entry (the first version of
this code wrote none) is ignored and the dialog shows. The entry is also cleared when the
send fails, on sign-out and on Decline. The cross-device "needs
email" prompt carries the same box, so a link opened elsewhere still has an entry when the
user confirms their address.

**Order.** The check fits the email-link order of operations above: it runs after
`completeEmailSignIn` has returned (so after `authStateReady()` and the link itself) and
before `ensureProfile` and the RL-034 favourites push on both upgrade paths, and before
`ensureProfile` on an ordinary verified sign-in. On the existing-account path it also runs
before the uid migration. One check per uid per session, shared by `onAuthStateChanged` and the
link completion, so the existing-account path writes once. The profile is still ensured when
the dialog is shown instead: profile writes are not guarded, and holding them back would
change the RL-041 behaviour for no gain.

**Enforcement.** `acceptedTerms()` guards recipe, suggestion and message creates only, the
writes that put new content in front of other people. One extra document read each.

**A failed read is unknown, not "not accepted".** The rules and the client ship separately.
With the client live before the rules, the read and write of `termsAcceptance` match no rule
and are denied. Had a denied read shown the dialog, its Accept would be denied too: a
blocking dialog nobody can satisfy. So a failed read (denied, offline, slower than 5 s, anything)
reports `terms-check` at most once per session and lets the user continue; the rules still stop a contributing write if the
acceptance is really missing. Only a successful read of a missing document or an older
version leads to the write or the dialog. A failed Accept shows an inline error with Retry,
and Decline (sign out) is never disabled, not even while Accept is in flight. Each read and
write is bounded at 5 seconds so offline Firestore cannot hang the dialog.

A failed read is not cached. The per-uid "already checked" promise is dropped when the read
fails, and the `online` event and the tab becoming visible again each recheck, at most three
times per session, so a user who was offline at load or signed in before the rules deployed
is asked once the answer can be known, rather than left blocked by the rules with no dialog
for the rest of the session.

**The dialog stays off the policy pages.** Its links open `/terms`, `/privacy` and `/cookies`
in a new tab, which loads the whole app; a modal over them would hide the text the user is
asked to accept, every link would loop, and Decline there would sign out every tab.
`AuthProvider` sits outside the router and cannot read its location, so it only holds the
prompt state (in a small `TermsContext`, kept apart from `AuthContextType` so the many fake
auth contexts in tests stay valid), and `TermsGate`, mounted inside `BrowserRouter`, reads
`useLocation()` and hides the dialog on those three paths. It shows as soon as the user
navigates elsewhere in that tab. Subscribing the provider to history events was the other
option; it would need patching `pushState`, which react-router does not announce. Deploy order is in
[operations.md](operations.md).

**When the version changes.** `TERMS_VERSION` (the Terms' `lastUpdated`) and the rules'
`termsVersion()` literal are bumped together, guarded by a test. Every verified user then has
an old acceptance, so the next load shows the dialog; contributing fails until they accept.
Existing verified accounts from before RL-047 have no document at all and get the same dialog
on their next load. Escape does not dismiss it. Anonymous accounts are never asked: they
cannot contribute anyway (decision 1a).

### Suggestions and replies are rate-limited in the rules alone (RL-048, 2026-10-15)

**Why the rules.** Product decision 2 keeps the project on Spark with no Cloud Functions, so a
per-user limit has to be something the rules can prove on their own. The existing
`rateLimits/{uid}` collection stays closed: it is reserved for the undeployed Cloud Function,
and opening it to clients would let a user reset that quota.

**The pattern.** One document per user per action, `writeWindows/{uid}_{action}`, holding
`windowStart`, `count`, `at` and `last`. The client writes the suggestion or message and the
window in one transaction. The content's create rule requires `getAfter()` of the window to
show `at == request.time` and `last` equal to the content's own path, which proves the window
moved in the same request for this document and no other. `at` alone was not enough: one
bump in a batch with any number of creates passed them all (emulator-proved 2026-10-15, found
in review). Deriving the content id from the count was the other option; it does not work
for replies, because the same id is free again under every other thread, and on a reset the
client cannot know the server's `windowStart` to make ids unique across windows; the window's own
rule only lets it open with `count == 1`, start a new window after the old one has expired by
server time, or add exactly one up to the cap. A delete would reset the limit, so there is
none. Read is decided from the document id, not `resource.data`, because the first read of a
window is of a document that does not exist (RL-026).

**Caps.** Suggestions 10 per hour, replies 30 per hour (groomer's choice; messaging abuse is
the author's stated concern, and these two are what produce notifications). One number in
two places: `suggestionCap()`, `replyCap()` and `windowMs()` in the rules and the constants
in `src/lib/rateLimit.ts`, held together by a test that reads the rules file.

**Clock skew.** The client decides with its own clock and the rules with `request.time`. A
client that is fast would try to reset early and be denied for a reason the user cannot
see, so the client resets only once the window has been over for `RESET_MARGIN_MS` (60 s)
more; until then it keeps incrementing, which the rules accept while the count is within the
cap. A slow client clock only makes the user wait a little longer than an hour. A window
whose `windowStart` is in the future counts as open. A client clock more than a minute fast
can see a reset denied, which surfaces as the generic failure.

**Offline.** A transaction is not queued offline the way `addDoc` was. A suggestion or reply
made offline now fails within 5 seconds with the existing generic message instead of
appearing to send and landing later. The 5 s bound uses the same rejecting timer as the
Terms calls (`rejectAfter`), not `withTimeout`, because `withTimeout` resolves a fallback
and would swallow the `RateLimitedError` that must reach the UI. A timed-out transaction
may still commit later; the user then sees a failure for a write that landed, and resending
counts twice. The `last` binding does not change that: a resend is a new transaction that
reads the window afresh and gets a new document id. What is safe is a replay of the same
commit, which fails on the existing document (emulator: 409 ALREADY_EXISTS), and two
in-flight transactions on one window, which Firestore's read preconditions serialise.

**Detection.** Each limited attempt is reported once as `rate-limited-suggestion` or
`rate-limited-reply` in `clientErrors`, with the uid, which is the abuse signal RL-050 reads.

**Deploy order.** Unlike RL-047, both orders break something for a short gap, and there is
deliberately no client fallback to the old plain write; see [operations.md](operations.md)
and the pending entry in `backlog/DECISIONS.md`.

### Notifications and recipe creates join the rules-only limits (RL-049, 2026-10-15)

Same `writeWindows` pattern as RL-048, with two more actions: `notification` (60 per hour
per sender) and `recipe` (30 per day, creates only). Caps are the groomer's choice.

**Per-action windows.** The recipe window is a day, so the window length is no longer one
constant. The rules take the action from the window id after the underscore (a uid has none)
and look up its cap and window in `capFor()` and `windowMsFor()`; the client holds the same
table as `RATE_LIMITS` in `src/lib/rateLimit.ts`, and the rules-text test checks every
number. The 60 s reset margin applies to every action. A user at the recipe cap waits up to
a day from the first publish of that window.

**Notifications are post-commit and silent.** Each notification is its own small
transaction (`notify()` in `services/firestore.ts`) after the favourite, follow, suggestion,
reply or review has committed, never inside that batch. Putting the window in the primary
batch would let a limited notification abort the favourite or follow. When limited, the
notification is skipped and reported once as `rate-limited-notification`; any other failure
stays silent, as the old fire-and-forget `addDoc` was. Offline, notifications are now
skipped rather than queued. No path writes two notifications in one request, so the `last`
binding (one bump admits one create) never blocks a legitimate write.

**Recipe limit scope.** Only `publishRecipe`'s create branch is limited; a re-publish is an
update and needs no window, so editing is never blocked. A limited publish throws
`RateLimitedError('recipe')` having written nothing. The transaction re-reads the recipe
first and takes the re-publish merge (no window, no counters, no `recipeCount` bump) if it
exists by then, so neither a stale existence read nor a save-time publish that landed after
its caller timed out can turn a later Share into a second create that resets the counters
or counts twice. The recipe is already in Dexie
(dual-write order), so the user loses nothing: the save toast and the Share toast say
"You've published a lot today. Try again tomorrow." Offline, a first publish now fails
instead of queueing; Share retries it.
The "already in Dexie (dual-write order)" clause is superseded by 1b and RL-082: the chat save
now publishes first and writes Dexie only on success.

*2026-10-18: see 1b. A limited save now writes nothing anywhere and the chat page says why (RL-082).*

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
beats a fraction that overstates. An eighth (⅛) is itself a drawable fraction, so half a
teaspoon scaled to a quarter of the servings reads ⅛, not ¼.

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

*2026-10-18: see 1b. Edits are cloud first (RL-083); an edit still never creates a cloud copy.*

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

Consequence: a dropped notification is invisible, whether the network failed or the rules
denied it. Since RL-015 the rules also deny a notification with an extra key, an unknown
`type`, or a message that is too long. Roadmap 1.2's beacon is what would make either visible.

Because a denial is silent, the 500-unit message cap is matched in the client, not left to
the rule alone: `truncateNotificationMessage` (`src/lib/notifications.ts`) cuts the
notification copy with a trailing ellipsis. Without it, a long suggestion or reply would
lose its notification, since suggestions and replies are deliberately uncapped. The rules'
`size()` counts UTF-16 code units (an emoji is two), so the helper counts `.length` too.

### Counters are denormalised and approximate

Rules constrain foreign writes to exact ±1 bumps, which is the strongest guarantee available
without a server. They can still drift if a client dies mid-batch, and nothing reconciles
them. Never use a counter as the source of truth for a decision.

### View counts are raw, not unique

A uniqueness scheme needs per-viewer state for a vanity metric. Raw increments are
rules-constrained and honest enough.

### Security rules on a `list` never see document data (measured 2026-08-11)

Worth writing down because it is counter-intuitive, it costs real time to re-derive, and it
already sent one investigation after a corrupt document that did not exist (FUN-20).

A query is authorised against **its constraints**, not against the documents it returns. If
the rule cannot be proven from the `where` clauses, the query is rejected whole; if it can,
every matching document comes back without its own fields being checked. Measured against
the emulator: a `follows` document missing `followerId` -- the first field the read rule
dereferences -- is returned by `where('followingId','==',uid)` with no error at all, while an
unfiltered `list` on the same collection fails with `Property followerId is undefined` even
when every document is well-formed.

Two consequences. A malformed document cannot poison a filtered query, so rule-level
defensiveness buys nothing for `list`. And a `Property X is undefined` error on a `list` is a
statement about the query's shape, never about the data -- the fix is to constrain the query,
not to hunt for a bad document.

Single-document `get` is the opposite: `resource.data` is bound to the real document, so a
missing field genuinely does raise an evaluation error there. That is the only place the
`resource.data.get('field', default)` form changes an outcome, and it is why the codebase
prefers that form in a disjunction (see `verified()` and the `follows` read rule in
`firestore.rules`). RL-026 is a consequence: `isFollowing` and `isCloudFavorite` became filtered
queries because a `getDoc` of a missing document is denied.

RL-018 is a second live example: the `suggestions` read rule in `firestore.rules` checks
`recipeOwnerId` or `suggestedBy.uid` against the caller, so `subscribeRecipeSuggestions` in
`src/services/firestore.ts` must filter on exactly that field, and a query by `recipeId`
alone is denied whole, even for the owner.

### Development is an autonomous agent loop between two human touchpoints (2026-10-13)

The author sets direction (`ROADMAP.md`, approving each grooming run) and does QA before
anything goes live. Everything between is agents: `/groom` writes tickets, `/next-ticket`
implements, reviews, gates and merges one at a time, `/qa-pass` prepares the checklist,
`/release` ships. Full contract in [agent-workflow.md](agent-workflow.md).

Decisions taken in setting it up, each cheap to overrule:

- **Tickets live in the repo** (`backlog/tickets/`, one file each), not in an issue
  tracker. Same reasoning as the docs: reviewed and closed in the pull request that
  implements them, offline, no second system. Parallel sessions claim work by pushing a
  `ticket/<ID>` branch, so git is the lock. Rejected GitHub Issues (fine, but needs API
  access from every session and splits the spec from the code) and Jira (the author has
  used it elsewhere; too heavy for a solo hobby project).
- **Models are pinned per role.** Sonnet orchestrates and reviews, Haiku looks things up,
  Opus grooms and takes `hard` tickets, Fable only for the roadmap. Escalation is
  mechanical (two gate failures promote one tier, once). Rejected running everything on
  the most capable model: grooming is where capability pays, implementation mostly is
  not, and the loop's cost per ticket is the thing that decides whether it runs at all.
- **Reversible decisions are taken and logged; irreversible ones stop the ticket.** The
  list of irreversible things is in `backlog/README.md`. This is what makes the loop
  safe to leave unattended; widening the list is always allowed, narrowing it is the
  author's call.
- **`main` is integration, not live.** Agents auto-merge green pull requests; live is
  whatever `/release` last deployed. Rejected deploying from CI on merge, because the QA
  pass is the point.
- **`AUDIT.md` is retired as a backlog** and `/audit-next` removed. Two queues with two
  pickers was one too many; its open findings became tickets and its fix notes stay as
  history.

Consequence: a ticket that a human never approved at grooming never runs. If the loop is
idle, the fix is `/groom`, not a looser rule.

### Suggestion approval writes the collaborator first (RL-017, 2026-10-14)

Approval adds the suggester to `collaborators`, then writes `status: 'approved'`, then
notifies. The old order wrote status and notified first, so a failed collaborator write
left a suggestion marked approved with no collaborator and a suggester told otherwise.
A retry after the collaborator write succeeded but the status write failed is safe,
because `arrayUnion` of the same object is idempotent. In the same change the create rule
checks `recipeOwnerId` against the recipe's `createdBy.uid` with a `get()`; one extra read
per suggestion create is the accepted cost, since a wrong owner otherwise leaves a
suggestion nobody can review and, with delete forbidden, nobody can remove.

### Recipe delete waits for the cloud and reports what remains (RL-023, 2026-10-14)

Since RL-080 a verified owner's delete runs the cloud delete first and removes the local
subtree only once the cloud reports no failures. The original RL-023 order (local first,
then the cloud) stopped being safe with 1b: a recipe left in the cloud is synced straight
back into Dexie by the RL-078 listener, so a recipe the user thought was gone would come
back. The local subtree ids are read first (`getSubtreeIds`) and passed to the cloud delete
so variations the cloud tree query misses are still attempted. The delete waits for the
cloud instead of firing it and forgetting it. Descendants owned by other users are skipped
rather than counted as failed: the rules deny them by design, and removing them needs a
Cloud Function. Ids the tree query did not return are read first, and a missing doc
(never published, or removed by an earlier attempt) is skipped: the rules deny deleting a
nonexistent doc, which would otherwise be a failure "Try again" could never clear. The
wait is bounded at 10 seconds; a timeout counts as a failure, and because the real count
is unknown the dialog then states no number.
On failure nothing is removed from the device, and the page shows "Couldn't delete this
recipe" with "Try again" (same ids) and "Cancel" (stay on the recipe). RL-023's "Leave
anyway" is gone: under the old order it left published copies behind, and under the new one
it would have left a recipe that syncs back. Both replace the old silent `.catch(() => {})`
that left recipes public at `/shared/:id` with no local handle. If the local delete fails
after a successful cloud delete, the error is logged and the RL-078 sync removes the rows.
There is no background retry queue; that was out of scope. The cloud delete is attempted
only for a user with `emailVerified`, per the ticket and RL-040, since nobody else can
publish under the current rules.

*2026-10-18: see 1b. The order is reversed, cloud first, by RL-080 (described above).*

### Recipe writes are bounded in time and size (RL-016, 2026-10-14)

A recipe create needs an integer `createdAt` no more than 60 seconds ahead of server time,
and an owner update may not change `createdAt`. Both need `title` at most 200 characters
and `ingredients` and `instructions` at most 100 entries each. The feed is
`orderBy('createdAt', 'desc')`, so an unbounded `createdAt` would pin a recipe to the top
of everyone's feed, and an oversized document is read on every first paint. Only the upper
bound is enforced: imports keep their original `createdAt`, so past dates stay allowed.
The caps are generous against every generated recipe seen so far and are named in a
comment above the recipe rules so RL-036 can mirror them on the client. The accepted
consequence: a client clock more than a minute fast cannot publish.

### Tech stack: Firebase stays, the AI path moves behind a proxy (proposed 2026-10-13)

Not yet a decision. [tech-stack-review.md](tech-stack-review.md) argues for keeping
Firebase Hosting, Auth and Firestore (free at this scale, hard-stop quotas, the most
verified code in the repo) and changing only the generation transport: a proxy holding
the key, a per-user quota, and a configurable model, preferably on a Cloudflare Worker
calling Claude Haiku 5.5 so Firebase stays on Spark. The author's decision is RL-001; the
consequence is recorded here once taken. The review's numbers are flagged as unverified
where the official pages could not be loaded from the agent sandbox.

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

### PWA update policy: prompt, never auto-update (RL-007)

`registerType: 'prompt'`: a waiting worker shows an "Update available" bar and activates only on
Reload. Auto-update would swap bundles under a user mid-recipe or mid-generation. The
navigation fallback to `index.html` denylists `/__/` (Firebase Auth handler), `/api/` and any
underscore-prefixed path, so auth redirects reach Firebase Hosting. There is no runtime caching: Firestore, Auth
and AI traffic always go to the network. Email-link sign-in lands on `/` with query params,
which the fallback correctly serves as the app.

The plugin is a devDependency, but its `virtual:pwa-register` module and `workbox-window` ship in the
client bundle: the author approved `vite-plugin-pwa` at /groom and the prompt-based update bar cannot
work without them. Hand-rolling registration and a service worker would avoid the library but lose
precache manifest generation.

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

### Existence lookups for follows and favourites are filtered queries, not getDoc (RL-026)

The read rules for `follows` and `favorites` dereference `resource.data`, so a `getDoc` of a
missing document, the normal not-following case, is denied (403, emulator-verified
2026-10-15) instead of returning not-exists. Reporting lookup failures would then beacon a
false error on most page views, and swallowing permission-denied would hide real denials.
`isFollowing` and `isCloudFavorite` therefore query with equality filters the rules can
prove and `limit(1)`: a missing document is an empty result and every real failure still
rejects and is reported. Rejected: treating permission-denied as "not following" in the hook.

### Cloud favourites hydrate once per session, add-only (RL-043)

A verified account's cloud favourites are read once per session per uid with one
`where('uid','==',uid)` query and only the missing rows are added to Dexie. Nothing local is
deleted or overwritten, there is no live listener, and removals on another device do not
propagate (no deletion sync). A favourite removed on this device in the session is skipped.
The trigger lives in `hooks/useFavorites.ts` (`useFavoriteIds` and `useFavorite`), guarded
by a module-level uid set, not in `AuthContext`, so it runs where favourites are shown and
`AuthContext` stays as it was. Rejected for now: an `onSnapshot` listener (a standing read
per session for a rarely changing list), a deletion sync (needs tombstones, so a Dexie schema
change), and running it next to the RL-034 push in `AuthContext`. An assistant's call, cheap
to overrule.

*2026-10-18: own recipes use a live listener, see 1b.*


### Policy sign-off for solo testing (RL-046, 2026-10-18)

The author signed off the Terms, Privacy and Cookie policies as drafts for testing by the operator and a few invited people. Terms `TERMS_VERSION` is `2026-10-17` (unchanged); Privacy and Cookie are dated `2026-10-18`. The draft notice stays on every page and a lawyer review is still advised before a public launch.

Answers recorded: the request log rests on legitimate interests (not legal obligation); the policy states plainly that the operator accesses data from Australia, which has no EU or UK adequacy decision, and claims no further transfer mechanism; PostHog is on the free plan (one year retention) and its key stays unset for the first release; reCAPTCHA, Hosting log and Gemini wording is deliberately cautious (reCAPTCHA cookie `_GRECAPTCHA` about six months from third-party listings, Hosting logs up to 30 days "may keep", Gemini free tier). Testers are invited from outside the EEA, Switzerland and the UK only while the Gemini free tier is in use, because Google's terms allow only the paid tier for those regions.


### Organic theme adopted (RL-062, 2026-10-18)

The Organic rebrand (`docs/design/organic/`) is applied by repointing the semantic tokens (`surface*`, `text-*`, `border*`, `primary-*`) in `src/index.css`, not by rewriting components, so about 28 files change colour with no edit. `primary-600`, the fill and link shade, is accent-700 `#8c491a` rather than the accent swatch, because cream on `#c67139` is 3.03:1 and AA needs 4.5:1 (accent-700 gives 5.72:1). Fonts are self-hosted under `public/fonts/` instead of loaded from Google Fonts, because a request to a Google host sends every visitor's IP to a third party the privacy policy does not list and would reopen the RL-046 sign-off. Tailwind's own radii and spacing are deliberately not overridden (it would resize 18 `rounded-sm/md/lg` uses and every spacing utility); `rounded-card` (32px) is added instead. The `.dark` block is untouched until RL-065.

Note 2026-10-18: RL-063 also restyles shape and type inside the shared primitives (Button, Chip, TagList, SegmentedControl, Input, ConfirmDialog, Skeleton, EmptyState, TopBar), so "not by rewriting components" applies to colour only.


### Light only until a dark Organic exists (RL-065, 2026-10-18)

The app is light only. The Theme control is removed from Settings and `useTheme` always removes the `dark` class, so an OS in dark mode changes nothing; `index.html` keeps one `theme-color` of `#f5ead8` with no media query. The stored preference is kept (`getTheme`/`setTheme` unchanged) so restoring dark needs no migration, and the roughly 66 `dark:` classes stay as inert structure (the `dark` variant is class-based, `.dark, .dark *`, so with the class never applied none fire). New UI writes no `dark:` classes. Rejected: a temporary dark Organic mapping, which would be a second palette to design and test and then discard when the real dark design lands (brief ticket 8). The author's call.
