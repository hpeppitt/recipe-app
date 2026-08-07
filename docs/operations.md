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

`firebase.json` also declares a `functions` codebase pointing at `functions/`. **Do not
deploy it.** It requires the Blaze plan, and moving to Blaze ends the free Gemini tier on
the AI Logic path. It is kept as a written, ready escalation path — see
[decisions.md](decisions.md).

Hosting serves `dist/` with a catch-all rewrite to `index.html`, which client-side routing
requires.

## Verification gates

**`/preflight`** is the pre-commit gate: `npm run build`, `npm run lint`, `npm test`, then a
390×844 mobile-viewport browser walk of the core flows (library, detail, tree in both
themes, create, shared, profile) with a console-error check at the end, plus a `docs/` drift
check against the maintenance contract in [docs/README.md](README.md). It is a gate, not a
repair step.

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
