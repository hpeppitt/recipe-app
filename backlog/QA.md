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
