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
