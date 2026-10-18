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

### RL-083 Editing a recipe is cloud first for a verified owner

- On the preview as a verified user, edit a recipe and tap Save. The recipe page opens with the save toast, and the edit shows on its `/shared/<id>` link.
- Edit again, set DevTools to offline, and tap Save. Within about 5 seconds the form shows "Couldn't save your changes. Check your connection and try again." above Save, the draft is still there, and Save works again.
- Go back online and tap Save. The recipe page opens and the edit is on the `/shared/<id>` link.
- Check the error at 390 px in both themes: readable, red, directly above the Save button.
- Reviewer noted (med, UI): the save error uses `text-danger-600`, about 3.7:1 on the dark surface; use `danger-500` or `dark:text-danger-300` (`RecipeEditPage.tsx:518`).
- Reviewer noted (med, UI): the TopBar back arrow is not guarded while a save is in flight, so a user can leave mid-save and never see a failure, or be pulled back by a late success (`RecipeEditPage.tsx` about 168-181 and 261). Try it during the offline save.
- Reviewer noted (med, UI): a save that times out at 5 s may still land, so "Couldn't save" can be wrong; the edit then appears once the sync arrives.
- Reviewer noted (med, data): the page pre-checks the cloud copy and then `publishRecipe` does its own `getDoc`, so a delete on another device between the two reads would let an edit take the create path (daily window used, `recipeCount` bumped, recipe resurrected); an update-only publish would close it (`RecipeEditPage.tsx` 208-211, `firestore.ts` 73-99).
- Reviewer noted (med, data): a timed-out publish keeps running; if the user retries and succeeds, the stale first write can land later and revert the cloud to the older edit while Dexie holds the newer until the sync arrives.
- Reviewer noted (med, data): the edit is built from the render-time recipe and `put` over the whole Dexie row, so changes that arrived after the form opened are overwritten in both stores (last write wins; the fetched cloud copy is unused).
- Reviewer noted (low, data): Dexie keeps the user's tag casing until the next sync lowercases it; Dexie-only edits for an unverified owner of a cloud copy can diverge from it; tests lack a late-landing publish case and the Dexie-write-failure-after-publish branch.
- Reviewer noted (low): anonymous and local-only edits also navigate with `saved: 'cloud'`; "Saving…" is not announced; after "no longer in your account" the only exit is Cancel.

### RL-082 Saving a generated recipe is cloud first

- On the preview as a verified user, generate a recipe and save it. The recipe page opens with "Recipe saved", and the recipe is on Explore.
- Generate again, set DevTools to offline, and tap Save. After about 4 seconds the chat page shows "Couldn't save the recipe. Check your connection and try again.", the Save button works again, and nothing new appears in My Recipes.
- Go back online and tap Save on the same card. Exactly one copy appears in My Recipes and on Explore.
- The save error sits in the same red box as generation errors and has no "Try again" button (that button re-runs generation, so it is deliberately not offered).
- Reviewer noted (med, data): a publish that times out at 4 s may still land, so "Couldn't save" is not strictly true; a user who leaves instead of retrying gets a public recipe with no Dexie row until RL-078's listener fills it (`useRecipeChat.ts` about 320-329). A distinct timeout message ("taking longer than expected, tap Save again") would help.
- Reviewer noted (med, data): the built recipe is cached in `builtRef` and keyed only on the card, so a session change between a failed save and its retry reuses the old `createdBy.uid` and `publishRecipe` throws; key it on `user?.uid` too (`useRecipeChat.ts` about 315-317).
- Reviewer noted (med, UI): `saveRecipe` does not clear the previous error when a retry starts, so the old message shows next to "Saving…" (`useRecipeChat.ts` about 276-283).
- Reviewer noted (med, UI): the auto-scroll effect in `RecipeChatPage.tsx` (about 106-108) does not depend on `error`, so a save error from an older card can land off-screen.
- Reviewer noted (low): the error box has no `role="alert"`; tests lack a late-landing-publish retry case and a concurrent double-tap case; the timeout test spends a real 4 s.

### RL-076 Pure sync plan for a verified user's own cloud recipes

- Nothing to check in a browser yet. `planOwnRecipeSync` is pure and unused until RL-078 wires the listener, which is the ticket that makes it visible.
- Reviewer noted (low): the plan treats the snapshot as complete, so RL-078 must skip `snapshot.metadata.fromCache` and any narrowed query, or an offline device would lose its cached own rows (`recipeSync.ts` about 75-78).
- Reviewer noted (low): a Dexie row with no `createdBy` would throw and abort the whole plan (`recipeSync.ts:101`); the type forbids it.
- Reviewer noted (low): a valid cloud doc by another author sharing an id with an own local row protects that row; no test covers it.

### RL-061 Share on an unpublished recipe asks anonymous and signed-out users to sign up

- On the preview build, as an anonymous user, open a recipe saved from a share link and tap Share: the sign-up dialog shows and nothing is copied.
- As an anonymous user, open a published recipe from Explore and tap Share: its `/shared/<id>` link is copied with no dialog.
- Add an email, open the link, return to the recipe and tap Share: a `/shared/<id>` link is copied if you created it, otherwise a self-contained link.
- Repeat the first step signed out.
- Check the dialog at 390 px in light and dark mode, and on "Not now" note where keyboard focus lands (expected: top of the page, not the More options button; see reviewer note).
- Reviewer noted (med): focus is not restored to the More options button after the dialog closes (`RecipeDetailPage.tsx` about 529-532 and 139, with `SignUpDialog.tsx:28`); fix is a ref on the button focused in onClose.
- Reviewer noted (med): a failed or timed-out published check shows the sign-up dialog, so a user on a slow connection with a published recipe sees "Sign up to share" after up to 4s; consider a distinct "could not check, try again" message (`RecipeDetailPage.tsx` about 130-141).
- Reviewer noted (med): the Share item is only visually disabled while auth loads, with no text or aria hint (`RecipeDetailPage.tsx` about 533-536).
- Reviewer noted (med): the "Preparing share link..." role=status node mounts with its text so some screen readers will not announce it; pre-existing (`RecipeDetailPage.tsx` about 830-838).
- Reviewer noted (low): the early return that opens the dialog does not clear shareFallback or shareCopied, so an earlier "Copy this link" card or "Link copied" toast can sit beside the dialog (`RecipeDetailPage.tsx` about 121-141).
- Reviewer noted (low): the isSharing double-tap guard reads a stale closure value but is safe in practice (`RecipeDetailPage.tsx:120`).
- Reviewer noted (low): tests stub showModal and close so they cannot catch focus behaviour, and there is no test for the auth-loading disabled state or the 4s timeout path (`RecipeDetailPage.test.tsx`).

### RL-059 Published recipes store their tags in lower case, so the curated Explore chips find them

- On the preview build, as a verified user, generate a recipe whose AI tags include a capitalised cuisine (for example ask for "an Italian pasta dinner") and save it.
- Open Explore and tap the `italian` chip (or whichever chip matches the cuisine): the new recipe is listed.
- Open the recipe's own page: its tags still show as generated (for example "Italian"), not lower-cased.
- Reviewer noted (low): a non-string tag would make `normalizeTags` throw before any write, so nothing partial is stored; the recipe schema types tags as strings, so this is theoretical. (low) Re-publishing a recipe rewrites previously mixed-case published tags, which is intended; nothing backfills old documents (RL-042 wipes them).
- Reviewer noted (low): no test covers `publishRecipe` applying `normalizeTags` itself, only the pure function, in line with the repo's lib-tests convention.

### RL-060 Erasing a recipe owner keeps other people's suggestion threads, with the owner side anonymised

- The Privacy Policy marker `[DEPENDS ON RL-060 ...]` is gone from "Suggestions and replies". Re-read that paragraph during the RL-046 sign-off.
- The erase table in `docs/operations.md` ("Data requests") changed for suggestions on the erased user's own recipes. Read it before the next real erasure request.
  - Reviewer noted (low): a reply by a suggester in a kept thread now notifies `deleted-user` (`src/services/firestore.ts` about lines 637-645). It is newly reachable in this direction because those threads used to be deleted; practical impact is near zero because the thread is not reachable in the app.
  - Reviewer noted (low): the permanent fix for the stray-reply lookup is a collection-group `fieldOverride` for `messages.fromUid` in `firestore.indexes.json`. It is outside this ticket and needs a deploy, for the author to decide.

### RL-054 Product events go to PostHog, only after consent (PR #68)

- Build the preview with `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST` set. In a fresh browser profile with the network panel open, load the app: the consent banner shows and there is no request to the PostHog host.
- Choose "No thanks", use the app, reload: still no PostHog request, and no `ph_*_posthog` cookie or localStorage entry.
- In Settings, turn analytics on: events appear in PostHog's live view. Create a recipe: a `recipe_created` and an `$ai_generation` event arrive, and neither carries the prompt or recipe text.
- Signed in anonymously, the person in PostHog is the anonymous uid. After signing in with an email, it is the account uid, with no email or name.
- Turn analytics off in Settings: requests stop straight away.
- Build without the two variables: no banner, no Settings toggle, no console errors.
- Read `/privacy` and `/cookies`: the PostHog sections match what you saw.

### RL-056 A signed-in user can download all their data, local and cloud, from Settings

- Run `npm run emulators` and `npm run dev:emulated` (or use the preview build). Sign in with a verified email account, favourite a published recipe, follow another account, and make a suggestion on someone's recipe. Settings, Data, "Download my data": the button shows "Preparing..." and is disabled, then a `recipe-lab-data-<date>.json` downloads and a status line says so. Open it: valid JSON, `version`, `exportedAt`, `uid` at the top, and the favourite, the follow and the suggestion (with any replies) are in `cloud`. Local recipes and bookmarks are in `local`.
- Search the file for the other account's uid and display name: neither appears. They show as `other-user-1`, and the other person's reply text is still present.
- Signed in anonymously (and signed out): the button reads "Download my data (this device only)", and the file has `cloud: null` and the note that anonymous accounts keep data on this device only.
- Failure display: stop the emulators (or go offline) and click it as a verified user. Expect an alert saying the online data could not be read, and a file with the local part and an `errors` list. A signed-in but unverified email account sees "1 part could not be fully read" (suggestions are verified-only) and the rest of its data.
- Double-tap the button: one file only. The status text names the missing parts in plain words and says "Verify your email to include suggestions" for an unverified account. The helper line under the button explains the difference from Export All Recipes.
- Reviewer noted, not fixed (low): the status messages appear conditionally rather than in an always-present live region; the filename date is UTC, so it can be a day off near midnight; the status regions follow the page's existing pattern.
- Check it at 390px wide and in dark mode: the button is at least 44px tall and the status text is readable.
- Privacy Policy wording may now point at this download (author re-signs per RL-046). Lines that could now point at it (not edited, author-owned): `src/content/legal/privacy.ts` line 29 ("To see, export, correct or delete...") and line 208 (the portability line, which already carries a `[DEPENDS ON RL-056]` marker); `src/content/legal/terms.ts` line 84 ("Use Export All Recipes ... to keep a copy") could also mention Download my data.

### RL-043 A verified user's cloud favourites appear on every device they sign into

- Run `npm run emulators` and `npm run dev:emulated`. In browser profile A sign in with a verified email account and favourite a published recipe (Explore). In browser profile B (fresh, no local data) sign in to the same account, open Explore and pick Favorites: the recipe appears with a filled heart once its page is loaded. Open the recipe: the heart is filled.
- In a profile signed in anonymously, open the Library and a recipe with the network panel open: there is no `favorites` list query (no `runQuery`/Listen request on `favorites`).
- On B, unfavourite the hydrated recipe, then reload: it stays removed locally (the cloud doc was deleted by the unfavourite, so the next session's read does not bring it back).
- Reviewer noted (not fixed): (med) a failed or timed-out first fetch is never retried this session, because the uid is marked hydrated before the fetch; the cheap fix is `hydratedUids.delete(uid)` on a null result, deliberately not applied to keep the once-per-session contract, and the author may prefer a retry. (med) An unfavourite whose cloud delete failed or timed out comes back next session, because the removal set is in memory. (low) "Delete Recipes on This Device" followed by a new session re-adds every verified cloud favourite as a row for recipes no longer on the device: confirm the UI tolerates such rows, and consider the Settings copy. (low) `pushLocalFavoritesToCloud` right after hydration can report inflated `skipped` counts for rows already in the cloud. (low) The module-level `hydratedUids` and `removedThisSession` sets leak across tests that reuse a uid.
- Known limit, see backlog/DECISIONS.md: on B, the Favorites filter on My Recipes does not show the favourite (its recipe is not in this device's Dexie), and on Explore it shows only once the recipe's page has been loaded.

### RL-036 The recipe editor rejects negative amounts and enforces the same size caps as the rules

- On the edit page type `-1` as an ingredient amount and press Save. "Amounts can't be negative." should appear under Ingredients, Save should be blocked, and a screen reader should announce it.
- Paste a title over 200 characters: "Titles can be at most 200 characters." appears by the title and Save is blocked.
- Add more than 100 ingredient rows or 100 step rows (blank rows do not count): the matching "at most 100" error appears and Save is blocked.
- Reviewer noted (not fixed, page is outside this ticket's files): (med) Save on RecipeEditPage does not scroll or focus to the first error, and Save sits in a non-sticky footer, so on a long recipe the title or ingredients error can be off-screen; (med) the title, servings, prep and cook errors rendered by Input.tsx have no role=alert, aria-describedby or aria-invalid, so they are not announced; (low) 'Amounts can't be negative.' does not name the row; error text uses text-danger-500 (about 3.8:1 on a light surface); the 100-item caps are only reachable on Save and the message does not say how many to remove; the rules-sync test checks only the three numbers, not that hasBoundedContent is still wired into create and update. Worth one follow-up ticket for the edit form's error focus and announcements.


### RL-035 Unit abbreviations are never pluralised

- Open a recipe with an ingredient in `pt` or `qt` at an amount of 2 or more. It should read "2 pt" or "2 qt", not "pts" or "qts". Cups should still pluralise ("2 cups"), including after switching units so that a volume converts to cups.

### RL-033 Hosting sends X-Frame-Options DENY and X-Content-Type-Options nosniff

- On the preview channel (RL-013) or after release, run `curl -sI` on the site root and on an `/assets/` file. Both should show `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff`, and the Cache-Control values should be unchanged (`no-cache` on the root, `public, max-age=31536000, immutable` on the asset).
- Then complete an email-link sign-in end to end. Firebase Auth helper pages are served under `/__/auth/` on the hosting domain when it is the auth domain, so this is the check that matters. If sign-in breaks, see the risk note in `docs/operations.md` (hosting section).
- Open the app in a normal tab (not a test profile) and confirm reCAPTCHA and App Check still work, so recipe generation is not blocked.

### RL-030 Mark all notifications read works with more than 500 unread

- Tests only. Optional: seed 501 unread notifications on the emulator for one account, open the bell and tap Mark all read; all should clear, with no error.
- Reviewer noted, not fixed: (a) a notification deleted between the read and its chunk's commit fails that whole chunk (the batch is atomic); earlier chunks stay committed and a retry recovers. (b) `NotificationBell.tsx` passes `markAllRead` straight to `onClick`, and `useNotifications.ts` (line 54) awaits `markAllNotificationsRead` without a catch, so a rejection is not shown to the user: it surfaces only as an unhandled promise rejection in the console and the button does nothing visible. Not changed.

### RL-027 The library's cloud fetch ignores responses that arrive after a retry or unmount

- Tests only. Optional: on Explore over a slow connection, tap Retry and confirm the newest result wins.
- Reviewer notes, not fixed (hook out of scope), for a future ticket: (a) after a tag change there is a one-commit window where `loadMore` can run with the new tag and the old cursor; (b) the double-tap guard reads the `loadingMore` state closure, so two same-tick calls can both pass; (c) `loadMore` has no timeout, so Load more can spin forever offline.

### RL-009 Tag chips on the Explore tab

- Author deploy (production, not done by the agent): `firebase deploy --only firestore:indexes`, then wait until the new `recipes` index (`tags` ASC + `createdAt` DESC) shows READY in the console. It only needs to be READY before the client release carrying the chips; it rides in the RL-022 index step in `docs/operations.md`.
- On Explore at 390 px: the tag chip row scrolls sideways with no page overflow, chips are easy to tap, the active one is clearly filled in light and dark mode, and tapping it again clears it.
- With the index READY, tap a few tags: the feed refetches and shows only tagged recipes; an empty tag shows "No recipes tagged X yet" with Clear tag. Before the index is READY a tapped chip shows Could not load.
- The tag row now scrolls with the content (not sticky); the tab control, search and filter row stay sticky. Check 390 px and 320 px.
- Reviewer noted (not fixed): the `scrollbar-none` class is undefined (pre-existing, shared with the filter row); the All chip and the tag chips look identical; `hover:bg-border` equals `surface-tertiary` in dark mode (pre-existing); the active tag chip is not scrolled into view; the tag persists while hidden under Following or My Recipes (intended, a momentary lens).
- Tags are AI free text and may be capitalised ("Italian"); the filter matches lower case exactly. Check whether real recipes match the curated list.

### RL-052 Analytics load only after the user opts in through a consent banner, and the choice can be changed in Settings

- The banner only exists when `VITE_POSTHOG_KEY` is set at build time, and it is not set on production until RL-054. With no key: load the app in a fresh profile and expect no banner and no Privacy switch in Settings. This is the production state.
- To see the rest, build or run with `VITE_POSTHOG_KEY=phc_test` (any value; nothing is sent). Fresh profile: the banner shows at the top of the page, in normal flow (a deliberate change from "above the nav": fixed bottom items would collide with it), with the exact copy, a Cookie Policy link, and two equal buttons "Allow analytics" and "No thanks".
- "No thanks" hides it and it stays hidden after a reload. Repeat with "Allow analytics" (clear site data between).
- Settings > Legal shows "Privacy: allow analytics", reflecting the choice; flipping it changes it, and a banner never comes back after a choice. In a fresh profile, choosing in Settings makes the banner disappear.
- At 390 px in light and dark: banner readable, buttons at least 44 px tall, link works, nothing hidden behind it. On a page with a FAB (Library) while the banner shows: the FAB is visible and tappable. Trigger an update prompt or a recipe toast: it is not hidden by or hiding the banner. The last content of a long page is not clipped. Tab through it with the keyboard; the page stays usable (no overlay, no focus trap).
- Set a fake `_ga` and `_ga_TEST` cookie in devtools on the site domain (and any key setting), reload: both are gone and a later `_ga` cookie you add is left alone (it runs once). This runs with or without the key.
- To test re-asking: bump `CONSENT_VERSION` in `src/lib/consent.ts` and reload; the banner returns. The PostHog request checks are in RL-054.
- Reviewer noted (low): the banner only mounts inside AppShell routes (`/`, `/profile`, `/settings`), so a visitor who lands on `/shared/:id`, `/recipe/:id` or `/create` is not asked until they reach a shell page (analytics stay off meanwhile, which is the safe direction); the Cookie Policy page has no control to change the choice (Settings does). Banner moved from above the BottomNav to the top of the page to avoid the FAB, update prompt and toasts (deviation from the ticket wording, recorded in the ticket Notes).


### RL-058 GA4 is removed, and the analytics seam sends product events nowhere until PostHog is wired in

- On the preview build, open devtools. Network: filter `google-analytics` and `googletagmanager`, load the app, sign in, create and view a recipe; expect no request to either host. Application > Cookies: expect no new `_ga` or `_ga_*` cookie (clear site data first; old ones may remain from earlier visits).
- The GA4 property in the Google console can now be deleted by the author; this is optional and nothing in the repo depends on it. Remove the `VITE_FIREBASE_MEASUREMENT_ID` repository variable in GitHub if it is set (it is no longer read).

### RL-055 The operator can fulfil an access, export or erasure request for one uid from a written runbook and a dry-run-first script

- No UI change. Read the new "Data requests" section in `docs/operations.md` end to end; it is what you will follow per request.
- Emulator rehearsal: start the emulators (`npx -y firebase-tools emulators:start --only auth,firestore --project demo-rl055`, Java on `PATH`), sign up two accounts through `npm run dev:emulated`, have each publish a recipe, favourite, follow, suggest on and reply to the other's recipe. Run `node scripts/data-request.mjs export <uid> --emulator` and open the JSON in the temp dir: it should be complete, and the other account should appear only as `other-user-1` with no display name while its reply text is still there. Run `erase <uid> --emulator` (dry run) and read every line, then `erase <uid> --emulator --execute`, and check in the emulator UI that the other account's thread still reads, with "deleted-user" in place of the erased one.
- Check `node scripts/data-request.mjs erase <uid> --execute` without `--confirm` refuses (it does so before any network call).
- Decide the pending RL-055 rows in `backlog/DECISIONS.md`, especially the deletion of other people's suggestions on an erased owner's recipes and whether the Privacy Policy should say so.
- First real request: authenticate with `gcloud auth application-default login`, run export and the dry run against production, expect a WARNING about the `messages.fromUid` collection-group index (harmless, see the runbook), and keep a log entry without the exported file.
  - Reviewer noted (low): the collaborator scan reads every recipe (documented shortcut); redaction does not search free text for names typed into suggestions or replies; the batch-retry path was checked by reading only; the script was never run against production credentials.


### RL-048 Suggestions and replies are rate-limited per user in the rules, and the client says so when a limit is hit

- **LOUD: deploy order gap. Neither order is safe for suggestions and replies.** Follow the combined order in `docs/operations.md` (client, then rules) and run the rules deploy straight after the client release. Until the rules are live, every suggestion and reply from the new client fails with the generic message; once they are live, any tab still on the old client cannot suggest or reply until it reloads. No fallback was built (pending in `backlog/DECISIONS.md`).
- Needs a browser against `npm run emulators` plus `npm run dev:emulated` (no agent ran this walk). Temporarily lower the reply cap to 3 in BOTH `REPLY_CAP` (`src/lib/rateLimit.ts`) and `replyCap()` (`firestore.rules`); `npm test` fails if they differ. Then:
  - Send replies quickly on one suggestion: the first three send; the fourth shows "You've sent a lot of replies recently. Try again in a while." under the reply box (readable in light and dark), and the draft stays in the box. In the emulator UI, `writeWindows/{uid}_reply` has `count` 3 and `last` naming the third message's path, and no fourth message exists.
  - In `clientErrors`, one entry with context `rate-limited-reply` and your uid for that attempt.
  - Suggestions still work normally below their cap: send one, see "Suggestion sent", and `writeWindows/{uid}_suggestion` has `count` 1. Optionally lower the suggestion cap the same way and confirm "You've sent a lot of suggestions recently. Try again in a while." in the dialog.
  - Offline: stop the Firestore emulator and send a reply and a suggestion. Within about 5 seconds each shows the generic message ("Couldn't send that reply. Please try again." / "That didn't send. Check your connection and try again."), not the rate-limit message. They no longer queue and send later, which is a behaviour change.
  - Put both caps back and confirm `npm test` passes, so the numbers in the rules and `rateLimit.ts` match (10 and 30).
- On the preview build, after RL-051 deploys the rules: send replies quickly past 30 in an hour (or lower the cap on a preview only) and confirm the message, then confirm the `rate-limited-reply` entry in `clientErrors` in the console.
- Reviewer and implementer notes, not fixed:
  - A timed-out transaction may still commit later; the user sees a failure for a reply that landed, and resending counts twice against the cap.
  - A client clock more than a minute fast may see a window reset denied after the hour, shown as the generic failure; a slow clock waits a little longer than an hour.
  - A user can move their own window without writing content; that only limits themselves.
  - Review fix: one window bump now admits exactly one suggestion or message (the window's `last` names it). Before the fix, one bump in a batch admitted any number; the emulator proves both.
  - Notification creates are still not tied to a suggestion or reply and are unthrottled (pre-existing, RL-049).
  - Reviewer noted (low): the thread load-error text in SuggestionThread.tsx uses text-danger-600 with no dark variant (pre-existing); the suggest modal tests do not assert the draft survives an error; after a limit error Send stays enabled and the error stays until the next send; the modal textarea has no accessible label (pre-existing).


### RL-049 Notification and recipe-publish writes are rate-limited per user in the rules

- **LOUD: deploy order gap, now wider than RL-048.** Follow the combined order in `docs/operations.md` (client, then rules, back to back). Between the client release and the rules deploy, no notification is written for anything (favourites, follows, suggestions, replies, reviews all still land, silently un-notified) and every first publish fails (the recipe stays on the device with "Saved on this device"). Once the rules are live, any tab still on the old client can neither notify nor publish a new recipe until it reloads. No fallback was built (pending in `backlog/DECISIONS.md`).
- Needs a browser against `npm run emulators` plus `npm run dev:emulated` (no agent ran this walk). Temporarily lower the caps in BOTH places: `NOTIFICATION_CAP` and `RECIPE_CAP` in `src/lib/rateLimit.ts`, and `notificationCap()` and `recipeCap()` in `firestore.rules` (for example 3 and 2); `npm test` fails if they differ. Then:
  - Normal use still notifies: with a second verified account, favourite one of its recipes and follow it. The other account's bell shows both notifications. `writeWindows/{your uid}_notification` has `count` 2 and `last` naming the follow notification's path.
  - Past the notification cap: unfavourite and favourite again until the cap is passed. Every favourite still lands (heart filled, `favoriteCount` moves) and no error appears anywhere; the other account stops receiving notifications after the cap. `clientErrors` has one `rate-limited-notification` entry with your uid per skipped notification.
  - Publish limit from the chat save: generate and save new recipes until the recipe cap is passed. The over-cap save still opens the recipe page with "Saved on this device" and "You've published a lot today. Try again tomorrow." (not the generic "It couldn't be shared..." sentence), the recipe is in My Recipes on this device, and no `recipes/{id}` document was created. `clientErrors` has a `rate-limited-recipe` entry.
  - Share on that recipe: the link is copied as the self-contained link and the toast also says "You've published a lot today. Try again tomorrow."
  - Edit an already-published recipe while at the cap and save: it re-publishes normally (the cloud title changes), since an update is not limited.
  - Offline: stop the Firestore emulator and save a new recipe. After about 4 seconds the recipe page says "Saved on this device" with the generic sentence, and the recipe does not appear in the cloud later when the emulator comes back (it no longer queues; Share retries). Favourite something offline: the favourite behaves as before and no notification is written later.
  - Put the caps back and confirm `npm test` passes (60 and 30).
- On the preview build, after RL-051 deploys the rules: favourite and follow normally and confirm notifications arrive; save one new recipe and confirm "Recipe saved". A user at the daily cap sees the message for up to a day (plus a minute of clock-skew margin) from their first publish of that window, not from their last.
- Implementer notes, not fixed:
  - A limited notification is skipped, not delayed: the recipient never gets it.
  - Review fix: the create transaction re-reads the recipe, so a late-landing save-time publish followed by Share no longer resets `favoriteCount`, `viewCount` and `collaborators` or counts twice. Optional check: on the emulator, favourite a freshly saved recipe from a second account, then Share it from the first; the counts stay.
  - Review fix: publishing a recipe whose `createdBy.uid` is not the signed-in uid is rejected before any read, as the rules denied it before.
- Reviewer noted, not fixed:
  - UI (med): the `{ saved, note }` navigation state is never cleared, so after a reload or going back to that history entry the toast "Saved on this device / You've published a lot today. Try again tomorrow." can reappear for 8 s even after the limit has reset. The saved toast already had this problem; the note makes it misleading.
  - UI (low): the saved toast and the share toasts all sit at `bottom-24 z-50` and can overlap each other, the update prompt and the FAB. No manual dismiss, and 3 s or 8 s auto-dismiss is short for the rate-limit explanation. A `role="status"` region mounted already filled may not be announced by screen readers.
  - Data (low): the `recipeCount` bump is not atomic with the recipe (fire-and-forget; may stay low if it fails). `notify()` transactions fail offline and drop silently, and concurrent `notify()` calls contend on one window document and can be lost after the SDK's retries. All five notification types share one pool of 60 per hour, so spamming favourites or follows can starve that sender's suggestion and reply notifications. The rules tests are string checks; the build never runs the rules.
### RL-047 Sign-up requires accepting the current Terms, recorded privately per account with version and time

- **LOUD: do not release before RL-046 signs off the policies. Deploy in the combined order in `docs/operations.md` ("The pending release order"): the client carrying RL-047 goes live before ANY rules deploy, because `firestore.rules` deploys as one unit and now includes the RL-047 guards.** Rules first would stop every verified user on the old client from creating recipes, suggestions or messages until they reload.
- **Author decision needed: RL-051 asks for your own `termsAcceptance/{uid}` to exist before the rules go live, but the client cannot write it until the rules are live** (no rule matches before then). Either accept on the live app straight after the rules deploy, or create the document by hand in the console beforehand. Both are written up in `docs/operations.md`; RL-051's wording should be adjusted to whichever you choose.
- Needs a browser, against `npm run emulators` plus `npm run dev:emulated` (no agent ran this walk). At 390 px and 320 px, light and dark:
  - Sign-in modal, email step: with the box unticked the Send Link button is disabled and "Tick the box above to continue." shows under it; Enter shows "Tick the box..." with the box outlined; tick it and the hint goes and the link sends. Same on Profile's "Add Email" banner and the sign-up dialog (follow, or `/create` as anonymous), where the box now sits above the email field.
  - Open the link from the Auth emulator in the same browser. In the Firestore emulator UI, `termsAcceptance/{uid}` has exactly `version` (today's TERMS_VERSION), `acceptedAt` (a number) and `recordedAt` (a timestamp). No dialog appears. Signed in as another account, reading that document is denied.
  - Cross-device: open the link in a private window. The "Confirm the email address" prompt has the box above the field, Continue stays disabled with the hint, and Enter while unticked shows the error; after it completes, the document exists and no dialog appears.
  - Account binding: tick the box and request a link for address A, then sign in as a different verified account B on the same browser. B gets the dialog; A's tick is not recorded for B.
  - A failed send (stop the Auth emulator, then send) leaves no `recipe-app-terms-acceptance` key in local storage.
  - An existing verified account with no document (delete it in the emulator UI, then reload): the blocking "Accept the Terms to continue" dialog appears with focus on its title. Escape does not close it. Open each policy link: the new tab shows the policy readable with no dialog over it; navigate to the library in that tab and the dialog appears there. Accept is disabled until the box is ticked; Accept records the document and closes it, and its width does not jump between Accept, the spinner and Retry. Repeat and press "Decline and sign out": you are signed out, a double tap does nothing extra, and recipes saved on the device are still listed.
  - A read error does not block: stop the Firestore emulator and reload while signed in. No dialog appears and the app keeps working; one `terms-check` report is attempted. Start the emulator again and switch tabs away and back (or toggle the network): with no document, the dialog now appears.
  - A failed Accept: with the dialog open, stop the Firestore emulator and press Accept. Within about 5 seconds an inline error and a Retry button appear, and Decline still works.
  - Anonymous accounts are never asked: continue anonymously and browse; no box, no dialog.
- Keyboard and screen reader: the box is a real checkbox named "I accept the Terms of Service and have read the Privacy Policy", announced as required and described by the hint while unticked, with a visible focus ring; the send button is described by the same hint; the needs-email prompt is no longer announced as one alert, only its error is; the dialog is announced by its title and traps focus.
- On the preview build, after the rules deploy (RL-051): sign up with the box unticked (button disabled), ticked (works), then confirm `termsAcceptance/{uid}` in the console has the three fields and that another account cannot read it. Your own existing verified account will see the dialog once.
- Expect `terms-check` reports in `clientErrors` (at most one per session) between the client release and the rules deploy; that is the designed fallback, not a fault.
- Reviewer notes, not fixed:
  - (med) An unaccepted user sees usable app content for a network round trip before the dialog appears, because `setIsLoading(false)` and `setUser` run before `checkTermsOnce` resolves, so they can start an action under the old terms.
  - The checkbox's policy links are `text-xs` `inline-block py-2` (about 32 px tall) inside a label, below 44 px, and are interactive content nested in a label.
  - The AuthModal's "Continue Anonymously" step and "sent" step show no policy link, and the Cookie Policy is linked from no form (only Settings and the dialog).
  - `ensureProfile` and the "Signing you in" banner now wait on the terms check (up to about 10 s on a bad connection: the 5 s read bound plus the 5 s stored-entry write bound).
  - `recordTermsAcceptance` gives up at 5 s, but the write stays queued and may commit later (idempotent, harmless).
  - `acceptedAt` has no lower bound in the rules (0 or negative is accepted), and a re-acceptance overwrites the previous record (latest only, by design).
  - Acceptance is client-attested: it proves a verified-email account wrote a record with the current version and the server stamped the time, not that the user saw the text.
  - The version test does not check that the `termsAcceptance` write rule uses `termsVersion()` rather than a second literal.
  - Tests do not strictly cover the push-after-terms ordering, the completion-versus-listener race, sign-out then sign-in re-checking, or a read timeout end to end.
  - The draft terms still carry `[DEPENDS ON RL-047]` markers (policy wording for RL-046).
  - (low) The retry needs an `online` or tab-visible event, so a read that keeps timing out while the tab stays visible and online is not retried after its 3 attempts until a reload (an optional timed retry would help).
  - (low) The link completion awaits the terms check before `ensureProfile` and the banner update (up to about 10 s on a bad network).
  - (low) In `EmailLinkStatus` the catch that clears the entry never runs, because `runEmailLinkCompletion` never rejects; after a wrong address or an expired link the entry (bound to that address) stays until sign-out. Harmless because it is email-bound.
  - (low) A failed resend clears the entry of a still-valid earlier link; that fails safe to the dialog.
  - (low) An already-accepted account keeps its stored entry until sign-out (email-bound, harmless).
  - (low) The Spinner inside Accept and Decline gives the button the accessible name "Loading", and Accept stays enabled while a decline is in flight.
  - (low) After Accept or Decline, focus lands at the top of the document, because the dialog opens from an async effect and has no element to return focus to.
  - (low) The checkbox's invalid outline shows for any form error, including "Failed to send".
  - (low) Policy links are about 32 px tall (noted above).
  - The pre-existing choose-step error in the AuthModal ("Failed to continue") still uses `text-danger-600` with no dark variant; only the errors this ticket added or touched were moved to `text-danger-700 dark:text-danger-300`.
  - After the rules are live, a recipe save whose cloud create is denied only logs to the console and keeps the recipe local-only with no mention of Terms (`useRecipeChat`), and suggestion and reply failures show generic messages.

### RL-045 Terms, Privacy and Cookie pages are reachable from Settings and the sign-up forms

- **LOUD: these pages carry DRAFT text. The release that carries them waits for the author's sign-off in RL-046.** Note that once the Preview deploy secret is set, the preview channel from RL-013 publishes main at a public link, draft pages included.
- Open Settings, scroll to Legal, open each of the three pages at 390 px in light and dark, signed out and in local-only mode. Check the draft notice at the top is prominent, the last-updated date reads well, bracketed placeholders ([STATE], [AUTHOR TO CONFIRM: ...]) show exactly as written, nothing scrolls sideways, and the back button returns to Settings. Also try 320 px.
- Open the sign-in modal (email step) and the email form on Profile or the chat gate: since RL-047 the "Read our ..." line is gone and the Terms box carries the two links instead. Each opens in a new tab and the half-typed email is still there. Check this in the installed PWA too (unverified from code: in an installed PWA a target=_blank link may open in an in-app browser view).
- Reviewer notes (low): focus is not moved and there is no skip link when arriving at a legal page from Settings in the same SPA instance, so screen-reader and keyboard users get no announcement (focusing the h1 or main on document change would fix it); the new-tab path loads fresh so it is fine. The TopBar back button has no focus-visible style (pre-existing). Nothing in Settings marks the three pages as drafts (the on-page notice is prominent). The [DEPENDS ON RL-047] text in terms.ts says users must accept the terms while the forms only pointed at the policies; RL-047 has since replaced that pointer with a required acceptance box, so re-check the wording in RL-046. Draft notice contrast is estimated at about 7:1 light and 12:1 dark, not measured.
- NOT verified: whether target=_blank in an installed standalone PWA opens an in-app browser or hands off to Safari or Chrome (on iOS that could take the user out of the app context). Test on a device.
- Back on a legal page goes back in the app, or to Settings when the page was opened in a fresh tab.
- Needs a browser: all of the above. Unit tests cover content, structure and hrefs only.

### RL-044 A grounded data inventory and draft Terms of Service, Privacy Policy and Cookie Policy exist in the repo

- Nothing user-visible changes. The drafts are not rendered anywhere until RL-045, and must not be released before your sign-off in RL-046.
- Read `docs/legal/claims-to-verify.md` first (33 items), then the three drafts in `src/content/legal/` (`terms.ts`, `privacy.ts`, `cookies.ts`). Every `[AUTHOR TO CONFIRM]`, `[DEPENDS ON RL-0xx]` and `[STATE]` must be resolved before publishing.
- Check `docs/legal/data-inventory.md` section 1 against your own understanding of the app, and its section 3 for the corrections to the groomed inventory.
- The policies are written for the release state. They are untrue until these ship: RL-058 (GA4 removed; today GA4 runs without consent when configured), RL-052 and RL-045 (consent banner and Settings control), RL-053 and RL-054 (PostHog), RL-055 (email request runbook), RL-047 (terms acceptance), RL-048 (suggestion and reply limits), RL-010 (clientErrors retention). Self-service export (RL-056) and deletion (RL-057) are deliberately not promised.
- Confirm `SUPPORT_EMAIL` in `src/lib/constants.ts` is the address you want published in all three documents.
- Author-owned files the inventory contradicts, left untouched for you: `README.md` (around lines 25 and 104, "a shared feed the whole circle can browse" and "invite-only by design") describes a closed audience, but recipes and profiles are readable by anyone, signed-out visitors included. `README.md` (around lines 113 to 115, "Publishing requires only a signed-in user", "world-writable in practice") is stale: every client write now needs a verified email. `ROADMAP.md` (around line 684, decision 7) says "anyone may read, favourite and follow anonymously", which decision 1a supersedes. `ROADMAP.md` (around lines 636 and 675) still says "Clear All Data"; the control is now "Delete Recipes on This Device".

### RL-037 Re-publishing a recipe never overwrites its cloud collaborators

- Collaborator survives an edit: on browser profile A, signed in as the recipe owner, approve a suggestion on a published recipe. On browser profile B, signed into the same account, open that recipe (it has no collaborator locally), edit the title and save. Open `/shared/:id` and confirm the suggester is still listed as a collaborator.
- First publish: generate and publish a brand-new recipe. Its `/shared/:id` page shows no collaborators, and the recipe count on your profile goes up by one.
- Re-publish does not count: edit that same recipe and save. The recipe count on your profile stays where it was.
- Known limit, not a regression: profile B's local copy still has no collaborator after the edit. Pulling cloud collaborators into Dexie is out of scope.
- Reviewer note (med, pre-existing, not a regression, worth its own ticket): the existence check is a plain `getDoc` and the create branch is a non-merge `setDoc`. Online, `getDoc` reads from the server, so it is accurate. But the app uses a bare `getFirestore(app)` with no persistence (memory cache only). If an earlier read in the same session cached "no such doc" (for example `getPublishedRecipe` returned null) and the client then goes offline, `getDoc` can return `exists()` false from that cache for a doc that exists. The create branch then queues a full `setDoc`. On reconnect it passes `isOwnerUpdate`, which constrains neither counters nor collaborators, and overwrites the cloud doc: `favoriteCount` and `viewCount` reset to 0 and `collaborators` is replaced with the local copy. The caller's `withTimeout` gives up first, but the SDK keeps the queued write until reload. The old code did exactly the same. Suggested follow-up: `getDocFromServer`, a transaction, or `updateDoc` first with a create fallback.
- Reviewer note (low): two devices first-publishing at once both take the create branch, and the second plain `setDoc` overwrites the first (unchanged). If the doc is deleted between `getDoc` and the merge `setDoc`, the merge becomes a create without counters and the create rule denies it, so nothing is corrupted. The emulator probe used a hand-built REST `updateMask` (`title`, `ingredients`, `instructions`, `createdBy.*`, `createdAt`, `rootId`, `depth`), a subset of what the SDK sends for a real Recipe (for example `parentId`). It proves the rules and merge-mask behaviour, not the SDK's field serialisation.

### RL-034 An anonymous user's local bookmarks become cloud favourites on the verified account when they add an email

- Linked path, on the preview build in a fresh browser profile: continue as anonymous, publish nothing, heart two recipes on Explore (published by someone else) and note each one's favourite count. Heart a third recipe that exists only in your local library (never published). Add an email from the same browser and open the link there. Both Explore recipes should show as favourited and each favourite count should be one higher. The third stays a local bookmark (still in the Favorites filter, count unchanged).
- Existing-account path: as a new anonymous session, heart two published recipes, then add an email that already has an account and open the link in the same browser. After sign-in both should show as favourites on that account and each count should be one higher.
- A second sign-in (sign out, then sign in again by email link) must not push or bump again: the counts stay where they were.
- Console and `clientErrors`: on the linked path, exactly one `favorites-upgrade` report per upgrade and only when something was skipped (the third, never-published recipe in the first walk causes one, with "1 of 3" in the message). No report when every bookmark pushed. On the existing-account path skips are only logged to the console (`[auth] favourites carry-over ...`) and never reported, because favourites the account already had in the cloud are denied as updates on a healthy upgrade.
- Reviewer note (med): if `migrateRecipesUid` or `migrateFavoritesUid` rejects on the existing-account path, `runMigration`'s `Promise.all` rejects and the push is skipped (the catch sets `linkState` to error), so the carry-over is silently dropped and nothing calls the push again. The failure mode already existed for the migration; it now also drops the carry-over.
- Reviewer note (low): the cloud heart on `SharedRecipePage` can show empty right after a linked upgrade when the landing URL is a recipe the user bookmarked. The lookup fires as soon as `emailVerified` flips and is not re-run after the push, so tapping it runs `addCloudFavorite` on an existing doc (an update, denied) and shows the toggle error until reload.
- Reviewer note (low): on the existing-account path `migrateFavoritesUid` is an upsert, so an anonymous row overwrites the existing row's `createdAt` for the same recipe. Cosmetic: it can reorder favourites locally and differs from the cloud doc.
- Reviewer note (low): `recipeOwnerId` falls back to `'local'` for bookmarks whose recipe is not in Dexie, which is most shared-recipe bookmarks. Nothing reads it today; backfill if anything starts to.
- Reviewer note (low): a bookmark whose push failed shows an empty heart on `SharedRecipePage` (cloud only) but a favourite in Library (Dexie), and unfavouriting it calls `removeCloudFavorite` on a missing doc, denied, one `unfavorite` report (the RL-041 note).
- Reviewer note (low): the Dexie rows are snapshotted once at the start of the sequential push, so an unfavourite during the push (up to N times 5 s offline) is followed by the cloud doc being created, so local and cloud diverge.
- Note for the author: favourites pushed this way do not appear on other devices until RL-043 pulls cloud favourites down. Unfavouriting one later removes both the local and the cloud copy.
- Not driven by the agent: the two real upgrade paths need Firebase Auth. Only the batch writes were checked on the Firestore emulator (see the ticket Notes).

### RL-031 Blocked or corrupt localStorage never throws out of services/storage.ts

- Open the preview build in Safari with Block all cookies on, and in Chrome with cookies and site data blocked for the site. The library should load, and the theme and unit toggles should not crash (they just will not be remembered after a reload).
- Not covered: code outside `storage.ts` that touches localStorage directly. `src/services/firebase.ts` lines 109, 225 and 230 (`emailForSignIn` for the email-link flow) can still throw when storage is blocked.
- Reviewer note (med, for the author): the email-link sign-in flow in `services/firebase.ts` still touches localStorage directly at those three places, so with storage blocked starting or completing email-link sign-in may throw. That is the sign-up path RL-041 routes users to, so it is the more important place to fix next. The `'emailForSignIn'` key is a literal and is not in `STORAGE_KEYS`.
- Reviewer note (low): Safari "Block all cookies" can also block IndexedDB, which is outside this ticket and not audited (Dexie start-up). With storage blocked every write warns; callers are not hot paths, though `RecipeDetailPage` persists inside a setState updater, so StrictMode in dev warns twice.
- Reviewer note (low): `docs/data-model.md` has no section for the nine `STORAGE_KEYS` plus that literal, and the device id fallback (`crypto.randomUUID` exists only in secure contexts, so plain http falls back to `getRandomValues`, then `Math.random`) is documented nowhere else.

### RL-029 Profile stats and the following list load in a constant number of round trips

- Own profile: the total views, total favourites and each recipe's counts should match the previous release for published recipes, and show zero for recipes you never published. Compare against the last release if you can.
- Following list (Profile, Following): same people in the same order as before, and it should load noticeably faster when you follow many users.
- Note: own-profile counts now come from one query on `createdBy.uid`, which has no limit, so there is no cap on published recipes. A local recipe whose cloud copy has a different `createdBy.uid` would now show zero; none are expected.

- Reviewer note (med, data, edge case): a published recipe whose cloud `createdBy.uid` differs from the signed-in uid now shows zero views and favourites on its owner's own profile; the old per-id `getDoc` returned the real counts. Example: a user published under an old uid and `migrateFirestoreUid` was denied (rules forbid changing `createdBy.uid`), so local Dexie was re-stamped to the new uid while the cloud doc kept the old one. This arguably is more truthful (the recipe is no longer theirs in the cloud), but it is a behaviour change for that cohort, and "none expected" is optimistic given the known-broken migration. RL-042 wipes production data, which should empty the cohort. No test covers it.
- Reviewer note (low, data): the `useOwnRecipes` effect still has no cancelled flag and no uid stamp, so a slow response for user A can overwrite user B's stats map (keyed by recipe id, so A's ids cannot render on B's recipes; the window shrank from N sequential reads to one), and a failed fetch is swallowed with neither `reportError` nor `console.error`, unlike the RL-026 sibling hooks. Adding a cancelled flag and `reportError(err, 'load-own-stats')` would close it.
- Reviewer note (low, data): `getFollowingProfiles` issues an unbounded `Promise.all` of `getDoc` calls, so a user following hundreds of accounts bursts hundreds of reads and one transient failure rejects the whole list (the old sequential loop also rejected on the first failure). Probably fine at current scale; if follows grow, chunk at 30 with `documentId() in [...]` and restore the order. No follow cap was found in the rules or app.
- Reviewer note (low): `src/hooks/useUserRecipes.test.tsx` line 10 still mocks the removed `getRecipeStats`; harmless, but deleting it makes a grep for the removed function come back clean. No test covers a late stale response for `useOwnRecipes`.

### RL-028 The My Recipes empty state does not depend on the search text

- On the My Recipes tab, type a search that matches none of your recipes. Confirm "No results" with a Clear search button, and not "You haven't created a recipe yet". Tap Clear search and confirm the list returns. (Tests only; no behaviour changed. The Mine chip this ticket was written for no longer exists.)

- Reviewer note (low, real behaviour, not fixed here): a whitespace-only search is inconsistent. `LibraryPage.tsx` (the `search ?` branch near line 259 and the result-count condition near line 215) treats `search` as active when it is `"  "`, but `filterFeed` in `src/lib/library.ts` (near line 105) trims it and treats it as inactive. A user with no recipes who types a space sees "No results / Nothing matches" instead of the first-run screen, and a user with recipes sees the full list under an "N results" heading. Using `search.trim()` for the page's branch and count conditions would fix it. No test covers this.
- Reviewer note (low, test gaps): nothing covers My Recipes with the favourites filter on and no search (by the code, "No favorites yet" with Show all), nor an Explore search that matches nothing ("No results" with Load more and the "loaded so far" note). The empty-state button is found with `getByText('Clear search', { selector: 'button' })` because the search box's clear icon shares the aria-label; that is correct but would stop matching if `Button` ever wrapped its children in a span.

### RL-026 Follow, cloud favourite and profile recipe hooks ignore stale responses and report failures

- On the preview build, signed in with a verified account, open a profile you follow and then go straight to one you do not (via a recipe's "Added by" link). Confirm the button never shows "Following" on the second profile, not even for a frame.
- Go offline (devtools) on a profile and tap Follow. Confirm "Couldn't update that. Check your connection and try again." appears under the button in red (light and dark mode), the button still says "Follow", and the message clears when you go back online and tap again.
- On a shared recipe you do not own, go offline and tap the heart. Confirm the same message appears at the top of the page and the heart does not fill. Online again, tap it: the message clears and the heart fills.
- With the console open and the clientErrors collection visible, load several profiles and shared recipes you do not follow or favourite. Both should stay quiet: normal not-following and not-favourited views must not log or report anything (the lookups are queries now because a get of a missing doc is denied by the rules).
- Open Library, Explore, Following: confirm "No recipes from followed users" no longer flashes before the feed loads.
- Offline toggles give up after 5 seconds and show the error. A timed-out write may still commit when connectivity returns, so the button can then differ from the server until the next lookup (reload to resync). Not solved here.
- (med, UI) The favourite error on `SharedRecipePage` renders at the top of main, not near the heart in the sticky header, so a scrolled-down user may not see it, it shifts the recipe down by about 40px, and the heart is not optimistic so a tap looks like nothing happened. A message in the sticky header or a toast would be better.
- (med, UI) A failed `getRecipesByUsers` or `getUserRecipes` fetch is stored as an empty list with no error exposed, so the Library Following filter says "No recipes from followed users" and a public profile says "No recipes yet" for a failed fetch, with no retry (the ticket stopped at report and settle).
- (low) There is no lookup-pending state, so right after navigating the Follow button is enabled and shows Follow until the lookup resolves, and a fast tap on an already-followed profile sends a follow that the rules deny. Disable the button until the lookup settles, or ignore a lookup that arrives after a toggle.
- (low) A failed lookup settles as not following, and the later toggle error is generic.
- (low) The cloud heart has no in-flight feedback or `aria-pressed`.
- (low) The follow and favourite error stays until the next toggle or id change.
- (low) `useFollowingList` swallows a failure into empty lists with only a beacon, so the Following filter then looks like "you follow nobody". It also issues `getFollowingIds` twice (RL-029).
- (low) A verified user's cloud favourite on `SharedRecipePage` never writes Dexie, so `useFavoriteIds` and the Library favourites filter do not show it (pre-existing `localRecipe ?? cloudRecipe` divergence).
- (low) Tests do not cover a double tap against the in-flight guard, no query for unverified or signed-out users, or the service-level rejection path of `isFollowing` and `isCloudFavorite`.

### RL-025 Scaled amounts snap to an eighth and decimals render with a leading zero

- On a recipe with "1/2 tsp" and 4 servings, scale to 1 and confirm the one-eighth glyph shows ("⅛ tsp").
- Check a decimal with no glyph reads "0.44", not ".44" (and "1.44" with a whole part).
- Check the glyph renders in light and dark mode and at 320px. The one-eighth glyph can fall back to a different font; look at it on a real phone.
- (med, for the author) `formatAmount` is unit-blind and also receives converted metric and imperial values (`IngredientList.tsx` ~L52-61; `units.ts` ~L212-214 rounds converted values under 10 to two decimals). A converted amount whose fraction rounds to .12 or .13 now shows the eighth glyph where it used to show a decimal: 2.13 g shows "2⅛ g" (was 2.13), 7.12 ml shows "7⅛ ml", 0.13 g shows "⅛ g". Values from 10 up and whole numbers such as 125 ml are unaffected. The same class already existed for ⅓ and ¼ on metric units (2.33 g shows 2⅓), but .12 and .13 are common two-decimal conversion outputs, so it is noticeably wider. Fix: skip the glyph path for metric units (pass the unit or an isMetric flag), or only use the eighth within about 0.005 of 0.125. The ticket asked to match the eighth "after its two-decimal rounding", so this was left as specified.
- (low) `scale.ts` treats only counts specially; tsp, tbsp, cup, g and ml are handled alike, so the eighth also applies to g and ml scaling (0.5 g at a quarter of the servings shows "⅛ g", where it showed "¼ g" before).
- (low) 1/6 (0.1667) now snaps to the eighth, which undershoots by 25 percent instead of overshooting by 50 percent, an improvement. 0.1, 0.0625 and 1/12 stay as raw decimals. An eighth teaspoon times 3 (0.375) still snaps to a third.
- (low) U+215B sits in the Number Forms block with the third glyphs, so it is as safe as them in San Francisco, Segoe UI and Roboto, but a fallback font may draw it at a different size or weight, and the `font-medium` wrapper may not apply to it.
- (low) Raw amounts like 0.999 or 1.001 at factor 1 (stored, AI or shared-link values) still render as raw decimals. This was the old behaviour and `scaleAmount` cannot produce them.

### RL-024 Self-contained share links are validated against the recipe schema

- Open a hash share link made by the app (Share with Firebase off, or an unpublished recipe): it still renders and Save a copy works.
- Edit a hash link so the payload lacks `ingredients` (or build one by hand): the page shows Invalid Link, not a blank page.
- If you have an old hash link from before nutrition or attribution existed, open it: it should still render.

- Reviewer note (low): `decodeRecipeFromHash` casts its result `as SharedRecipe`, but `createdBy` is required in that type and optional in practice (old links lack it). `SharedRecipePage` uses `?.` and falls back to `{ uid: 'local', displayName: null }`, so nothing breaks, but a future caller doing `decoded.createdBy.uid` would crash on an old link. Returning `Omit<SharedRecipe, 'createdBy'> & { createdBy?: CreatedBy }` would fix it (out of scope).
- Reviewer note (low): the `NutritionSchema` comment says "Optional throughout" but its four macro fields are required, so a link with partial nutrition (for example only calories) now shows Invalid Link. No code path produces partial nutrition today.
- Compatibility, checked: `group` (nullable, required on ingredients and steps) has existed since the first commit, the same one that introduced share links, so every stored recipe has had it, and `nutrition` (added 2026-07-28) is `nullish`. Content field types are unchanged since then and the schema has no `.min`, `.max` or refinements. Hand-edited or lax links (a string `servings`, an ingredient missing `unit` or `notes`, an unknown `difficulty`) now show Invalid Link with no coercion; nothing the app emits looks like that.

### RL-021 The Following feed shows the newest 50 recipes from followed users

- Ordering note for RL-022: the `recipes` index (`createdBy.uid` ASC, `createdAt` DESC) must be READY before this client is released. If the client goes out first, the ordered query fails and the Following filter shows an empty list for every follower.
- After RL-022, follow an account with more than 50 recipes (or confirm on live) and check the Following filter on Explore lists the newest first.
- Reviewer note (low): `useFollowingRecipes` (`src/hooks/useUserRecipes.ts`, the `.catch` around lines 91-94) sets an empty list and never calls `reportError`, so until the index is READY every follower silently sees an empty Following list. The only protection is the ordering note in `docs/operations.md`, and `/release` is manual. Reporting the error, or an index-status check before the hosting deploy, would close it.
- Reviewer note (low): the new test asserts orderBy before limit, two `getDocs` calls for 31 uids and the merge order. It does not assert the chunks passed to `where('createdBy.uid','in',...)` (30 and 1) and inspects only the first call's query shape.
- Reviewer note (low): the emulator does not enforce composite indexes, so a wrong index would only show up on live.
- For the author: `ROADMAP.md` lines ~24-25 say rules and indexes are deployed, which is not true for the new `recipes` index until RL-022. Lines ~52-53 cite `firestore.ts:836-845` for the following filter, which is now `migrateFirestoreUid`; `getRecipesByUsers` is near line 981. Left untouched as author-owned.
- RL-022 criterion 3 says "built" while `docs/operations.md` says READY (same meaning), and RL-022 does not name the `recipes` index.

### RL-020 clientErrors reports must carry receivedAt equal to the server time

- Rules change only. Not live until RL-022 deploys the rules; until then the old rule still accepts any `receivedAt`.
- After RL-022, trigger a handled error in the app (for example, a deliberately failing publish on the preview build) and confirm a `clientErrors` document appears in the Firebase console with `receivedAt` set to a server timestamp.
- Reviewer note (for RL-010): a report written without `receivedAt` is still accepted (the ticket allows it), so it would have no TTL field and never expire; documents written before this rule may also hold other values. A TTL policy acts only on timestamp-typed fields, so this change helps RL-010 by guaranteeing that any `receivedAt` that is present is a real server timestamp, but it does not cover absent or older values.

### RL-019 Avatars render only data:image photos, and profile rules enforce the prefix and a size cap

- Needs the rules deployed (RL-022) to enforce the cap; the Avatar change is live with the build.
- On the preview build, signed in with a verified email, upload an avatar and confirm it renders on your profile page and in the library header.
- If any old profile has a non-data photoURL (an https link), confirm it now shows initials, not a broken image. Its owner can still change displayName.
- Avatar upload through `npm run dev:emulated` (rules plus UI together) was not run by an agent.
- Reviewer note (low): `AvatarEditor` seeds `imageURL` from `currentPhotoURL`, which for a legacy profile could be an https URL. The Upload tab preview then shows initials, and Save without picking a file would write that same URL back. The rule only checks `photoURL` when the value changes, so an unchanged value is not denied. UI oddity only, no security effect.
- Reviewer note (low): `data:image/svg+xml` is accepted. It is script-inert inside an `<img>`, so not a security issue.
- Reviewer note (low): the 100000 cap in `firestore.rules` and the `'data:image/'` prefix in `Avatar.tsx` must be kept in sync by hand.
- Reviewer note (low): the typical `AvatarEditor` size of 4 to 8 KB was estimated, not measured.
- Reviewer note (low, data): `migrateFirestoreUid` copies the old profile to the new uid with `setDoc`, which is a create, so an old profile holding a non-data `photoURL` now also fails `photoURLOk`. That path is already broken by design (the old uid's profile delete is denied), so nothing new is lost; it needs the server-side migration path.
- Reviewer note (low, data): `toDataURL('image/jpeg')` falls back to PNG on a browser without JPEG support, and a noisy 128x128 PNG could approach about 87 KB of base64, still under the 100000 cap. Theoretical only.
- Reviewer note (low, data): the owner branch of the profile update still has no other field constraints, so an owner can set their own `followerCount` or `recipeCount` to anything. Pre-existing and out of scope here.
- Reviewer note (low, data): the `Avatar` guard also requires `photoType === 'uploaded'`, so a bad URL with that type falls to initials, never to the emoji, which matches the intent (the ticket wording "falls through to emoji" is loose).
- Residual risk: every `photoURL` in `src` is a profile field and reaches an `<img>` only through `Avatar` (the only `<img>` in `src/**/*.tsx`). Recipes `createdBy`, suggestions and follows are arbitrary maps, so a `photoURL` key can be stored there, but nothing reads or renders it. A future component that renders a photo from those maps would bypass the rule; route any such rendering through `Avatar`.

### RL-013 Deploy a Firebase Hosting preview channel for every QA pass

- You must add these yourself; an agent cannot. Until you do, the Preview workflow skips with a note and does not fail.
- Secret: Settings, Secrets and variables, Actions, New repository secret `FIREBASE_SERVICE_ACCOUNT`, the JSON key of a service account with Firebase Hosting Admin only (see "Preview deploys" in `docs/operations.md`).
- Variables (Actions, Variables tab): `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, `VITE_RECAPTCHA_SITE_KEY` (needed for generation), and optionally `VITE_FIREBASE_MEASUREMENT_ID`. Copy the values from your `.env`.
- First run: Actions tab, Preview, Run workflow. Open the finished run and read the job summary for the "Preview URL" line; open it on a phone. Confirm the app loads and sign-in works.
- The preview uses live Firebase data and is public to anyone with the link.
- For the author (outside this ticket, left untouched): the `/qa-pass` skill (`.claude/skills/qa-pass/SKILL.md`, step 2) says to "record the channel URL from the run output", but `gh workflow run` prints no run URL. The URL is only in the job summary and a log line, so the skill needs `gh run list --workflow preview.yml` then `gh run view <id> --log` to get it, and a branch for the skipped case (no secret: the run succeeds with a skip note and no URL).
- For the author: `preview.yml` pins `FirebaseExtended/action-hosting-deploy` by the floating tag `@v0` while passing it the service account secret. That matches how `ci.yml` pins its actions (by tag), but a full commit SHA would be stricter. The service account only needs Firebase Hosting Admin, and whether that alone suffices for channel deploys is untested until the first real run.
- Not verified: the workflow itself. It was parsed as YAML and read for correctness (triggers, env gating, permissions), but it has never run; the first real run needs your secret and variables.

### RL-008 Split the Library into "My Recipes" and "Explore" tabs

- At 390 px in light and dark: both tabs, the tab control above search, and every empty state. My Recipes empty: "You haven't created a recipe yet" with Create a recipe (goes to `/create`). Explore empty (fresh emulator): "Nothing published yet". Favorites empty, Following empty, and "No results" in each tab.
- Tab memory: pick Explore, reload, Explore is still selected. Pick My Recipes, reload, it stays.
- Search in each tab only searches that tab. On Explore with more than 30 published recipes, search for something: the "Searching the N recipes loaded so far. Load more to search further." note shows, Load more stays, and pressing it grows N and can add results.
- Favorites filter in each tab as an anonymous account (local bookmarks) and as a verified account. Following chip as a verified account who follows someone: shown on Explore only, never on My Recipes, never for anonymous or signed-out users.
- Your own published recipe appears once in My Recipes and once in Explore. Variation counts on cards look right in both tabs.
- Local-only mode (no Firebase env): no tab control, My Recipes only, no network errors.
- Offline: My Recipes still lists local recipes. Explore shows "Could not load" with the offline copy after about 6 seconds, and Try again works once back online.
- The old first-run welcome card is gone; its explanation now lives in the My Recipes empty state. Check it reads well as a first screen.
- Failed Load more: on Explore with more than 30 recipes, go Offline in devtools and press Load more. "Could not load more recipes. Try again." appears in red above the button, the loaded list stays, and pressing Load more again once online loads the page and clears the message.
- Favorites on Explore with more pages to fetch: the empty state reads "No favorites in the N recipes loaded so far. Load more to look further.", not "No favorites yet".
- Reviewer notes (medium, not fixed): `SegmentedControl` is a radiogroup, not tabs, so there is no tablist/tabpanel association or arrow-key handling; changing it would also change the Settings theme picker. Back from a recipe remounts LibraryPage, so search text, filters, scroll position and loaded Explore pages reset (only the tab is remembered). The sticky header is now about 220px tall (56px bar, 44px tabs, 44px search, 44px chips), a third of a 320x568 viewport. No scroll reset on tab switch, and search and the favourites filter carry across tabs without a signal.
- Reviewer noted (med, data): `useFollowingList()` runs on every Library mount whichever tab is active, so any signed-in user, anonymous included, makes two `getFollowingIds` reads plus one `getProfile` per followed user. Its `Promise.all` has no `.catch` and no cancellation guard, so a rejected read is an unhandled rejection (and a stuck `isLoading`) on every visit, and a slow response after a uid change can overwrite fresh state. The reads are allowed by the rules, so no `permission-denied`. Gate it on `tab === 'explore' && emailVerified` and add a catch and a cancelled flag (RL-026 territory; `ProfilePage` has the same issue). The component test mocks `useFollowingList`, so it never catches this.
- Reviewer noted (med, data): variation counts on My Recipes depend on whether Explore has been opened. `cloud.recipes` is null until Explore starts, so a local root with cloud-only variations shows a lower count until the user visits Explore, then a higher one. On Explore a root whose variations sit on unfetched pages undercounts until Load more. Dedup itself is correct. Accept as the price of lazy loading, or document it.
- Reviewer noted (low, data): the Following list bypasses `buildFeed`, so it has no roots-only filter, no dedup and no variation chip, and `getRecipesByUsers` uses `limit(50)` per 30-uid chunk with no `orderBy`, so those 50 are arbitrary, not the newest (predates this ticket). `useFollowingRecipes` has no cancellation, and there is a one-frame flash of "No recipes from followed users" on entering Following. The favourites filter reads Dexie only, so a verified user on a new device sees only locally held favourites until something syncs cloud favourites down. `loadMore` guards with state, not a ref, so two clicks in one tick could fetch the same cursor twice (a wasted read, no visible corruption). Two page-1 fetches under StrictMode in dev only. No test for pages kept across tab switches, Load more appending, the favourites filter per tab, or Following results.
- Reviewer noted (med, UI, second round): the new "Could not load more recipes. Try again." message uses `text-danger-600` (#dc2626) at 12px, about 3.7:1 on the dark `bg-surface` (#111827), under 4.5:1 for small text (about 4.8:1 in light mode). Use `text-danger-700 dark:text-danger-300`, the pattern in `SettingsPage.tsx` line 171 and `RecipeChatPage.tsx` line 423. `RecipeDetailPage.tsx` line 587 and `SuggestionThread.tsx` copy the same class and have the same dark-mode issue. Check it in the dark-mode walk.
- Reviewer noted (low, second round): `loadMoreError` is not cleared on a page-1 reload or a tab switch, so a stale but still-true message can show on returning to Explore; the conditionally mounted `role="status"` notes may not be announced by some screen readers; the failure test does not pin the in-flight state, the absence of the alert on a page-1 failure, or the last-page "No favorites yet" copy.
- Reviewer notes (low, not fixed): a Following selection silently re-activates when returning to Explore. Layout shift when the shared-recipes note and the Following chip row appear. Skeleton height may not match the cards. The followed-user avatars sit ungrouped inside the filter row. Load more shows "Loading…" text, not the shared Spinner.

### RL-007 PWA manifest and precached app shell

- Install on a phone (Add to Home Screen): the "RL" icon shows, the app opens standalone with the right status bar colour in light and dark.
- Offline: load the app online once, go Offline in devtools (or airplane mode), reload `/` and a local recipe. Both should render from cache. Cloud-only recipes and Create will not work offline, which is expected.
- Update prompt: deploy or preview two builds (bump any text, rebuild), revisit with the old one open. An "Update available" bar appears above the bottom nav; Dismiss hides it without reloading, Reload applies the new build.
- Email-link sign-in with the service worker active: request a link, open it in the same browser, confirm you are signed in.
- Deep link: on a first visit open `/recipe/:id` directly. The service worker should register (devtools Application tab), and the update bar can appear on any route, including pages without the bottom nav.
- Reviewer notes (medium): the update bar (z-40, roughly 56 to 116px from the bottom) overlaps the FAB (bottom-20, z-30) and covers about 60px of the last page content, because `main` has `pb-16` and does not grow, until Dismiss. On routes without the bottom nav it floats 56px above the screen edge.
- Reviewer notes (low): Reload discards unsaved edits with no confirmation. At 320px the label may wrap to two lines. No `env(safe-area-inset-bottom)` on the bar or BottomNav (`viewport-fit=cover` is not set, so fine today, relevant once installed standalone). The theme-color meta tags follow the OS setting, not the in-app theme toggle. A component test for the bar would need a mock for `virtual:pwa-register`.
- After the hosting deploy: `curl -sSD - -o /dev/null https://recipe-lab-3832b.web.app/sw.js` shows `no-cache`, and `/assets/*.js` still shows `immutable`.

### RL-006 Split the bundle at route boundaries

- Standing walk, watching for a visible loading flash: Library, Settings, Profile, a recipe, its edit page, its tree, Create. A brief spinner on the first visit to a route is expected. The bottom nav and top bar should stay put on Settings and Profile while it shows.
- Offline chunk load: load the app, set devtools Network to Offline, then open a route you have not visited this session (for example Settings or Create). You should see the error fallback with "Back to library", not a blank page.

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
