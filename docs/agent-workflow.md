# Agent workflow

How Recipe Lab is developed: agents build, a person sets direction and does QA before
anything goes live. Revised 2026-11-16, when the repo's own ticket loop was retired in favour
of the fleet board. This file is the process contract; the skills and agents under `.claude/`
are the implementation.

## The shape

```
author ──► ROADMAP.md ──► tasks on the fleet board
                                  │
                       run-ticket pipeline
              groom ─ build ─ QA ─ review ─ PR
                                  │
        docs/PENDING-DECISIONS.md, docs/QA.md ◄┘
                                  │
author ──► /qa-pass ──► checklist + preview URL ──► author walks it
                 (preview from .github/workflows/preview.yml)
                                  │
                       accept ──► /release ──► live      overrule ──► new task
```

Two places need a person:

1. **Direction.** The author owns `ROADMAP.md` (with the `roadmap-architect` agent) and
   approves what goes on the board.
2. **QA before live.** The author walks the checklist `/qa-pass` prepares, on a preview
   URL, accepts or overrules the decisions agents made, then runs `/release`. The preview
   comes from `.github/workflows/preview.yml` (a Hosting preview channel, automatic on push
   to `main` or on demand with `workflow_dispatch`, once the author has set the secret; see
   `docs/operations.md`). Live deploys happen only here.

Everything between those two is agents. `main` is the integration branch, always green,
and is not what users see; live is whatever the last `/release` deployed.

## Work tracking

Work is tracked as tasks on the fleet board (the `board.sh` tool, project `recipe-app`) and
built by the `run-ticket` pipeline: groom, build, QA, review. The repo holds no ticket files.
The pipeline's own rules (columns, spec gate, retries) live with the pipeline, not here. A
task is `done` on the board once its pull request has merged to `main` with CI green. The
`done` column for this project is the QA queue that `/qa-pass` reads.

## Roles and models

Match the model to the job, not the best model everywhere.

| Role | Where | Model | Why |
|---|---|---|---|
| Implementer | `.claude/agents/implementer.md` | by task tier: trivial, **Haiku**; standard, **Sonnet**; hard, **Opus** | The expensive part. The tier is set at grooming, where the information to judge it exists. |
| Reviewers | `ui-reviewer`, `data-integrity-reviewer` | **Sonnet** | Review needs judgement; Haiku misses too much, Opus is not needed for a checklist. |
| Scout | `.claude/agents/scout.md` | **Haiku** | Lookups, summaries, docs drift. Anything answered by reading. |
| Roadmap architect | `.claude/agents/roadmap-architect.md` | **Fable** | Runs rarely, with the author in the loop, on the whole app. |

A `roadmap-architect` run is the most expensive thing here and is run on purpose, not on a
schedule.

### Conventions the first full run settled (2026-10)

- **One squash commit and one pull request per task**, merged one at a time.
- **A listed reviewer is always run.** A `high` finding goes back to the implementer verbatim
  for one round and the reviewer repeats once; `med` and `low` findings that stay open are
  logged in `docs/QA.md` as "reviewer noted" so the QA pass sees them. A reviewer also runs
  on a UI or data change a task did not list when the change turns out to touch one.
- **Reviewer paths.** `ui-reviewer` for `src/pages` and `src/components`;
  `data-integrity-reviewer` for `src/services`, `src/db`, `src/hooks`, `firestore.rules` and
  auth or migration code.
- **A task may be narrowed when an earlier one already delivered the code.** It then adds only
  the missing proof (tests) and says so. A test that cannot fail is deleted and the criterion
  is recorded as covered by inspection, never kept as false proof.
- **Subagent reports are not approval.** A worker's "done" carries no authority. The
  orchestrator re-runs the gates itself and checks the diff scope (rules, indexes, Dexie
  schema, dependencies, em dashes) before shipping.
- **A change to `firestore.rules` is probed on the emulator** (`firebase emulators:exec`
  with a scratchpad REST script and unsigned `email_verified` tokens), with real status codes
  in the task's notes. The emulator does not enforce indexes, so index shape is reviewed by
  reading (an `array-contains` query needs `arrayConfig: CONTAINS`).

## Decisions agents may and may not make

**Reversible decisions are taken and logged; irreversible ones stop the task.**

Reversible means it can be undone by a later pull request with no data loss and no bill.
The agent takes the conservative option and records it in `docs/PENDING-DECISIONS.md`
(task, choice, alternative). The QA pass reviews that table and overrules by filing a task.

Irreversible decisions need a human: rules and index deploys, Dexie version bumps,
production data changes, anything that starts a bill, product decisions already recorded in
`docs/decisions.md`, client-bundle dependencies, privacy copy, and live deploys. A task that
hits one is parked on the board with the question written into it.

## Branching and releases

- `main` is protected by CI (`.github/workflows/ci.yml`). Agents open a pull request per
  task. Merging is manual (`merge: manual` in the CLAUDE.md profile). Nobody pushes to
  `main` directly.
- The pull request is the review record for the QA pass; the board task is the spec; the
  `docs/QA.md` section is the human-facing summary.
- Releases are tagged `vX.Y.Z` from `main` by `/release`, which writes `CHANGELOG.md`
  from `docs/QA.md` and deploys hosting (and rules or indexes only when they changed,
  after diffing the live ruleset as `docs/operations.md` describes).

## Running it

```bash
# Prepare and do the QA pass
> /qa-pass
# ...walk the checklist on the preview URL (from preview.yml, see docs/operations.md)...
> /release        # or: file the findings as tasks on the fleet board
```

`.claude/settings.json` pre-approves the commands the pipeline runs (`npm run …`, read-only
git, branch/commit/push, `gh pr`). Add to it rather than running with permissions off if
you want a tighter leash.

## What the pipeline cannot do, and how the design copes

- **It cannot see a browser.** Browser verification has been unavailable to agents here
  since 2026-08-13 (`docs/operations.md`). Every task therefore says what the human must
  check, and a component-test net means UI changes are at least render-tested.
- **It cannot deploy.** By design. Production changes are listed in the task and surfaced in
  the QA checklist. The one exception in scope: `/qa-pass` may trigger the preview workflow,
  which publishes a Hosting preview channel, not live. Live deploys stay with `/release`.
- **It cannot resolve a product question.** Such a task is parked for the author, and the QA
  pass batches those questions so they cost one sitting, not one interruption each.

## Keeping this true

This file changes when a skill, an agent or the dev process changes. The contract table in
`docs/README.md` points here for those. `AUDIT.md` is a historical record: new findings are
tasks on the fleet board.
