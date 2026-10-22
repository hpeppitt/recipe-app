# Changelog

**Reconstructed from git history on 2026-07-31.** This project has no release history: at
the time of writing `package.json` is `0.1.0`, there are zero git tags, and there are 105
commits spanning 2026-02-16 to 2026-07-31. The entries below are dated milestones grouped
from commit history, not releases that were ever cut, and no semantic version has been
retrofitted onto them.

Real tagging starts at the end of roadmap Phase 1, which will be `v0.2.0` — the first
version this project can actually point at. From then on this file is maintained per
release, newest first.

---

## v0.4.0 - 2026-10-22

A new look and a much bigger app. Every screen follows the Organic design, and Recipe Lab
now helps you import, cook, shop and share, not only generate. Everyone accepts the updated
Terms once.

### Added

- **The Organic look, light and dark.** New colours, type and icons, soft dialogs and
  sheets, a five-slot bottom nav, a left rail from 1024px wide, and Explore and Saved
  beside the recipe on large screens. Settings has Light, Dark and System, and a grouped
  list. Signed-out visitors get a short Settings page.
- **A new Create tab.** Build a sentence ("Write it" or "Describe it my own way"), tap
  taste terms, or use the import tiles. You can attach up to three photos to the recipe
  chat and to a new branch.
- **Search.** A /search screen, with a pantry chip that finds what you can make now.
- **Branching.** Branching opens one focused screen: a single instruction, quick-change
  chips that learn from the recipe's family, and a Grow this branch button. While you
  type, a card warns when a recipe is the same or similar, and a sheet checks again on
  send. A new original can be moved into its related family.
- **The version tree, three ways.** A Map, a Timeline and a Forest view, with a legend,
  a What changed screen for any branch, and a branch carousel on the recipe page. Deleting
  a version moves its branches up. Branching someone else's recipe tells its author.
- **A better recipe page.** A version pill, two-line titles, a sage lineage strip,
  macro and diet pills, an inline servings stepper with a Scaled strip, tick-off
  ingredients, numbered method steps, and a collapsed nutrition card. You can reorder
  ingredients and collapse the method when editing, and fact pills are native pickers.
  A "Weigh spoons and liquids" setting shows spoon and millilitre amounts in grams.
- **Suggestions you can act on.** Suggest mode sends structured edits. The owner sees diff
  rows and can Apply, Decline or Keep as branch. Each suggestion opens as a full thread.
- **Import from a link.** Paste a recipe link and the app reads it, shows what it found,
  and credits the source ("Imported from <host>").
- **Import from photos.** Snap a page, up to three photos, and it reads the recipe. The
  photos are used once and never stored. Photo imports are credited "Imported from a photo".
- **Share to Recipe Lab on Android.** Share a link from another app. Recipe Lab asks
  "Read this recipe from <host>?" and only reads after you confirm.
- **Continue with Google.** A new sign-in option, with sign-in methods shown in Settings.
  It stays off unless the site turns it on.
- **Sign-in that remembers.** Sign-in is a sheet that names the action, the link brings
  you back to the page you were on, and the action you asked for then runs once.
- **Cooks.** An I made this sheet records a cook with notes, an optional photo and what
  was left over. Cooked shows in the recipe footer, with a made-by row, a notes sheet and
  a cook log page. A branch grown from a cook note credits it. Profiles show a Cooked tile.
- **Cook mode.** A full-screen, step-by-step view for the kitchen.
- **Kitchen.** A new tab with a shopping list, a pantry and your collections.
  - Add a recipe, or a whole family tree, to the shopping list. Shop mode is for the
    supermarket aisle.
  - The pantry nudges you about ageing items, and a receipt photo can fill it.
  - Households: invite people to share a kitchen, a list and a pantry, each with an avatar.
- **Collections and cookbooks.** Save a recipe into a collection straight after saving it.
  Share a collection as a public cookbook at its own page, and follow other people's
  cookbooks. Activity shows "added to <cookbook>" for the ones you follow. Sharing is
  limited to 5 a day.
- **Taste and avoids.** The app learns what you like from what you save and cook, shows it
  on a Your taste page, and asks once about foods to avoid. Avoids are respected when it
  generates.
- **Explore cooking stats.** Explore has newest-recipe tiles, Most branched and Most cooked
  rankings, a Branching this week row, a Tonight card and a pantry card. Cook counts show on
  the tree, and the most-cooked branch opens from Explore and Search.
- **Activity.** Filter chips, day headers, one-line suggestion changes, and Settings
  "Notify me when" controls for branch notifications.
- **Profiles.** A redrawn own profile and other cooks' profiles, a Collabs tab, stat tiles,
  and a new avatar editor.
- **Saved.** Replaces favourites everywhere ("save", "saves", "Saved"). The Saved page lists
  everything honestly, including offline, failed and deleted items.
- **Loading screens** that appear on long generations, and a redrawn tree explainer.

### Changed

- Explore is the home screen, and My Recipes shows what you created, branched and saved.
- A shared recipe opens straight to the recipe with a "Shared by" banner, Save and
  Make it yours.
- Saving, editing and deleting your own recipes now go to the cloud first, and a verified
  account's recipes stay in step on every device. Imports are saved copies that sync never
  removes.
- Signing out removes your own recipes from the device, and the delete-from-this-device
  copy says so. The old cloud identity migration is gone.
- Everyone accepts the updated Terms once. The Terms, Privacy and Cookie Policies cover
  photos, cooks, kitchens, cookbooks, Google sign-in and imports, give a contact
  address, and no longer carry a draft banner.
- The spinner stops spinning if you ask your device to reduce motion.

### Fixed

- Avatars and themes follow dark mode, and the chrome colour follows the theme.
- Opening a link, sign-in or share no longer loses the page or action you came from.
- Cooks, cookbooks and follows are guarded in the cloud rules, so a deleted or private
  cookbook can still be unfollowed.
- Small import and Explore reads stay within time and size limits.

## v0.3.0 - 2026-10-18

The first release as an accounts app. Production data and every sign-in were wiped first, so
everyone starts fresh.

### Added

- **Accounts you can trust.** Anonymous visitors can browse and bookmark on their own device.
  Saving, publishing, sharing, favouriting in the cloud, following, suggesting and replying
  need a verified email, signed in with a link. Sign-up asks you to accept the Terms, and
  asks again if they change.
- **Terms, Privacy and Cookie pages**, linked from Settings and the sign-up forms. They are
  drafts for testing, not legal advice.
- **Analytics only if you agree.** A banner asks once. Nothing is tracked unless you allow
  it, and you can change your mind in Settings. This build ships with analytics off.
- **Download all my data** from Settings, local and cloud.
- **Explore tab and tag chips**, separate from My Recipes. Tags are stored in lower case so
  the chips find recipes.
- **Cloud favourites follow you** to every device you sign into, and local bookmarks move to
  your account when you add an email.
- **Share asks you to sign up** if you have no verified email, instead of handing out a long
  link.
- **Works offline as an app**, with an install prompt and an update prompt.
- **Limits that say so.** Suggestions, replies, notifications and new recipes are rate
  limited, and the app tells you when you hit one.

### Changed

- Google Analytics is gone. The app sends no product events anywhere in this release.
- Reply and suggestion threads are visible only to the recipe owner and the suggester.
- Deleting a recipe waits for the cloud and tells you when published copies remain.
- Share links are checked before they open. Amounts snap to an eighth. Unit abbreviations are
  never pluralised. The recipe editor refuses negative amounts.
- Security headers are sent on every page, and app dependencies have no known critical or
  high advisories.

### Fixed

- Re-publishing a recipe no longer overwrites its collaborators.
- Mark all read works with more than 500 notifications. Cold loads tell "not found" from
  "could not load". Corrupt browser storage no longer breaks the app.

---

## v0.2.0 — 2026-08-11

The first tagged version, and the end of roadmap Phase 1. Everything above this line in the
repo's history was reconstructed; this is the first entry written as a release rather than
recovered from commits.

Phase 1 set out to make the app observable, durable and bounded before anyone else was
invited into it. All six items landed: the `docs/` knowledgebase, CI on every pull request,
the client error beacon, an honest notice on the one identity-loss path, `responseSchema`
enforcement on generation, and the contribute boundary below.

### Added (2026-08-11)

- **Contributing takes a verified email.** Anyone could publish into the shared library:
  anonymous sign-in is one tap, and nothing anywhere enforced who was allowed in. Reading,
  favouriting and following stay open to anonymous accounts; creating a recipe, suggesting a
  change and replying on a suggestion now need an email you have proved you own. Enforced in
  the security rules, so it is a property of the system rather than a check the client is
  trusted to make.
- **The block is an invitation, not an error.** Hitting the gate shows a sign-up screen
  offering a passwordless link, rather than failing at the end of a long flow. Signing up
  from an anonymous account upgrades it in place, so the recipes already published under it
  come along. Generation is gated in front of the composer rather than at save time,
  because spending a generation and then being refused is a worse way to meet the app.

### Added (2026-08-07)

- **The shared library can be browsed past 200 recipes.** It was capped at the newest 200 with
  no way further, and re-read all 200 on every visit whether or not you scrolled. Now paginated
  at 30 per page with a Load more button. Paging is hidden while a search or the favourites
  filter is active, because those only filter what has already been fetched.
- **Client error reporting.** Nothing in the app reported a client-side failure, which is why
  several known limits were described as happening "silently". Uncaught errors and unhandled
  promise rejections, plus 12 places that previously only wrote to the console, now file a
  capped, deduplicated report to a write-only `clientErrors` collection. Reports carry the
  route but never the full URL, since a shared-recipe hash holds an entire recipe and the
  sign-in query holds a live link code. Live as of 2026-08-08.


- **An explainer that teaches the branching model.** Nothing in the app taught the idea it is built
  on: that changing a recipe makes a new version rather than overwriting it. A small diagram, using
  the same lines as the real version tree, now appears once on a root recipe from the second recipe
  you open onward. It is skipped on variations, which already demonstrate the idea, and it does not
  come back once dismissed.

### Fixed (2026-08-11)

- **The suggestion dialog no longer fails in silence.** A suggestion that could not be sent
  left the button to stop spinning and said nothing at all, with the text still sitting in
  the box. It now says that it did not send and invites a retry.

### Fixed (2026-08-07)

- **Signing in with email no longer abandons your guest account.** Adding an email to an
  anonymous account created a second, empty account and left the first one behind, taking
  everything published under it. The completion ran before Firebase had restored the session, so
  the code that attaches an email to the existing account could never run. It now waits, and the
  account is upgraded in place with its uid, recipes, and name intact.
- **Magic-link problems are no longer silent.** Expired links, already-used links, and links
  opened in a different browser from the one that requested them all used to leave you on a
  signed-out page with no explanation. Each now says what happened, and the different-browser
  case asks for your address and carries on instead of dead-ending.
- **An email that already has an account is reported honestly** rather than as an expired link.
- **Hosting no longer caches `index.html` for an hour**, which made deploys look like they had not
  happened.

### Added

- **Documentation knowledgebase.** `docs/` with capabilities, architecture, data model,
  operations, and decisions; this changelog; `README.md` rewritten from the stock Vite
  template as the front door. `CLAUDE.md` demoted to a pointer so each fact has one home.
- `ROADMAP.md` and the `roadmap-architect` subagent: the strategic layer above `AUDIT.md`,
  with four phases, sequencing rationale, and an explicit not-doing list.
- **CI.** `.github/workflows/ci.yml` runs build, lint, and tests on every pull request and
  every push to `main`. The 0-error, 153-test baseline was previously protected by local
  habit alone.
- **A notice when published recipes cannot follow you to a new account.** Upgrading an
  anonymous account to an email address that already exists signs you in under the existing
  account, and Firestore rules correctly forbid reassigning ownership of the recipes you
  published as the old identity. That failure was previously swallowed. Now a dismissible
  banner names how many recipes stayed behind and under which name, with a prefilled mail to
  support carrying the old account id. Shown only when something was actually stranded.
- `Button` accepts `as="a"`, so an action that is genuinely a link can look like a button
  without a hand-rolled copy of its classes.

- **Serving scaling.** A stepper above the ingredients rescales the amounts for the number of
  people you are actually cooking for. Display only, never saved, and it resets when you move
  to another recipe. Times and the per-serving nutrition figures deliberately stay put.
- **Manual recipe editing for owners** at `/recipe/:id/edit`, reached from Edit in the recipe
  menu. Every content field is editable; steps renumber themselves; total time is worked out
  from prep plus cook. Edits apply in place, so the recipe keeps its position in the version
  tree — fixing a typo no longer means spending an AI generation and forking the tree. Leaving
  with unsaved changes asks first, including on browser back and the iOS swipe gesture.

### Changed

- **Recipe generation enforces its output shape** at the model layer via `responseSchema`
  rather than only asking for it in the prompt. Narrows what a misused request can return to
  a valid recipe. The prompt's schema text is now serialised from that same object, replacing
  a hand-written second copy that nothing kept in step with it.

### Removed

- Root dependency on `@google/genai`. Nothing in `src/` has imported it since generation
  moved to Firebase AI Logic; the only importer is `functions/src/index.ts`, which declares
  it in its own `package.json`.

### Fixed

- Documentation drift found while writing the above: `VITE_USE_EMULATORS` and the
  `emulators` / `dev:emulated` scripts were undocumented despite being how suggestion reply
  threads were verified, and the Firestore collection list omitted the
  `suggestions/{id}/messages` subcollection and the `rateLimits/{uid}` collection.

---

## 2026-07-30 — Audit backlog cleared

All 78 findings in `AUDIT.md` closed and verified (PR #4). The last of them:

- Suggestion reply threads, so a rejected suggestion can be discussed rather than
  dead-ending. Implemented as a `messages` subcollection and verified against the Firestore
  emulator suite, which was added for exactly this reason: suggestions cannot be deleted, so
  testing against the live project would have left permanent records.
- Curated ingredient densities, making volume↔weight conversion work instead of refusing
  every such conversion.
- Converted units are pluralised, so a scaled measure no longer reads "2 cup".

## 2026-07-29 — UX sweep

Second audit pass merged (PR #3), covering the 45 UX findings from three parallel reviews:

- Unit system toggle (original / metric / imperial) with temperature conversion in
  instruction text.
- Per-serving macro estimates on generated recipes.
- Follower and following lists on your own profile.
- Accessibility and mobile work throughout: 44px touch targets, dark-mode contrast brought
  to AA, dialogs associated with their headings, empty states given actions, and design-system
  drift pulled back onto the shared `ui/` primitives.

## 2026-07-28 — Firebase AI Logic; the big remediation pass

- **Gemini calls moved to Firebase AI Logic** (PR #2). The API key is now held server-side by
  a Google-hosted proxy and the browser never sees one; the user-supplied-key flow and its
  localStorage storage were removed. App Check is enforced on this path. Model pinned to
  `gemini-3.6-flash` after `gemini-2.0-flash` was shut down on 2026-06-01.
- **77 audit fixes** (PR #1) across security, infrastructure, functionality, and UI:
  Firestore rules and indexes brought into the repo, cloud-aware duplicate detection,
  double-tap save guards, delete cascading to the cloud, ownership-aware actions,
  unsaved-work guards, real loading and error states, and the lint gate taken to zero errors.
- A server-side Gemini proxy Cloud Function written and committed but left inert, as the
  escalation path if quota abuse ever appears.

## 2026-02-25 — Shared library and social layer

- The library feed became a shared repository of all published recipes rather than a private
  one.
- Anonymous auth persistence, email-link account upgrade, user profiles, follows, and GA4
  analytics.
- Duplicate detection at prompt time, tree-aware back navigation.

## 2026-02-24 — Recipe Lab

- The app: AI recipe generation, branching variations, the version tree, the local library,
  and shareable view-only recipe links.
- Authentication, favourites, anonymous identity, and the first social features.
- Firebase Hosting configuration.

## 2026-02-16 — Initial commit

Project scaffold.
