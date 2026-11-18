## Project profile
- type: engineering
- extensions: none
- run: npm run dev
- check: npx tsc -b && npm run lint && npm test
- test: npm test
- docs: docs/
- reviewers: ui-reviewer (src/pages, src/components); data-integrity-reviewer (src/services, src/db, src/hooks, firestore.rules, auth and migration code)
- merge: manual

# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## Read the docs first

`docs/` is the knowledgebase and the single source of truth. **This file holds no fact that
lives there.** That is deliberate: two copies of a fact become two copies that disagree.

| Question | File |
|---|---|
| What can the app do? What is shipped, partial, or cut? | [docs/capabilities.md](docs/capabilities.md) |
| How is it put together? Where are the seams? | [docs/architecture.md](docs/architecture.md) |
| Dexie schema, Firestore collections, what the rules permit | [docs/data-model.md](docs/data-model.md) |
| Commands, env vars, emulators, deploy, verification gates | [docs/operations.md](docs/operations.md) |
| Why is it like this? What was tried and rejected? | [docs/decisions.md](docs/decisions.md) |
| How is it developed? Who decides what, which model does which job? | [docs/agent-workflow.md](docs/agent-workflow.md) |

Read [docs/decisions.md](docs/decisions.md) before proposing anything architectural. It
records what has already been tried and reverted with evidence, including the
`createBrowserRouter`/`useBlocker` attempt and the six standing product decisions of
2026-07-31. Re-litigating one of those without new evidence wastes a session.

In one paragraph, so you are not flying blind before you open them: Recipe Lab is a
mobile-first React 19 + Vite + TypeScript SPA. Recipes are AI-generated and branch into a
navigable version tree. Every recipe is written twice, to Dexie (IndexedDB) locally and to
Firestore in the cloud, and Gemini is reached through Firebase AI Logic, which holds the API
key server-side. Firebase is optional; without it the app degrades to a local viewer that
cannot generate.

## Dev cycle

Work is tracked on the fleet board (`board.sh`, project `recipe-app`) and built by the
`run-ticket` pipeline: groom, build, QA, review. The repo holds no ticket files. Process
details are in [docs/agent-workflow.md](docs/agent-workflow.md).

- **`ROADMAP.md`** is the strategic backlog, owned by the author with `roadmap-architect`.
- **`/qa-pass`** prepares the author's checklist and preview; **`/release`** ships.
- **`/preflight`** (the kit's `engineering:preflight`) is the manual full-verification gate. It walks the Core flows below.
- **`AUDIT.md`** is historical. Its open findings were moved to tickets on 2026-10-13 and
  new findings go on the fleet board, not appended there.
- A PostToolUse hook (`.claude/hooks/typecheck-lint.sh`) runs `tsc -b` + ESLint after every
  edit to `src/**/*.ts(x)` and feeds errors back automatically.

## Core flows

`/preflight` checks these at a 390x844 viewport (iPhone-class). The dev server default is
http://localhost:5173 (`npm run dev`). Stop the dev server if you started it.

1. **Library**: page loads, recipe cards render, search filters, favourites filter toggles.
2. **Recipe detail** (`/recipe/:id`): action icon row, breadcrumb, variations.
3. **Version tree** (`/recipe/:id/tree`) for a recipe with variations: nodes readable in both light and dark theme (toggle in Settings).
4. **Create flow** (`/create`): the auth modal or chat input appears. Do not spend Gemini quota generating unless the change under test requires it.
5. **Shared page** (`/shared/:id`) for a published recipe.
6. **Profile** (`/profile`): avatar, stats, and the anonymous-account banner if signed in anonymously.

Afterwards, read the console and flag errors and unhandled rejections. Ignore dev-only noise such as React DevTools suggestions.

The static gate is the profile's `check` command. It must exit 0.

Docs drift is a warning, not a failure. Check the working diff against the maintenance
contract in [docs/README.md](docs/README.md):

- a user-visible feature: `docs/capabilities.md`
- a module boundary, service, or route: `docs/architecture.md`
- `src/db/database.ts`, `firestore.rules`, `firestore.indexes.json`, a type in `src/types/`: `docs/data-model.md`
- an npm script, env var, or deploy step: `docs/operations.md`
- reasoning worth keeping, or an approach rejected: `docs/decisions.md`
- anything a user would notice: `CHANGELOG.md`

## Subagents

Each has a pinned model; the table in `docs/agent-workflow.md` says why.

- `engineering:implementer` (kit): builds one board task, spawned by the `run-ticket` pipeline. Model by task tier.
- `engineering:explorer` (kit, Haiku, read-only): lookups, summaries, docs drift.
- `ui-reviewer`, `data-integrity-reviewer` (Sonnet, read-only): run after page/component
  changes and after data-layer changes respectively.
- `roadmap-architect` (Fable, writes `ROADMAP.md`): planning with the author, not fixes.

## Hard rules

- **Smallest change.** Do only what the ticket asks. Neighbouring problems go in your report as a one-line note, not into the diff.
- **Production changes need a human.** Do not edit `firestore.rules`, `firestore.indexes.json`, or the version blocks in `src/db/database.ts` unless the ticket says so. A human deploys them. Never edit the rules or indexes in the Firebase console either: the repo is the source of truth and a deploy will silently revert console edits.
- **Never put a secret in a `VITE_*` variable.** Vite inlines them into the client bundle at
  build time. There is deliberately no Gemini key variable.
- **Nothing in `lib/` imports from `services/` or `hooks/`.** That constraint is what keeps
  `lib/` testable in node.
- **New pure logic in `src/db` or `src/lib` comes with tests.** That is where the suite lives
  and where testing is cheap; use `src/test/factories.ts` (`makeRecipe`, `makeIngredient`).
- **Update `docs/` in the same change.** The contract table in
  [docs/README.md](docs/README.md) says which file covers what. A user-visible change also gets a bullet under the ticket's section in [docs/QA.md](docs/QA.md) saying what the human should look at.
- **Reversible decisions are taken and logged.** If a ticket leaves a reversible decision open, take the conservative option and log it in [docs/PENDING-DECISIONS.md](docs/PENDING-DECISIONS.md) (date, ticket, decision, alternative, status `pending`).
- **Irreversible decisions stop the work.** The list is in [docs/agent-workflow.md](docs/agent-workflow.md). Leave the code buildable and report `BLOCKED: <reason>`.
- **Use the emulators for writes you cannot undo**: `npm run emulators` plus
  `npm run dev:emulated`. Suggestions are `allow delete: if false`, so a test suggestion
  against the live project is permanent.
- **Build workers do not commit, push or deploy.** The orchestrator reviews, commits and opens the pull request. Live deploys belong to `/release`.
- **Finish with a report.** Give the ticket id, `DONE`, `PARTIAL` or `BLOCKED`, the files changed, each acceptance criterion and how it is met, the gate exit status, decisions logged, and anything noticed but not touched.
- **No em dashes** in anything you write.
