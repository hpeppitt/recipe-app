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

Tests run in node with `fake-indexeddb`; setup is `src/test/setup.ts`. Fixtures are
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

Deploy rules alone with `--only firestore:rules` when only rules changed, so a stale
`firestore.indexes.json` cannot ride along unnoticed.

`firebase.json` also declares a `functions` codebase pointing at `functions/`. **Do not
deploy it.** It requires the Blaze plan, and moving to Blaze ends the free Gemini tier on
the AI Logic path. It is kept as a written, ready escalation path — see
[decisions.md](decisions.md).

Hosting serves `dist/` with a catch-all rewrite to `index.html`, which client-side routing
requires.

**Cache headers are load-bearing.** `firebase.json` sets `Cache-Control: no-cache` on
everything and then overrides `/assets/**` to a year with `immutable`. Firebase Hosting's
default is `max-age=3600` on every file, which is exactly wrong for a Vite SPA: `index.html`
names the content-hashed bundle, so an hour of caching on it means a returning visitor keeps
loading the *previous* build and a deploy appears not to have happened. This bit on
2026-08-07. Hashed asset URLs can never change their bytes, so caching those hard is free.

Verify after a deploy by checking the headers rather than trusting the CLI's success message:

```bash
curl -sSD - -o /dev/null https://recipe-lab-3832b.web.app/            # expect no-cache
curl -sSD - -o /dev/null https://recipe-lab-3832b.web.app/assets/…js  # expect immutable
```

A deploy that changed `index.html` is confirmed live when the bundle hash it references
matches the one in your local `dist/assets/`.

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

**Review subagents**, both read-only:

- `ui-reviewer` — after any page or component change. Catches mobile, dark-mode, a11y, and
  state-coverage regressions.
- `data-integrity-reviewer` — after changes to `services/firestore.ts`, `src/db/`, the
  favourites or recipe-chat hooks, or `firestore.rules`.
- `roadmap-architect` — not a gate. Reviews the whole app and rewrites `ROADMAP.md`; use it
  for "what next", not for individual fixes.

**CI** (`.github/workflows/ci.yml`) runs `npm ci`, `npm run build`, `npm run lint`, and
`npm test` on every pull request and every push to `main`, on Node 22. `npm ci` rather than
`npm install` so a `package.json`/lockfile mismatch fails the gate instead of silently
rewriting the lockfile. In-flight runs are cancelled when the same branch is pushed again.

CI deliberately does **not** replicate `/preflight`'s browser smoke test: that needs a booted
preview server and the emulator suite, and the payoff-to-flake ratio is wrong until there are
component tests to anchor it. The tests it does run are node plus `fake-indexeddb`, so the
job needs no secrets and no emulators — if that changes, the job needs secrets adding.

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

- `AUDIT.md` — tactical findings with `SEC`/`INFRA`/`FUN`/`UI`/`UX` ids. Fully cleared as of
  2026-07-30. `/audit-next` fixes exactly one finding, verifies it, checks it off, and
  commits; loopable with `/loop /audit-next`.
- `ROADMAP.md` — the strategic layer. Phases, sequencing rationale, and an explicit
  not-doing list.

## Versioning

`package.json` is `0.1.0` and there are **zero git tags**: 105 commits from 2026-02-16 to
2026-07-31 with no release history. Real tagging starts at the end of roadmap Phase 1, which
is `v0.2.0` and the first version this project can actually point at. Do not retrofit
invented semver onto the past — see [CHANGELOG.md](../CHANGELOG.md).
