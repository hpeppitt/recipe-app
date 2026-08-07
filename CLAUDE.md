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

- **`ROADMAP.md`** is the strategic backlog: phases, sequencing, and an explicit not-doing
  list. Use it for "what next / how to prioritise".
- **`AUDIT.md`** is the tactical backlog of audit findings, **fully cleared** as of
  2026-07-30. The fix note on each finding records why that fix took the shape it did; it is
  worth grepping before changing code near one.
- **`/audit-next`** fixes exactly one unchecked `AUDIT.md` finding, verifies it, checks it
  off, and commits (`Fix <ID>: ...`). Loopable via `/loop /audit-next`. With the backlog
  cleared it has nothing to do until new findings are filed.
- **`/preflight`** is the pre-commit gate: build + lint + tests + a mobile-viewport browser
  smoke test of the core flows + a `docs/` drift check.
- A PostToolUse hook (`.claude/hooks/typecheck-lint.sh`) runs `tsc -b` + ESLint after every
  edit to `src/**/*.ts(x)` and feeds errors back automatically.

## Subagents

All read-only except where noted.

- `ui-reviewer` — run after any page or component change.
- `data-integrity-reviewer` — run after changes to `services/firestore.ts`, `src/db/`, the
  favourites or recipe-chat hooks, or `firestore.rules`.
- `roadmap-architect` (Fable, writes `ROADMAP.md`) — for planning and re-planning, not for
  individual fixes.

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
