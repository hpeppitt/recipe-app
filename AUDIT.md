# Recipe Lab Audit Backlog (2026-07-27)

Verified findings from a code audit. Each item has file:line anchors.
Work top to bottom within a severity band. Check items off as they are fixed and verified.

## How dedup currently works (context for the dedup fixes)

Dedup is a prompt-time similarity search against local IndexedDB only, and only for the
first chat message of a session (`useRecipeChat.ts:73-88`):

- New recipes: `searchRecipes()` (`db/recipes.ts:115-144`) lowercases the prompt, splits on
  whitespace, drops words of length <= 2, scores each local recipe by the fraction of query
  words appearing as substrings in `title + description + tags + ingredient names`.
  Threshold >= 0.5, top 5 shown with a "Create Anyway" bypass.
- Variations: `searchVariations()` (`db/recipes.ts:146-171`) same scoring algorithm within
  the local tree, threshold >= 0.4, top 3, but a different haystack: `title + description +
  prompt + tags`, with ingredient names swapped for the originating prompt.
- Handles case and word order. Does not handle: plurals/stemming, substring false positives
  ("rice" matches "licorice"), all-short-word prompts (returns nothing), semantics.
- There is NO dedup at save time, on data import, on later chat messages, or against
  Firestore, so duplicates flow freely into the shared cloud library.

## High severity

- [x] **INFRA-1** `npm run lint` fails with 11 pre-existing errors + 10 warnings
      (unused vars in `firestore.ts`/`AuthContext.tsx`/hooks, react-hooks/exhaustive-deps
      warnings). The lint gate must be green for /preflight and /audit-next to work.
      Caution: the exhaustive-deps warnings overlap with real stale-closure bugs in this
      backlog (FUN-9, FUN-14); fix deps deliberately, never by blindly adding suppressions.
      (fixed: 0 errors, exit 0. no-unused-vars now ignores rest siblings/underscore args;
      useAuth co-location gets a targeted disable; useNotifications markAllRead deps fixed
      via uid destructure; set-state-in-effect demoted to warn since the per-hook rewrites
      belong to FUN-8/9/11/13 + UI-12. 17 warnings remain, deferred to those findings.)
- [x] **SEC-1** Deploy Firestore security rules (repo now has `firestore.rules` +
      `firestore.indexes.json`; project is still in test mode). `firebase deploy --only firestore`
      (fixed: deployed 2026-07-27 to recipe-lab-3832b — rules compiled + released, indexes
      deployed. Verified target against `.firebaserc` and confirmed the released rules are
      the ownership-enforcing ruleset, not test mode. UID-migration limitation still stands.)
- [x] **FUN-1** Dedup never checks Firestore, so users publish duplicates to the shared
      library. Cloud recipes are not mirrored locally, so `searchRecipes` cannot see them.
      (`useRecipeChat.ts:76-78`, `db/recipes.ts:125`)
      (fixed: scoring extracted to `lib/search.ts`; new `searchPublishedRecipes` scores the
      cloud feed and merges with local matches, local winning on id ties. Two of the five
      panel slots are reserved for cloud matches so local results can't bury the cloud
      duplicate. Cloud failure degrades to local-only. Also fixed a regression this
      introduced: dedup is now a network call, so `sendMessage` got an in-flight ref guard
      and covers the search with `isLoading` — without it a second send skipped dedup and
      raced a second Gemini generation. Labels distinguish own-but-not-on-this-device from
      another user's recipe.
      NOT fixed, deliberately: dedup still only sees the newest 200 published recipes and
      re-reads that feed per prompt with no caching — a real limit, needs a server-side
      index to fix properly. A failed cloud check is also silent to the user; folded into
      UI-12. Reaching a cloud-only recipe shows no lineage (FUN-11) and can surface a
      recipe whose cloud delete was orphaned (FUN-3).)
- [x] **FUN-2** `saveRecipe` has no in-flight guard and the Save button never disables;
      double-tap creates two recipes with different UUIDs in both stores.
      (`useRecipeChat.ts:101-129`, `RecipeCardMessage.tsx:61-62`)
      (fixed: `savingRef` guard plus an `isSaving` state the hook exposes; RecipeCardMessage
      takes `saving` and renders a disabled "Saving…" button. Both halves are needed — the
      button is still enabled in the same synchronous tick as the first click, before React
      re-renders, so the ref is what actually stops tap 2. Stays locked after success since
      the page navigates away; unlocks and surfaces `error` on failure.
      Verified in-browser with a stubbed Gemini response: three rapid taps wrote exactly one
      recipe. No unit test — the guard lives in a React hook and the Vitest env is node with
      no jsdom or React testing setup.)
- [x] **FUN-3** Deleting a recipe cascades locally but deletes only the single doc in
      Firestore, orphaning published variations reachable via `/shared/:id` and profiles.
      (`RecipeDetailPage.tsx:56-64` vs `db/recipes.ts:71-95`, `firestore.ts:80-83`)
      (fixed: subtree computation extracted to `collectSubtreeIds` in `lib/tree.ts` and
      shared by both cascades, so local and cloud delete exactly the same set.
      `deleteRecipeTree` now returns the ids it deleted; new `deletePublishedRecipeTree`
      queries the cloud tree by rootId — catching variations published from another device
      that were never local — and deletes each doc individually via `allSettled`, not a
      `writeBatch`, because one rules-denied descendant would abort an atomic batch and
      leave the whole subtree published. Removed the now-unused single-doc
      `deletePublishedRecipe` so the old footgun can't be picked up again.
      NOT fixed: descendants owned by OTHER users are denied by the rules and stay
      published — same Cloud Function gap as the UID migration. The cascade result is still
      swallowed, so a partial failure is invisible; that belongs with FUN-5/UI-12.)
- [x] **FUN-4** Ownership fallback (`!user` or `createdBy.uid === 'local'`) shows Delete on
      other people's cloud recipes; rules now block the write server-side but the UI still
      offers it and it previously succeeded. (`RecipeDetailPage.tsx:34-37`)
      (fixed: `useRecipe` now reports `source: 'local' | 'cloud'`, and the decision moved to
      a pure `canManageRecipe` in `lib/ownership.ts` with 9 tests. Ownership no longer keys
      off the `'local'` placeholder uid — which any signed-in user could match on a
      cloud-fetched doc — but off whether the recipe is actually in this device's library.
      Signed-out visitors no longer get Delete on published recipes. Fails closed while the
      recipe is still resolving so the destructive menu can't flash in.
      Verified by unit test only: the affected branches need Firebase configured, and there
      is no `.env` on this machine. Extracting the pure function was what made them testable.)
- [x] **UI-1** SharedRecipePage renders `null` while loading and forever on fetch failure:
      blank white page for share-link recipients on any error, no spinner or retry.
      (`SharedRecipePage.tsx:136`, `:42-56`)
      (fixed: replaced the `recipe`/`error` pair with a `loading | ready | not-found | failed`
      status. Root cause of the permanent blank page was that `getPublishedRecipe` could
      throw and `load()` had no try/catch, so `error` stayed false and `recipe` stayed null
      forever — now caught as `failed`. 'not-found' (dead link) and 'failed' (retryable
      fetch error) render different copy, and only 'failed' offers Try Again.
      Verified all four states in-browser by pointing a temporary `.env` at a nonexistent
      Firebase project to force a real Firestore throw: spinner while loading, "Couldn't Load
      Recipe" + working Try Again on failure, "Invalid Link" for a corrupted hash, and a
      valid lz-string link still renders in full. Temp `.env` removed afterwards.)
- [x] **UI-2** Anonymous-account warning banner uses `warning-*`/`success-*` color tokens
      that are not defined in `index.css`, so the app's only data-loss safeguard prompt
      renders mostly invisible. (`ProfilePage.tsx:48-70`, `index.css:3-31`)
      (fixed: added the 16 missing shades to `@theme` — the whole `warning-*` scale plus
      success 200/300/400/700/800/950. The components' `dark:` variants were already correct;
      only the tokens were absent, and an undefined Tailwind token emits no CSS at all.
      Verified by diffing built CSS across the fix: 0 occurrences of these shades before,
      37 after. Then measured `getComputedStyle` on the banner's exact markup in-browser —
      every colour resolves in both themes (light amber #fffbeb/#92400e, dark #451a03/#fde68a).
      Also bumped the "we sent a link" body from `success-600` to `success-700`: once visible
      it computed to ~3.1:1 on `success-50`, under the 4.5:1 minimum for 12px. Now ~4.8:1.)
- [x] **UI-3** Version tree current/root nodes hardcode light `bg-primary-50` with themed
      text: illegible in dark mode. Same pattern in `RecipeDetailPage.tsx:249` and
      NotificationBell unread rows. (`VersionTreePage.tsx:65-67`)
      (fixed: added `--color-primary-950` and explicit `dark:` variants at the three named
      sites — tree current/root nodes, notification unread rows, pending suggestion rows.
      Measured in dark mode: the current node was 1.1:1 (near-white text on near-white
      #eef2ff) and is now 15.3:1; the root node 3.5:1 -> 16.2:1.
      Deliberately did NOT remap `primary-*` in `.dark` even though that would fix all sites
      at once: tinted chips pair `bg-primary-50` with `text-primary-700`, so a blanket
      remap would invert them into dark-on-dark. Left as-is: chips and the `bg-danger-50`
      error block stay light-tinted in dark mode — visually jarring but readable
      (dark text on light tint), unlike the themed-text cases above. Folded into UI-13.)
- [x] **UI-4** Back navigation from the chat silently discards an unsaved generated recipe;
      no guard, no persistence, no confirm. (`RecipeChatPage.tsx:55-58`)
      (fixed: `TopBar` got an `onBack` that opens a danger ConfirmDialog naming the recipe
      when `latestRecipe` exists and isn't being saved. Verified in-browser with a stubbed
      Gemini response: back opens the dialog and stays put, Cancel keeps the recipe and the
      Save button, Discard navigates away, and with no generated recipe back still leaves
      immediately with no prompt.
      Chose confirm-on-exit over draft persistence as the conservative option — persisting
      drafts is a feature, not a bug fix, and would need a schema decision.
      NOT covered: the browser/hardware back button and the swipe-back gesture still discard
      silently. `App.tsx` uses `BrowserRouter`, so React Router's `useBlocker` is unavailable
      without migrating to a data router; that migration belongs with UI-7, which already
      covers this app's history handling. Tapping a dedup match also still leaves the page,
      though at that point no recipe has been generated yet — only the typed prompt is lost.)
- [x] **UI-5** Missing Gemini API key is discovered only after composing and sending a
      message; error is plain text with no link to Settings, and raw Gemini exception text
      is shown verbatim. (`useRecipeChat.ts:26-30`, `:55-57`, `RecipeChatPage.tsx:176-180`)
      (fixed, all three parts: hook exposes `needsApiKey`, so the page shows a banner with a
      Settings link and disables the composer up front instead of letting the user write a
      prompt first. `error` became a `FriendlyError { message, action? }` and renders an
      "Open Settings" link when the cause is key-related. New `lib/errors.ts` maps throws to
      user-facing copy (bad key / rate limit / offline / unreadable output / outage) with
      10 tests; the raw message now goes only to `console.error`.
      Worth noting this was also a leak: the SDK's message embeds the request URL, and the
      old code rendered `err.message` verbatim, so a rejected-key error printed the API key
      into the page. Verified in-browser with a stubbed 400 whose body contained the key —
      page shows only the friendly line, key/URL/raw phrase all absent, full detail in console.
      Also added `danger-300/700/950` and gave this error block a `dark:` variant while
      rewriting it, since it was one of the light-only tints noted under UI-3.)

## Medium severity

- [x] **FUN-5** Firestore publish is fire-and-forget with swallowed errors and no retry;
      Share still emits a cloud URL that 404s for recipients. Needs a reconciliation or
      retry path, and Share should verify the recipe is actually published.
      (`useRecipeChat.ts:123-124`, `share.ts:42-44`)
      (fixed: `encodeRecipeToUrl` — which returned a cloud URL purely because Firebase was
      configured — is replaced by pure `pickShareUrl`/`cloudShareUrl`/`hashShareUrl`. Share
      now checks whether the doc exists, retries the publish if it doesn't, and only emits a
      cloud link once confirmed; otherwise it falls back to the self-contained hash link and
      the toast says recipients can't favourite or suggest. That retry is also the
      reconciliation path for the swallowed save-time publish, which now logs instead of
      vanishing silently.
      Browser testing found a regression in my own first version: against an unreachable
      backend Firestore retries rather than rejecting, so Share hung with no link at all
      (>14s, worse than the old broken link). Added `withTimeout` (4s) so it degrades to the
      working link; verified it now completes in ~5s. 12 new tests.
      Only publishes when the doc is confirmed absent, so it cannot trigger FUN-10's
      counter reset. NOT fixed: a recipe whose publish failed is still missing from the
      shared library feed until someone shares it — reconciliation is share-triggered only.)
- [x] **FUN-6** Settings import does `bulkPut` with no dedup and no schema validation:
      re-import duplicates every recipe under new UUIDs; malformed records later crash
      `searchRecipes`. (`SettingsPage.tsx:44-61`, `db/recipes.ts:103-105`)
      (fixed: `importRecipes` now takes the raw parsed JSON and validates it through a new
      `ImportedRecipeSchema` + pure `parseImportedRecipes`. Malformed records are dropped and
      counted instead of persisted, so they can no longer crash `searchRecipes` later. The
      schema is strict on the content fields queries dereference but tolerant on the storage
      envelope, because pre-v2/v3 exports have no `createdBy`/`collaborators`/`rootId` and
      rejecting old backups would be its own bug — those get backfilled.
      Import returns counts and Settings reports them inline, replacing the `alert()`
      (which also clears that part of UI-13; no `alert(` remains in `src/`).
      CORRECTION to this finding: re-import does NOT duplicate under new UUIDs. `bulkPut` is
      keyed on the inbound `id`, so it upserts and re-importing the same file is idempotent.
      Verified by test and in-browser (a second import reports "1 updated", count unchanged).
      The real defects were the missing validation and the silent result.
      Verified in-browser with a mixed file (valid + legacy + malformed + a bare string):
      "2 added, 2 skipped as invalid", legacy envelope backfilled, both recipes render, and
      search still works afterwards. Writing `describeImport` also surfaced a bug of my own
      that a test caught — it reported "Import complete" when only skips had occurred.)
- [x] **FUN-7** Approved collaborators are written only to the Firestore doc, but the owner
      UI prefers the local Dexie copy, so owners never see collaborators on their own
      device. (`firestore.ts:228-230`, `useRecipe.ts:48`)
      (fixed: `updateSuggestionStatus` now returns `{ recipeId, collaborator }` on approval
      and `useSuggestions.approve` mirrors it into Dexie via new `addLocalCollaborator`,
      following the same dual-write pattern as favourites. Idempotent on uid to match
      `arrayUnion`, and a no-op when the recipe isn't held locally.
      Also tightened the ordering: the cloud `updateDoc` used to swallow failures with
      `.catch(() => {})`, so a denied write was invisible. It now logs and returns null,
      which means the local mirror is skipped too — better that both stores stay empty than
      disagree about who collaborated.
      Verified: 5 unit tests through real Dexie for the mirror, and in-browser that the
      owner's detail page renders "Collaborators: <name>" once the local copy has them.
      Note the browser check needed a reload only because raw IndexedDB writes bypass
      Dexie's liveQuery; `addLocalCollaborator` writes through Dexie, so the real flow
      refreshes in place. The end-to-end approve action still needs Firebase to exercise.)
- [x] **FUN-8** After a recipe is deleted, `removeCloudFavorite`'s batch update on the
      missing doc rejects, so the cloud favorite can never be removed.
      (`firestore.ts:136-145`, `useFavorites.ts:50`)
      (fixed: split the `writeBatch` — the favourite doc is deleted on its own, then the
      counter decrement is attempted separately and tolerated if it fails. Atomicity was the
      bug here: the favourite is the user's own data and must come off regardless, while the
      counter lives on a doc that may no longer exist.
      First Firestore-layer tests in the repo (5), using a module mock of the SDK: no
      credentials for a real project, and the emulator needs a JVM which isn't installed.
      Confirmed the tests are sensitive by reverting to the batch version — all 5 fail.
      They pin the fix's contract (favourite removed even when the counter update rejects,
      delete ordered first, delete failures still propagate); they do NOT re-prove
      Firestore's batch-rollback semantics, which the fix takes as given.
      Left asymmetric on purpose: `addCloudFavorite` stays batched, since refusing to create
      a favourite for a nonexistent recipe is correct. Its local/cloud divergence on failure
      belongs with FUN-9.)
- [x] **FUN-9** Favorite toggle read-then-write race: double-tap runs `increment(1)` twice,
      permanently inflating `favoriteCount`. (`useFavorites.ts:39-67`, `:82-105`)
      (fixed: `togglingRef` in-flight guard in both `useFavorite` and `useCloudFavorite`.
      The cloud write is now awaited so the guard spans the counter update rather than
      releasing early, but wrapped in `withTimeout` (5s) so an unreachable Firestore can't
      leave the button permanently locked — the same hang I hit on FUN-5. Cloud errors now
      log instead of being swallowed by `.catch(() => {})`.
      VERIFICATION GAP, stated plainly: I could not exercise the double-tap. Favourites
      require a signed-in user and Firebase is unconfigured here, so the toggle returns early
      on `!uid`. The mechanism is the same ref guard empirically confirmed under FUN-2, where
      three synchronous taps produced exactly one write, but that is an argument by analogy,
      not a measurement of this code path.)
- [x] **FUN-10** `publishRecipe` uses unconditional `setDoc` that resets `favoriteCount`
      and `viewCount` to 0 on any re-publish. Latent until a retry mechanism exists.
      (`firestore.ts:27-35`)
      (fixed: `publishRecipe` now reads the doc first and branches. Create writes both
      counters as 0 (the rules require them present and zero); re-publish does a
      `{ merge: true }` write that omits them entirely, so other users' favourites and the
      view count survive.
      Second bug at the same site, not in the finding: `recipeCount: increment(1)` fired on
      EVERY publish, so a retry inflated the creator's profile count. Same root cause — no
      create/update distinction — so it is fixed here too and now only bumps on first publish.
      No longer latent: FUN-5 added the retry path this finding was waiting on. My FUN-5 call
      site only publishes when the doc is confirmed absent, but that guard is now belt-and-
      braces rather than the only protection; comment there updated.
      8 tests via the SDK mock. Confirmed sensitive by reverting: exactly the 3 re-publish
      tests fail, the 5 first-publish ones still pass.)
- [x] **FUN-11** Version tree and variation dedup read local Dexie only: empty tree and
      zero dup detection when varying someone else's cloud recipe.
      (`useRecipeTree.ts:5-11`, `db/recipes.ts:55-57`)
      (fixed both halves. Tree: new `getPublishedRecipeTree(rootId)`; `useRecipeTree` merges
      the live local query with the published tree via `mergeDedupById`, local winning on id
      since it holds the fuller record. A cloud fetch failure degrades to the local tree
      rather than blanking the view. Dedup: new `searchPublishedVariations` plus
      `searchSimilarVariations`, mirroring the FUN-1 shape (2 of 3 slots reserved for cloud
      matches, cloud failure degrades to local-only).
      `variationHaystack` moved into `lib/search.ts` so the Dexie and Firestore paths score
      identically instead of drifting.
      Two related display bugs fixed while here: `useRecipe`'s cloud fallback hardcoded
      `prompt: ''`, discarding a value the published doc actually carries (`publishRecipe`
      strips only `chatHistory`); and the tree rendered a bare `""` for any node without a
      prompt, which every cloud node used to be. Now falls back to "Variation".
      Verified in-browser: 3-node local tree renders correctly, promptless node shows
      "Variation" not empty quotes. The cloud merge itself needs Firebase to exercise; its
      merge logic is the already-tested `mergeDedupById`.)
- [x] **FUN-16** Favouriting is inert without auth, but the button still looks live. `useFavorite`
      returns early on `!uid`, and `AuthContext` leaves `user` null whenever Firebase is
      unconfigured, so in local-only mode the heart icon is rendered and clickable yet writes
      nothing and never changes state. The Library's Favorites filter is therefore permanently
      empty too. Either hide/disable the control in local-only mode, or fall back to a device
      uid so local favourites work without a cloud account.
      (`useFavorites.ts:45`, `AuthContext.tsx:65-69`, `RecipeDetailPage.tsx` favourite button)
      (found while verifying FUN-9: three taps stored 0 favourite records and left the
      aria-label unchanged. Not in the original audit.)
      (fixed: hooks expose `canFavorite`. Split by whether an account is even possible —
      the two cases deserve different answers rather than one blanket rule:
        - Firebase unconfigured: the favourite button and the Favorites filter are hidden.
          No account can exist, so the feature genuinely doesn't apply.
        - Firebase configured but signed out: the button stays and opens `AuthModal`,
          matching how SharedRecipePage already handles this. Hiding it here would have
          been a discoverability regression, since signing in is available.
      Also fixed a trap the fix would otherwise have introduced: signing out while the
      Favorites filter was active removes its chip, stranding the user on an empty list with
      no way back to All. The active filter is now derived, falling back to 'all'.
      DECISION, since this needed a product call and the user wasn't available: chose hiding
      over the device-uid alternative. A synthetic device uid would make local favourites
      work without an account, but orphans those records under that uid once the user signs
      in, and no favourites migration exists (only `migrateRecipesUid`). That is a data-model
      change, not a bug fix. Flag if local favourites are actually wanted.
      Verified in-browser both ways: unconfigured hides the control while Share/tree/menu
      remain; configured-but-signed-out shows it and opens "Sign in to continue".)
- [x] **UI-6** "Suggest a Change" exists only on `/shared/:id`; non-owners browsing the
      shared feed land on `/recipe/:id` which has no suggest affordance, making the
      headline collaboration feature undiscoverable. (`SharedRecipePage.tsx:245-251`)
      (fixed: RecipeDetailPage gained a secondary "Suggest a Change" button under Create
      Variation, reusing the existing `SuggestChangeModal` and `useSubmitSuggestion` rather
      than duplicating either.
      Gate is `isConfigured && !isOwner && source === 'cloud'`, leaning on the `canManageRecipe`
      and `source` signals added for FUN-4. The `source === 'cloud'` term is deliberate
      defence: recipes only enter Dexie via create or import, so anything local is effectively
      the user's own, and a suggestion needs a published doc to point at. Signed-out visitors
      get the button and an AuthModal prompt, matching SharedRecipePage.
      VERIFICATION GAP: only the negative cases were exercised. Producing the positive case
      needs a cloud-sourced recipe, which needs a working Firebase project — a bogus `.env`
      cannot help, since `source` only becomes 'cloud' when `getPublishedRecipe` succeeds.
      Confirmed in-browser that local-only mode hides the button and leaves Create Variation
      intact; the positive branch rests on the 9 `canManageRecipe` tests plus code reading.)
- [x] **UI-7** Recipe detail back button always goes to `parentId` or `/` with
      `replace: true`, ignoring real history (tree, profile, notifications) and corrupting
      the hardware back button. (`RecipeDetailPage.tsx:39-45`)
      (fixed: `handleBack` now calls `navigate(-1)` when there is in-app history, detected via
      `location.key !== 'default'` — React Router labels a session's first entry 'default'.
      Deep-linked entries (nothing behind them) still fall back to the parent recipe, or the
      library if there is no parent, but without `replace: true`.
      The `replace: true` in `handleDelete` was deliberately left: not being able to navigate
      back to a recipe you just deleted is correct.
      Verified in-browser, all three behaviours: deep-loaded child (history idx 0) falls back
      to its parent; tree -> recipe -> back returns to the TREE rather than the parent; and
      history is coherent again — browser back from the recipe (idx 3) lands on the tree
      (idx 2) matching the on-screen button, and forward restores idx 3, showing the entry is
      no longer destroyed.
      Does NOT deliver the UI-4 follow-on: guarding browser/swipe back against discarding an
      unsaved recipe still needs the data-router migration, filed as UI-15.)
- [x] **UI-8** Notification dropdown (`w-80`, right-anchored) clips offscreen on 320-390px
      viewports. (`NotificationBell.tsx`)
      (fixed: below `sm` the panel is `fixed inset-x-4 top-16`, spanning the viewport with
      1rem insets, so overflow is impossible regardless of where the bell sits. The original
      anchored 20rem dropdown returns at `sm` and up. Click-outside still works — it uses
      `panelRef.contains()`, which is DOM containment and unaffected by fixed positioning.
      Quantified the bug rather than assuming it: reproduced the header anchoring inside a
      320px container and measured the old panel's left edge at **-48px**, i.e. 48px of 320
      clipped offscreen. `w-80` and `right-0` are anchor-relative, so that reproduction is
      faithful without viewport emulation (which has never worked in this session).
      Verified the fix two ways instead of eyeballing: the shipped CSS puts `.sm\:absolute`
      inside `@media(min-width:40rem)` with `.fixed`/`.inset-x-4`/`.top-16` unconditional, so
      the viewport-pinned branch is what applies below 640px; and at the real 1800px viewport
      the computed style is `absolute / right:0 / 320px`, confirming large screens keep the
      original design.
      Note the bell only renders when `isConfigured && user`, so the live component could not
      be opened here — the geometry was verified from its exact classes.)
- [x] **UI-9** RecipeCard nests a `span role="link"` with onClick inside a `<button>`:
      creator link is unreachable by keyboard and broken for screen readers.
      (`RecipeCard.tsx`)
      (fixed with the stretched-link pattern: the card is now a plain `div` holding two real
      `Link`s — one `absolute inset-0` over the whole card, one for the creator lifted above
      it with `relative z-10`. Both are genuine anchors, so both are keyboard reachable and
      the invalid interactive-inside-button content model is gone. Also marked the decorative
      emoji `aria-hidden` and gave the creator link an explicit "View X's profile" label,
      since a link named only "Nina Cook" doesn't convey where it goes.
      Verified in-browser: card is a DIV, no `button [role=link] / button a` anywhere, both
      anchors tabbable, creator click reaches /profile/... (proving z-10 beats the overlay)
      and the card reaches /recipe/..., with 4 sampled points across the card body all hitting
      the recipe link so the click area is unchanged. Overlay is 2px smaller than the card in
      each axis — exactly the 1px border, since `inset-0` resolves against the padding box.
      Note on tooling: `read_page` reported the creator link as unnamed, but so was BottomNav's
      plainly-labelled "Library" link, and the DOM confirms an aria-hidden avatar plus a
      visible name span. That was a snapshot limitation, not a defect; `Avatar` already sets
      `aria-hidden` on all three branches.)
- [x] **UI-10** Touch targets below 44px: TopBar icon row (32px), suggestion Approve/Reject
      text buttons (~24px). (`RecipeDetailPage.tsx:117-169`, `:270-281`)
      (fixed: icon buttons went from `p-1.5` (32px) to `w-11 h-11` with centred content — the
      four in RecipeDetailPage, TopBar's shared back button, and NotificationBell's bell, which
      is the same defect in the same icon-row family. Approve/Reject went from unpadded text
      (~16px tall, not 24) to `min-h-11 px-3`, measured 72x44 and 60x44; `-ml-3` on the row
      keeps the first label flush with the text above instead of looking indented.
      Both badge/dot indicators were repositioned from `-top-0.5 -right-0.5` to sit against the
      20px icon rather than the 44px hit area, or the bigger target would have flung them into
      the corner. Also bumped Approve to `success-700` and Reject to `text-secondary`, since
      `success-600`/`text-tertiary` on surface were below AA (same issue as UI-2).
      Verified by measurement, not eye: all header buttons exactly 44x44; the enlarged row does
      not overflow a 320px header even with five buttons (the `flex-1 truncate` title absorbs
      the compression, and the icon buttons are inline-block so they cannot shrink); and
      Approve/Reject measured from their exact classes since suggestions need Firestore to render.
      NOT changed, flagged instead: shared `Button` `size="md"` is ~40px. Both subagent reviewers
      raised it, but it is used mostly full-width where the horizontal target is ample, and
      changing it shifts every button in the app — that deserves an explicit decision.)
- [x] **UI-11** Version tree costs 48px per depth level in a non-scrolling column; deep
      chains leave <150px for cards on a phone. (`VersionTreePage.tsx:90`)
      (fixed: indent halved (`ml-6 pl-6` -> `ml-3 pl-3`, 50px/level -> 26px counting the 2px
      rule) and node cards given `min-w-56`, so a deep chain scrolls horizontally in the
      already-`overflow-auto` main instead of crushing the cards. Connector stub moved
      `left-6` -> `left-3` to track the new indent.
      The finding understated it. Measured a 6-level chain at 320px: cards went
      288/238/188/138/88/**38px** — under 150px by depth 3 and effectively unusable by
      depth 5. Now 288/262/236/224/224/224, flooring at the 224px min-width, with horizontal
      scroll engaged. Screenshot confirms nesting and connectors still read correctly.
      Method note: a first attempt to measure the "before" by swapping classes at runtime was
      wrong — `ml-6`/`pl-6` no longer exist in the source, so Tailwind never emits them and the
      swap silently did nothing, producing plausible-but-fake numbers. Redone with inline
      styles. Worth remembering for any runtime A/B of Tailwind classes.
      Chose min-width + scroll over capping the indent at N levels: capping makes deep siblings
      visually ambiguous about which parent they belong to, which is the tree's whole job.)
- [x] **UI-12** Cloud failures render as happy empty states: Firestore offline shows
      "No recipes yet" and "Recipe not found" instead of an error with retry.
      (`useRecipeLibrary.ts`, `useRecipe.ts`, `LibraryPage.tsx:190-195`)
      (fixed: both hooks expose `cloudError` plus a retry. Library shows a warning banner
      ABOVE the list (local recipes did load, so replacing them would lose real content) and
      suppresses "No recipes yet" when the cloud failed — otherwise the two contradict each
      other, which my first attempt actually did. Recipe detail distinguishes "Not found"
      from "Couldn't load" + Try Again.
      Testing found the naive fix does nothing: against an unreachable backend Firestore
      RETRIES rather than rejecting, so `.catch()` never fires — I waited 14s with no banner.
      Both lookups are now bounded with `withTimeout` (6s), treating a timeout as failure.
      Second time this environment's Firestore hang has changed a fix (see FUN-5); a plain
      `.catch()` on a Firestore call is not an error path.
      Also fixed a pre-existing permanent-spinner bug in the same hook (confirmed against
      HEAD, not introduced here): with Firebase unconfigured the cloud effect returned early
      without setting `cloudChecked`, so `isLoading` never cleared and any missing recipe sat
      on a skeleton forever. Now settles after the same 100ms Dexie delay. (That delay is
      still the FUN-13 hack.)
      Verified all four states: cloud-fails-with-local-recipes (banner + list, no false empty
      state), cloud-fails-with-none (banner only, no contradictory "No recipes yet"),
      cloud-fails-on-detail ("Couldn't load" + Try Again), and local-only mode (normal empty
      state, genuine "Recipe not found", no false network blame).
      STILL SILENT, not claimed: the dedup cloud-check failure (FUN-1) and the delete cascade
      result (FUN-3) — both were annotated "folded into UI-12" but are separate surfaces I did
      not touch here.)

- [x] **UI-15** Browser back and the iOS swipe-back gesture still discard an unsaved generated
      recipe silently. UI-4 added a confirm dialog to the in-app back button, but `App.tsx`
      uses `BrowserRouter`, so React Router's `useBlocker` is unavailable and non-button
      navigations can't be intercepted. Needs migrating to `createBrowserRouter` (routes as
      objects), after which `useBlocker` can guard `RecipeChatPage` while `latestRecipe` is
      unsaved. On a mobile-first app the swipe gesture is arguably the more common way to
      leave a page, so the UI-4 fix is partial in practice. (`App.tsx:18-33`,
      `RecipeChatPage.tsx` handleBack)
      (split out of UI-4/UI-7 rather than left dangling between them.)
      (ATTEMPTED 2026-07-28 and REVERTED — no code shipped. Findings so the next attempt
      starts informed rather than repeating this:
      1. The migration itself is fine. `createBrowserRouter` + `RouterProvider` converted
         cleanly (flat routes, one `AppShell` layout route) and all 9 routes were verified
         rendering. `AuthProvider` can stay outside `RouterProvider` — it uses no router hooks;
         only `AppShell` needs router context, via `Outlet`.
      2. `useBlocker` did NOT block. With react-router 7.13.0 and a confirmed unsaved recipe,
         the blocker registered (state 'unblocked', `hasUnsavedRecipe` true) but its callback
         was NEVER invoked on navigation — verified by logging persisted through the
         transition. It failed for `navigate(-1)` from the in-app button as well as
         `history.back()`, i.e. all POP navigation, not just the gesture.
      3. NOT StrictMode. That was my hypothesis (effect-registered blocker, React 19
         double-invoke); I tested it by temporarily removing StrictMode and the callback still
         was never called. Hypothesis disproven — don't re-spend time there.
      Reverted rather than shipped because the migration's only purpose is enabling the
      blocker, so without it there is no user benefit, and keeping it would have left UI-4's
      guard regressed (the manual `onBack` dialog was removed in favour of the blocker).
      UI-4's dialog was re-verified working after the revert.
      Next step is probably a `popstate`/`beforeunload` guard, or checking whether v7 blocking
      of POP needs something this app is missing — not another straight `useBlocker` attempt.)
      (FIXED 2026-07-28, second attempt, taking the `popstate` route the note above pointed at.
      **No router migration.** `createBrowserRouter` was only ever a means to `useBlocker`, and
      that was already disproven, so this intercepts POP directly and `App.tsx` is untouched.
      Mechanism: while a recipe is unsaved, a sentinel history entry is parked on top of the
      page. The first Back pops the sentinel instead of leaving; the handler immediately
      re-pushes it — so the user stays put — and opens the existing discard dialog. Confirming
      unwinds two entries (sentinel + the page's own), or goes home when `location.key` is
      'default' and there is nothing behind. `beforeunload` covers reload and tab close, which
      no in-app guard can observe.
      Verified against a real generated recipe, not a fixture: Back showed the dialog with the
      recipe still on screen and the URL unchanged; Cancel kept the recipe and a *second* Back
      was caught again (the re-arm works); Discard left to the library. Regressions checked too
      — with nothing unsaved, Back navigates with no dialog, and saving still navigates to the
      new recipe unblocked, which was the most damaging thing this could have broken.
      **Known trade-off, measured:** the sentinel is left behind when the guard disarms because
      the recipe was *saved* rather than discarded, so Back from the new recipe lands on
      `/create` twice before reaching the library. Two presses on the same URL, no data loss, no
      spurious dialog. Removing it would require navigating during cleanup, which would race the
      save's own navigation — a worse failure than a duplicate history entry. Accepted
      deliberately rather than left undiscovered.)

## Low severity

- [x] **FUN-12** `incrementRecipeViews` in useEffect under StrictMode double-counts every
      view in dev. (`RecipeDetailPage.tsx:76-81`, `main.tsx:7`)
      (fixed: `viewCountedRef` guard so the effect body runs at most once per recipe per
      mount. The ref survives StrictMode's remount because React reuses the component
      instance, which is what makes it the right tool for a one-shot side effect — a state
      flag would reset.
      Measured rather than assumed: instrumented the effect and counted fires on a real
      navigation — 2 without the guard, 1 with it. Removed the instrumentation after.
      Worth noting this stopped being dev-only cosmetics once `.env` pointed dev at the live
      project: every local page view was inflating real `viewCount` values by 2.
      `SharedRecipePage` also increments but is already safe — its increment sits behind the
      `cancelled` check inside an async load, so StrictMode's first pass is discarded. That is
      incidental rather than deliberate, so it is worth a comment if that file is touched again.
      StrictMode itself left enabled; it is doing its job here by surfacing the bug.)
- [x] **FUN-13** Cloud fallback gated on an arbitrary 100ms setTimeout instead of awaiting
      the Dexie query. (`useRecipe.ts:24-45`)
      (fixed: the timing guess is gone. Root cause was that `useLiveQuery` returns `undefined`
      both while loading AND when the row is missing, so the code could not tell the two
      apart and slept 100ms hoping Dexie had settled. Wrapping the result
      (`async () => ({ value: await getRecipe(id) })`) makes the states distinct: the hook
      returning `undefined` now means "still loading", `{ value: undefined }` means "resolved,
      not here". The cloud effect gates on `localSettled` instead of a clock.
      Replaced the `clearTimeout` cleanup with a `cancelled` flag, which covers the same
      staleness case — a late cloud response landing after the id changed — that the timeout
      teardown happened to cover.
      Was a real correctness bug, not just inelegance: on a slow device Dexie could take
      longer than 100ms, so a local recipe would trigger a pointless cloud lookup, and a
      cloud recipe on a fast device would briefly render "not found".
      Verified all three paths in-browser: a cloud-only recipe loads with no false not-found
      flash, a nonexistent id resolves immediately to "Recipe not found" with no stuck
      skeleton and no network blame, and a Dexie-only recipe renders with owner actions.)
- [x] **FUN-14** "Create New Anyway" has no in-flight guard; double-click runs two
      concurrent Gemini generations. (`useRecipeChat.ts:95-99`)
      (fixed: `generatingRef` guard placed inside `generateRecipe` rather than at the call
      site, because that is the chokepoint both entry paths funnel through. `sendMessage`
      already had `sendingRef` from FUN-1, but `dismissSimilar` bypasses it entirely and calls
      `generateRecipe` directly, so the existing guard gave no cover here.
      Measured: three synchronous clicks started **3** concurrent generations without the
      guard and **1** with it. Each of those is a billed Gemini call, and each would have
      raced an assistant message into the transcript, so the user could end up with several
      recipes appearing from one tap.
      Note this only became a real cost rather than a theoretical one once generation
      actually worked again (see FUN-12's sibling finding on the retired model) — the app had
      been failing every generation since 2026-06-01, so a double-fire cost nothing.
      Not relying on the panel unmounting: `generateRecipe` clears `similarRecipes`
      synchronously, which does hide the button, but only after React re-renders. Clicks
      inside the same tick all land first, which is exactly what the measurement shows.)
- [x] **FUN-15** A failed first message (e.g. no API key) consumes the one-shot dedup
      check; dedup is permanently skipped for the rest of that chat session.
      (`useRecipeChat.ts:64-93`)
      (fixed: the gate was `messages.length === 0`, which is spent the moment a message is
      *typed* rather than when a recipe is *produced*. Now gated on a `generatedOnceRef` set
      only after a generation actually returns, so "once per chat" means once a recipe exists.
      `messages.length` also dropped out of the sendMessage deps, which stops the callback
      being rebuilt on every message.
      Measured in-browser, two sends after a forced generation failure: dedup ran **1** time
      before the fix and **2** after. Also checked the opposite direction, since making dedup
      run more often risks it running when it shouldn't: after a *successful* generation, the
      follow-up "make it vegan" correctly did not re-trigger dedup (1 check total).
      Note the first pre-fix reproduction was invalid and reported 2 — the temporary revert
      changed the gate but left `messages.length` out of the deps, so the old expression read
      a stale 0. Restoring the dep as well gave the true pre-fix result of 1.)
- [x] **UI-13** Inconsistent feedback patterns: native `alert()` in Settings import, three
      different empty-state styles, ad hoc Button reimplementations on ProfilePage.
      (`SettingsPage.tsx:55-57`, `ProfilePage.tsx:308-318`, `:408-413`)
      (fixed: the `alert()` was already gone — replaced by the inline `role="status"` message
      when `describeImport` landed, so only the ProfilePage half remained.
      Two ad hoc CTAs (Follow, Sign In) now use `Button`, which also gets them the shared
      focus-visible ring and disabled styling they were missing — the hand-rolled Follow
      button had a `disabled` attribute but no disabled *appearance*, so it looked live while
      a follow was in flight.
      Empty states: added a `compact` variant to `EmptyState` rather than reusing the
      full-page one, whose 6xl icon and 4rem padding would dwarf a list inside a section —
      that mismatch is why these two spots grew bare-paragraph styles instead. `compact`
      renders the title as a `<p>`, since a section empty state sits under an existing
      heading and an `h2` would misreport the document outline. `description` is now optional.
      Verified at 390px: compact empty state on both profile variants, plus the Follow and
      Sign In buttons. Neither of those two states is reachable as the sole user with no
      second account, so both were forced with temporary edits and reverted after; the
      "Following" (secondary) state was left unclicked to avoid writing a bogus self-follow
      to Firestore. No console errors.)
- [x] **UI-14** Modal/dropdown a11y gaps: dialogs missing `aria-labelledby`, bell missing
      `aria-expanded` and unread count announcement, unlabeled search input, ChatInput
      autofocus fights AuthModal focus. (`AuthModal.tsx`, `NotificationBell.tsx`,
      `LibraryPage.tsx:78-84`, `ChatInput.tsx`)
      (fixed: all three dialogs (`ConfirmDialog`, `AuthModal`, `SuggestChangeModal`) now carry
      `aria-labelledby` via `useId`; ConfirmDialog also gets `aria-describedby` for its
      message, since that text carries the consequence of the action. AuthModal and
      SuggestChangeModal swap their heading between steps, so one id follows the visible
      heading rather than each step declaring its own — otherwise the name would go stale
      after submitting. Bell gained `aria-expanded`, `aria-haspopup`, and the unread count
      folded into its `aria-label`; the count previously existed only as a painted badge.
      Search input gained an `aria-label`, since a placeholder is not an accessible name.
      Verified against the live accessibility tree, not just the markup: the labelledby ids
      resolve to the real heading text ("Clear All Data" / its warning), and the bell's
      `aria-expanded` flips false→true on open.
      **The ChatInput claim did not reproduce and no change was made for it.** Tested with
      the modal forced open: focus lands on "Continue Anonymously" and stays inside the
      dialog. Two things prevent the conflict — ChatInput's focus effect is mount-only so it
      cannot fire later, and `showModal()` runs after it and pulls focus in regardless. On
      close, native `<dialog>` restores focus to the composer on its own. I had implemented an
      `autoFocus` prop before testing and reverted it: it added API surface for a defect that
      does not exist. The rest of UI-14 was real.)

## Known limitation introduced by the security rules

Client-side UID migration (`AuthContext.tsx:59`, `firestore.ts:423-519`) rewrites docs
belonging to the OLD uid while authenticated as the NEW uid. Rules cannot verify the old
identity, so these writes are now denied. The call is fire-and-forget so nothing crashes,
but cloud data will not migrate when an email sign-in lands on a different uid. Proper fix:
a Cloud Function using the Admin SDK, or linking credentials so the uid never changes.
Local Dexie migration is unaffected.

---

# UX/UI Sweep Backlog (2026-07-28)

Findings from three parallel UX reviews (create/library flow; detail/tree/sharing;
account/social/design-system). These are **experience** findings, not correctness bugs —
the code audit above already cleared those. Same convention: check off when fixed AND verified.

Obsoleted before filing: the reviews flagged that the primary CTA dead-ends with no
explanation of what a Gemini API key is or where to get one. The server-side proxy removes
that failure mode entirely, so it is not listed.

## High severity

- [x] **UX-1** "Clear All Data" does not clear all data. `clearAllRecipes()` is
      `db.recipes.clear()` only, so the local `favorites` table survives AND every recipe
      published to Firestore stays public under the user's name. The most deliberate
      destructive action in the app leaves the content visible to everyone with no
      indication. Trust/privacy issue, not cosmetic. Either rename to "Delete recipes on this
      device" and say so explicitly, or actually delete the owned Firestore docs.
      (`SettingsPage.tsx:70-73`, `db/recipes.ts:155-157`)
      (fixed, taking the rename option — **product decision, flagged**. The finding offered
      two paths and I took the conservative one: mass-deleting published recipes is
      irreversible and is not purely the user's call, because other people may have
      favourited or branched from them. Removing a root would orphan or destroy someone
      else's variation. Per-recipe delete already exists for anyone who wants a published
      recipe gone.
      Two changes. The local wipe is now genuinely complete: `clearAllRecipes` clears
      `favorites` as well as `recipes`, in one transaction. The surviving favourites were a
      real bug on their own — rows pointed at recipes the user had just deleted, and the list
      resurrected itself on next sign-in. Covered by a test that fails against the old
      one-line implementation.
      The button is renamed "Delete Recipes on This Device", with helper text and a confirm
      dialog that both state that shared recipes stay in the shared library. Verified at
      390px; the dialog was cancelled rather than confirmed, so no data was destroyed.
      If you would rather it also unpublished your own Firestore docs, that is a
      straightforward follow-up — say so and I will add it.)
- [x] **UX-2** Avatar and display-name editing are hover-only
      (`opacity-0 group-hover:opacity-100`), so on touch the entire AvatarEditor feature —
      3 tabs, 40 emoji, image upload — is unreachable on the primary platform. The avatar
      button also has no accessible name (Avatar is `aria-hidden`, pencil svg unlabelled).
      (`ProfilePage.tsx:133-137`, `:166-168`, `:123`)
      (fixed: the avatar's hover-reveal pencil is replaced by a persistent badge pinned to the
      bottom-right of the avatar — a standing affordance rather than one that only exists for
      a pointer. The hover tint is kept on top as a pointer-only nicety, so mice lose nothing.
      The name pencil is simply always visible now.
      Both buttons gained accessible names; the avatar had none at all, since `Avatar` is
      `aria-hidden` and the pencil svg was unlabelled, so it announced as an empty button.
      Avatar also gets `aria-expanded`, since it toggles the editor panel inline.
      Went beyond the finding on one point: the name button measured 32px tall, below the
      44px touch minimum. Since the whole finding is about touch reachability, leaving a
      known-undersized target would have half-fixed it. Now 44px exactly.
      Verified at 390px: badge and pencil both visible with no hover, tapping each opens its
      editor, `aria-expanded` flips, and a repo-wide grep confirms no `opacity-0
      group-hover:` affordances remain anywhere.)
- [x] **UX-3** AuthModal states a difference that is false: email sign-in "lets your name
      appear on recipes you share", but anonymous users also get an auto-generated display
      name on theirs. The differences that matter (tied to this browser, clearing site data
      loses everything, no other-device access, no sign-out) are never mentioned, and the
      lossy option is the primary-styled default. (`AuthModal.tsx:80-93`,
      `AuthContext.tsx:139-145`)
      (fixed. Confirmed the claim was false before rewriting: `handleSignInAnonymously` calls
      `generateDisplayName(uid)` and writes it to the profile, so anonymous users are credited
      identically — the test account on this machine shows as "TangySage". The footnote was
      selling a distinction that does not exist.
      Replaced it with per-option copy stating the differences that are real: email survives
      clearing the browser and works across devices; anonymous is quickest but lives in this
      browser only, is deleted by clearing site data, and is unreachable elsewhere. Also
      mentions that an email can be added later from the profile, so the fast path no longer
      reads as a dead end.
      Swapped the visual priority: email is now the primary button. Anonymous being
      primary-styled nudged people toward the lossy option without disclosing it was lossy,
      which is the part of this finding that actually costs users their recipes.
      Verified at 390px with the modal forced open (not reachable while signed in): both
      options and their copy fit without overflow, and the email step still reaches Back /
      Send Link. Deliberately not addressed here: anonymous users having no sign-out is
      UX-5's subject.)
- [x] **UX-4** The only safeguard against permanent recipe loss is triple-buried:
      `EmailLinkingForm` renders *after* the whole recipe list, so the more you stand to lose
      the further you scroll; Profile is reachable only via a 20px avatar and is absent from
      BottomNav and Settings. (`ProfilePage.tsx:238-239`, `BottomNav.tsx:4-7`)
      (fixed both halves. `EmailLinkingForm` moved above the recipe list, directly under the
      stats — measured at 390px it now sits at y=352 and is fully visible without scrolling,
      where before its position grew with the recipe count. Profile added to BottomNav.
      Two knock-on problems the finding did not mention, both created by adding the tab:
      1. `/profile` was not inside `AppShell`, so the new tab led to a page with no bottom nav
         — a dead end. Moved it into the shell. Public profiles (`/profile/:uid`) stay outside
         deliberately: they are a detail view reached from a recipe and carry their own back
         button.
      2. That move then produced exactly 64px of phantom scroll, because OwnProfile's own
         `min-h-dvh` stacked on the shell's `min-h-dvh` + `pb-16`. Caught by measuring
         `scrollHeight - innerHeight`, not by eye — 64px looks like nothing in a screenshot.
         Dropped the duplicated height; overflow is now 32px of real content.
      Also changed `/profile/:uid`-when-it-is-you from rendering `<OwnProfile/>` in place to a
      real `<Navigate to="/profile" replace/>`. Rendering it in place would have put the
      shell-dependent component outside the shell again, reintroducing (1) by another route.
      Verified: redirect lands on `/profile` with nav present, email form above "My Recipes".
      The finding also mentions Settings as a route to Profile; the nav tab makes that
      redundant, so it was not added.)
- [x] **UX-5** Anonymous users are trapped: no sign-out by design, and AuthModal
      auto-dismisses whenever any user exists, so the email screen is unreachable again. A
      user on a shared device cannot leave; someone with an existing email account cannot
      sign into it here and their identities diverge permanently.
      (`ProfilePage.tsx:238-244`, `AuthContext.tsx:158-161`, `AuthModal.tsx:22-26`)
      (fixed: `handleSignOut` threw for anonymous users. The intent was protective — the
      account cannot be signed back into — but removing the exit did not prevent the loss, it
      just stranded people. Sign Out is now offered to everyone, with a `ConfirmDialog` that
      states the consequence plainly: no way back in, local recipes stay, published copies
      become unmanageable, and adding an email first keeps the account.
      No change needed to AuthModal's auto-dismiss: it is conditioned on a user existing, so
      once sign-out works the email screen is reachable again. That is the second half of the
      finding, resolved by the first fix rather than separately.
      Verified end to end by actually signing out, not just opening the dialog — the previous
      behaviour was a thrown error, so anything short of completing it would not have proven
      the fix. Sign-out completed with no unhandled rejection, the signed-out profile
      rendered, Sign In reopened AuthModal, and the email step was reachable. Then signed
      back in anonymously to leave the app in a working state. Safe to do here because the
      test account held 0 recipes; on an account with content this is destructive, which is
      exactly why the confirmation says so.
      Note the local library is not lost on sign-out — `canManageRecipe` returns true for
      `source === 'local'` regardless of uid, so device recipes stay manageable. Only control
      of already-published copies goes, which is what the dialog says.)
- [x] **UX-6** The collaboration loop dead-ends. Approve writes `status` and adds a
      collaborator but does not change the recipe, does not open a variation, and sends the
      suggester no notification (`AppNotification.type` has no outcome variant). Owner presses
      Approve, nothing visibly happens, suggester never learns. Fatal for the app's
      differentiating mechanic. (`useSuggestions.ts:21-34`, `firestore.ts:339-357`,
      `types/social.ts:15`)
      (fixed in two parts.
      **The suggester now learns the outcome.** Added `suggestion_approved` /
      `suggestion_rejected` notification types, written on both outcomes — rejection matters
      as much as approval, since silence is what makes people stop contributing. The
      notification echoes the original suggestion text, so it still makes sense weeks later
      instead of reading "your suggestion was approved" with no context. Required storing
      `recipeEmoji` on the suggestion doc; older docs lack it and fall back to a neutral
      emoji rather than rendering blank.
      Also restructured `updateSuggestionStatus` to read the suggestion *before* writing the
      status. It previously returned early on rejection without ever loading the doc, so the
      suggester's identity was unavailable on exactly the path that needed it.
      **Approve now leads somewhere.** It carries the owner into the variation composer with
      the suggestion prefilled. Deliberately prefilled and *not* auto-sent: auto-sending would
      spend a billed Gemini call the owner never asked for and give them no chance to edit.
      One judgement call worth flagging: the finding says approve "does not change the
      recipe". I did not make it mutate the recipe automatically. A suggestion is free text
      like "add more garlic" — there is no reliable way to apply that to a structured recipe
      without generating, and silently rewriting someone's recipe from another user's text is
      worse than doing nothing. Routing into the variation flow is the app's own mechanic for
      exactly this, and keeps the owner in control.
      `NotificationBell` moved from a two-way ternary to keyed icon/verb maps — four types
      made the inline conditional unreadable, and unknown types now fall back instead of
      silently rendering as "suggested a change to".
      Verified: composer seeding confirmed in-browser at 390px (textarea prefilled, nothing
      sent). **The notification write itself is not verified end to end** — it needs a second
      account to suggest and a first to review, which this single-user setup cannot produce.
      Rules were checked and permit it: `notifications` create requires only
      `fromUid == request.auth.uid`, which the reviewer satisfies, and does not constrain
      `type`, so no rules redeploy is needed.)
- [x] **UX-7** Suggestion review is below ingredients, instructions, notes, tags, credits,
      collaborators and variations; the only entry point is an 8px dot on a "More options"
      button whose menu contains only Delete. The count is visual-only.
      (`RecipeDetailPage.tsx:349-402`, `:277-279`)
      (fixed: the Suggestions section moved above `RecipeContent`, so the owner's one action
      item on their own page is the first thing under the header rather than the last thing
      on it. It only renders for owners with suggestions, so it costs nothing on every other
      recipe. Reviewed suggestions stay in the same list as pending ones — splitting them
      would have added a second section for no gain, since the list is short and resolved
      rows already read as resolved.
      The 8px dot became a numbered badge matching the notification bell, and the button's
      `aria-label` now carries the count, which previously existed only as a coloured pixel.
      Added `aria-expanded`/`aria-haspopup` while there, since it opens a menu.
      Verified at 390px with a forced owner and fixture suggestions: section renders above
      the recipe, badge reads "1", label reads "More options, 1 suggestions pending".)
- [x] **UX-8** The review UI cannot support a real decision: no timestamp, no profile link,
      no reply. Approve/Reject aren't disabled in flight (double-tap on a slow link), there is
      no success or failure feedback, and Reject is irreversible with no confirm.
      (`RecipeDetailPage.tsx:355-399`)
      (fixed five of the six; reply is deferred, see below.
      **Timestamp**: `timeAgo` was a private helper inside `NotificationBell`. Lifted it to
      `lib/utils` and reused it rather than writing a second copy. Now takes an injectable
      `now`, so the boundaries are testable — three tests added, including one asserting a
      future stamp renders "just now" rather than a negative age, since clock skew between
      devices makes that reachable.
      **Profile link**: the suggester's name is now a link to their profile. Deciding on a
      suggestion means knowing who sent it.
      **In-flight**: one `reviewingId` disables *both* buttons on *every* row, not just the
      one clicked — the failure mode included approving one suggestion while rejecting
      another, which a per-button guard would have allowed. Approve shows "Working…".
      **Failure feedback**: a `role="alert"` line in the section. A rejected write was
      previously silent: the row stayed pending and the owner never learned why.
      **Reject confirm**: added, echoing the suggestion text. Approve deliberately has no
      confirm — it navigates to a composer the owner can just back out of, so a confirm there
      would be friction without a decision. Reject is one-way *and* now notifies the
      suggester (UX-6), which is what earns it the extra step.
      Each behaviour was verified by forcing its state, not by assuming: a temporary 3s delay
      proved a triple-tap yields one "Working…" with both buttons disabled, and a temporary
      thrown error proved the alert renders, no navigation happens, and the buttons re-enable.
      **Deferred: reply.** That is a new feature — a message model, a thread UI and its own
      notification type — not a fix to this screen. Logged as UX-37 rather than smuggled in.)
- [x] **UX-9** First-run framing is missing. The feed merges all published cloud recipes, so
      "No recipes yet" is nearly unreachable and a new user's actual first screen is an
      unlabelled list of strangers' recipes — no "Mine" filter, no statement of what the app
      is. (`LibraryPage.tsx:226-231`, `useRecipeLibrary.ts:89-110`)
      (fixed all three parts.
      **Framing**: a first-run card saying what the app does and that the list below is
      everyone's shared recipes, with a "Create your first recipe" button. Gated on the user
      owning no recipes, so it disappears permanently once they have one — no dismiss state to
      persist, and no way to get it stuck on screen.
      **Label**: once the intro is gone, a one-line "Recipes shared by everyone using Recipe
      Lab" sits above the list, so "All" is never mistaken for "mine". Hidden on Mine,
      Following, search and cloud-error, where it would be wrong.
      **Mine filter**: added, matching on `createdBy.uid`, and treating the pre-auth 'local'
      placeholder as the user's own — the same rule `canManageRecipe` uses, so the two cannot
      disagree about what "mine" means. The chip only appears once it would contain something:
      showing a new user a filter guaranteed to be empty is worse than not offering it. It
      still gets an empty state, since search can empty it.
      Verified both branches at 390px, since one user account only exercises one: with 0 own
      recipes the intro shows, no Mine chip, no label; with ownership forced the intro is
      gone, chips read All/Mine/Favorites, the label appears, and switching to Mine filters
      the list and hides the label.
      Deliberately not touched: the feed hardcodes `childCount: 0` for cloud recipes, which is
      the other half of why the app looks flat to a newcomer. That is UX-10's subject.)
- [x] **UX-10** The central concept (recipes branch into a version tree) is never
      communicated where a newcomer would see it. Only hint is inert "3 variations" tertiary
      text — and cloud feed entries hardcode `childCount: 0`, so it is absent on exactly the
      recipes a new user browses. (`RecipeCard.tsx:47-54`, `useRecipeLibrary.ts:105`)
      (fixed both halves.
      **The data half was the real bug.** Counts are now computed across local and cloud
      records together via a new pure `countDescendantsByRoot`. Doing it per-store would
      double-count anything both saved locally and published, so it dedupes by id first —
      covered by a test, along with counting the subtree rather than direct children, which is
      what the local count already meant.
      Measured against the live shared library: **0 recipes showed a variation count before,
      5 of 7 after.** The concept was invisible not because the hint was too quiet but because
      the number was hardcoded to zero on every cloud recipe.
      **The framing half** extends the UX-9 first-run card to state that any recipe can branch
      into variations and grows a tree of versions rather than being overwritten.
      `getCoreRecipes` was deleted rather than left in place: the hook was its only caller and
      now needs the full local set to compute counts, so keeping it would have left a tested
      function nothing calls. Its describe block went with it; the replacement logic is
      covered by the three new `countDescendantsByRoot` tests.)
- [x] **UX-11** Version tree renders the bare string "No tree data found" while the recipe is
      still resolving (up to the 6s cloud window) and again as the terminal failure state with
      no retry, though `useRecipe` exposes `cloudError`/`retry`. A single-version tree — the
      common case — is one card floating with no explanation. (`VersionTreePage.tsx:11-12`,
      `:32-36`)
      (fixed. The page now has four distinct states: skeleton while loading, a cloud-error
      state with a working Try again wired to `useRecipe`'s `retry`, a genuine "Recipe not
      found", and the tree. The single-version case gets copy explaining that branching leaves
      the original untouched, plus a Create a variation button.
      **Two real bugs sat underneath the cosmetic one, both found by measuring rather than
      looking.** Replacing the vague string with a confident "Recipe not found" made a
      pre-existing mid-load flash visible, so I instrumented a MutationObserver and caught it
      at ~69ms:
      1. `useRecipe` held `cloudChecked` as a bare boolean. React reuses the component across a
         param change, so it stayed true from the *previous* recipe for one render. Cloud state
         is now stamped with the id it belongs to and the flags are derived, so a stale result
         can never be read as this id's answer.
      2. The flash survived that fix, which disproved my first diagnosis. The real remaining
         cause was `useRecipeTree.isLoading`, which only reflected Dexie and ignored its own
         cloud fetch — so for any recipe not in local Dexie it reported "loaded, empty" while
         the variations were still in flight. That is the actual mechanism behind the original
         finding, not just a slow recipe lookup. Its cloud state is now keyed to `rootId` too,
         and counts toward `isLoading`.
      Verified: skeleton → tree with no intermediate state, a bogus id still lands on "Recipe
      not found" rather than hanging, and a multi-variation tree renders without the
      single-version hint.)
- [x] **UX-12** Shared page shows "View only" unconditionally, contradicting the favourite
      and Suggest controls beside it on `/shared/:id`. The genuinely view-only hash link gets
      the same badge with no explanation and no way to save the recipe — the recipient's
      highest-value conversion moment is a dead end. (`SharedRecipePage.tsx:193-195`,
      `:274-292`)
      (fixed both halves. The badge is now shown only on the hash path, where it is true, and
      reworded to "Read-only copy" — on `/shared/:id` it sat directly beside a working
      favourite button and a Suggest a Change action, contradicting both.
      The hash path gained "Save to my library". A hash link carries the whole recipe in the
      URL and nothing else: no Firestore doc to favourite, no owner to suggest to, so the
      recipient could previously only read it and close the tab. The copy is local-only and
      deliberately not published, and `createdBy` keeps the original creator rather than being
      rewritten to the saver.
      **Found a bug in my own first version by checking the database rather than the UI.**
      Three synchronous taps produced **3 saved copies**: I had guarded with the `saving`
      state, which does not exist yet when clicks land in the same tick. Switched to a
      `savingRef`, same as `saveRecipe` (FUN-14) — re-measured at **1 copy** from three taps.
      The button had shown "Saved — open it" in both cases, so the UI looked correct while the
      library was quietly accumulating duplicates.
      Cleaned up the 3 stray copies the failed attempt wrote to local Dexie, and the 1 from the
      passing run; local recipe count back to 0. Verified `/shared/:id` shows no badge and
      keeps both actions.)
- [x] **UX-13** The dedup panel omits the product's whole point: it offers "open this one" or
      "create anyway" but not "make a variation of this". It also runs behind a
      "Generating recipe..." indicator, so it breaks a promise it just made, gives no reason
      for each match, and discards the typed prompt if a match is tapped.
      (`RecipeChatPage.tsx:166-218`, `TypingIndicator.tsx:9`)
      (fixed all four.
      **Branch from this** added per match, alongside Open. The only choices had been abandon
      your idea or duplicate an existing recipe — branching, the product's whole premise, was
      absent from the one screen where it is most obviously the right answer.
      **Indicator**: the hook now reports which of its two waits is running, so the dedup
      search says "Checking for similar recipes..." instead of announcing generation that had
      not started and that the panel then contradicted. Measured: only the checking label
      appears during dedup.
      **Reason per match**: each row lists the query words it actually shares, e.g. "Matches:
      pressure, cooker, brown, rice", rather than asserting similarity and leaving the user to
      guess.
      **Typed prompt preserved**: Branch carries `pendingQuery` into the variation composer, so
      choosing a match no longer throws away what you wrote.
      **A latent bug surfaced while verifying that last part, and the first fix silently did
      nothing.** The composer came up empty: `initialValue` is only read at mount, and
      navigating /create -> /recipe/:id/vary keeps RecipeChatPage — and its ChatInput —
      mounted. My first attempt synced it with an effect; lint correctly objected that this is
      a cascading-render antipattern, so it is now a `key` on the seed, which is the idiomatic
      remount. Re-measured: composer arrives holding the typed prompt.
      Worth noting UX-6's approve-to-variation path was unaffected, because it navigates from
      RecipeDetailPage and so mounts the page fresh — the bug only existed on the route that
      stays within the same component.)

## Medium severity

- [x] **UX-14** Generation failure has no Try Again, uniquely in the app now — recovery means
      retyping the prompt that is visible directly above. (`RecipeChatPage.tsx:223-235`)
      (fixed: `retryGeneration` re-sends the last user message from the transcript. It calls
      `generateRecipe` directly rather than `sendMessage`, so the retry does not run the dedup
      search a second time — that already happened before the failure.
      Retry is **not** offered unconditionally. `FriendlyError` gained a `retryable` flag set
      per branch: transient failures (network, 429, 5xx, unknown) and unreadable model output
      get it, since model output is non-deterministic and the same prompt can parse next time.
      A rejected key or `permission_denied` does not — retrying would reproduce the failure
      and imply the user did something wrong — and neither does `GENERATION_UNAVAILABLE`,
      where there is no configured backend to retry against. Four tests cover the split.
      Verified end to end, not just that the button renders. First attempt was inconclusive:
      I induced the failure by pointing at a bad model name, then restored it via HMR, and
      retry still failed — because `chatRef` had cached a session bound to the bad model. That
      was an artefact of hot-reloading mid-session, not a product bug. Re-ran with a fault that
      clears on its own (fail the first `sendMessage` only): error → Try again → "Generating
      recipe..." → error cleared → recipe rendered, with the prompt appearing once rather than
      being duplicated into the transcript.)
- [x] **UX-15** Only the newest generation is savable (`showSave={i === lastAssistantIdx}` +
      single `latestRecipe`), so refining once and disliking the result loses the good version
      that is still on screen. (`RecipeChatPage.tsx:156`, `useRecipeChat.ts:109`)
      (fixed: `saveRecipe` now takes the version to save, defaulting to `latestRecipe`, and
      every assistant card offers a save button rather than only the last one. Older cards read
      "Save This Version" instead of "Save Recipe", so saving a superseded generation is a
      deliberate act and not a mis-tap.
      Also fixed a second-order bug the finding did not mention: the saved recipe's `prompt`
      came from the *first* user message in the session. Saving an older version would have
      stamped it with whatever was typed first, so a refined version and the one it replaced
      both claimed the same origin. A `promptFor(messages, index)` helper walks back to the user
      message that actually produced that card.
      Verified against real generations rather than fixtures: generated a cucumber salad, refined
      it to "make it spicy with chilli", then saved the *older* card. Checked IndexedDB rather
      than the UI — the stored recipe was the non-spicy version (no chili/spicy tags) with
      `prompt` = "simple cucumber salad with dill", not the refinement. Pre-fix that save was
      impossible to reach at all.
      Cleaned up afterwards through the app's own delete so the Firestore doc cascaded too;
      confirmed on a fresh load that the feed is back to 7 cards and local storage to 0. Note the
      first check looked like the delete had failed — the already-mounted feed was showing cloud
      data fetched before the delete, not a stale document.)
- [x] **UX-16** `/recipe/:id/vary` for an uncached parent can leave a permanently dead
      composer: only `recipe` is destructured, discarding the `isLoading` and `cloudError`
      that `useRecipe` now exposes. Looks functional, does nothing.
      (`RecipeChatPage.tsx:23`, `:243`)
      (fixed: the page now consumes `isLoading`, `cloudError` and `retry`, and separates the
      three situations that all looked identical before — parent still loading (spinner),
      parent lookup failed (explanation + Try again, the only one worth retrying), and parent
      genuinely gone (explanation + Create a new recipe, since retrying a deleted recipe is
      pointless).
      The disabled composer's placeholder was the part that made this look functional: it
      still invited you to "Describe the modification..." while accepting nothing. It now says
      why it is inert. Also suppressed the "How would you like to modify this recipe?" prompt
      while the parent is unresolved, since it contradicted the notice directly above it.
      Verified all three states at 390px, and the recovery specifically — a fault that clears
      after one call gave: composer disabled with "The original recipe is unavailable" →
      Try again → parent rendered, placeholder back to "Describe the modification...",
      composer enabled.
      Two self-inflicted stumbles worth noting: a regex meant to inject the test fault landed
      inside the function's return type and broke the build, and an unconditional `throw` made
      the rest of the function unreachable, which changed TS narrowing and produced a
      misleading type error. Both were my test scaffolding, not the fix; the second was solved
      by making the throw conditional. An earlier attempt also appeared to show Try again
      missing, when in fact HMR had already re-run the lookup and recovered on its own — the
      button was gone because it was no longer needed.)
- [x] **UX-17** Saving gives no confirmation, and a failed cloud publish is console-only, so
      the recipe is local while the user believes it is shared. A toast pattern already exists.
      (`useRecipeChat.ts:246-253`, `RecipeDetailPage.tsx:448-461`)
      (fixed: a toast on the destination page, reusing the Share toast treatment as the finding
      suggested. Two outcomes, because "saved" and "saved but not shared" are different facts:
      "Recipe saved" or "Saved on this device" with an explanation that others can't see it yet
      and that sharing will retry. The local-only toast stays up 8s rather than 3s — it carries a
      consequence worth reading.
      **The structural change is that the publish is no longer fire-and-forget.** The outcome has
      to be known *before* navigating, since the confirmation appears on the destination, and
      claiming "saved and shared" when the write never landed is exactly the false belief this
      finding is about. It is bounded by `withTimeout(4s)` rather than awaited outright, because
      an unreachable Firestore retries instead of rejecting — the same trap hit in FUN-5 and
      UI-12. A timeout is reported as local-only, which is the honest reading.
      Verified both branches against the real backend, including a genuinely forced publish
      failure rather than only checking that the toast renders: a real save with publishing
      broken produced "Saved on this device", and a normal save produced "Recipe saved".
      Note the 'cloud' toast auto-dismisses at 3s, and my first check waited 3.5s and saw
      nothing — that was the timing of my own probe, not a missing toast. A later attempt to
      re-trigger it via `popstate` also showed nothing, because the toast's initial state is read
      at mount and React does not remount on a same-route navigation; forcing a real remount
      showed both variants correctly.
      Cleaned up both test recipes through the app's own delete so the published one cascaded out
      of Firestore; feed back to 7 cards, local storage to 0.)
- [x] **UX-18** The Following filter swaps in a different, information-poorer card (no time,
      difficulty, variation count or favourite marker) and reimplements the nested-link
      pattern UI-9 fixed. Reuse `RecipeCard`. (`LibraryPage.tsx:174-192`)
      (fixed by reusing `RecipeCard`, which required understanding *why* the duplicate existed:
      the card demanded a full `RecipeWithChildren`, and a cloud feed entry cannot satisfy that
      (no rootId, depth, prompt or chatHistory). So the prop type is now `RecipeCardRecipe` —
      exactly the eight fields the component reads — and any feed can pass through it. Fixing
      the type was the actual fix; without it the duplicate card was unavoidable.
      That restores time, difficulty, the favourite marker, and the accessible nested-link
      structure UI-9 established: the old hand-rolled version was a `<button>` wrapping the
      creator's avatar and name, so the creator was not separately reachable at all.
      `childCount` is now optional and the chip is omitted when absent, which is the honest
      outcome here: `CloudRecipe` has no `rootId`, so the variation count genuinely cannot be
      derived for followed users' recipes. Showing 0 would have been a claim rather than a gap.
      **Also fixed a contradiction I introduced in UX-9** and spotted in this screen: the
      first-run card was rendering on the Following filter, where "below are recipes shared by
      everyone" describes a different list than the one on screen. Now gated to the All feed.
      Verified by actually following a user, since with nobody followed the filter chip does not
      exist: cards render with time, difficulty and creator links, no variation chips, and the
      intro appears only on All. Unfollowed afterwards and confirmed on a fresh load that the
      count is back to 0 — the immediate post-unfollow reading of 1 was stale UI, not a failed
      write.)
- [x] **UX-19** Detail header crushes the title (~55px at 320px with five 44px buttons), and
      the footer makes Create Variation primary even on someone else's recipe where Suggest a
      Change is the contextually right action. Favourite count is never shown.
      (`RecipeDetailPage.tsx:215-301`, `:406-419`)
      (fixed, and **fixes UX-36 in the same change** — same header, same root cause, so they
      could not be separated.
      **The stated premise is wrong and worth correcting.** Measured at a 320px header, the
      pre-fix title was **208px, not ~55px**. The ~55px figure assumes the action buttons lay
      out in a row consuming ~188px of width. They never did: the container was
      `<div className="relative">` with no flex direction, so four 44px buttons stacked
      *vertically*, occupying only 44px horizontally. The title therefore had more room than
      claimed, and the actual defect was UX-36's: 176px of stacked buttons centred in an
      `h-14` header put the first ones at negative y, off-screen and unreachable. Measured
      pre-fix at 320px: Favorite at y=-38, three buttons all at x=260.
      Header is now `flex items-center gap-1`, which alone stops the stacking, and reduced to
      two visible controls (Favourite + overflow menu) with Share, Version tree and Delete
      moved into the menu. The menu is no longer owner-only, since everyone needs Share and
      Version tree. Post-fix at 320px: all buttons in one row at y=6, nothing off-screen, title
      160px. Note the title is *narrower* than pre-fix (160 vs 208) — that is the correct
      trade, since the pre-fix width came from the buttons being unreachable.
      **Footer**: on someone else's recipe Suggest a Change is now primary and Create Variation
      secondary. On your own, branching stays primary — there is nobody to suggest to.
      **Favourite count**: rendered when non-zero. Read defensively off the recipe rather than
      widening `Recipe`, since `favoriteCount` is a cloud-only field a local recipe never has.
      Verified by favouriting a recipe (count showed "1 favourite", correctly singular) and
      unfavouriting to restore, confirming it returns to hidden.
      One false alarm while verifying: the menu appeared to show Delete for a non-owner. That
      was the closed `ConfirmDialog`'s confirm button, which is always in the DOM; scoping the
      query to the menu panel showed only Share and Version tree, as intended.)
- [x] **UX-20** Share can silently do nothing: `navigator.clipboard.writeText` sits in a `try`
      with only a `finally`, so an insecure context or denied permission produces no signal
      at all. The up-to-4s publish wait shows only `disabled:opacity-50` on a 20px icon.
      (`RecipeDetailPage.tsx:76-114`) — introduced by my own FUN-5 fix; add a catch with a
      selectable-URL fallback and a Spinner.
      (fixed as prescribed. The clipboard write now has its own catch, and on rejection the URL
      is shown in a read-only input that selects on focus, so the user can copy it by hand.
      Showing the link beats reporting an error — they came here to get a URL.
      **Confirmed the failure mode without simulating it.** The Chrome automation window is not
      focused, so `navigator.clipboard.writeText` genuinely rejects with
      "Document is not focused". Pre-fix that produced **two unhandled promise rejections and
      zero UI signal** — no toast, no alert, nothing. Post-fix the same conditions show the
      fallback with the real link. That is the exact silent-failure the finding describes,
      observed rather than mocked.
      **The progress indicator had become worse than the finding described, through my own
      UX-19 change.** Moving Share into a menu that closes on tap meant the menu item's
      "Preparing link..." label was never visible for even one frame, so there was no progress
      indication at all rather than a faint one. Added a spinner toast; verified with an
      artificially slowed lookup that it appears during the wait and clears after.
      Note the toast is usually invisible in practice because an already-published recipe
      resolves in well under a second — that is correct, not a missing indicator. It only earns
      its keep on the slow path the 4s timeout exists for.)
- [x] **UX-21** Cloud recipes still lose their lineage: `useRecipeChildren` and
      `useRecipeAncestors` remain Dexie-only, so browsed-from-feed recipes get an empty
      Variations carousel, a floating "Prompt:" quote with nothing saying what it varies, and
      a delete warning that undercounts variations. (`useRecipe.ts:100-122`,
      `RecipeDetailPage.tsx:305-312`, `:346`, `:425-427`) — a real gap in my FUN-11 fix, which
      merged cloud data into `useRecipeTree` only.
      (fixed: the two Dexie-only hooks are replaced by one `useRecipeLineage`, **derived from
      `useRecipeTree` rather than issuing its own queries**. That hook already merges the local
      and published tree for the root, so lineage and the tree view now cannot disagree about
      what exists — which was the underlying reason FUN-11 fixed one and missed the other.
      Also returns `descendantCount`, which fixes an undercount the finding understates: the
      delete warning used `children.length` (direct children only) while `deleteRecipeTree`
      removes the entire subtree. A variation with its own variation was silently uncounted even
      for purely local recipes. Now counts the whole subtree via `collectSubtreeIds`.
      The ancestor walk carries a cycle guard; a corrupted `parentId` chain would otherwise spin
      forever, and the merged set spans two stores that could in principle disagree.
      Measured before and after on the same cloud recipe: pre-fix a nested variation rendered a
      bare `Prompt: "Use a pressure cooker"` with no breadcrumb chain and no Variations section
      at all; post-fix its parent chain renders and the root shows "Variations (3)". Exactly the
      symptom described.
      Removed the old hooks rather than leaving them: the page was their only caller, so keeping
      them would have left Dexie-only lineage available to be wired up again by mistake.)
- [x] **UX-22** Cooking ergonomics: instructions and ingredients are `text-sm` (14px) — the
      one screen where type size matters most — with no way to check off a gathered
      ingredient or completed step, and a sticky footer eating ~72px for a CTA nobody needs
      mid-cook. (`InstructionList.tsx:20-24`, `IngredientList.tsx:20-31`)
      (fixed all three. Type is now `text-base`; measured 16px for both lists, up from 14px.
      **Tick-off is opt-in via a `checkable` prop, not unconditional.** These components are also
      used by the chat preview card and the collapsed parent-recipe preview, where the recipe is
      a proposal or context rather than something being cooked — checkboxes there would be
      furniture. Verified the compact preview renders 0 checkboxes and 0 step buttons while still
      listing ingredients.
      Ingredient rows are 44px labels (measured) so the whole row is the target, not just the
      box. For steps the existing numbered circle *becomes* the target and flips to a filled
      ✓ — cooking adds no new controls to an already busy screen; measured 56px, `aria-pressed`
      toggles correctly.
      **State is deliberately session-only and not persisted.** A tick means "this is out on the
      counter right now"; restoring yesterday's ticks would actively mislead someone starting the
      same recipe again. That is a real decision, not an omission.
      Footer un-stuck, reclaiming ~72px. Branching or suggesting is a before/after action, and
      the end of the recipe is where that decision actually gets made. Verified the wrapper is
      now `position: static` and no longer occupies the viewport while reading.)
- [x] **UX-23** A profile fetch failure renders "User not found" with no retry, so a dropped
      connection is indistinguishable from a deleted account — the same class UI-12 fixed
      elsewhere. (`ProfilePage.tsx:275-284`, `useProfile.ts:68-71`)
      (fixed: `usePublicProfile` now exposes `error` and `retry`, and the page shows a distinct
      "Couldn't load this profile" state with Try again. Genuine absence keeps "User not found"
      and deliberately gets *no* retry button — retrying a deleted account only reproduces the
      result.
      **The actual pre-fix behaviour was worse than the finding says.** `getProfile(uid).then()`
      had no `.catch` at all, so a rejection did not render "User not found" — it left
      `isLoading` stuck true (skeleton forever) *and* raised an unhandled rejection. Bounded with
      `withTimeout(6s)` too, since an unreachable Firestore retries rather than rejecting and a
      catch alone would never fire.
      Saying "User not found" for a network failure is worth fixing beyond consistency: it tells
      the visitor something untrue about *another person's* account.
      Verified both branches — a forced failure shows the error state and Try again recovers to
      the real profile; a non-existent uid shows "User not found" with no retry offered.
      Getting a testable failure took three attempts, each worth noting: a per-call one-shot was
      consumed by `useOwnProfile` calling `getProfile` first; keying it per-uid still passed
      because **StrictMode double-invokes the effect**, so the second invocation succeeded. Only
      a console-controlled flag isolated the retry path. A one-shot fault is unreliable in dev
      for anything reached through an effect.)
- [x] **UX-24** The follow loop is write-only: no notification on gaining a follower (the
      strongest retention signal a creator gets), follower/following counts aren't tappable,
      and no follower list exists anywhere. (`firestore.ts:460-485`, `ProfilePage.tsx:201`)
      (fixed the notification, which is the part with a real consequence. `followUser` now writes
      a `follow` notification, fire-and-forget like the others so a failed notification never
      fails the follow.
      This needed a shape change: `recipeId`/`recipeTitle`/`recipeEmoji` are now optional on
      `AppNotification`, because a follow is about a person, not a recipe. Kept as one type with
      optional fields rather than a separate model so a single subscription and list still cover
      everything. Two consequences handled: the bell omits the trailing title instead of
      rendering "undefined", and clicking routes to `/profile/:fromUid` rather than
      `/recipe/undefined`, which would have been a dead end.
      Verified against the real backend by temporarily addressing the notification to the
      follower, since with one account it otherwise goes to a uid whose notifications the rules
      correctly forbid me from reading. Result: rules accepted the write (no failure logged), the
      bell read "Notifications, 1 unread", the row rendered "SilkyBaker started following you"
      with no dangling recipe, and clicking landed on the profile route. Then restored the real
      recipient and unfollowed; follower count back to 0.
      **Residue disclosed:** that test left one self-addressed notification in the account. It is
      marked read so it does not nag, but there is no delete-notification UI to remove it.
      **Deferred as UX-40: tappable counts and the follower list.** Those need a `follows`
      query by `followingId`, a new list screen and routing — a feature, not a fix, and the
      counts cannot become tappable before the destination exists.)
- [x] **UX-25** Notifications: no `isLoading`, so "No notifications yet" shows during the
      initial subscription and a failure reads as "nobody cares"; unread count is visual-only;
      badge uses raw `bg-red-500` instead of the danger token.
      (`useNotifications.ts:10-25`, `NotificationBell.tsx:45`, `:62-66`)
      (fixed. `useNotifications` gained `isLoading` and `error`; the panel now has three distinct
      states plus the list, so waiting, failing and genuinely-empty no longer look identical.
      Getting the error at all required a change one layer down: `subscribeNotifications` called
      `onSnapshot` with no error callback, so a failed subscription was **completely silent** —
      not merely unstyled. It now takes an optional `onError` and logs.
      The empty state mattering here is specific: for a creator, "nothing here" and "we couldn't
      check" are very different messages, and showing the former on failure tells them nobody
      cares about their recipes.
      Badge now uses `bg-danger-600`; a repo-wide grep confirms no raw `bg-red-500` remains.
      **Unread count was already non-visual** — UI-14 put it in the button's `aria-label`
      ("Notifications, 1 unread"), verified again here. That third of the finding was already
      done and needed no change.
      Verified all four states. The real subscription resolves from Firestore's local cache too
      fast to catch the loading state by racing it, so loading and error were forced via a
      temporary switch: loading shows a spinner and **not** the empty state, error shows its own
      message with neither empty nor loading, and the normal path still lists notifications.)
- [x] **UX-26** Settings is incoherent once the API key field goes — a theme toggle, three
      data buttons and a hardcoded "v1.0", with no mention of the signed-in account. Proposed
      IA: Account (identity, anonymous warning + upgrade, sign out) / Appearance / Data. Also
      hand-rolls the sticky header `TopBar` provides, and Export gives no feedback.
      (`SettingsPage.tsx:77-81`, `:169`, `:35-44`)
      (fixed, adopting the proposed Account / Appearance / Data structure and replacing the
      hand-rolled sticky header with `TopBar`.
      **Account deliberately links out rather than duplicating.** The finding proposes putting
      the anonymous upgrade and sign-out here, but both already exist on the Profile page — the
      upgrade form and, since UX-5, a sign-out whose confirm explains that an anonymous account
      cannot be signed back into. Rebuilding either here would mean two copies of a
      consequential flow to keep in step. Settings now states who is signed in, warns when the
      account is browser-only, and links to where those actions live. Verified the link lands on
      a page that really does offer both.
      **Export feedback**: it wrote a file and said nothing, which on a phone — where the
      download lands out of sight — is indistinguishable from a dead button. It now reports the
      count, and says so explicitly when there is nothing to export rather than silently writing
      an empty file. Verified with 0 recipes.
      **The version was a lie, so it is now derived.** "v1.0" was hardcoded. Vite `define` now
      injects it from `package.json`, with an ambient declaration in a new `src/vite-env.d.ts`
      (`vite/client` types already come from tsconfig, so the file only needs the one line).
      `package.json` was 0.0.0, which would have displayed as "v0.0.0", so I set it to **0.1.0**
      — a small project decision, flagged here: it reads as pre-1.0 and in testing, which matches
      where the app actually is. Renders "Recipe Lab v0.1.0", and can no longer drift.)
- [x] **UX-27** Design-system drift: hand-rolled primary buttons instead of `Button`
      (ProfilePage Follow/Sign In, AvatarEditor Save/Choose), the segmented control built
      twice with different metrics, filter pills that duplicate `Chip` with a different
      selected treatment (so "selected pill" means two things), and `EmptyState` bypassed on
      Profile. `Chip`'s `active` prop is dead code. (`ProfilePage.tsx:308-318`, `:408-413`,
      `AvatarEditor.tsx:105-123`, `LibraryPage.tsx:96-140`, `Chip.tsx`)
      (fixed. **Two of the five items were already done** and I verified that rather than
      re-doing them: ProfilePage's Follow/Sign In became `Button`s, and Profile's empty states
      became `EmptyState`, both under UI-13. Checked by grep before touching anything.
      Remaining three:
      **Segmented control** extracted to `ui/SegmentedControl` and used by both callers. The two
      copies differed only in padding (`px-4 py-2 text-sm` vs `px-3 py-2 text-xs`), which is
      exactly how they drifted, so that difference is now a `compact` prop rather than a second
      implementation. Also upgraded on the way: `role="radiogroup"` + `aria-checked`, so the
      options are announced as one choice instead of three unrelated buttons. Verified both
      instances — labels "Theme" and "Avatar type", correct checked state, and selection moving
      on click.
      **AvatarEditor** Save and Choose Image now use `Button`, which also gives them the shared
      focus ring and disabled styling they lacked.
      **Filter pills → `Chip`**, which is what makes `active` a live prop rather than dead code.
      The treatments genuinely conflicted: `Chip.active` was `bg-primary-100 text-primary-700`
      while the pills were `bg-primary-600 text-white`. Unified on the filled version — the
      stronger signal for an active filter — and safe to change because `active` had no existing
      consumer. Added `aria-pressed` so a filter's state is not colour-only. Verified toggling
      All → Favorites swaps both the background and `aria-pressed`.)
- [x] **UX-28** Touch targets still under 44px outside the areas UI-10 fixed: library header
      icons (~26-30px) and the scrolling filter row, `Button size="sm"` (~30px) used for
      standalone account actions, Show/Hide, Mark all read, theme buttons, AvatarEditor's
      32px emoji cells and 28px swatches, shared-page favourite (~32px), breadcrumb links.
      (`LibraryPage.tsx:53-57`, `Button.tsx:25`, `SharedRecipePage.tsx:177-181`,
      `LineageBreadcrumb.tsx:16-21`)
      (fixed by measuring every interactive element on every screen rather than working from the
      list, which turned out to be incomplete. Measured before: Profile icon 28px, Settings 32px,
      search input 38px, filter chips 32px, `Button size="sm"` 32px, breadcrumb links ~20px,
      emoji cells 32px, swatches 28px, credit links 20px. All now >=44px, verified per screen.
      **The list missed things, and one of them was mine.** `SegmentedControl` — which I had
      created one finding earlier for UX-27 — shipped at 40px (page) and 32px (compact), so the
      component built to remove duplication reproduced the very defect this finding is about.
      Also missing from the list: the "Added by" credit links on both the detail and shared pages
      (20px, two separate copies).
      **A first approach was wrong and is worth recording.** I added a `.touch-target` utility
      expanding the hit area with an overlaid `::after`, keeping small controls visually compact.
      It measured correctly — 44px — but a click 5px above a filter chip hit the parent row, not
      the chip. The filter row is `overflow-x-auto`, which clips the overlay, and the card's
      creator link is `truncate` (`overflow: hidden`), which clips its own. **A measurable target
      that is not clickable is worse than a small one**, because it passes an audit while failing
      the user. Removed the utility entirely and used explicit `min-h-11`, then re-verified by
      hit-testing at a chip's true top edge.
      Audit note: an `<input>` inside a >=44px `<label>` is already full-size — the ingredient
      checkboxes read as 20px until the measurement accounted for their label wrapper.
      **One documented exception**: the in-card creator link is 32px, up from 20px. A 44px target
      inside the card's dense metadata row would inflate every card. 32px clears WCAG 2.2 SC
      2.5.8 (AA, 24x24), it is a secondary link, and the whole card is a large target for the
      primary action. Deliberate, not overlooked.)
- [x] **UX-29** Competing autofocus on `/create`: `ChatInput` focuses unconditionally on
      mount, so the keyboard opens then AuthModal steals focus; for signed-in users the
      keyboard covers the suggestion chips, which are the only concrete instruction a new
      user gets. (`ChatInput.tsx:13-15`, `RecipeChatPage.tsx:59-63`)
      (fixed the second half. **The first half does not happen** — the AuthModal focus conflict
      is the same claim UI-14 made, which I tested and disproved then: `showModal()` runs after
      ChatInput's mount effect and pulls focus into the dialog, and native `<dialog>` restores
      focus on close. Re-checked rather than assumed; no change, and no `autoFocus` prop
      reintroduced (I built one for UI-14 and reverted it for exactly this reason).
      The second half is real and distinct: on a touch device, focusing the composer opens the
      on-screen keyboard, which covers the suggestion chips — the only concrete instruction a
      first-time user gets. Autofocus is now gated on `(pointer: coarse)`: skipped on touch,
      kept on pointer devices where focus costs nothing and saves a click.
      Chose a pointer media query over a user-agent check because it describes the input device,
      which is what actually determines whether a keyboard appears — a touchscreen laptop gets
      the right behaviour either way. Guarded for environments without `matchMedia`.
      Verified both branches: on this desktop browser (`pointer: fine`) the composer still holds
      focus at mount; with a coarse pointer forced, focus stays on `body` and the chips are
      visible and unobstructed.)

## Low severity

- [x] **UX-30** Light-only tints inside dark theme: recipe tags and the instruction step
      badge pair a hardcoded light background with dark indigo text. Legible but visually
      loud against `#111827`, and the only elements ignoring the theme. Add
      `dark:bg-primary-950 dark:text-primary-300`, matching the pending-suggestion card.
      (`RecipeContent.tsx:56`, `InstructionList.tsx:21`, `RecipeCardMessage.tsx:61`)
      (fixed, using the prescribed `dark:bg-primary-950 dark:text-primary-300`.
      **Grepped for the pattern instead of trusting the three cited lines, and found six.**
      The list missed the tag row on `SharedRecipePage` (a *third* copy of the same tag markup),
      the selected emoji cell in `AvatarEditor`, and a `hover:bg-primary-50` on the shared page's
      Suggest button. Fixing only the named three would have left the shared page — the screen
      strangers actually see — still glaring in dark mode.
      Measured rather than eyeballed: in dark mode both tags and step badges now paint
      `rgb(30,27,75)` on `rgb(165,180,252)`, about **8:1** contrast, and light mode is unchanged
      (`rgb(224,231,255)`/`rgb(238,242,255)` with `rgb(67,56,202)` text). Confirmed visually too.
      Left alone deliberately: the unread dot's `bg-primary-500` is a saturated mid-tone that
      reads correctly on both surfaces, so it is not a light-only tint.
      **Observation for later:** the tag markup now exists in three places, which is precisely why
      the finding missed one. Logged as UX-41 rather than fixed here, since extracting a component
      is a different change from adding dark variants.
      Theme left on System, as it was.)
- [x] **UX-31** `text-primary-600` on the dark surface is ~2.8:1, below AA. Use
      `dark:text-primary-400`. (`RecipeCard.tsx:50`, `RecipeDetailPage.tsx:328`)
      (fixed. Confirmed the figure first by computing it rather than trusting it: primary-600 on
      `#111827` is **2.82:1**, and primary-400 is **5.95:1** — so the prescribed token clears AA's
      4.5:1 for body text with margin.
      **Two files were cited; eleven occurrences existed**, across `SharedRecipePage`,
      `RecipeDetailPage`, `RecipeCard`, `LineageBreadcrumb`, `BottomNav` and `NotificationBell`.
      Notably the active tab colour in `BottomNav` was among them — a persistent, always-visible
      element the finding did not mention. Handled `hover:` variants separately so a hover colour
      did not get turned into an unconditional dark colour.
      Verified by measuring the live DOM in dark mode rather than by inspection: **zero elements
      still paint `rgb(79,70,229)`**, and no remaining low-contrast text uses a primary token.
      Theme restored to System.)
- [x] **UX-32** Dialogs render a heading they never associate with the dialog
      (`aria-labelledby`), and AuthModal's email step doesn't autofocus its single input.
      (`AuthModal.tsx:68-72`, `ConfirmDialog.tsx:33-37`, `SuggestChangeModal.tsx`)
      (**the `aria-labelledby` half was already done** — UI-14 added it to all three dialogs via
      `useId`, plus `aria-describedby` on `ConfirmDialog`. Verified at runtime rather than by
      grep count: the AuthModal announced "Sign in with Email" and the confirm dialog resolved
      both its name and its description text. No change made.
      Fixed the autofocus. `Input` is a plain function component that does not forward a ref, so
      this uses the `autoFocus` attribute instead of adding ref plumbing — the email step
      remounts when `step` changes, so it fires reliably. Verified: choosing "Sign in with Email"
      moves focus from the button to `INPUT:email`.
      Note this is the opposite decision to UX-29, deliberately. There, autofocus was *removed*
      on touch because the keyboard covered the suggestion chips. Here the user has just chosen
      "Sign in with Email" and typing an address is the only remaining action, so the keyboard
      appearing is the desired outcome rather than an obstruction. The distinction is whether
      there is still content to read.)
- [x] **UX-33** Library search matches title, description and tags but NOT ingredients, so
      searching "chicken" misses recipes full of it — the opposite of what a recipe app user
      expects. Also no label, no clear button, no result count, and the no-results state
      offers no way to clear the query. (`useRecipeLibrary.ts:123-131`,
      `LibraryPage.tsx:86-92`, `:215-220`)
      (fixed. **Ingredients**: search now runs over `recipeHaystack` — the same haystack the dedup
      check already used — rather than a second hand-written field list. That is deliberate: with
      two lists, "this already exists" and "I can find it" could disagree about what a recipe
      contains. Required carrying `ingredients` on `FeedRecipe`, which did not have them.
      Measured before and after on the live library: "garlic" returned **0 results before, 1
      after** (Pork and Beef Bolognese, whose title and description contain no "garlic"), so the
      ingredient path is genuinely doing the work rather than the term happening to appear
      elsewhere.
      **Clear button** added rather than relying on `type="search"`, whose native clear affordance
      exists in some browsers and not others. **Result count** as a `role="status"` line, since a
      filtered list is otherwise indistinguishable from a short library. **No-results** gained a
      Clear search button — it was previously a dead end whose only escape was selecting the field
      and deleting the text. Both clear paths verified to restore all 7 recipes.
      The label was already present (added in UI-14); updated its wording to mention ingredients,
      since the placeholder now promises them.)
- [x] **UX-34** A new user's profile leads with a row of four zeros, and `pluralize` makes the
      labels twitch as counts cross 1 while "views" never pluralizes.
      (`ProfilePage.tsx:197-202`)
      (fixed both. The stats row is hidden entirely until at least one stat is non-zero: four
      zeros is a worse first impression than no row, and it was the first thing a brand-new user
      saw on their own profile. With it gone, the anonymous-account warning leads instead, which
      is the thing that actually matters at that moment.
      Labels are now always plural. Resolving the inconsistency required choosing a direction —
      pluralize "views" too, or stop pluralizing the other three. Chose static plurals because the
      number sits on its own line above the label, where "1 / recipes" reads correctly, and it
      also removes the width shift as counts cross 1. The cost is losing "1 recipe" grammar in a
      place where it was never really reading as a sentence.
      `pluralize` is deliberately kept for the per-recipe rows ("3 views", "1 fav"), where the
      count is inline with the word and the grammar does matter — this was about the stat row
      specifically, not the helper.
      Verified: own profile with 0 recipes shows no stats row at all; a profile with data shows
      `14 recipes / 109 views / 2 favorites / 0 followers`, with no singular form anywhere.)
- [x] **UX-35** `EmptyState` has no action slot, which is why every empty state in the app
      describes a button instead of offering one. (`EmptyState.tsx:1-15`)
      (fixed: added an `action` slot taking a `ReactNode` rather than a label/onClick pair, so
      callers keep control of the button variant and a state with no sensible next step can just
      omit it.
      **The finding understates the symptom: it was not only prose, it was also duplication I
      introduced earlier in this session.** Three call sites (VersionTreePage's cloud error,
      ProfilePage's profile error, LibraryPage's no-results) had each hand-rolled a flex wrapper
      to sit a Button beside the component — my own workaround for the missing slot, written
      across UX-11, UX-23 and UX-33. All three now pass `action` and the wrappers are gone.
      Three more genuinely described a button in prose and now offer one: "Tap the + button" on
      both the Mine and library-empty states became a Create a recipe button, and the Following
      empty state gained Browse recipes. The Favorites state keeps "Tap the heart on any recipe"
      because that explains a *mechanism* rather than substituting for a missing button — there is
      no single control to press — but it now offers Browse recipes as the way forward.
      Verified in-browser: Browse recipes switches the filter and restores 7 recipes, Clear search
      restores the list, and the action renders inside the EmptyState box rather than as a sibling.)
- [x] **UX-36** RecipeDetailPage header actions wrap off-screen for owners. At 390px with a
      long title the four action buttons (Favorite, Share, Version tree, More options) wrap
      into a column inside the `h-14` header; 4x44px centred in 56px puts the first two at
      y=-60 and y=-16, above the viewport and unreachable. An owner cannot favourite or share
      such a recipe at all on a phone. Measured, and confirmed pre-existing by reproducing it
      against the pre-UX-7 code with ownership forced, so not a regression.
      (`RecipeDetailPage.tsx` header action row)
      (fixed as part of UX-19 — same header and the same root cause, so fixing one necessarily
      fixed the other. The cause was not wrapping at all, as I originally described it: the
      container had no flex direction, so the buttons were block-level and stacked. Adding
      `flex` resolves it; reducing to two visible controls makes a recurrence impossible.
      See UX-19 for the measurements, which also correct that finding's premise.)
- [ ] **UX-37** No way to reply to a suggestion. The owner can only approve or reject, so any
      clarification ("which part is too salty?") is impossible and the suggester cannot
      respond to a rejection. Split out of UX-8, which fixed that screen's other five gaps.
      Needs a message model, thread UI and a notification type, so it is a feature rather
      than a fix. (`RecipeDetailPage.tsx` suggestions section, `types/social.ts`)
- [ ] **UX-40** No follower/following list, and the counts on a profile are not tappable. Split
      out of UX-24, which added the missing follow notification. Needs a `follows` query by
      `followingId` (and by `followerId` for following), a list screen reusing the existing
      profile-row pattern, and routes; the counts cannot become tappable until that destination
      exists. Note `follows` docs already store `followerDisplayName`, so a follower list can
      render without a second read per row.
      (`firestore.ts` follows helpers, `ProfilePage.tsx` StatBox)
- [ ] **UX-41** Recipe tag markup is duplicated three times, identically:
      `RecipeContent`, `RecipeCardMessage` and `SharedRecipePage` each hand-roll the same
      `px-2 py-0.5 rounded-full` tag pill. UX-30 had to patch all three for dark mode and its
      own finding text only listed two, which is the cost of the duplication. Extract a `Tag`
      component (or reuse `Chip` non-interactively) so the next visual change touches one file.
      Noted while fixing UX-30; kept separate because extraction is a different change from
      adding dark variants.
      (`RecipeContent.tsx`, `RecipeCardMessage.tsx`, `SharedRecipePage.tsx`)
- [ ] **UX-42** The dark theme's grey text tokens fail AA for body text, app-wide. Measured on
      `#111827`: `--color-text-tertiary` (#6b7280) is **3.67:1** and `--color-text-secondary`
      (#9ca3af) is **4.06:1**, both under the 4.5:1 needed at the 12-14px sizes they are used at.
      25 failing elements on the library alone — recipe metadata (time, difficulty, creator),
      helper text, the version line — so this is a token change, not a per-component one.
      Note the light and dark values are swapped (secondary/tertiary trade places between
      themes), so darkening one token naively will regress the other theme; the fix is to pick
      dark-mode-specific values that clear 4.5:1 against `#111827`, e.g. #9ca3af for tertiary and
      something nearer #cbd5e1 for secondary, then re-measure both themes.
      Found while verifying UX-31, which was specifically about a primary token; logged separately
      because this is the neutral scale and affects every screen. (`index.css` dark block)
- [ ] **UX-38** No unit system toggle. Recipes render whatever units the model happened to
      emit, so a metric cook gets cups and an imperial one gets grams, with no way to switch.
      Requested by the user 2026-07-28.

      **Correction to the first version of this entry**: it claimed `ingredients[].amount` is
      free text like "1¼ cups" and therefore needed a prose parser and a schema change. That is
      wrong. `Ingredient` is already `{ amount: number | null, unit: string | null, name, notes,
      group }` — the quantity is a number and the unit is a separate field. There is no parsing
      problem and **no schema change is required**. `IngredientList.formatAmount` already turns
      the number back into fractions for display, so a converted value renders correctly with
      no extra work.

      **Approach (recommended, not yet decided): a static conversion module in `src/lib`, not a
      Dexie table, and not a Gemini call.**

      Most of this needs no ingredient knowledge at all. g↔oz, ml↔fl oz and cups↔ml are pure
      arithmetic on a number already in hand. The only ingredient-dependent case is
      volume↔weight (cups→grams), where ~30 densities — flour, sugars, butter, rice, oats,
      cocoa, honey, water/milk — cover nearly all baking, which is the only place the precision
      matters. Savoury cooking tolerates approximation.

      A table is right; a *database* table is the overkill part. The data is identical for every
      user, never mutates, and needs no queries or sync. A plain TS constant ships in a few kB,
      needs no migration, works offline, and is directly unit-testable — which matters, because
      this is arithmetic that should be covered by tests rather than checked by eye.

      **Rejected: converting via a Gemini call when the toggle is engaged.** Tempting because it
      handles the long tail, but (a) it is non-deterministic, so the same recipe shows different
      numbers on different views, devices, or to the person it was shared with — a measurement
      toggle that is not stable is not trustworthy; (b) a wrong conversion is undetectable and
      ruins the dish (200g flour returned as 1 cup rather than 1⅔ fails a bake), which is the
      same confidently-wrong failure mode flagged in UX-39; (c) it puts latency, quota and a
      failure state behind a toggle that should be instant, and cannot be tested.

      **Fallback must not guess.** For an unknown ingredient, do volume→volume (cups→ml, always
      correct) or leave the line untouched. Never invent a density.

      **In scope, confirmed by the user 2026-07-28** — both were initially noted as asides:

      1. **Unit synonym normalisation.** `unit` is free text from the model, so the same unit
         arrives as `tbsp` / `tablespoon` / `T` / `Tbsp.`. Normalise to a canonical key before
         any lookup, or conversions silently no-op on spellings the map does not happen to
         contain. This is the difference between the toggle working and the toggle working
         *sometimes*, which is worse.
      2. **Temperatures.** Converting ingredients while leaving "Bake at 180°C" untouched is a
         half-done toggle — the oven is exactly where an imperial cook is stuck. This is harder
         than ingredients because temperatures live inside `Instruction.text` prose, not a
         numeric field, so it means rewriting rendered text rather than formatting a number.
         Notes: match at display time only and never mutate the stored string; handle the real
         spread of forms (`180C`, `180 °C`, `350F`, `180°`, ranges like `180-200°C`, and gas
         marks, which convert to neither system and should be left alone); round to sane oven
         steps (177°C is technically right for 350°F and useless on a dial — go to 175/180);
         and convert only plausible cooking temperatures so a stray "200" or a time like
         "350 minutes" is not mangled. Bare `180°` with no unit is ambiguous and should be left
         as-is rather than guessed.

      Other constraints: convert at display time only, never rewriting the stored recipe, or a
      shared link changes meaning depending on who last viewed it. Preference lives in Settings
      beside Theme and persists via `storage.ts`.
      (`types/recipe.ts` Ingredient + Instruction, `components/recipe/IngredientList.tsx`,
      `components/recipe/InstructionList.tsx`, `SettingsPage.tsx`, new `lib/units.ts` + tests)
- [ ] **UX-39** Recipes carry no macros. Requested by the user 2026-07-28: calories and
      protein/carbs/fat, presumably per serving so it composes with the existing `servings`
      field.
      Two possible sources, and the choice matters. Asking Gemini for macros in the same call
      is nearly free but the numbers are plausible-looking guesses, which is the worst failure
      mode for nutrition data — wrong and confident. Computing from a food database is accurate
      but needs ingredient matching and a data source. Whichever is chosen, macros must be
      visibly labelled as estimates, and per-serving must be stated rather than implied.
      Schema change plus `MetadataPills`/`RecipeContent` display; existing recipes have no
      macros and need an absent state rather than zeros, which would read as "no calories".
      (`schemas/recipe.schema.ts`, `types/recipe.ts`, `lib/prompts.ts`,
      `components/recipe/RecipeContent.tsx`)

---

# Accepted risks (watch, not backlog)

- **RISK-1** Client-side prompt construction. With Firebase AI Logic the browser builds
  the request, so the system instruction ships in the bundle and someone running the app can
  send arbitrary prompts to the project's Gemini quota. App Check raises the bar (valid app
  attestation required) but does not remove it. There is also no server hop, so per-account
  rate limiting has nowhere to run — App Check blocks unauthorized *apps*, not a legitimate
  user hammering the button.
  Accepted 2026-07-28 as a deliberate trade for avoiding Blaze and the extra machinery.
  Watch for: unexplained quota consumption, or generations that don't look like recipes.
  Mitigations in increasing order of effort, if it ever bites:
  1. Enforce `responseSchema` on the model config so output must be a valid recipe — cheap,
     and worth doing anyway since `lib/prompts.ts` already hardcodes the JSON schema.
  2. Constrain input to structured fields (cuisine, ingredients, dietary dropdowns) instead
     of free text, which removes the arbitrary-prompt surface rather than policing it.
  3. Route generation through `functions/` — the Gemini proxy Cloud Function is already
     written and committed but inert. It owns the prompts server-side and enforces a
     per-account 30/hour limit. Requires the Blaze plan.
