# QA ledger

What has landed on `main` since the last release and what the human QA pass must check.
`/next-ticket` appends a section per ticket; `/qa-pass` collates this file, the pending
decisions, and the preview build into a checklist; `/release` moves the accepted entries
into `CHANGELOG.md` and clears this file.

## Standing checks

Things no agent can verify here, so every QA pass covers them at a 390x844 viewport in
both themes:

- Library loads, cards render, search and the favourites filter work.
- A recipe detail page: action row, breadcrumb, variation chips, the version tree.
- `/create` shows the composer for a verified account and the sign-up call to action otherwise.
- A `/shared/:id` link opened signed out, in a fresh browser profile.
- The browser console shows no errors or unhandled rejections on that walk.
- `TreeIntro` renders legibly on the second root recipe opened (AUDIT UI-16, never yet seen in a browser).

## Since the last release

### RL-005 Distinguish "recipe not found" from "could not load" on a cold first load

- Cold load: open a shared link (`/recipe/<id>`) in a fresh browser profile or a private window. It should show the recipe, never "Recipe not found".
- Slow or offline read: in devtools Network, set throttling to Offline (or block the Firestore host), open a shared recipe you have not viewed on this profile, and wait about 6 seconds. You should see "Could not load this recipe" with "Try again". Go back online and tap it: the recipe appears.
- Same check on `/recipe/<id>/edit`, which used to say "Recipe not found" in this case.
- A made-up id with a working connection should still say "Recipe not found."
- Where the defect was: not in `useRecipe` or `RecipeDetailPage`, which already branched on
  `cloudError`. `RecipeEditPage` ignored it, so a cold-load timeout there said "Recipe not found".
  `RecipeEditPage.tsx` is outside the ticket's file list; the ticket asked to establish the cause
  first.
- Reviewer noted (med, UI): the error state is hand-rolled JSX duplicated in `RecipeEditPage.tsx`
  and `RecipeDetailPage.tsx` instead of the shared `EmptyState` with its `action` slot, which
  `VersionTreePage` and `ProfilePage` use, so type scale and spacing differ slightly. A cheap
  follow-up.
- Reviewer noted (low): the error text has no `role="alert"` and the emoji is not `aria-hidden`
  (fixing `EmptyState` would cover every caller); "Try again" is primary here and secondary on the
  tree and profile pages; copy uses "Could not load" here and "Couldn't load" on `VersionTreePage`,
  `ProfilePage` and `RecipeChatPage`.
- Noticed by the implementer: `useRecipe.test.tsx` waits through the real 6 second timeout, which
  adds about 6 seconds to the suite. Fake timers would remove it.

### RL-004 Guard RecipeContent against malformed documents and add an error boundary

- Standing walk, plus a look at a recipe detail page and a shared recipe in light and dark mode.
- No real recipe lacks an array today (`publishRecipe` writes complete documents), so the
  missing-array guard is covered by tests only. If you can edit a cloud recipe in the emulator
  and delete `ingredients`, the page should show "This recipe has no ingredients to show." and
  the rest of the recipe.
- Boundary fallback: temporarily throw in a page's render in dev. You should see "Something went
  wrong" with "Back to library"; on a shell page the bottom nav stays. Tapping the button goes
  home, and navigating elsewhere clears the fallback.
- Reviewer noted (med): if the failing route is `/` itself (the library throws on a corrupt cloud
  document, the likeliest crash), "Back to library" resets the boundary and navigates to `/`, the
  pathname does not change, the page throws again and the fallback returns at once, so the button
  looks dead. Consider a Reload action on the fallback.
- Reviewer noted (med, a11y): the fallback has no `role="alert"` and no focus move, so focus drops
  to `<body>` when the crashed page unmounts and screen reader users hear nothing.
- Reviewer noted (low): the boundary in `AppShell` and the one around `Routes` nest correctly (the
  nearest catches, no double report), but an error thrown by `AppShell` itself falls to the outer
  one and the nav disappears. The `RecipeContent` missing-section notice uses `role="status"` on
  content already present, which is not announced, and has no matching heading. An empty array
  (not absent) still renders a heading with an empty body. Indentation inside
  `<RouteErrorBoundary>` in `App.tsx` is off.

### RL-041 Anonymous and signed-out users can only bookmark locally, and every other action routes to sign-up

- Release ordering: RL-041 must ship in the same release as RL-040's rules, and be live before
  RL-022 deploys them. With the rules live and an older client, anonymous favourites, follows and
  the first-sign-in profile write all fail with `permission-denied`.
- On the preview build, as an anonymous account (Continue Anonymously), with the console open:
  - The sign-in prompt's anonymous option says it only saves bookmarks on this device.
  - Bookmark a recipe from its detail page and from a `/shared/:id` link, then open the
    Favorites filter: both appear.
  - Open someone's profile and tap Follow: "Sign up to follow ..." opens with the email form,
    and nothing is followed.
  - Open your own profile and tap the avatar, then the name: each opens "Sign up to edit your
    profile" rather than the editor.
  - Share a local recipe: you get a self-contained link, with no publish attempt.
  - Console clean throughout: no `permission-denied`, and no `clientErrors` reports.
- Signed out: Follow on a profile opens the same sign-up dialog; the heart opens the sign-in
  prompt.
- Verified upgrade: as an anonymous account, add an email from your profile and open the link in
  the same browser. Afterwards your profile shows your email (no reload needed), and a
  `profiles/{uid}` document exists for the same uid with the generated name. Then follow someone
  and publish a recipe: both succeed and your recipe count goes up. Local bookmarks are still
  there (pushing them to the cloud is RL-034).
- As a verified account: favouriting, following and profile editing behave exactly as before.
- Not run by the agent: any browser walk. Covered by unit, hook and component tests only.
- Reviewer noted (med, data): verified users reading a missing doc probably still throw
  `permission-denied`, because the `follows` and `favorites` read rules dereference `resource.data`
  (`useFollow.ts` line 26 and `useFavorites.ts` line 130 have no `.catch`). That would beacon as an
  unhandled rejection on most profile and shared-recipe views for a verified user. Unconfirmed
  against the emulator; check the console as a verified account. Same class as RL-026.
- Reviewer noted (med, data): `runMigration` still calls `migrateFirestoreUid` on uid drift for
  anonymous accounts. Its `favorites` and `notifications` queries are denied, the error is
  swallowed so nothing beacons, but it is wasted work and console noise.
- Reviewer noted (med, data): after an upgrade, unfavouriting a bookmark made while anonymous runs
  `removeCloudFavorite` on a doc that was never created. The delete is probably denied and
  reported as `unfavorite`, once per old bookmark, until RL-034 pushes local bookmarks to the cloud.
- Reviewer noted (med, data): profile creation on the upgrade is fire-and-forget with no retry, and
  `setUser` runs before it resolves. If it fails or loses the race, `followUser` fails its whole
  batch on the missing follower profile (and `useFollow.toggle` has no catch). Making `followUser`
  ensure the follower profile first would close it.
- Reviewer noted (med, UI): the anonymous sign-out confirm on `ProfilePage.tsx` (about line 359) is
  stale. It talks about copies already shared and never says the real loss, the device bookmarks.
  The `AuthModal.tsx` choose-step subtitle (about line 81) still says "get credited as the creator"
  and its code comment says "credited identically". The `EmailLinkingForm` email input has no
  accessible name (placeholder only). The favourite tap does nothing after a signed-out user picks
  Continue Anonymously, so they must tap again, and the heart looks dead in local-only mode.
- Reviewer noted (low): favourite state diverges for an upgraded user on `/shared/:id` (cloud
  only) versus the detail page (Dexie); `EmailLinkingForm` default copy says "keep your recipes
  safe" and "secure your account"; its error and success lines have no `role="alert"` or
  `role="status"` and its layout is tight at 320px; `SignUpDialog` duplicates the
  `SuggestChangeModal` gate markup and has no max height; `aria-expanded` is misleading on the
  profile edit buttons for anonymous users; an anonymous sign-out then a new anonymous sign-in
  orphans the old bookmarks, which the confirm dialog should say; link completion may run twice
  under StrictMode in dev.
- For the author (docs outside this ticket, left untouched): `README.md` line 41 ("everyone else
  can favourite and suggest"), lines 26 to 30 (feature list has no verified-email qualifier) and
  lines 113 to 115 ("world-writable in practice", which goes stale when RL-022 deploys the RL-040
  rules). `CHANGELOG.md` is due at release for the user-visible changes.

### RL-018 Suggestions and their reply threads are readable only by the recipe owner and the suggester

- Rules and index change; nothing differs in the live app until RL-022 deploys. Ordering for
  RL-022: build the two new `suggestions` indexes and release this client first, then deploy
  these rules. With the rules live and the old client still cached, its unfiltered query is
  denied (the emulator denies it even for the owner) and the suggestions list goes blank.
- On the preview build, with a recipe that has suggestions from two different accounts:
  - The owner (verified) sees every suggestion and can open each reply thread.
  - The suggester (verified) sees only their own suggestion and its thread.
  - A third verified account sees no suggestions section, and the console is clean.
  - An anonymous account sees no suggestions section, and the console is clean.
- Approve and reject as the owner, and reply from both sides: all still work.
- Not run by the agent: the three-account app walk. The rules were probed on a demo-project
  emulator (`demo-rl018`) over REST: 18 of 18 as expected, and the same script against the
  previous rules allowed all 10 cases that should now be denied.
- For the author: this narrows who can see what. Suggestions and reply threads were readable by any
  signed-in account, anonymous included. After RL-022 only the recipe owner and the suggester, each
  with a verified email, can read them. That matches what the UI already showed, so no privacy copy
  changes.
- Reviewer noted (low): `subscribeRecipeSuggestions` passes no `onSnapshot` error callback, unlike
  `subscribeSuggestionMessages`. If the rules deploy before the new indexes finish building, a
  verified user hits an uncaught listener error in the console and the list silently shows nothing.
  Add an error callback that calls `reportError`.
- Reviewer noted (low): the page-level `isOwner` is still `canManageRecipe`, true for any local copy.
  A non-creator with a local copy sees approve and reject buttons on their own suggestion, and
  pressing approve is now denied at the `getDoc` in `updateSuggestionStatus` instead of at the
  update. Check the approve and reject handlers surface the rejection and do not leave an unhandled
  rejection.
- Reviewer noted (low): a legacy suggestion with a wrong `recipeOwnerId` never appears in the
  owner's query and a direct read is denied, so it stays unreviewable (the update rule keys on the
  same field already); the suggester still sees it. A suggestion on a deleted recipe is not shown to
  anyone. RL-042 wipes legacy data.

### RL-016 Recipe writes have a bounded createdAt, capped title and array sizes, and an immutable createdAt

- Rules change; nothing differs in the app until RL-022 deploys `firestore.rules`.
- After the RL-022 deploy, on live: publish a new recipe, then edit an existing published one
  and save. Both succeed and the edit shows on the shared page.
- Expected and accepted: a device whose clock runs more than a minute fast cannot publish.
- Not run by the agent: the `npm run dev:emulated` publish, edit and re-publish walk. The rules
  were probed over REST on a demo-project emulator (19 of 19 as expected; the same script against
  the previous rules allowed all 9 of the cases that should now be denied).
- Reviewer noted (med, for RL-036): the editor (`lib/recipeEdit.ts`, `RecipeEditPage.tsx`) has no
  title or list cap matching the rules. A recipe saved over a cap writes Dexie, then the cloud
  update is denied and the user gets the local-only toast, so the owner sees the edit while everyone
  else sees the old version. Over-cap content on a new recipe falls back to a local-only link.
- Reviewer noted (med, for RL-036): `createdAt` on import (`lib/import.ts`, `recipe.schema.ts`)
  accepts floats, future and huge values. A future or fractional `createdAt` on a later share is
  denied by the create rule and `handleShare` quietly falls back to a self-contained link.
- Reviewer noted (low): re-publish always sends the local `createdAt`, so a legacy cloud doc with
  no `createdAt`, or an imported copy whose local value differs from the cloud one, is denied as a
  changed key. A stored recipe already over a cap cannot take any owner update, including approving
  a suggestion (the collaborator write), and shrinking it is subject to the same check. RL-042
  wipes legacy data, so this should not occur on fresh data. The caps are checked on every owner
  update, not only when those keys change; scoping them to updates that touch those keys would
  fix the approval case.
- Noticed by the implementer (low): `ImportedRecipeSchema` accepts any number for `createdAt`
  (`z.number()`, not `.int()`), and `useRecipe` falls back to `createdAt ?? 0` for a cloud doc
  with none, which the immutability rule would deny on re-publish.

### RL-015 Notification creates need a verified email, a known type, a fixed key set and a capped message

- Rules change; nothing differs in the app until RL-022 deploys `firestore.rules`.
- After the RL-022 deploy, from a second verified account, favourite a recipe and follow its
  owner. Sign in as the owner and confirm the bell shows both notifications.
- Optional: file a suggestion longer than 500 characters. The owner's notification shows it
  cut with a trailing ellipsis; the suggestion itself shows the full text.
- Not run by the agent: the app against the emulator. The rules were probed on a demo-project
  emulator (19 of 19 as expected, including the 500 and 501 limit and the 250 and 251 emoji limit).
- Reviewer noted (low): the rule does not type-check or cap `recipientUid`, `recipeId`,
  `recipeTitle`, `recipeEmoji`, `fromDisplayName` or `createdAt`, so a verified user can still send
  an oversized `recipeTitle` or a wrong-typed field to any recipient. Out of scope for this ticket;
  worth a follow-up only if you want full shape validation.
- Reviewer noted (low): `updateSuggestionStatus` reads `suggestion.recipeTitle` with no fallback. A
  legacy suggestion without it would make the SDK throw on `addDoc` after the status write landed,
  which surfaces as a failed review. The suggestions create rule also does not require `message`
  to be a string. RL-042 wipes legacy data, so this should not occur.

### RL-040 Every client cloud write except view counts and error reports requires a verified email, and the decision is recorded

- Rules and docs only; nothing changes in the app until RL-022 deploys `firestore.rules`.
- Release order: RL-041 (the client half) must ship in the same release, and before RL-022
  deploys these rules. Deploying the rules without RL-041 leaves the client attempting writes
  the rules now deny.
- Once deployed, anonymous users lose every cloud write: favourites, follows, notifications
  (create, mark read, delete) and their profile. They keep local bookmarks only. Check on the
  preview with an anonymous account that favourite and follow fail quietly or are hidden
  (per RL-041), and with a verified account that all of them still work.
- An anonymous first sign-in no longer creates a cloud profile; check the profile page still renders for that account.
- Signed out, open a `/shared/:id` link: the view count still increments and the console shows
  no permission errors. A crash report from a signed-out session still lands in `clientErrors`.
- Confirm the generation question in the ticket Notes: generation is unchanged by this decision.
- Reviewer noted (med, for RL-041): `linkWithCredential` keeps the uid and does not re-fire
  `onAuthStateChanged`, and the profile is only ensured at `AuthContext.tsx` lines 237 and 255. An
  anonymous account whose profile create is now denied, then upgraded by email link, ends up
  verified with no profile doc. Then `followUser` fails its whole batch on the missing
  `profiles/{followerId}`, and the `publishRecipe` profile `updateDoc` fails and is only logged, so
  `recipeCount` drifts. RL-041 should ensure the profile once the user becomes verified, or make
  `followUser` and `publishRecipe` create it when missing.
- Reviewer noted (low): a verified user can still bump any recipe's `favoriteCount` or any
  profile's `followerCount` by 1 with no backing favourite or follow doc, and can create a
  notification for any `recipientUid` with arbitrary content (shape checks are RL-015). An owner can
  set `favoriteCount` and `viewCount` to any value.
- For the author (docs outside this ticket, left untouched): `README.md` line 41 ("everyone else can
  favourite and suggest") and lines 113 to 114 ("Publishing requires only a signed-in user ... so
  today the shared library is world-writable in practice") now state the old rule. `ROADMAP.md`
  lines 684 to 685 (the current boundary statement) is wrong, and the landed 1.6 entry at lines
  310 to 313 and 322 to 325 is history that RL-040 supersedes.

### RL-039 Production dependencies have no known critical or high advisories that npm audit fix can resolve

- Lockfile-only change (`npm audit fix`, no `--force`). On the preview build do the standing walk,
  with attention to two areas.
- Navigation (react-router went to 7.18.4): click through Link flows (home, recipe, version tree,
  shared link), trigger `useNavigate` flows (delete a recipe returns home, sign-in return), open
  a deep link and a bad URL, and use the browser Back and Forward buttons. Redirects must land
  in-app and Back must not loop.
- Live Firestore listeners: signed in, open a recipe and confirm suggestions and the library update
  live; open `/shared/:id` signed out and confirm the console is empty.
- 4 high advisories remain by design (@grpc/grpc-js chain, Node-only, not in the bundle). See the
  ticket Notes for the table.

### RL-023 Deleting a recipe waits for the cloud delete and tells the user when published copies remain

- On the preview build, signed in with a verified email, open a published recipe, set the network
  to Offline in devtools, and delete it. The Delete button reads "Deleting..." and is disabled for
  up to 10 seconds, then a dialog reads "Removed from this device, but N published copies could not
  be removed from the shared library." with "Try again" and "Leave anyway". After a timeout the
  copy states no number ("...the shared library did not confirm its published copies were
  removed."). The page does not navigate on its own.
- Go back online and press "Try again": the app goes home, and the recipe's `/shared/:id` link
  no longer loads.
- Repeat and press "Leave anyway": the app goes home and the `/shared/:id` link still works.
- Online, delete a published recipe: it goes home as before, with no dialog. Also try one with an
  unpublished local variation beneath it: still no dialog.
- As an anonymous user, deleting a local recipe goes straight home and never shows the dialog.
- For the author: a recipe published anonymously before the verified-email gate is orphaned
  when its unverified owner deletes it. The delete is local only, so the cloud copy stays at
  `/shared/:id` and no dialog says so.
- Not run by the agent: no browser. Covered by a mocked-Firestore unit test of the owner filter only;
  there is no page test for `handleDelete`.
- Reviewer noted (high, fixed): the first pass attempted deletes on never-published local ids, which
  the rules deny, so the dialog showed a false failure and "Try again" never cleared. Leftover ids
  are now read with `getDoc` first and skipped when missing or foreign. Round 2 confirmed it.
- Reviewer noted (med): the `emailVerified` gate is stricter than the delete rule, so an
  unverified owner of a pre-gate public copy cannot remove it (ticket-mandated, see the orphan
  note above). Offline, Firestore queues the deletes: after the timeout dialog they can still land
  once the network returns, even after "Leave anyway", and each "Try again" queues a duplicate set.
- Reviewer noted (med, UI): Escape is not blocked while `busy`, so it can close the delete dialog
  mid-delete (leaving a bare "Deleting..." page for up to 10 seconds) or act as "Leave anyway"
  during a retry. Consider `onCancel` preventDefault on `ConfirmDialog` when busy, and a neutral
  Escape on the failure dialog.
- Reviewer noted (low, UI): the dialogs remount when the recipe disappears mid-delete (different
  child index, no key); at 320px the footer ("Leave anyway" and "Trying again...") may wrap or
  squash, so check it; busy state has no `aria-busy` or live region, and focus is lost after a
  failed retry; the "Deleting..." page has no spinner; the copy does not say the copies are still
  public; the "all N variations" line at about `RecipeDetailPage.tsx:528` does not use `pluralize`.
- Reviewer noted (low): `trackRecipeDeleted` fires before the local delete succeeds and again on a
  re-click; a failed `getDoc` on a missing doc still produces a phantom failure (rare, commented);
  no test for the `getDoc` rejection fallback or retry-after-partial-success.

### RL-017 Suggestions must name the real recipe owner, and approval adds the collaborator before marking approved

- Needs the rules deploy (RL-022) before the owner check is live on the preview.
- On the preview build, as user B suggest a change on user A's published recipe. As A, approve it:
  B appears in the recipe's collaborators, and B receives the "suggestion approved" notification.
- If an approval fails, the page shows "Couldn't approve that suggestion. Please try again." and
  stays put (no jump to the variation composer); the suggestion still reads as pending.
- Not run by the agent: the full approve flow against `npm run dev:emulated`. The create rule was
  probed on a demo-project emulator (correct owner allowed, wrong owner and missing recipe denied).
- Reviewer noted (med): approve now needs the recipe update to succeed, so it can fail for good on
  legacy data (suggestion whose cloud recipe was deleted, or a wrong `recipeOwnerId` that matches
  the reviewer but not the recipe's `createdBy`). The "Please try again" text will mislead there.
  Reject still works. Cleanup is deferred to RL-042.
- Reviewer noted (med): `recipeOwnerId` comes from the local Dexie `createdBy.uid` but the rule
  checks the cloud recipe's. A local copy whose uid differs (for example after the blocked uid
  migration) is denied, and the modal says "That didn't send. Check your connection", which
  blames the network for a permanent denial.
- Reviewer noted (low): if the cloud writes succeed but `addLocalCollaborator` throws, the UI shows
  "Couldn't approve" while the suggestion is already approved, with no retry path. A partial
  failure (collaborator written, status not) leaves the owner's local view without the collaborator
  until a retry. The in-flight guard reads React state, so a same-tick double click could send the
  notification twice.
- Reviewer noted (low): the `?? 'local'` owner fallback in `RecipeDetailPage.tsx` and
  `SharedRecipePage.tsx` only produces a doomed write. Check `danger-600` contrast in dark mode.

### RL-003 Gate the suggestions listener on a signed-in user

- Open a `/shared/:id` link in a fresh signed-out profile (private window) and confirm the
  browser console is empty: no `permission-denied`, and no new `clientErrors` document.
- Sign in and open one of your recipes: suggestions still appear and update live.
- Sign out on a recipe page: the suggestions area empties, nothing stale from the account.
- Reviewer noted (low): the comment in `useSuggestions.ts` and the ticket say the keying matches
  `useSuggestionThread`; it does not (that hook keys on suggestion id only and relies on an empty
  list when signed out). The test does not cover a `recipeId` change for the same user. A signed-in
  user who hits a real denial still gets an uncaught listener error, which is out of scope here.

### RL-002 Add a component and hook test harness

- No visible change. Check only that `npm test` is green on the preview branch and that the
  app still loads (`AuthContext` gained two exports, nothing else in `src/` changed).
