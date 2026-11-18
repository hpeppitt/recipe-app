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
navigable version tree. Every recipe is written twice — Dexie (IndexedDB) locally and
Firestore in the cloud — and Gemini is reached through Firebase AI Logic, which holds the API
key server-side. Firebase is optional; without it the app degrades to a local viewer that
cannot generate.

## Dev cycle

Work is tracked on the fleet board (`board.sh`, project `recipe-app`) and built by the
`run-ticket` pipeline: groom, build, QA, review. The repo holds no ticket files. Process
details are in [docs/agent-workflow.md](docs/agent-workflow.md).

- **`ROADMAP.md`** is the strategic backlog, owned by the author with `roadmap-architect`.
- **`/qa-pass`** prepares the author's checklist and preview; **`/release`** ships.
- **`/preflight`** is the manual full-verification gate, including the browser walk.
- **`AUDIT.md`** is historical. Its open findings were moved to tickets on 2026-10-13 and
  new findings go on the fleet board, not appended there.
- A PostToolUse hook (`.claude/hooks/typecheck-lint.sh`) runs `tsc -b` + ESLint after every
  edit to `src/**/*.ts(x)` and feeds errors back automatically.

## Subagents

Each has a pinned model; the table in `docs/agent-workflow.md` says why.

- `implementer` (Sonnet by default; Haiku or Opus by task tier): does one board task, spawned by the `run-ticket` pipeline.
- `ui-reviewer`, `data-integrity-reviewer` (Sonnet, read-only) — run after page/component
  changes and after data-layer changes respectively.
- `scout` (Haiku, read-only) — lookups, summaries, docs drift.
- `roadmap-architect` (Fable, writes `ROADMAP.md`) — planning with the author, not fixes.

## Working conventions

- **New pure logic in `src/db` or `src/lib` comes with tests.** That is where the suite lives
  and where testing is cheap; use `src/test/factories.ts` (`makeRecipe`, `makeIngredient`).
- **Nothing in `lib/` imports from `services/` or `hooks/`.** That constraint is what keeps
  `lib/` testable in node.
- **Never put a secret in a `VITE_*` variable.** Vite inlines them into the client bundle at
  build time. There is deliberately no Gemini key variable.
- **Never edit `firestore.rules` or `firestore.indexes.json` in the Firebase console.** The
  repo is the source of truth and a deploy will silently revert console edits.
- **Use the emulators for writes you cannot undo** — `npm run emulators` plus
  `npm run dev:emulated`. Suggestions are `allow delete: if false`, so a test suggestion
  against the live project is permanent.
- **Update `docs/` in the same change.** The contract table in
  [docs/README.md](docs/README.md) says which file covers what; `/preflight` checks the diff
  against it.
