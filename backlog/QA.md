# QA ledger

What has landed on `main` since the last release and what the human QA pass must check.
`/next-ticket` appends a section per ticket; `/qa-pass` collates this file, the pending
decisions, and the preview build into a checklist; `/release` moves the accepted entries
into `CHANGELOG.md` and clears this file.

## Standing checks

Things no agent can verify here, so every QA pass covers them at a 390x844 viewport:

- Explore loads, rows render, search and the favourites filter work.
- A recipe detail page: action row, breadcrumb, branch carousel, the version tree.
- `/create` shows the composer for a verified account and the sign-up call to action otherwise.
- A `/shared/:id` link opened signed out, in a fresh browser profile.
- The browser console shows no errors or unhandled rejections on that walk.
- `TreeIntro` renders legibly on the second root recipe opened (AUDIT UI-16, never yet seen in a browser).

## Since the last release

### RL-304 Focus assertions wait for the focus move

- Test-only. Nothing to check in a browser.

### RL-284 docs/decisions.md and backlog/DECISIONS.md record the author's 2026-10-22 decisions on the beta feedback tab

- Docs only. Nothing to check in a browser.

### RL-283 Privacy wording for bio and country flag

- Author: sign off the bio and country flag wording in /privacy before release. It is pending your sign-off. Read "What is public", "Your profile" and "Correction".
- Release step: Privacy `lastUpdated` is already 2026-10-22 and live. Move it to the release date if that is later (not `TERMS_VERSION`).

### RL-280 Time zone to country helpers

- No visible change yet (pure lib code for RL-281/282). Nothing to check beyond CI.

### RL-282 Profile flag defaults from the time zone

- Sign up a new account in a fresh browser; the flag matches your time zone. Set the computer's time zone to Europe/London, sign up another; it shows GB.
- An existing account with no flag gets one on its next sign-in, once. Choose No flag, sign out and back in: it stays No flag. Pick another country, change the time zone, sign in again: your pick stays.

- Checked against the live v0.4.0 rules: the owner profile update has no key list, so adding country to the sign-in write is allowed before RL-291.
- Reviewer noted (data, low): a flag picked in the instant between the sign-in read and write could be overwritten (sign-in happens before the UI is usable); the sign-in profile write fails silently and retries next sign-in; no test pins that a caller's own country beats the default.

### RL-281 Country flag on the profile

- Saves live only after RL-291 deploys the RL-278 rules.
- Change your flag, choose No flag, check the public profile from another account. On Windows expect two letters.
- With no flag, "+ Add your country" shows in the Cooking since line; as a guest it opens the sign-up dialog.
- Type in the search field: the list filters by name; a failed save keeps the sheet open with an error.

- Reviewer round fixed: result count and "Saving..." are announced; the current country is marked selected; the heading and search stay pinned; focus survives the Add to flag swap; an unverified save shows the error.
- Check in the browser: the pinned search header's offsets inside the sheet on a phone; the keyboard opening over the list on first open.
- Reviewer noted (low): no arrow-key navigation through about 250 rows; a timed-out save may still land later; the public flag adds the country name to the heading's spoken name.

### RL-279 Profile bio

- Saves live only after RL-291 deploys the RL-278 rules; before that, a save against the live project may be refused or stored unbounded.
- Write a 160-character bio on a phone, check it on your public profile from another account.
- Clear it and save: the "+ Add a short bio" button comes back and the public profile shows no bio line.
- As a guest, tap "+ Add a short bio": the sign-up dialog opens.

- Reviewer round fixed: the counter is announced from 140; focus moves into the editor and back to the button; Cancel is disabled while saving; the bio save times out after 8 s with the error.
- Reviewer noted (low): the name save on the same page has no timeout or error message (pre-existing).

### RL-278 Profile rules bound bio and country

- Rules only, in the repo, not deployed until RL-291. Nothing to see in the app yet.
- After RL-291 deploys: edit your profile name and avatar, follow and unfollow someone, and check none of it is refused.

### RL-277 Create tab: add an ingredient, a time and a method

- Create tab: add an ingredient, a time and a method, cycle each, Write it, check the composer text.
- Remove each with its chip (the chip shows as pressed and filled). With Quicker learned, adding a time hides "under 30 min".
- At 320px the three chips wrap and nothing overflows; the sentence is still reachable above Write it.

- Reviewer noted (ui, low): on screens 700px tall or less the chip row can sit under the Write it bar until scrolled; two identical announcements in a row may not re-announce.

### RL-276 Create sentence builder: optional veg, time and method words

- Pure logic only, no UI change yet; nothing to look at until RL-277 adds the buttons.

### RL-275 Create tab: tiles, pantry card, or, sentence

- Create tab at 390x844 (and 320, light and dark): Paste a link and Snap a page tiles, the green What have you got? card, an "or" divider, then the sentence. Tap What have you got? and the pantry sheet opens over Search. Check nothing scrolls sideways and the Write it bar does not cover the sentence at the end of the scroll. Explore's card should look unchanged.
- At 320x568, check the first line of the sentence is visible above Write it without scrolling.

- Reviewer noted (ui, low): the card's top-right corner blends into the decorative sage circle (as the Paste tile already does); the "or" rules are faint in dark mode. If 320x568 still hides the sentence, the fallback is moving the card to the bottom.

### RL-274 Create tab: Describe it my own way opens the chat

- Create tab: Describe it my own way opens the chat with an empty box.

### RL-272 Stored multi-emoji recipes show one emoji

- On live, open a recipe saved with several emoji before RL-271 (if any exist), in your library and as a published recipe in Explore or a shared link: one emoji shows. Re-publish it and the cloud copy now holds one.
- Notification and suggestion rows, shopping list sources and collection tiles may still show the old multi-emoji copy; that is out of scope.

- Reviewer noted (data, low): Download my data and backups read through the hook, so a legacy multi-emoji recipe exports with one emoji; a row with no emoji exports as the fallback. Any read-then-write of a legacy row stores one emoji, as intended.

### RL-271 One emoji per recipe write

- Edit a recipe's emoji on a phone: pick two emoji from the keyboard; only the last stays, and the icon fits its circle.

- Reviewer round fixed (ui, med): a new emoji wins wherever the caret is; emoji search and IME composition are not wiped mid-typing; an empty field previews the current emoji with "Leave empty to keep the current emoji". Check all three on an iPhone and an Android keyboard.
- Reviewer noted (low): © and ® count as emoji; sync still copies a legacy multi-emoji value until RL-272.

### RL-270 oneEmoji helper in src/lib

- Nothing to check in a browser. The helper is pure and covered by `src/lib/emoji.test.ts`; RL-271 to RL-273 call it.

### RL-269 Import review: Save recipe, branch only as Add to family

- Snap a page and Paste a link: Save recipe opens the new recipe (saved toast, not the branch composer). Edit first still opens the editor.
- Import a dish you already have and check Add to <family> is offered below the two buttons; without a match only Edit first and Save recipe show.

- Reviewer noted (ui, low): a long family title in "Add to <Title> family" may not truncate at 320px (unchanged markup); buttons show no visual disabled state while saving beyond the "Saving..." label.

### RL-301 data-request.mjs requires --project

- On the next real data request, run `export` with `--project recipe-lab-3832b` and check the first line ends `target PRODUCTION`. Run one against the emulator (`--emulator`, no `--project`) and check it uses `demo-recipe-lab`.
- A bare run without `--project` should exit 1 and print the required-flag message.

### RL-295 Pure deploy helpers in scripts/deploy-lib.mjs

- Nothing to check in a browser. The helpers are pure and covered by `scripts/deploy-lib.test.mjs`; the runner (RL-296) is what uses them.
