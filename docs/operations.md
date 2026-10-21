# Operations

How to run, test, verify, and deploy. Verified against `package.json`, `firebase.json`,
`.env.example`, and `.claude/` on 2026-07-31; the Data requests section against
`scripts/data-request.mjs` on 2026-10-15.

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
| `node scripts/data-request.mjs <export\|erase> <uid> [flags]` | One person's data export or erasure, by the operator (RL-055, tested in `scripts/data-request.test.mjs`). See [Data requests](#data-requests) |

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
`src/components/ui/UserPill.test.tsx`. Fixtures are
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
| `VITE_RECAPTCHA_SITE_KEY` | **recipe generation** | reCAPTCHA v3 *site* key. App Check is enforced on the AI Logic path, so the Gemini proxy rejects requests without it |
| `VITE_POSTHOG_KEY` | optional | PostHog project key. A public key, not a secret. Unset (the production state today) means no consent banner, no Settings privacy toggle and no analytics. Read through `isPostHogConfigured()` in `services/analytics.ts`, which needs both this and `VITE_POSTHOG_HOST` |
| `VITE_POSTHOG_HOST` | optional | PostHog ingestion host, for example `https://eu.i.posthog.com`. Set it with the key; either one alone counts as unset |
| `VITE_APPCHECK_DEBUG_TOKEN` | local dev only | App Check enforcement blocks localhost unless the token is registered under App Check → Apps → Manage debug tokens. Leave blank to let the SDK mint a fresh one each run, then register that |
| `VITE_ENABLE_GOOGLE_SIGNIN` | optional | `true` shows "Continue with Google" (RL-188). Not a secret. Leave unset until RL-191 enables the Google provider in the console, or the button fails live. The Auth emulator accepts Google with fake accounts, so set it for emulated dev |
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

Once the secret is set, the `qa` channel publishes `main` publicly, so the preview serves the
DRAFT Terms, Privacy and Cookie pages at `/terms`, `/privacy` and `/cookies` to anyone with the
link. That matters until the author signs them off in RL-046.

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
but it is passed into the SDK config and identifies the web app, so set it).
`VITE_APPCHECK_DEBUG_TOKEN` and `VITE_USE_EMULATORS` are local-dev only and are not mapped.
`VITE_ENABLE_GOOGLE_SIGNIN` (RL-188) is not mapped yet, so previews have no Google button; RL-191
maps it when it turns Google on.
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

## Release and deploy runbook (first production release)

The one ordered checklist for the first release since August 2026. It does not repeat the
reasoning: each step points at the section that holds it. Nothing here is automated, and the
loop never runs it (`backlog/README.md`, "What needs a human"). Tick as you go.

**A. Decide first (no deploy yet)**

- [ ] Walk the QA checklist (`/qa-pass`, `backlog/QA-CHECKLIST.md`) and accept or overrule each
  row in `backlog/DECISIONS.md`. An overruled decision becomes a `/groom` input.
- [ ] **RL-046** sign off the Terms, Privacy and Cookie drafts: set `[STATE]`, resolve every
  `[DEPENDS ON ...]` and `[AUTHOR TO CONFIRM]` marker (the ticket's Notes list each file and
  line), and record the date and `TERMS_VERSION` in [decisions.md](decisions.md). If the terms
  date changes, `TERMS_VERSION` and the rules literal change together (`src/lib/legal.test.ts`
  fails if they differ). **Do not release the client before this.**
- [ ] Decide whether your own `termsAcceptance` document is made by hand before the rules or
  by accepting on the live app straight after (see "The pending release order", step 6).
- [ ] Confirm the production build gets the values it needs from the local `.env` (to confirm
  against the `/release` skill): `VITE_FIREBASE_*` and `VITE_RECAPTCHA_SITE_KEY`. Leave
  `VITE_POSTHOG_KEY` unset until the PostHog item in section C, so no consent banner shows.

**B. The release, in this order** (details: "Deploying", "The pending release order")

- [ ] **RL-042** wipe production Firestore and every Firebase Auth user. From here until the
  rules are live, do not use the live app.
- [ ] Diff the live ruleset against HEAD and write down the current ruleset id as the rollback
  target.
- [ ] Indexes: `firebase deploy --only firestore:indexes`, then wait until every new index is
  READY: RL-018 (two on `suggestions`), RL-021 (`recipes` by `createdBy.uid`), RL-009
  (`recipes` by `tags` + `createdAt`).
- [ ] Client: `/release` (hosting only). It carries the RL-040 to RL-049 work, the consent
  banner (RL-052, hidden without a key), GA4 removal (RL-058), the PWA shell and the security
  headers (RL-033).
- [ ] Rules, straight after the client, minutes not hours: `firebase deploy --only
  firestore:rules`, then diff again; the diff must be empty. Record the date and both ruleset
  ids (RL-022 and RL-051 are this one deploy; the wrong orders are described under "What each
  wrong order does for RL-047", "RL-048" and "RL-049"). Tell testers not to suggest, reply,
  favourite, follow or save a new recipe in the gap.
- [ ] Your own Terms acceptance (step 6 of the pending order): confirm
  `termsAcceptance/{your uid}` exists with the current version.
- [ ] Headers: `curl -sSD -` the site root and an `/assets/` file (cache headers unchanged,
  plus `X-Frame-Options: DENY` and `nosniff`), then complete an email-link sign-in and a
  redirect sign-in end to end ("Risk to watch after the first deploy": `/__/auth/` helper
  pages).
- [ ] Live QA: the RL-040 to RL-049 checks in `backlog/QA.md`.

**C. After the release**

- [ ] **RL-050** App Check: look at the Firestore App Check metrics, enforce once nearly all
  requests carry valid tokens, register debug tokens, set the AI Logic per-user limit, and
  add the abuse watch (weekly look at `clientErrors` filtered by `rate-limited-`, Firestore
  usage and AI Logic usage). Console work, so it is a human ticket.
- [ ] **RL-010** TTL policy on `clientErrors.receivedAt` (30 days suggested). The ticket
  carries the steps; it records the command here when done.
- [ ] PostHog (RL-053 and RL-054 done 2026-10-17): to turn analytics on, set
  `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST` as build variables and release the client
  again. Before inviting anyone else, revisit the project settings (IP, autocapture,
  recording) the author accepted as the only user.
- [ ] **RL-032** (done on its branch) removed the uid migration, the stranded-identity notice
  and unused helpers; release that client.
- [ ] Optional housekeeping: set the Preview secret and variables (RL-013, "Preview deploys"),
  delete the GA4 property and the `VITE_FIREBASE_MEASUREMENT_ID` repository variable if it
  exists, change `SUPPORT_EMAIL` in `src/lib/constants.ts` before inviting anyone else.

A later Terms bump is the reverse order, rules first, then the client ("A later Terms bump is
the reverse"). Never deploy `functions/` (see "Deploying").

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

**Structured-suggestion rules (RL-146, deployed by RL-156).** The RL-148 client and these
rules need each other. Under the old live rules, Apply fails whole (its recipe and status
writes are one transaction) and Keep as branch publishes the branch, then its `branched`
status write is denied and the suggestion stays Open. Under the new rules an old
client's Approve adds the suggester to `collaborators`, then its `status: 'approved'` write is
denied. Ship the client and deploy the rules together, with the window between them as short
as possible. After the deploy, re-run a 10-edit suggestion against the
real project: the rules' expression budget for it was probed on the emulator only.

**The pending release order (RL-022 and RL-051, combined).** `firestore.rules` deploys as
one unit. Every rules change merged so far rides along with the next
`firebase deploy --only firestore:rules`, including the RL-047 acceptance guards on recipe,
suggestion and message creates. So the client carrying the RL-047 acceptance flow must be
live before any rules deploy from today's repo. That makes RL-022's rules step also RL-047's,
and the client released before it must be the RL-047 client, which cannot ship before RL-046
signs off the policies. (Deploying RL-022 from a ruleset older than RL-047 would decouple
them; that is the author's call, not something to improvise at deploy time.) In order:

1. **RL-042 wipe**: production Firestore is emptied. Do not use the live app between the
   wipe and step 5. (The wipe also deletes any `termsAcceptance` document, including the
   author's.)
2. **Diff the live ruleset** against HEAD (above) and record the current ruleset id as the
   rollback target.
3. **Indexes (RL-018, RL-021)**: `firebase deploy --only firestore:indexes`, then wait until
   all three new indexes show READY in the console's index list: the two `suggestions`
   indexes (`recipeId` + `recipeOwnerId` + `createdAt`, and `recipeId` + `suggestedBy.uid` +
   `createdAt`) and the `recipes` index (`createdBy.uid` ASC + `createdAt` DESC). RL-009 adds a
   fourth, `recipes` `tags` ASC + `createdAt` DESC, in the same deploy; it only needs to be READY
   before the client release that carries the Explore tag chips (without it a tapped chip shows
   the Explore "Could not load" state).
4. **The client release** via `/release` (`--only hosting`), carrying RL-040, RL-041, RL-015
   to RL-021, and RL-045, RL-047, RL-048 and RL-049 (so RL-046 is signed off first).
5. **The rules**: `firebase deploy --only firestore:rules`, then diff again; the diff must be
   empty. Record the date and both ruleset ids here (RL-022, RL-051). Run this **straight
   after step 4, back to back**: from the moment the RL-048 and RL-049 client is live until
   these rules are, every suggestion, reply and first publish fails and no notification is
   written (see "What each wrong order does for RL-048" and "for RL-049" below).
6. **The author's own acceptance, straight away**: reload the live app signed in with your
   verified account. A stored acceptance for your address is written automatically;
   otherwise the dialog appears, so accept it. Confirm `termsAcceptance/{your uid}` exists
   with the current version before any contributing write; until it does, your own recipe,
   suggestion and message creates are denied.

   RL-051 asks for this document to exist *before* the rules go live. The client cannot do
   that: until step 5 no rule matches `termsAcceptance`, so its read and write are denied
   (the designed fallback above). The only way to have it in place beforehand is to create
   it by hand in the Firestore console (console writes bypass rules) as
   `termsAcceptance/{your uid}` with `version` (string, the current `TERMS_VERSION`),
   `acceptedAt` (integer ms) and `recordedAt` (timestamp). Create it only AFTER step 1: the
   wipe deletes it. Re-check its `version` against `TERMS_VERSION` in `src/lib/legal.ts` at
   deploy time: if RL-046 changes the terms date, `TERMS_VERSION` and the rules literal both
   change and a document made earlier is stale, so your writes are denied and the dialog
   asks again. Either way is acceptable; which one is the author's call, and RL-051's wording
   should be adjusted to match.
7. **Live QA** of the RL-040, RL-041, RL-015 to RL-021, RL-047, RL-048 and RL-049 checks in
   `backlog/QA.md`.

Why the client waits for READY: the RL-021 client issues an ordered `in` query on recipes.
Until that index is built the query fails, and `useFollowingRecipes` shows an empty list for
every follower and reports the failure through `reportError` (`load-following-recipes`). Why
rules go last: the pre-RL-018 client subscribes with an unfiltered `recipeId`-only query,
and the new read rule denies that query whole, so the old client's suggestions panel breaks
for everyone, owner included, the moment the rules go live. The old client also writes no
terms acceptance, so under the RL-047 guards it can create nothing. The old `suggestions`
index (`recipeId` ASC, `createdAt` DESC) stays in `firestore.indexes.json` until that client
is gone, as [data-model.md](data-model.md) records.

**RL-019 (avatar rule)** is order-independent. The old client only writes data URLs or null,
so deploying the rules does not break it. Profiles that already hold a non-data `photoURL`
stay readable, and their avatar falls back to emoji or initials once the new client ships,
not when the rules deploy. After the rules deploy, an owner update that sets `photoURL` to a
non-data value is denied.

**What each wrong order does for RL-047:**

- **Client live before the rules** (the expected window between steps 4 and 5): the
  `termsAcceptance` read and write match no rule and are denied. The client treats a failed
  read as unknown, reports it once per session as `terms-check`, lets the user continue, and
  retries a few times when the browser comes back online or the tab becomes visible.
  `TermsUpdateDialog` is only shown after a successful read, so nobody is blocked. Expect
  `terms-check` reports in `clientErrors` from verified sessions until step 6. A stored
  acceptance stays in its browser (bound to the address it was ticked for) and is written on
  the first check after the rules are live. Old and new clients can still create recipes,
  suggestions and messages.
- **Rules live before the client**: every verified user on the old client can no longer
  create recipes, suggestions or messages (no `termsAcceptance` document, and the old client
  cannot write one) until they load the new client, which then records the acceptance or
  shows the dialog. Edits, favourites, follows and profiles keep working.

**What each wrong order does for RL-048 (write limits).** Neither order is safe, unlike
RL-047. The new client writes `writeWindows/{uid}_{action}` in the same transaction as each
suggestion and reply, and the new rules require that window move on every suggestion and
message create. There is deliberately no client fallback to the old plain write (pending in
`backlog/DECISIONS.md`).

- **Client live before the rules** (the gap between steps 4 and 5): no rule matches
  `writeWindows`, so the window read is denied and the transaction fails. Every suggestion
  and reply from the new client fails with the generic message ("That didn't send. Check
  your connection and try again." or "Couldn't send that reply. Please try again."), the
  text stays in the box, and nothing is written. Emulator-checked against the HEAD rules
  (ticket RL-048 Notes). Recipes, favourites, follows and everything else keep working.
- **Rules live before the client**: old clients write the suggestion or message alone, with
  no window move, so every suggestion and reply from a tab still on the old client is denied
  until it reloads onto the new client.

**What each wrong order does for RL-049 (notification and publish limits).** The same
coupling as RL-048, over two more write paths. The new client writes
`writeWindows/{uid}_notification` with every notification and `writeWindows/{uid}_recipe`
with every first publish; the new rules require those moves.

- **Client live before the rules**: the older rules do not allow the two new window ids, so every
  notification transaction is denied and skipped silently (favourites, follows, suggestions,
  replies and reviews themselves still land; nobody is notified of them), and every first
  publish fails. Since RL-082 a failed first publish from the chat save writes nothing and the
  chat page shows the save error; Share falls back to the self-contained link. Re-publishing an
  already-published recipe keeps working (an update, no window). Emulator-checked against the
  HEAD rules (ticket RL-049 Notes).
- **Rules live before the client**: old clients write notifications and recipe creates with
  no window move, so every notification from an old tab is denied (silently, as today's
  fire-and-forget) and every first publish from an old tab fails until it reloads.

So the combined order stays client first, then rules, as RL-047 needs, with a short expected
gap for suggestions, replies, notifications and first publishes. Keep steps 4 and 5 minutes
apart, not hours, and tell testers not to suggest, reply, favourite, follow or save a new
recipe in between.

**A later Terms bump is the reverse: rules, then client, back to back.** Bump
`TERMS_VERSION` and the `termsVersion()` literal in one change (`src/lib/legal.test.ts`
fails if they differ), deploy the rules, then release the client. Client first would be the
trap: the new client reads the old version, shows the blocking dialog, and its Accept is
denied by the old rules' literal, so the only way out is Decline (sign out) until the rules
land. Rules first instead means that, until the client is released, contributing writes fail
for everyone (their acceptance is now the old version and the old client does not know it),
while browsing, edits, favourites and follows keep working. Keep that window short.

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

**Security headers (RL-033).** The `/**` block also sends `X-Frame-Options: DENY` (no other
site can frame the app) and `X-Content-Type-Options: nosniff` (no MIME sniffing). Firebase applies
every matching block, so `/assets/**` gets both as well as its immutable cache header. The
cache headers are unchanged. These take effect only on a hosting deploy (`/release`); a local
build or `vite preview` does not show them. A Content-Security-Policy is out of scope: it needs
its own inventory of Firebase, Analytics and App Check origins. Check on the live site with
`curl -sSD - -o /dev/null https://recipe-lab-3832b.web.app/` and expect both headers.

**Risk to watch after the first deploy.** Firebase Auth helper pages live under `/__/auth/`.
When the hosting domain is also the auth domain (`VITE_FIREBASE_AUTH_DOMAIN`), Firebase serves
them there, so email-link and redirect sign-in pass through this origin. Confirm both still work
after the first deploy. If they break, the fix is `X-Frame-Options: SAMEORIGIN` or excluding
`/__/**` from the header rule. Do not apply either fix speculatively. The repo does not record
the auth domain value (it lives in the local `.env` and the repository variables), so it does not
prove the two domains match; the `/__/` navigation carve-out in
[decisions.md](decisions.md) assumes they can.

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
grep -o 'url:"[^"]*"' dist/sw.js          # precache list: entry, route chunks, firebase chunk, fonts/*.woff2
```

After deploy, `curl -sSD - -o /dev/null https://recipe-lab-3832b.web.app/sw.js` must show
`no-cache`. The offline reload itself needs a real browser: load once online, set devtools
Network to Offline, reload `/` and a local recipe.

## Data requests

The app cannot export a person's cloud data or delete an account itself (self-service is
RL-056 and RL-057). Until then the Privacy Policy says "email us", and this is what the
operator does with that email. The tool is `scripts/data-request.mjs`. It uses the Firebase
Admin SDK (`firebase-admin`, a dev dependency, never in the client bundle), which bypasses the
security rules.

**Deadline: one month from the day the request arrives.** GDPR and UK GDPR allow an extension
of two further months for complex requests, but only if the requester is told within the
first month. Plan to finish well inside it.

### 1. Verify and record the request

- **The requester must own the account.** Reply to the request from the operator address,
  *to the email address on the account*, and ask them to confirm by replying. Act only on a
  reply from that address. A request from a different address gets the same treatment: write
  to the account's address, not the sender's. Never act on a uid or email alone.
- Anonymous accounts have no email. They cannot prove ownership, and they hold local data
  only (product decision 1a), so there is normally nothing in the cloud to act on.
- **Record the request, not the data.** Keep a short log entry outside the repo: date
  received, the account email, the uid, the right asked for (access, export, erasure),
  the date verified, the date done, and the counts the script printed. Do not keep the
  exported JSON or the email thread's attachments once the request is closed.

### 2. Find the uid from the email

Firebase console, Authentication, Users: search by email and copy the "User UID" column.
Do not use `firebase auth:export` for this; it writes every user's data to a file.

### 3. Authenticate (production runs only)

Either application default credentials:

```bash
gcloud auth application-default login
gcloud auth application-default set-quota-project recipe-lab-3832b
```

or `GOOGLE_APPLICATION_CREDENTIALS=/path/outside/the/repo/key.json` for a service account
key. Never commit a key, never put it in `.env`, and delete a downloaded key when done. The
project is `--project <id>` if given, else `GCLOUD_PROJECT`, else the default in
`.firebaserc` (`recipe-lab-3832b`). The first line of output names it; check it.

A production run (no `--emulator`) refuses to start while `FIRESTORE_EMULATOR_HOST` or
`FIREBASE_AUTH_EMULATOR_HOST` is set, even to an empty value, because Firestore would follow
the variable while Auth went to production. Unset both in that shell first.

### 4. Emulator first, every time

Rehearse on the emulator before touching production. `--emulator` always overwrites
`FIRESTORE_EMULATOR_HOST` and `FIREBASE_AUTH_EMULATOR_HOST` with `127.0.0.1` and the ports in
`firebase.json` (8080 and 9099), refuses anything that is not a loopback host, and never
loads credentials. A stale value in the shell cannot redirect it.

```bash
export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
npx -y firebase-tools emulators:start --only auth,firestore --project demo-rl055
# seed a test user by signing up through `npm run dev:emulated`, then:
node scripts/data-request.mjs export <uid> --emulator
node scripts/data-request.mjs erase <uid> --emulator              # dry run
node scripts/data-request.mjs erase <uid> --emulator --execute
```

### 5. Run it for real

```bash
node scripts/data-request.mjs export <uid>                        # access or export
node scripts/data-request.mjs erase <uid>                         # dry run: read it all
node scripts/data-request.mjs erase <uid> --execute --confirm <uid>
```

- **Export** writes one new JSON file, by default under the system temp directory
  (`recipe-lab-export-<uid>-<time>.json`, mode 600), or to `--out <file>`. It refuses any path
  inside the repo (resolved through symlinks and compared without regard to case, since this
  Mac reaches the repo as both `~/Projects` and `~/projects`), a directory that does not
  exist, and an existing file. Send the file to the verified address, then delete it.
- **Other people are redacted in the export.** Every other account's uid becomes a stable
  `other-user-1`, `other-user-2` and so on, in fields and in document paths, and their display
  names become null. Content is kept: the requester's own recipes, suggestions and replies,
  the recipes they collaborate on, and the other party's text in threads they are part of
  (they can read all of it in the app). The file says so in its `redaction` field.
- **Erase** without `--execute` prints every delete and update it would make, then a count
  per kind, and changes nothing. Read it before running for real. With `--execute` against
  production it refuses unless the uid is typed a second time with `--confirm`; the check runs
  before Firebase is initialised. Writes go in batches of at most 400. If a batch fails (for
  example a counterparty's profile was deleted between the read and the write), that batch is
  retried one write at a time and each write that still fails is printed as `FAILED`, so one
  missing document does not block the rest. Afterwards it collects again and prints how many
  writes are still planned; a failed write or anything other than 0 exits 1, so run the dry
  run again and look. A run can be repeated safely: each counter decrement is in the same
  batch as the delete that causes it, and the re-run plans only what is left.
- **Collection-group index check.** The script cross-checks replies with a collection-group
  query on `messages` where `fromUid == uid`. The emulator needs no index for it. Production
  may: Firestore's automatic single-field indexes are collection-scoped, and a
  collection-group query needs the collection-group scope enabled for `messages.fromUid`. If
  it is missing the script prints a WARNING with the console link and carries on, because it
  also reads every thread the uid is a party to, and the rules allow a reply only from one of
  a thread's two parties. Treat the warning as expected until the index exists; adding it is a
  `firestore.indexes.json` `fieldOverrides` change a human deploys.

### What erase does, per collection

| Data | Erase |
|---|---|
| Auth user | Deleted, after Firestore |
| `profiles/{uid}`, `termsAcceptance/{uid}`, `notificationPrefs/{uid}`, `tasteProfiles/{uid}`, `rateLimits/{uid}`, `writeWindows/{uid}_suggestion`, `{uid}_reply`, `{uid}_notification`, `{uid}_recipe` and `{uid}_cook` | Deleted |
| `recipes` with `createdBy.uid == uid` (with `createdBy.displayName`) | Deleted |
| The uid in another recipe's `collaborators` (objects of `{ uid, displayName }`) and `collaboratorUids` (RL-172) | Removed from both with `arrayRemove` in one update (`collaboratorUids` only when the document's list holds the uid). Found with an `array-contains` query on `collaboratorUids` plus a read of every recipe, because recipes credited before RL-172 have only the objects, which no query can match on uid. Export aliases other uids in both fields |
| `favorites` with `uid == uid` | Deleted, and the favourited recipe's `favoriteCount` decremented (not below 0, not on the uid's own recipes) |
| Other users' `favorites` of the uid's recipes (`recipeOwnerId == uid`) | Deleted: the recipe is gone |
| `follows` on either side (with `followerDisplayName`) | Deleted, and the other party's `followerCount` or `followingCount` decremented (not below 0) |
| `suggestions` the uid wrote on someone else's recipe | Kept for the recipe owner, anonymised: `suggestedBy.uid` becomes `deleted-user`, `suggestedBy.displayName` null, the text stays |
| Replies (`messages`) the uid wrote in those threads | Kept, anonymised: `fromUid` becomes `deleted-user`, `fromDisplayName` null, the text stays. The other party's replies are untouched |
| `suggestions` on the uid's own recipes (`recipeOwnerId == uid`) | Kept and anonymised (RL-060): `recipeOwnerId` becomes `deleted-user`, the uid's own replies in the thread are anonymised as above, and the other party's suggestion, text and replies are untouched, though the recipe is deleted. The suggester can still read the thread (the rules never read the recipe) but the app only reaches it from the recipe page, so they see it through their data export. A suggestion the uid made on their own recipe has no other party and is deleted with its whole thread. `recipeOwnerId` is checked against the recipe on create, so it is the owner field relied on |
| `notifications` with `recipientUid` or `fromUid` equal to the uid (with `fromDisplayName`) | Deleted |
| `clientErrors` with `uid == uid` | Deleted |
| `cookPhotos` with `uid == uid` (RL-207) | Deleted, before the cooks, so no photo is left without its cook. Exported whole: each row holds its JPEG data URL, up to about 200 KB in the file. The dry run prints paths and counts only, never a URL |
| `cooks` with `uid == uid` (with `displayName` and `note`) | Deleted. Exported with the recipe owner's uid aliased |
| Other users' `cooks` of the uid's recipes (`recipeOwnerId == uid`) | Kept, anonymised: `recipeOwnerId` becomes `deleted-user`, as for suggestions on own recipes. Their cook photos are theirs and untouched |

| `collections` with `ownerUid == uid` (RL-226) | Deleted. Exported whole (name and recipe ids) |
| `kitchens/{uid}` (RL-226) | Deleted only when `ownerUid == uid` and `memberUids == [uid]`. Otherwise skipped and listed as `SKIPPED` in the dry run and again after the re-check, and the erase exits 3 (not 0) so it cannot be missed: do not delete a kitchen others share (RL-238 decides what to do). Exported with any other uid aliased. Print counts only, never list contents |

**Not covered**, so say so in the reply to an erasure request:

- Data under an earlier anonymous uid. Someone who used the app before signing in with an
  email may have a second uid (an upgrade that forked instead of linking; see the
  uid carry-over in [data-model.md](data-model.md)). Ask the requester whether they
  used the app before signing in, look for that uid (the console's Users list, by creation
  date, or recipes they name), and run export or erase for it too, as a separate run. An
  anonymous uid cannot prove ownership by email, so match it by what the requester can name.

- Recipe Lab data in the browser on the person's own devices (Dexie recipes and bookmarks,
  localStorage). Tell them to use "Delete recipes on this device" or clear the site's data.
- Other users' local libraries: anyone who opened a recipe, shared link or suggestion may
  hold a copy in their own browser. Share links also carry `createdBy` in the URL itself.
- Backups: any Firestore backup, scheduled export or point-in-time recovery window keeps
  the data until it expires. Check the console for backups before replying, and delete any
  manual export the operator made.
- Google Analytics 4 data from before 2026-10-15, keyed by the uid as User-ID. GA4 was removed
  by RL-058; delete any old data with a GA4 data deletion request.
- Free text: `clientErrors` reports with `uid` null (signed-out) or other users' reports, and
  the kept suggestion and reply text (kept threads on a deleted recipe also keep its `recipeTitle` and `recipeEmoji`), can contain a name or anything the person typed. The
  script does not search text.
- `writeWindows/{other uid}_*` `last` fields may still name a deleted suggestion, reply,
  notification, recipe or cook path. A path holds ids only, no uid or name.

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
  a11y, and state-coverage regressions.
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

### First release record (RL-042, v0.3.0, 2026-10-18)

- Wiped production on `recipe-lab-3832b`: `firebase firestore:delete --all-collections --force`
  (collections removed: clientErrors, favorites, follows, notifications, profiles, recipes), then
  all 14 Firebase Auth users deleted with the Admin SDK and application default credentials,
  with `GOOGLE_CLOUD_QUOTA_PROJECT=recipe-lab-3832b` set for that one command (the ADC quota
  project is another project without the Identity Toolkit API). No backup, as authorised.
- Rollback target for the rules: ruleset `2dc8bfba-ddb2-44c6-bf59-4d3e420a9656` (2026-08-14).
- Indexes deployed and all six READY before the client release.
- Built with `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST` blanked, so analytics are off.
