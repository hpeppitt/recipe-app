# Operations

How to run, test, verify, and deploy. Verified against `package.json`, `firebase.json`,
`.env.example`, and `.claude/` on 2026-07-31.

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Vite dev server (default http://localhost:5173) |
| `npm run build` | `tsc -b && vite build` — the type-check is part of the build |
| `npm run lint` | ESLint over the repo. Baseline is **0 errors**; keep it there |
| `npm test` | Vitest, single run. All tests must pass. The suite grows with each feature, so the signal to react to is a count that *shrinks*, not any particular number |
| `npm run test:watch` | Vitest in watch mode |
| `npm run preview` | Serve the production build locally |
| `npm run emulators` | Firebase Auth + Firestore emulators (see below) |
| `npm run dev:emulated` | Dev server pointed at the emulator suite |
| `npm run backlog -- <list\|next\|show\|set\|validate>` | The ticket backlog CLI (`scripts/backlog.mjs`, tested). `next` prints the ticket an agent should pick up, skipping any with a `ticket/<ID>` branch on `origin` |

Tests run in node by default, with `fake-indexeddb` and the jest-dom matchers loaded from
`src/test/setup.ts`.

**Component tests.** Name the file `*.test.tsx`, put `// @vitest-environment jsdom` as its
first line (that pragma is what selects jsdom; without it the file runs in node and
`document` is undefined), and render with `renderWithProviders` from
`src/test/renderWithProviders.tsx`. It wraps the UI in `MemoryRouter` and a fake
`AuthContext` value (`user` defaults to `fakeUser`; pass `user: null` for signed out, `route`
for the URL, `auth` to override any context field), and registers testing-library cleanup.
Use `userEvent` for interaction. If a page pulls in `services/firebase`, mock that module
with `vi.mock`; do not add env vars. Examples: `src/components/ui/EmptyState.test.tsx`,
`src/components/recipe/RecipeCard.test.tsx`. Fixtures are
`src/test/factories.ts` (`makeRecipe`, `makeIngredient`). New pure logic in `src/db` or
`src/lib` should come with tests — that is where the suite lives and where it is cheap.

## Environment variables

Copy `.env.example` to `.env`. Every value is public by design; **never put a secret in a
`VITE_*` variable**, because Vite inlines them into the client bundle at build time.

| Variable | Required for | Notes |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | auth, Firestore, AI | one of the three that flip `isFirebaseConfigured` |
| `VITE_FIREBASE_AUTH_DOMAIN` | auth, Firestore, AI | ditto |
| `VITE_FIREBASE_PROJECT_ID` | auth, Firestore, AI | ditto |
| `VITE_FIREBASE_APP_ID` | Firebase SDK | |
| `VITE_FIREBASE_MEASUREMENT_ID` | GA4 | optional; analytics is skipped without it |
| `VITE_RECAPTCHA_SITE_KEY` | **recipe generation** | reCAPTCHA v3 *site* key. App Check is enforced on the AI Logic path, so the Gemini proxy rejects requests without it |
| `VITE_APPCHECK_DEBUG_TOKEN` | local dev only | App Check enforcement blocks localhost unless the token is registered under App Check → Apps → Manage debug tokens. Leave blank to let the SDK mint a fresh one each run, then register that |
| `VITE_USE_EMULATORS` | local dev only | `true` routes Auth and Firestore at the emulator suite. Double-guarded on `import.meta.env.DEV`, so a production build can never redirect writes away from the real project |

There is deliberately no Gemini key variable. Firebase AI Logic holds it server-side.

With none of these set, the app runs in local-only mode: browsing, import, export, and
hash-based sharing work; generation does not.

## Emulator workflow

Use the emulators for anything whose writes cannot be undone. The concrete case:
`suggestions` are `allow delete: if false`, so verifying a suggestion or a reply thread
against the live project leaves a permanent record in it. This is how UX-37 was verified.

```bash
npm run emulators      # terminal 1: Auth on 9099, Firestore on 8080, UI on 4000
npm run dev:emulated   # terminal 2
```

Look for `[firebase] using local emulators; no live data is being touched` in the console.
Emulator data is discarded when the process stops. Ports and the emulator UI are configured
in `firebase.json`.

**Java is required and is not on `PATH`.** The emulators are Java processes. `openjdk 26.0.2`
was installed via Homebrew on 2026-08-13 (before that the suite simply could not run, which is
why several findings were verified by reading rather than measurement). Homebrew keeps it
keg-only, and macOS ships a `/usr/bin/java` stub that reports "Unable to locate a Java
Runtime", so every emulator shell needs:

```bash
export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
```

**The `firebase` CLI is not installed globally**, so `npm run emulators` fails on
`command not found`. Use `npx` and keep the Java export in the same shell:

```bash
export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
npx -y firebase-tools emulators:start --only auth,firestore
```

**Port 8080 is often taken on this machine** (Signal Desktop listens on it), and the emulator
refuses to start rather than picking another port. Check with
`lsof -nP -iTCP:8080 -sTCP:LISTEN` before assuming the suite is broken. Overriding the port
takes **two** edits, which is a coupling worth knowing about: the port appears in
`firebase.json` under `emulators.firestore.port` *and* hardcoded in `src/services/firebase.ts`
in the `connectFirestoreEmulator` call. Changing only the first leaves the app talking to
nothing. Revert both afterwards, or the committed default drifts.

**Emulator work needs a `.env`, even though nothing real is being contacted.**
`isFirebaseConfigured` gates the whole Firebase layer on `VITE_FIREBASE_API_KEY`,
`VITE_FIREBASE_AUTH_DOMAIN` and `VITE_FIREBASE_PROJECT_ID` being present, so with no `.env` the
app runs in local-only mode and never reaches the emulator at all. Dummy values are fine (the
emulators do not validate credentials); set `VITE_FIREBASE_PROJECT_ID` to `recipe-lab-3832b` to
match `.firebaserc` under `singleProjectMode`, and leave `VITE_RECAPTCHA_SITE_KEY` unset so App
Check never initialises. `.env` is gitignored.

**Vite binds one address family by default**, and which one varies. A dev server reachable at
`[::1]:5173` but not `127.0.0.1:5173` (or the reverse) will look like a broken browser. Bind
both with `npm run dev -- --host`, and confirm with
`curl -o /dev/null -w '%{http_code}' http://127.0.0.1:5173/`.

### Testing magic-link sign-in without sending email

This is the only practical way to test the auth flows, and it is how the 2026-08-07 upgrade bug
was found. The Auth emulator records the link instead of mailing it:

```bash
P=recipe-lab-3832b
# the pending magic links, newest last
curl -s "http://127.0.0.1:9099/emulator/v1/projects/$P/oobCodes"
# every account, to check whether an upgrade linked in place or forked
curl -s -X POST "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/$P/accounts:query" \
  -H "Authorization: Bearer owner" -H "Content-Type: application/json" -d '{}'
# wipe between runs
curl -s -X DELETE "http://127.0.0.1:9099/emulator/v1/projects/$P/accounts"
curl -s -X DELETE "http://127.0.0.1:8080/emulator/v1/projects/$P/databases/(default)/documents"
```

Navigate to the `oobLink` value to complete a sign-in exactly as a user would. Seeding Firestore
past the security rules needs `-H "Authorization: Bearer owner"`, which the emulator honours as a
rules bypass. Clear `localStorage` and the `RecipeAppDB` IndexedDB database between runs too, or
a stale anonymous session and stored address will mask the behaviour you are testing.

**The success check is the account count.** An upgrade that worked leaves **one** account with
the email attached and the original uid; a broken one leaves two, the anonymous one orphaned.

## Preview deploys (QA channel)

`.github/workflows/preview.yml` builds `dist/` and deploys it to the Firebase Hosting preview
channel `qa` (7-day expiry, `expires: 7d`) on every push to `main` and on demand. It never runs
on `pull_request`, so a forked PR cannot reach the secret. It deploys hosting only, never rules,
indexes or functions; live deploys stay manual via `/release`. It does not rerun the gates and
has no `needs` or `workflow_run` dependency on `ci.yml`, so a push to `main` that turns CI red
still deploys a preview. Its build step is only `npm run build` (typecheck and bundle), not lint
or tests. Auto-merge on green CI normally keeps `main` green.

**Secret** `FIREBASE_SERVICE_ACCOUNT` (repository secret): the JSON key of a service account
with the **Firebase Hosting Admin** role only (least privilege). The author creates it either
with `firebase init hosting:github` (it makes the account and stores the secret; decline the
build and PR workflow files it offers) or in the Google Cloud console under IAM, Service
Accounts, then Keys, Add key, JSON. Paste the JSON into Settings, Secrets and variables,
Actions, New repository secret. An agent cannot do this.

**Variables** (repository variables, not secrets, because they are inlined into a public bundle):
`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID` (required to
load the Firebase layer), `VITE_RECAPTCHA_SITE_KEY` (required for recipe generation), and
`VITE_FIREBASE_APP_ID` (not required by `isFirebaseConfigured`, so the layer loads without it,
but it is passed into the SDK config and identifies the web app, so set it), and `VITE_FIREBASE_MEASUREMENT_ID` (optional, analytics).
`VITE_APPCHECK_DEBUG_TOKEN` and `VITE_USE_EMULATORS` are local-dev only and are not mapped.
Values are the same as in your local `.env`.

Without the secret the workflow skips with a note in the job summary instead of failing, and
skips the build too.

**URL.** The channel URL looks like `https://<site>--qa-<hash>.web.app`. That shape is only
approximate; the action prints the real one and the workflow writes it to the job summary
(`details_url`). Redeploying to `qa` keeps the same channel and refreshes the 7-day expiry.

**On demand:** Actions tab, Preview, Run workflow, or `gh workflow run preview.yml`. Manual
fallback from a local checkout with the CLI logged in:
`npm run build && npx firebase hosting:channel:deploy qa --expires 7d`. `/qa-pass`
triggers it this way when the workflow exists and the secret is set, then reads the URL from
the run.

**Warnings.**
- The preview build uses the live Firebase project configuration: the same Auth, Firestore and
  Storage as production, so QA data is real data. The rules and indexes in `main` may be newer
  than what is deployed live, so the preview can behave differently from live until RL-022
  deploys them.
- The preview URL is public to anyone who has the link.

## Deploying

Target project is `recipe-lab-3832b` (`.firebaserc`).

```bash
npm run build
firebase deploy --only hosting               # static files from dist/
firebase deploy --only firestore             # rules + indexes
```

Rules and indexes live in the repo (`firestore.rules`, `firestore.indexes.json`) and are the
source of truth. Never edit them in the console: the console version wins until the next
deploy and then silently reverts.

**Diff the released ruleset before and after a rules deploy.** The git log is not a reliable
guide to what is live: on 2026-08-14 it looked like one undeployed commit, but two commits on
2026-08-10 had touched `firestore.rules` and the deploy note for that day did not say which one
it carried, so the actual delta was ambiguous until it was fetched. Reading it takes ADC
credentials, which are already present on this machine:

```bash
T=$(gcloud auth application-default print-access-token)
P=recipe-lab-3832b
# the release points at a ruleset id; fetch that ruleset's source
RS=$(curl -s -H "Authorization: Bearer $T" \
  "https://firebaserules.googleapis.com/v1/projects/$P/releases/cloud.firestore" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['rulesetName'])")
curl -s -H "Authorization: Bearer $T" "https://firebaserules.googleapis.com/v1/$RS" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['source']['files'][0]['content'])" \
  > /tmp/live.rules
diff -u /tmp/live.rules firestore.rules
```

Before a deploy this shows exactly what will change in production. After one it should report
no difference, which is the real confirmation that the deploy landed. Note the previous ruleset
id too: it stays fetchable and is the rollback target.

Deploy rules alone with `--only firestore:rules` only when `firestore.indexes.json` is
unchanged, so a stale index file cannot ride along unnoticed. When a change adds indexes
that a new query needs, deploy them on their own first.

**RL-018 and RL-021 ordering (indexes, then client, then rules).** Deploy in three steps:

1. `firebase deploy --only firestore:indexes`, then wait until all three new indexes show
   READY in the console's index list: the two `suggestions` indexes (`recipeId` +
   `recipeOwnerId` + `createdAt`, and `recipeId` + `suggestedBy.uid` + `createdAt`) and the
   `recipes` index (`createdBy.uid` ASC + `createdAt` DESC, RL-021).
2. Release the new client (`--only hosting`).
3. `firebase deploy --only firestore:rules`.

Why the client waits for READY: the RL-021 client issues an ordered `in` query on recipes.
Until that index is built the query fails, and `useFollowingRecipes` shows an empty list for
every follower and reports the failure through `reportError` (`load-following-recipes`). Why rules go last: the pre-RL-018 client subscribes with an unfiltered
`recipeId`-only query, and the new read rule denies that query whole, so the old client's
suggestions panel breaks for everyone, owner included, the moment the rules go live. The old
`suggestions` index (`recipeId` ASC, `createdAt` DESC) stays in `firestore.indexes.json`
until that client is gone, as [data-model.md](data-model.md) records.

**RL-019 ordering (avatar rule).** The profile `photoURL` rule and the `Avatar` change are
independent, so deploy order does not matter. The old client only writes data URLs or null,
so deploying the rules does not break it. Profiles that already hold a non-data `photoURL`
stay readable, and their avatar falls back to emoji or initials once the new client ships,
not when the rules deploy. After the rules deploy, an owner update that sets `photoURL` to a
non-data value is denied.

`firebase.json` also declares a `functions` codebase pointing at `functions/`. **Do not
deploy it.** It requires the Blaze plan, and moving to Blaze ends the free Gemini tier on
the AI Logic path. It is kept as a written, ready escalation path — see
[decisions.md](decisions.md).

Hosting serves `dist/` with a catch-all rewrite to `index.html`, which client-side routing
requires.

**Cache headers are load-bearing.** `firebase.json` sets `Cache-Control: no-cache` on
everything and then overrides `/assets/**` to a year with `immutable`. Firebase Hosting's
default is `max-age=3600` on every file, which is exactly wrong for a Vite SPA: `index.html`
names the content-hashed entry bundle and route chunks, so an hour of caching on it means a returning visitor keeps
loading the *previous* build and a deploy appears not to have happened. This bit on
2026-08-07. Hashed asset URLs can never change their bytes, so caching those hard is free.

Verify after a deploy by checking the headers rather than trusting the CLI's success message:

```bash
curl -sSD - -o /dev/null https://recipe-lab-3832b.web.app/            # expect no-cache
curl -sSD - -o /dev/null https://recipe-lab-3832b.web.app/assets/…js  # expect immutable
```

A deploy that changed `index.html` is confirmed live when the bundle hash it references
matches the one in your local `dist/assets/`.

### Service worker and PWA

`vite-plugin-pwa` generates `dist/sw.js`, a Workbox runtime file and `manifest.webmanifest` at
build. **`sw.js`, the `workbox-*.js` file and the manifest must revalidate, never get a long
cache**: a cached worker script means clients never see a new build. They live at the site
root, so the `/**` `no-cache` rule in `firebase.json` already covers them and only
`/assets/**` is immutable. Do not widen the immutable rule beyond `/assets/**`.

Verify against a local build (`vite preview` does not apply `firebase.json` headers, so it
only proves the files exist and the precache list is right; the header rule must be checked
on the live site after a hosting deploy):

```bash
npm run build && npm run preview          # note the port
curl -sSD - -o /dev/null localhost:4173/sw.js                # 200, text/javascript
curl -sSD - -o /dev/null localhost:4173/manifest.webmanifest # 200, application/manifest+json
grep -o 'url:"[^"]*"' dist/sw.js          # precache list: entry, route chunks, firebase chunk
```

After deploy, `curl -sSD - -o /dev/null https://recipe-lab-3832b.web.app/sw.js` must show
`no-cache`. The offline reload itself needs a real browser: load once online, set devtools
Network to Offline, reload `/` and a local recipe.

## Verification gates

**`/preflight`** is the pre-commit gate: `npm run build`, `npm run lint`, `npm test`, then a
390×844 mobile-viewport browser walk of the core flows (library, detail, tree in both
themes, create, shared, profile) with a console-error check at the end, plus a `docs/` drift
check against the maintenance contract in [docs/README.md](README.md). It is a gate, not a
repair step.

### Browser verification is currently unavailable (2026-08-13)

This blocks the browser half of `/preflight` and any finding whose symptom is visual. Recorded
in detail because the diagnosis is slow and was already repeated once: the 2026-08-07 session
lost `TreeIntro`'s visual check to the same class of obstacle (UI-16), and the 2026-08-13
session lost FUN-17, FUN-18, FUN-19 and UI-16 to it.

Chrome shows `Frame with ID 0 is showing error page` for every attempt to load the dev server,
while `curl` returns 200 for the same URL. What has been **ruled out by measurement**, so it
does not need redoing:

- Not the server. `curl` gets 200 on `127.0.0.1:5173` and `[::1]:5173` with Vite bound to all
  interfaces via `--host`.
- Not an address-family mismatch. Both hostnames tried against a dual-bound server.
- Not a proxy. `scutil --proxy` shows none beyond the `*.local` / `169.254/16` defaults.
- Not a Chrome managed policy, and `/etc/hosts` maps `localhost` normally.
- Not a remote browser. `list_connected_browsers` reports exactly one, `isLocal: true`, macOS.
  This was the leading hypothesis, since `https://example.com` renders fine while `localhost`
  does not, and it is wrong.
- Not a stale tab. A fresh tab behaves identically.

The untested explanation left is the Chrome extension's **site-level permission** not covering
`localhost` / `127.0.0.1`, which is configured inside the extension UI rather than on disk and
so cannot be checked or changed from a shell. Chrome's "Always use secure connections" setting
would produce the same symptom. Both need a human at the browser.

Separately, and independently: **`resize_window` reports success but the viewport stays
1450px**, so the 390x844 mobile check cannot be performed even on a page that does load. The
same failure is recorded against UI-8 in `AUDIT.md` ("viewport emulation has never worked in
this session"), so treat it as a standing limitation of this setup rather than a one-off.

Until both are fixed, the honest options for a user-visible fix are to leave it unmerged (what
FUN-17 did, on `wip/fun-17-suggestions-gate`) or to merge it with the fix note saying plainly
that it was code-reviewed and not browser-verified. Do not write a fix note that implies a
measurement that did not happen; every other note in `AUDIT.md` can be trusted, and that is the
property worth protecting.

**A PostToolUse hook** (`.claude/hooks/typecheck-lint.sh`) runs `tsc -b` and ESLint after
every edit to `src/**/*.ts(x)` and feeds errors straight back, so type and lint breakage
surfaces at edit time rather than at commit time.

**Subagents** (models and roles in [agent-workflow.md](agent-workflow.md)):

- `ui-reviewer` (read-only) — after any page or component change. Catches mobile,
  dark-mode, a11y, and state-coverage regressions.
- `data-integrity-reviewer` (read-only) — after changes to `services/firestore.ts`,
  `src/db/`, the favourites or recipe-chat hooks, or `firestore.rules`.
- `implementer`, `scout`, `groomer` — the loop's worker, lookup and grooming agents.
- `roadmap-architect` — not a gate. Reviews the whole app and rewrites `ROADMAP.md`; use it
  for "what next", not for individual fixes.

**CI** (`.github/workflows/ci.yml`) runs `npm ci`, `npm run build`, `npm run lint`, and
`npm test` on every pull request and every push to `main`, on Node 22. `npm ci` rather than
`npm install` so a `package.json`/lockfile mismatch fails the gate instead of silently
rewriting the lockfile. In-flight runs are cancelled when the same branch is pushed again.

CI deliberately does **not** replicate `/preflight`'s browser smoke test: that needs a booted
preview server and the emulator suite, and the payoff-to-flake ratio is still wrong while component
tests are few. The tests it does run are node plus `fake-indexeddb`, and jsdom for
`*.test.tsx` files, so the
job needs no secrets and no emulators — if that changes, the job needs secrets adding.
The second workflow, `preview.yml`, is the one that uses a secret and repository variables; see
"Preview deploys (QA channel)".

**Pushes must use the GitHub noreply address.** `git config user.email` is
`harry@seidrlab.com`, and the account has email privacy enabled, so GitHub rejects the push
with `push declined due to email privacy restrictions` after the commit already exists. The
address the repo's own merge commits use is `20333887+hpeppitt@users.noreply.github.com`.
Per-commit, without changing the global config:

```bash
git -c user.email="20333887+hpeppitt@users.noreply.github.com" commit -m "..."
# or, to repair a commit that has already been rejected:
git -c user.email="20333887+hpeppitt@users.noreply.github.com" commit --amend --no-edit --reset-author
```

## Backlogs

- `backlog/tickets/` — the tactical queue, one ticket per file, consumed by `/next-ticket`
  and produced by `/groom`. Contract in `backlog/README.md`; process in
  [agent-workflow.md](agent-workflow.md). `backlog/DECISIONS.md` and `backlog/QA.md` are the
  ledgers the loop writes for the author's QA pass.
- `ROADMAP.md` — the strategic layer. Phases, sequencing rationale, and an explicit
  not-doing list.
- `AUDIT.md` — the 2026-07 audit, historical since 2026-10-13. Open findings became tickets
  RL-003 to RL-006 and RL-010 to RL-012; `/audit-next` was removed.

## Versioning

`package.json` is `0.1.0` and there are **zero git tags**: 105 commits from 2026-02-16 to
2026-07-31 with no release history. Real tagging starts at the end of roadmap Phase 1, which
is `v0.2.0` and the first version this project can actually point at. Do not retrofit
invented semver onto the past — see [CHANGELOG.md](../CHANGELOG.md).
