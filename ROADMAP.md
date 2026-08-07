# Recipe Lab Roadmap

Written 2026-07-30, against commit `7448cef` (main, clean tree). Strategic layer above
`AUDIT.md`; tactical defects live there, product and architecture bets live here.

---

## 1. Ground truth

Everything below was verified against the code, the test run, or the git log on this
machine, not taken from docs.

**Backlog state.** All 78 AUDIT.md items are checked off (`grep -c '^- \[x\]'` = 78,
zero unchecked). The last three weeks of history are almost entirely audit grinding:
PR #1 (remediation), PR #2 (Firebase AI Logic migration), PR #3 (UX sweep), PR #4
(backlog clear). One accepted risk remains on the books (RISK-1, client-side prompts).

**Quality gates.** `npm test`: 153 tests, 12 files, all passing, confined to `src/db`,
`src/lib`, and two SDK-mocked `firestore.ts` suites. `npm run lint`: 0 errors,
20 warnings (mostly `react-hooks/set-state-in-effect`, deliberately demoted per INFRA-1).
No component or hook tests exist; the Vitest env is node with fake-indexeddb, no jsdom.
There is no CI; `/preflight` is a local convention and PR #4 merged with no remote check.

**Deployment state.** `firestore.rules` and indexes are deployed (SEC-1, 2026-07-27;
suggestion-thread rules deployed and emulator-verified 2026-07-30 per the UX-37 note).
The rules are genuinely good: ownership enforced, counters constrained to exact +/-1,
`rateLimits` closed to clients, reply threads modelled as a subcollection specifically to
avoid widening the parent update rule. `functions/` contains a complete, committed,
inert `generateRecipe` callable (per-uid 30/hour transactional rate limit, input caps,
server-held prompts). It has never been deployed; it needs the Blaze plan.

**AI path.** `src/services/gemini.ts` calls `gemini-3.6-flash` through Firebase AI Logic
with `GoogleAIBackend` and App Check. No `responseSchema`; JSON is prompt-requested and
repaired client-side (fence stripping, trailing-comma removal, Zod validation). I
verified externally that the Gemini Developer API backend is available on the no-cost
Spark plan, and that upgrading to Blaze converts all Gemini usage on this path to
pay-as-you-go (source: firebase.google.com/docs/ai-logic/pricing). That makes the
`functions/` escalation a real money decision, not just a plan checkbox.

**Identity.** Anonymous-to-email upgrade already uses `linkWithCredential`
(`firebase.ts:134-144`), so in the common case the uid never changes and no migration is
needed. The broken path is narrower than CLAUDE.md implies: only when the email already
belongs to another account (`auth/credential-already-in-use`) does the app fall through to
`signInWithEmailLink` plus `migrateFirestoreUid`, and that migration is denied by the
deployed rules and swallowed (`AuthContext.tsx:59`). In exactly that case, published
recipes silently stay under the orphaned anonymous uid and the user is told nothing.

**Scale posture, measured.** `getAllPublishedRecipes` reads the newest 200 recipe docs
(`firestore.ts:93-104`) on every Library load, every dedup check, and every share-feed
render; there is no pagination and no cache. The Library merges that window with the
full local Dexie set client-side (`useRecipeLibrary.ts`). The following filter chunks
`in` queries at 30 uids, limit 50 per chunk (`firestore.ts:836-845`). Avatars are
128x128 base64 JPEGs inside profile docs. View counts are raw increments constrained to
+1 by rules. Notifications subscribe to the latest 50.

**Product surface.** Nine routes, all reachable. A user today can: browse a merged
local-plus-shared feed with search and favorites/following filters, generate recipes and
variations by chat (Firebase required), view a cross-store variation tree, cook with
check-off ingredients and steps, toggle unit systems, see per-serving macro estimates,
share via Firestore link or lz-string hash, favorite, suggest changes, hold reply threads
on suggestions, follow users, manage a profile with three avatar types, and export/import
local data. What a user cannot do: edit a recipe by hand, scale servings, use the app
offline after a reload (no service worker, no manifest; `public/` holds only `vite.svg`),
or install it to a home screen. README.md is still the stock Vite template.

---

## 2. Assessment

### What is genuinely strong

- **The verification culture.** Nearly every audit fix carries a measured before/after
  (touch targets in px, contrast ratios, history-entry counts, concurrent-generation
  counts). This is a codebase whose claims can be trusted, which is rare and worth
  protecting. The roadmap below deliberately adds CI so this discipline survives
  contributors and future refactors.
- **Graceful degradation as a habit.** `withTimeout` on every Firestore path that can
  hang, cloud failure decaying to local, safe no-ops when Firebase is unconfigured. The
  local-first promise is honored in the data layer.
- **The security posture.** Deployed rules with counter constraints, server-held Gemini
  key, App Check, and a pre-written escalation path. Most side projects have none of
  these.
- **The collaboration loop is complete.** Suggest, review, reply thread, notify, prefilled
  variation. This is the app's differentiator and it now actually closes.

### Structural risks, ranked

1. **The Library conflates "my recipes" and "the whole community" in one feed, backed by
   a 200-doc full read.** Mechanism: `useRecipeLibrary` merges all local recipes with the
   newest 200 published docs and filters client-side. Trigger: either modest user growth
   (every visit costs up to 200 reads; 50 daily users is ~10k reads/day before anything
   else) or simply more than 200 published recipes, at which point older recipes silently
   fall out of the feed, search, and dedup forever. Blast radius: the entire discovery
   story and the dedup guarantee. Hurts at hundreds of recipes, not thousands.
2. **Silent identity loss on the credential-already-in-use path.** Mechanism above.
   Trigger: any anonymous user with published recipes who signs into a pre-existing email
   account. Blast radius: one user's entire published catalog orphaned, invisibly.
   Low frequency, maximal per-incident damage, and currently unobservable.
3. **RISK-1: unbounded client-side Gemini per account.** App Check gates unauthorized
   apps, not a legitimate user or script hammering the button. On Spark the failure mode
   is quota exhaustion, which is a generation outage for every user rather than a bill.
   Trigger: any public traction. Currently unwatched.
4. **Production is unmonitored.** Every hardened error path ends in `console.error` on
   the user's device. GA4 counts events but surfaces no failures. You would learn about
   an outage, a rules regression, or quota exhaustion from a user complaint, if at all.
5. **The missing server-side actor cluster.** Cross-user descendants survive tree deletes
   (FUN-3 residue), failed publishes reconcile only when someone presses Share (FUN-5
   residue), uid migration is impossible client-side. Three symptoms, one cause: no
   trusted process exists anywhere in the system. All are known, documented, and waiting
   on the same Blaze decision.
6. **Manual verification is the only UI regression net.** 153 tests cover pure logic
   only. Every one of the 78 audit fixes to pages and hooks is protected by nothing but
   the typecheck hook. Hurts the moment development velocity resumes on UI code.

### The product gap

For a cooking app, the sharpest gaps are ownership and kitchen reality, not more social
surface. A cook cannot fix "2 tbsp" that should be "2 tsp" without spending a Gemini call
and forking their own recipe into a variation. The app forgets how to load itself without
a network despite all data living in IndexedDB. There is no way to halve or double a
recipe. Discovery is a single recency feed with no browse dimension. Recipes have no
photos, which is defensible minimalism but a real adoption question. None of the social
mechanics are the bottleneck; the core object (a recipe you own, cook from, and trust) is.

### Verdict

This is a **polished private beta**, one rung above a personal tool and one below a
product. The engineering floor (rules, degradation, a11y, verified fixes) is already at
product grade, which is unusual; what is missing is product-grade **operations**(nobody
can see it break), **identity durability** (one silent loss path), and a **core-object
gap** (recipes are immutable except by AI). The rung to "shippable public beta" is
Phases 1 and 2 below. The rung to "product" is Phase 3 plus the Blaze decision in
Phase 4.

---

## 3. Phases

### Phase 1: Make it observable, durable, and bounded

Theme: before inviting anyone, write down what this is, be able to see failures, stop
silently losing things, and know who is actually allowed in. Demo: a `docs/` knowledgebase
and a changelog a new collaborator could read cold, a dashboard (even a Firestore
collection you scan) showing real client errors from a real device, CI badge green, an
honest in-app message on the one identity-loss path, and a stranger who cannot publish
into your circle's library.

- **1.0 Documentation knowledgebase.** **LANDED 2026-07-31.** Shipped as proposed: `docs/`
  with the five files below, `CHANGELOG.md` reconstructed from git with no retrofitted
  semver, `README.md` rewritten as the front door, and `CLAUDE.md` demoted to a pointer. All
  three predicted drifts were confirmed and fixed (root `@google/genai` removed;
  `VITE_USE_EMULATORS` and the emulator scripts documented; the collection list corrected to
  eight surfaces). The open sub-decision was resolved to the cheapest option — a pointer
  convention in `CLAUDE.md` plus a `docs/` drift step in `/preflight` that warns rather than
  fails — recorded in `docs/decisions.md` as an assistant's call and cheap to overrule.
  (Added 2026-07-31. Numbered 1.0 deliberately: it is
  step one, and renumbering 1.1 through 1.6 would invalidate the cross-references in
  Sequencing Rationale and Phase 4.)
  Why now: this is the record of what the app is, what it can do, and what was decided,
  and it is meant to be maintained in parallel with the build rather than reconstructed
  later. Today `CLAUDE.md` is the only substantive documentation, it is written for an
  agent rather than for a person, and it has already measurably drifted (three verified
  gaps below). `README.md` is still the stock Vite template.
  Where: a `docs/` directory plus a root `CHANGELOG.md`, with `README.md` rewritten as the
  front door. Proposed shape, one file per question a future reader actually asks:
    - `docs/README.md`: index and the maintenance contract (what updates when)
    - `docs/capabilities.md`: capability catalog: every feature, its status (shipped /
      partial / cut), where it lives, what gates it (auth, Firebase configured), known
      limits. This is the "what can it do" reference.
    - `docs/architecture.md`: dual-store model, the AI Logic path, auth and ownership,
      routing, module map, and the named seams. One mermaid diagram, not five.
    - `docs/data-model.md`: Dexie schema v1/v2/v3 and what each migration did; the seven
      Firestore collections with doc shapes, id conventions, and a plain-language summary
      of what the rules permit; the composite indexes and which query needs each.
    - `docs/operations.md`: env vars, commands, emulator workflow, deploy steps,
      `/preflight`, and (once 1.1 lands) CI.
    - `docs/decisions.md`: the decision log: the six product decisions of 2026-07-31, the
      "Known Decisions & Gotchas" currently buried in CLAUDE.md, and the rejected
      approaches worth not re-litigating (the `createBrowserRouter`/`useBlocker` revert,
      `zod-to-json-schema`, Sentry, photos). Highest-value file here; a knowledgebase that
      records only the current state loses the reasoning, which is the expensive part.
  Shape: in-repo markdown as the single source of truth, with `CLAUDE.md` demoted to a
  pointer at `docs/` so there is one copy of each fact rather than two that disagree.
  Rejected a hosted wiki (Notion, Confluence): it cannot be reviewed in a PR alongside the
  change that invalidates it, which is the only mechanism that keeps docs true. Rejected
  generated API docs (TypeDoc): the valuable knowledge here is capabilities and decisions,
  not type signatures the code already states.
  **Versions.** Ground truth verified 2026-07-31: `package.json` is `0.1.0`, there are
  **zero git tags**, and there are 104 commits spanning 2026-02-16 to 2026-07-30, heavily
  clustered (77 on 2026-07-28 alone, almost all audit remediation). So there is no release
  history to document, only a commit history. Reconstruct `CHANGELOG.md` as honest dated
  milestones (initial app, auth and social layer, shared library, AI Logic migration, the
  audit sweep), explicitly marked as reconstructed from git, and **do not retrofit invented
  semver onto the past**. Start real tagging at the end of Phase 1: that is `v0.2.0`, and
  it is the first version this project can actually point at.
  **Verified drift to fix while writing** (found while scoping this item, so the docs start
  correct rather than inheriting the errors):
    1. Root `package.json` still depends on `@google/genai ^1.41.0`, but nothing in `src/`
       imports it; the only import is `functions/src/index.ts`, and `functions/` has its
       own `package.json` that already declares it. The root dependency is dead weight
       left over from the pre-AI-Logic architecture and should be removed, not documented.
    2. `VITE_USE_EMULATORS` is referenced in `src/` but appears in no env-var list, and the
       `emulators` / `dev:emulated` npm scripts are absent from CLAUDE.md's Commands
       section. The emulator workflow is undocumented despite being how UX-37 was verified.
    3. CLAUDE.md's Firestore table lists six collections; `firestore.rules` governs eight
       surfaces, missing the `suggestions/{id}/messages/{messageId}` subcollection (UX-37
       reply threads) and the `rateLimits/{uid}` collection the inert proxy function uses.
  Cost: M. Prereq: none, and notably it does not depend on any other item, which is part of
  why it goes first. Absorbs 1.5 (see below).
  Risk: rot. A knowledgebase that lies is worse than none, and this one will drift the
  moment Phase 2 changes behavior. Mitigation is a maintenance contract stated in
  `docs/README.md` and enforced by habit at minimum; the mechanism is an open sub-decision
  below, not something to guess at now.
  Open sub-decision for the author: how this stays true. Three candidates, cheapest first:
  a convention line in CLAUDE.md plus a `docs/` review step folded into `/preflight`; a
  `/docs-sync` skill invoked after feature work; or a `docs-curator` subagent that reviews
  a diff against `docs/` and reports drift the way `ui-reviewer` reports UI regressions.
  Worth deciding before the docs exist, because it shapes how they are structured.

- **1.1 CI: build + lint + test on every PR.** **LANDED 2026-07-31.** Shipped as proposed:
  `.github/workflows/ci.yml`, Node 22, `npm ci` (so a lockfile mismatch fails the gate) then
  build, lint, test, on pull requests and pushes to `main`, with in-flight runs cancelled per
  branch. Browser smoke test deliberately left out, as scoped below.
  Why now: the 153-test, 0-error baseline is the project's most valuable asset and it is
  currently protected only by local habit; PR #4 merged with no remote gate.
  Where: `.github/workflows/ci.yml` running `npm run build`, `npm run lint`, `npm test`.
  Shape: plain GitHub Actions. Rejected replicating `/preflight`'s browser smoke test in
  CI for now; it needs a booted preview server and emulators, and the payoff-to-flake
  ratio is wrong until there are component tests to anchor it.
  Cost: S. Risk: near zero; watch for env-dependent test assumptions (there are none
  today, tests are node + fake-indexeddb).

- **1.2 First-party error beacon.**
  Why now: risks 2 through 5 are all invisible; every subsequent phase needs eyes.
  Where: new `src/services/telemetry.ts` hooking `window.onerror`,
  `unhandledrejection`, and the existing `console.error` call sites in hooks/services;
  writes capped, truncated docs to a new `clientErrors` collection; rules allow
  `create` only (no read, no update), keyed fields validated, plus a per-session cap in
  the client.
  Shape: use Firestore itself as the sink. Rejected Sentry: it is a heavy dependency in
  a deliberately dependency-light app, costs money at exactly the moment things go wrong,
  and the app already owns a database. If volume ever justifies it, the beacon call sites
  are the migration seam.
  Cost: M (S for the beacon, the rest is sweeping call sites). Prereq: a rules deploy.
  Risk: an error loop writing docs forever; the session cap and a "beacon failed"
  circuit breaker are the mitigations, and the fixed-window pattern from
  `functions/src/index.ts` is the model.

- **1.3 Tell the user when their published recipes cannot follow them.** **LANDED
  2026-07-31.** Taken ahead of 1.2 and 1.4 deliberately: both of those need a production
  rules deploy or a configured project to verify, and this was completable and verifiable
  without either. `migrateFirestoreUid` now returns a `UidMigrationOutcome` instead of
  failing behind `.catch(() => {})`, and it short-circuits after the recipes step because
  every later step is denied by the same class of rule. Copy lives in `lib/migration.ts`
  (tested, 9 cases) and renders as a dismissible banner in `AppShell`, gated on at least one
  recipe actually being stranded. Contact route is `SUPPORT_EMAIL` in `lib/constants.ts`,
  currently `harry@seidrlab.com` — change it before inviting anyone whose mail should not
  reach that address.
  Why now: risk 2 is the only remaining silent data-loss path, and the honest fix is one
  screen of copy while the real fix (4.2) waits on Blaze.
  Where: `completeEmailSignIn` already returns `previousUid` (`firebase.ts:159`);
  `AuthContext.tsx` knows migration was attempted; surface a one-time notice ("recipes
  you published as CrispyWaffle stay under that name; contact support to move them")
  instead of `.catch(() => {})`.
  Shape: honesty now, Admin SDK later. Rejected attempting any client-side workaround;
  the rules denial is correct and AUDIT.md already documents why.
  Cost: S. Risk: none beyond copy quality.

- **1.4 Enforce `responseSchema` on the AI Logic model config.** **LANDED 2026-07-31.**
  Schema built with the SDK's `Schema` builders in `schemas/recipe.responseSchema.ts` and
  passed as `responseSchema`. Went further than scoped on one point: `lib/prompts.ts` now
  serialises that same object into the system prompt instead of keeping the hand-written
  copy, so the two cannot drift — the old copy had nothing keeping it honest. Zod stays as
  the gate, and a test asserts its key set matches the response schema's. `parseRecipeJson`'s
  fence-and-comma repair is now expected to be dead code and is kept only because it is two
  regexes on a string already in memory.
  Verified against the live project rather than statically: two real generations, the first
  deliberately including "salt to taste" to exercise the nullable amount/unit path, plus a
  multi-turn refinement to cover the chat session. Both rendered correctly with no console
  errors, and neither was saved, so nothing was published. 169 tests pass.
  Why now: RISK-1 mitigation 1, already scoped in AUDIT.md as "cheap, worth doing
  anyway"; it narrows the arbitrary-prompt surface and should remove most of the JSON
  repair in `parseRecipeJson`.
  Where: `gemini.ts:36` (`generationConfig`), translating the hardcoded JSON schema in
  `lib/prompts.ts` to the SDK's `Schema` builders; keep Zod as the final gate.
  Shape: schema at the model layer, Zod at the trust boundary, both. Rejected removing
  the Zod pass; the model config is a request hint, not a guarantee.
  Cost: S/M (the translation is fiddly, testing needs a configured project).
  Risk: a subtle schema mismatch silently degrading generations; the existing
  `lib/errors.ts` mapping and the new beacon will show it.

- ~~**1.5 Replace the stock Vite README.**~~ **Absorbed into 1.0** on 2026-07-31. The README
  is the front door of the knowledgebase, so it is written as part of it rather than as
  separate hygiene bundled with CI.

- **1.6 Enforce the circle boundary.** (Added 2026-07-31 by the "private circle" decision.)
  Why now: "private circle" is currently a description of who happens to have the URL, not
  a property the system holds. Verified in `firestore.rules:17`: `allow read: if true` on
  every recipe doc, deliberately, so the library and shared pages work signed-out. Publish
  requires only `signedIn()`, and anonymous auth is one tap, so any visitor can put a
  recipe in front of your whole circle. Nothing enforces the circle at any layer.
  Where: `firestore.rules` is the only place this can be real. Two viable shapes:
  (a) **allowlist**: an `invites/{email}` or `members/{uid}` collection, `allow create`
  on recipes gated on `exists(/databases/$(database)/documents/members/$(request.auth.uid))`,
  membership written by you (console) or by a claim-an-invite rule; keeps signed-out
  reading of a specific shared link intact. (b) **read-gate too**: additionally require
  membership to read the feed, which breaks `/shared/:id` for non-members and therefore
  breaks sharing outward, the app's main growth loop.
  Shape: recommend (a), write-gated with open reads. It matches what the circle actually
  needs (nobody pollutes the shared library) without giving up shareable links, and it
  leaves `viewCount`/favorites semantics untouched. Rejected (b) unless you specifically
  want recipes unreadable outside the circle, which is a different product. Also rejected
  an email-domain check (fragile) and doing this in client code (rules are the boundary;
  a client check is decoration).
  Cost: M. Prereq: rules deploy plus one composite decision on how invites are claimed.
  Risk: locking yourself out, or breaking publish for existing members. Test against the
  emulator suite (the pattern `/audit-next` used for UX-37) before deploying, and seed your
  own uid into `members` first.
  Gate: **this must land before the first invite goes out.** Until it does, treat the
  shared library as world-writable, because it is.

### Phase 2: Make it a recipe app you actually cook from

Theme: the core object gains ownership and kitchen reality. Demo: edit a typo in your own
recipe on your phone in airplane mode, scale it to 6 servings, and cook from it.

- **2.1 Manual recipe editing for owners.** **LANDED 2026-07-31.** Taken out of phase order:
  Phase 1's remaining items (1.2, 1.6) are both blocked on a production rules deploy and an
  invite-mechanism decision, and this needed neither — the deployed `isOwnerUpdate` rule
  already permits it, as scoped below.
  Shipped as a sibling `RecipeEditPage` at `/recipe/:id/edit` rather than a mode on
  `RecipeDetailPage`, which is already ~700 lines. Pure form logic in `lib/recipeEdit.ts`
  (24 tests): draft/patch conversion, validation, step renumbering, dirty detection through
  a normalised draft so numeric fields do not report phantom changes. `updateRecipe` already
  existed with the get+put pattern, and `publishRecipe`'s `{ merge: true }` update path is
  reused, so counters survive.
  Two decisions worth noting, both in `docs/decisions.md`: `draftToPatch` names its twelve
  content fields rather than spreading, so an edit cannot reach `createdBy`/`rootId`/`depth`;
  and an edit re-publishes **only if a published copy already exists**, since editing is not
  a decision to publish.
  Also extracted the unsaved-work guard from `RecipeChatPage` into `hooks/useUnsavedGuard.ts`
  and shared it, rather than copying that history-sentinel logic.
  Verified in the browser against a local fixture: load, edit, delete an ingredient, delete a
  step, save, and confirm persistence in IndexedDB with `createdBy`, `rootId` and `depth`
  untouched; browser-back with a dirty form intercepted and the discard dialog shown; and a
  cloud recipe owned by someone else refused with an explanation. Found and fixed one real
  layout bug while doing it (a `w-full` in the shared field class defeated the per-field
  widths and pushed the ingredient name input out of view). 193 tests pass.
  Why now: the single largest product gap. Every recipe is currently immutable except by
  a billed AI variation, which punishes the most common intent (fix a quantity, reword a
  step) and pollutes the tree with correction forks.
  Where: an edit mode on `RecipeDetailPage` (or a sibling `RecipeEditPage`), a
  `updateLocalRecipe` in `db/recipes.ts` using the established get+put pattern, and
  republish through the existing `{ merge: true }` path from FUN-10 so counters survive.
  The deployed `isOwnerUpdate` rule already permits this; no rules change needed.
  Shape: edit-in-place on the same recipe id, preserving the tree position. Rejected
  edit-as-new-version (append a child node per edit): it burns the tree's legibility on
  typo fixes, and the branching tree should stay reserved for intentional variations.
  Trade-off accepted: in-place edits are not versioned; a favoriter may see the recipe
  change under them, which is how every recipe site works.
  Cost: M/L (the form is the bulk; validation can reuse `ImportedRecipeSchema` thinking).
  Risk: divergence between local and published copies on partial failure; reuse the
  FUN-5 confirm-then-write discipline, and the beacon (1.2) catches the residue.

- **2.2 Serving scaling.** **LANDED 2026-07-31.** Pure `scaleRecipe`/`scaleIngredients` in
  `lib/scale.ts` (21 tests, weighted to the ugly cases the note below names), a
  `ServingStepper` above the ingredients, display-only and never persisted.
  Scope is narrower than "scale the recipe", on purpose: **times do not scale** (doubling a
  traybake does not double its roasting time), nutrition is already per serving, and
  instruction text is untouched because "divide into 12 balls" cannot be fixed by arithmetic.
  That last one is a stated limit of the feature.
  Rounding is magnitude-dependent, and counts round to halves with a floor of ½ so a small
  factor never renders as "0 eggs" — which reads as "omit this ingredient".
  Also fixed a bug found while writing it: `RecipeContent` now keys its body on the recipe id,
  because `RecipeDetailPage` stays mounted across a recipe-to-recipe navigation and a scale
  chosen on one recipe would otherwise carry silently to the next. Verified by scaling a
  variation to 4 and navigating to its parent, which correctly showed its own 2.
  Why now: cheap, high daily-use value, and the machinery is mostly built:
  `lib/units.ts` (414 lines, 218 test lines) already normalizes amounts and converts
  volume to weight.
  Where: pure `scaleRecipe(recipe, factor)` in `src/lib`, a serving stepper in
  `RecipeContent`/`IngredientList`, display-only (never persisted).
  Shape: display transform, not data mutation. Rejected persisting scaled copies; that
  is duplicate-recipe pollution for a view concern.
  Cost: S. Risk: absurd fractions ("0.33 egg"); round with the existing unit tables and
  test the ugly cases.

- **2.3 PWA: manifest plus precached app shell.**
  Why now: the data layer is local-first but the app itself dies on an offline reload,
  which betrays the architecture's whole promise in its most likely setting, a kitchen
  with a flaky connection. Also unlocks home-screen install, the mobile-first payoff.
  Where: `vite-plugin-pwa` in `vite.config.ts`, a real manifest and icons in `public/`,
  precache the shell only; recipes already live in IndexedDB, and Firestore paths
  already degrade via `withTimeout`.
  Shape: this adds a dependency to a dependency-light app, argued explicitly: it is
  dev-only (generates the Workbox service worker at build), and it completes local-first
  rather than fighting it. Rejected a hand-rolled service worker; SW cache invalidation
  is exactly the wheel not to reinvent.
  Cost: M. Prereq: none. Risk: stale-bundle serving, the classic SW failure; use
  `registerType: 'prompt'` with a visible "update available" affordance, and verify
  against `npm run preview` before deploying.

### Phase 3: Make the shared library a place, not a dump

Theme: separate mine from the circle's, and let the shared surface scale past the 200-doc
window. Demo: a member lands on an Explore tab that pages, browses by tag, and their own
library is unambiguously theirs.

Rescoped 2026-07-31: with a private circle, this phase is about legibility and the read
ceiling, not about handling strangers at scale. 3.3 (reporting) is cut, and 3.2 drops in
urgency because a circle-sized corpus is browsable by recency for a long while. 3.1
survives unchanged and on merit: the "split them" decision confirms it, and the 200-doc
cliff is a correctness bug at any audience size.

- **3.1 Split Library into "My Recipes" and "Explore".**
  Why now: this is risk 1. One structural change fixes the product legibility problem
  (whose recipes am I looking at?), the read-cost problem, and the 200-recipe cliff at
  the same time, which is why it is one item and not three.
  Where: `LibraryPage` gains tabs; `useRecipeLibrary` splits into a local-only hook
  (Dexie live query, unchanged, works offline and in local-only mode) and a paged cloud
  hook using `orderBy('createdAt', 'desc')` + `startAfter` cursors, page size ~30.
  Shape: cursor pagination on the existing index. Rejected infinite-merge of both
  stores (the current design) because it cannot page: local is a live query and cloud is
  a window, and their union has no stable cursor. Also rejected any search service; see
  Explicitly Not Doing.
  Cost: M/L. Prereq: none (the `createdAt` ordering already has what it needs; verify
  with `firestore.indexes.json` at build time). Risk: dedup (`searchPublishedRecipes`)
  still scores only the newest window; keep it, restate it as an accepted limit, and
  note that true cloud dedup is a Phase 4 server concern.

- **3.2 Browse dimension: tag and cuisine chips on Explore.** (Now optional.)
  Why: recency is the only discovery axis; tags already exist on every recipe and the AI
  reliably populates them (they are in the generation schema).
  Where: chip row on the Explore tab, `where('tags', 'array-contains', tag)` +
  `orderBy('createdAt')`, one composite index added to `firestore.indexes.json`.
  Cost: S/M. Prereq: index deploy. Risk: tag vocabulary sprawl from free-text AI tags;
  seed the chip row from a curated list in `lib/constants.ts`, not from the corpus.
  Rescoped: defer until the circle's corpus is actually hard to scan by recency. Cheap
  enough to do on a whim, not worth scheduling.

- ~~**3.3 Minimal report mechanism.**~~ **Cut 2026-07-31** by the private-circle decision.
  Reporting is a mechanism for content from people you do not trust; in an invite-only
  circle the recourse is social, and 1.6 stops the anonymous-publish vector that made
  reporting necessary. See Explicitly Not Doing. Revisit only if the audience answer
  changes to public.

### Phase 4: The server-side actor (the Blaze decision)

Theme: one deliberate upgrade consolidates every "needs a Cloud Function" debt. This
phase is gated on evidence, not on the calendar: adopt it when the Phase 1 beacon or the
Firebase console shows quota abuse, when the 1.3 notice actually fires for real users, or
when traction makes the pay-as-you-go trade worth it. Demo: prompts leave the bundle,
a rate-limited generation succeeds, and a uid migration completes.

Confirmed trigger-gated 2026-07-31 ("only if abuse appears"), with two consequences worth
stating plainly. First, a private circle plus 1.6's write gate makes the quota-abuse
trigger unlikely to ever fire, so **plan on this phase never happening.** Second, that
means 4.2 stays parked, and therefore **1.3's notice is the permanent mitigation for the
uid-orphaning path, not a stopgap.** Write its copy accordingly: it is the product's real
answer to "can I move my recipes?", so it needs a route to you (an email address), not a
vague "contact support". If the beacon ever shows 1.3 firing for real users more than
rarely, that alone is grounds to reopen the Blaze decision, independent of abuse.

- **4.1 Deploy the generation proxy.**
  Why now (when triggered): RISK-1 mitigation 3, already written and committed
  (`functions/src/index.ts`: per-uid 30/hour transactional limit, input caps, server-held
  prompts, key never forwarded). Client work is small: swap `gemini.ts` to an
  `httpsCallable`, keep `lib/errors.ts` mapping, keep local-only mode disabled exactly
  as today.
  Cost: M, plus the hard prereq: **Blaze**, which I verified also flips Gemini Developer
  API usage from the Spark free tier to pay-as-you-go. This is why the phase is
  triggered, not scheduled; deploying it early converts a free resource into a billed one
  for no user-visible gain.
  Risk: cold-start latency on generation; measure before deciding on min instances.

- **4.2 Admin-SDK uid migration.**
  Closes the AUDIT.md "known limitation" and retires 1.3's apology copy. A callable that
  verifies both identities (the email link result plus the old anonymous token or a
  server-side custody check) and rewrites `createdBy.uid` across recipes, favorites,
  suggestions, profiles, follows. Cost: M. Risk: partial migration; write it as a
  resumable batch keyed on the old uid, and log to the beacon.

- **4.3 Consistency sweeper.**
  A scheduled function that (a) deletes cross-user orphaned descendants flagged by tree
  deletes (FUN-3 residue), (b) reconciles recipes whose publish failed (FUN-5 residue,
  currently share-triggered only), and (c) optionally compacts stale `rateLimits` docs.
  Cost: M. Risk: a sweeper with a bug is a mass-delete tool; dry-run mode first, beacon
  logging always, and it never touches docs newer than an hour.

---

## Sequencing rationale

The order is documentation, then observability, then the core object, then the crowd, then
the server.

1.0 first, ahead of even CI, for two reasons. It is the only item with no prerequisites and
no dependents, so it can never be blocked and never blocks anything, which makes "first"
free. More importantly it is the item whose cost rises fastest with delay: the ground truth
that makes it accurate (why the audit items were fixed the way they were, why
`useBlocker` was reverted, why Blaze is declined) is currently recoverable from a fresh
audit and six months of commit messages, and every phase after this one adds behavior that
would have to be documented from memory instead. Writing it in parallel with the build, as
intended, means it starts correct and stays cheap; writing it after Phase 3 means
archaeology.

Phase 1's remaining items follow because every later phase changes behavior in production
and nothing today would tell you if it broke. 1.2 (beacon) is also the explicit trigger mechanism for
Phase 4; without it the Blaze decision would be made on vibes. 1.3 stops the one silent
data-loss path before any push for users, because inviting people while able to lose
their catalog invisibly is the wrong order. 1.6 joins this phase for the same reason in a
different dimension: the private-circle decision only becomes true when the rules say so,
and the cost of discovering that later is a polluted shared library and no clean way to
tell members' recipes from a stranger's.

Phase 2 before Phase 3 because retention precedes acquisition: editing (2.1) and offline
(2.3) make the app worth returning to for the users it already has, while Explore (3.1)
mostly matters once there are strangers. There is also a mechanical dependency: 2.1's
edit-in-place must exist before the feed grows, or every typo in a popular recipe becomes
a permanent public embarrassment with an AI-fork as the only fix.

Phase 3 before Phase 4 because 3.1 removes the per-visit 200-read pattern, which lowers
the Firestore bill and quota pressure that would otherwise force the Blaze conversation
prematurely and for the wrong reason.

Phase 4 last and trigger-gated because it is the only phase that costs money structurally
(verified: Blaze ends the Gemini free tier on this path) and every item in it is already
written or well understood, so deferring it loses nothing but time-to-react, which the
Phase 1 beacon buys back.

Dependency chains, named: 1.0 -> nothing and nothing -> 1.0 (deliberately unblocked, which
is why it is first); 1.2 -> 4.x trigger; 1.3 -> 4.2 (apology copy retired by real fix, which
the trigger-gating now makes unlikely, so 1.3 is load-bearing); 1.6 -> first invite (hard
gate); 2.1 -> 3.1 (editing before the shared feed grows); 3.1 -> 4.1 timing (read-cost
relief delays the Blaze forcing function); 1.1 -> everything after it (no phase should land
unguarded).

Revised 2026-07-31: the six decisions below made this roadmap smaller, which is the right
outcome. Net change was one new item (1.6), one cut (3.3), one demoted to optional (3.2),
one phase (4) that should now be assumed never to run, and two audit findings closed
without work. Phases 1 and 2 were otherwise unaffected, as predicted.

Amended 2026-07-31, later: 1.0 (documentation knowledgebase) added as step one at the
author's direction, absorbing 1.5. It is scope the original roadmap missed by treating
documentation as the README line item it inherited from the audit, rather than as the
knowledgebase the project actually lacks.

## Explicitly not doing

- **Full-text search (Algolia, Typesense, or a search Cloud Function).** Client-side
  substring search over the local library plus a paged Explore is adequate below
  thousands of recipes, and every option is either a heavy dependency, a bill, or both.
  Revisit when 3.2's browse chips demonstrably fail users.
- **Recipe photos. Decided 2026-07-31: no, permanently.** Requires Firebase Storage,
  upload UX, and a moderation story, and the base64-in-Firestore trick that works for
  128px avatars categorically does not extend to food photography (1 MiB doc limit, read
  bandwidth). The product is text-first: AI generation plus the branching tree is the
  identity. Concretely, this means **do not add a speculative `imageUrl` field** to the
  recipe doc or the Zod schema as a hedge; an unused nullable field is a standing
  invitation to drift into the decision sideways. If this ever reverses it is a phase of
  its own, not a field.
- **Versioned edit history for in-place edits.** The branching tree is the versioning
  story for intentional variations; adding a second, hidden history for edits doubles the
  data model for an audit-trail feature nobody asked for.
- **The `createBrowserRouter`/`useBlocker` migration.** Attempted 2026-07-28 and
  reverted; `useBlocker` demonstrably did not block POP navigation in react-router
  7.13.0 (UI-15 notes). The shipped sentinel-entry guard works. Do not re-litigate
  without new evidence from a newer router release.
- **Draft persistence for unsaved chat recipes.** UI-4/UI-15 chose confirm-on-exit
  deliberately; drafts need a schema decision and a Dexie bump for a marginal gain over
  the working guard.
- **Local favorites via a synthetic device uid. Decided 2026-07-31: FUN-16 stands.**
  Those records orphan on sign-in with no migration path, and local-only mode already
  cannot generate recipes, so it is honestly a viewer and importer rather than a degraded
  full experience. The hidden control is the correct answer, not a deferred one.

- **Cloud unpublish on "Clear All Data". Decided 2026-07-31: UX-1's rename stands.**
  Clearing stays local-only, cloud copies survive. The trade accepted with open eyes: a
  member who wants to withdraw their published recipes must delete them individually, and
  there is no bulk exit. Revisit if anyone actually asks to leave; the honest version of
  that feature is a "delete my account" flow, which is a Phase 4 server concern anyway
  (it needs to clean up favorites, suggestions, notifications, and follows across other
  users' documents, which client rules correctly forbid).

- **Reporting and moderation tooling.** Cut with 3.3 by the private-circle decision.
  Trust is social in an invite-only group, and 1.6 removes the anonymous-publish vector.
  This is the first thing to rebuild if the audience ever goes public.
- **Structured-input generation (RISK-1 mitigation 2).** Replacing free-text chat with
  dropdowns would gut the app's best interaction to solve an abuse problem that 1.4 and
  (if triggered) 4.1 address without the UX cost.
- **Unique view counting.** Raw increments are rules-constrained and honest enough; a
  uniqueness scheme needs per-viewer state for a vanity metric.
- **Native apps or React Native.** The PWA (2.3) is the mobile bet; nothing in the
  product demands app-store distribution yet.

## Decisions taken (2026-07-31)

All six open questions were answered by the author. Recorded here as the standing product
constraints; the phases above have been revised to match.

1. **Audience: a private circle.** Invite-only, not a public community. Consequences: 3.3
   (reporting) cut, 3.2 demoted to optional, Phase 4's abuse trigger made unlikely, and
   one new item added, **1.6**, because the circle is not enforced anywhere today
   (`firestore.rules:17` is `allow read: if true`, and publish accepts any anonymous
   sign-in). 1.6 is a hard gate on the first invite.
2. **Blaze: only if abuse appears.** Stay on Spark and keep the free Gemini tier. RISK-1's
   accepted ceiling is App Check plus 1.4, and that is now written down here as accepted
   rather than pending. Phase 4 stays written and undeployed; assume it never runs. The
   load-bearing consequence is that **1.3's notice is the permanent answer** to the
   uid-orphaning path, so it needs a real contact route in its copy.
3. **Photos: no, text-first.** Permanently out of scope, including any speculative
   `imageUrl` hedge on the recipe doc. See Explicitly Not Doing.
4. **Feed: an accident, so split it.** 3.1 proceeds as a genuine split of My Recipes from
   Explore with cursor pagination, not as tabs over one source. It stands on its own merit
   regardless of audience size because the 200-doc cliff is a correctness bug.
5. **"Clear All Data": stays local-only.** UX-1's rename is the final answer; no opt-in
   cloud unpublish. The accepted trade and the honest alternative (a real account-deletion
   flow, which is server-side work) are recorded in Explicitly Not Doing.
6. **Local-only favorites: stay hidden.** FUN-16 stands as a decision, not a deferral.

Two things that are now the author's to schedule rather than decide: whether 1.6 gates
invites via an `invites/{email}` claim or a hand-seeded `members/{uid}` list, and whether
Phase 2 or 1.6 goes first if no invites are imminent.

The questions themselves are preserved in the session that produced them; each decision
above restates the question it answers, so nothing is lost by not repeating them here.
