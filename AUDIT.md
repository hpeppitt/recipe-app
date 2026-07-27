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
- [ ] **FUN-8** After a recipe is deleted, `removeCloudFavorite`'s batch update on the
      missing doc rejects, so the cloud favorite can never be removed.
      (`firestore.ts:136-145`, `useFavorites.ts:50`)
- [ ] **FUN-9** Favorite toggle read-then-write race: double-tap runs `increment(1)` twice,
      permanently inflating `favoriteCount`. (`useFavorites.ts:39-67`, `:82-105`)
- [ ] **FUN-10** `publishRecipe` uses unconditional `setDoc` that resets `favoriteCount`
      and `viewCount` to 0 on any re-publish. Latent until a retry mechanism exists.
      (`firestore.ts:27-35`)
- [ ] **FUN-11** Version tree and variation dedup read local Dexie only: empty tree and
      zero dup detection when varying someone else's cloud recipe.
      (`useRecipeTree.ts:5-11`, `db/recipes.ts:55-57`)
- [ ] **UI-6** "Suggest a Change" exists only on `/shared/:id`; non-owners browsing the
      shared feed land on `/recipe/:id` which has no suggest affordance, making the
      headline collaboration feature undiscoverable. (`SharedRecipePage.tsx:245-251`)
- [ ] **UI-7** Recipe detail back button always goes to `parentId` or `/` with
      `replace: true`, ignoring real history (tree, profile, notifications) and corrupting
      the hardware back button. (`RecipeDetailPage.tsx:39-45`)
- [ ] **UI-8** Notification dropdown (`w-80`, right-anchored) clips offscreen on 320-390px
      viewports. (`NotificationBell.tsx`)
- [ ] **UI-9** RecipeCard nests a `span role="link"` with onClick inside a `<button>`:
      creator link is unreachable by keyboard and broken for screen readers.
      (`RecipeCard.tsx`)
- [ ] **UI-10** Touch targets below 44px: TopBar icon row (32px), suggestion Approve/Reject
      text buttons (~24px). (`RecipeDetailPage.tsx:117-169`, `:270-281`)
- [ ] **UI-11** Version tree costs 48px per depth level in a non-scrolling column; deep
      chains leave <150px for cards on a phone. (`VersionTreePage.tsx:90`)
- [ ] **UI-12** Cloud failures render as happy empty states: Firestore offline shows
      "No recipes yet" and "Recipe not found" instead of an error with retry.
      (`useRecipeLibrary.ts`, `useRecipe.ts`, `LibraryPage.tsx:190-195`)

## Low severity

- [ ] **FUN-12** `incrementRecipeViews` in useEffect under StrictMode double-counts every
      view in dev. (`RecipeDetailPage.tsx:76-81`, `main.tsx:7`)
- [ ] **FUN-13** Cloud fallback gated on an arbitrary 100ms setTimeout instead of awaiting
      the Dexie query. (`useRecipe.ts:24-45`)
- [ ] **FUN-14** "Create New Anyway" has no in-flight guard; double-click runs two
      concurrent Gemini generations. (`useRecipeChat.ts:95-99`)
- [ ] **FUN-15** A failed first message (e.g. no API key) consumes the one-shot dedup
      check; dedup is permanently skipped for the rest of that chat session.
      (`useRecipeChat.ts:64-93`)
- [ ] **UI-13** Inconsistent feedback patterns: native `alert()` in Settings import, three
      different empty-state styles, ad hoc Button reimplementations on ProfilePage.
      (`SettingsPage.tsx:55-57`, `ProfilePage.tsx:308-318`, `:408-413`)
- [ ] **UI-14** Modal/dropdown a11y gaps: dialogs missing `aria-labelledby`, bell missing
      `aria-expanded` and unread count announcement, unlabeled search input, ChatInput
      autofocus fights AuthModal focus. (`AuthModal.tsx`, `NotificationBell.tsx`,
      `LibraryPage.tsx:78-84`, `ChatInput.tsx`)

## Known limitation introduced by the security rules

Client-side UID migration (`AuthContext.tsx:59`, `firestore.ts:423-519`) rewrites docs
belonging to the OLD uid while authenticated as the NEW uid. Rules cannot verify the old
identity, so these writes are now denied. The call is fire-and-forget so nothing crashes,
but cloud data will not migrate when an email sign-in lands on a different uid. Proper fix:
a Cloud Function using the Admin SDK, or linking credentials so the uid never changes.
Local Dexie migration is unaffected.
