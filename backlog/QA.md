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
