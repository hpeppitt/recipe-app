# Agent workflow

How Recipe Lab is developed: an autonomous loop of Claude Code agents between two human
touchpoints. Written 2026-10-13. This file is the process contract; `backlog/README.md` is
the ticket contract; the skills and agents under `.claude/` are the implementation.

## The shape

```
author ──► ROADMAP.md ──► /groom ──► backlog/tickets (ready)
                                          │
                     ┌────────────────────┘
                     ▼
          /loop /next-ticket  (Sonnet orchestrator)
             pick ─ claim ─ implement ─ review ─ gates ─ PR ─ auto-merge
                     │                                      │
                     └── backlog/DECISIONS.md, backlog/QA.md ◄┘
                                          │
author ──► /qa-pass ──► checklist + preview URL ──► author walks it
                                          │
                       accept ──► /release ──► live      overrule ──► /groom
```

Two places need a person:

1. **Direction.** The author owns `ROADMAP.md` (with the `roadmap-architect` agent) and
   approves every grooming run. Nothing enters `ready` without that approval.
2. **QA before live.** The author walks the checklist `/qa-pass` prepares, on a preview
   URL, accepts or overrules the decisions agents made, then runs `/release`. Live deploys
   happen only here.

Everything between those two is agents. `main` is the integration branch, always green,
and is not what users see; live is whatever the last `/release` deployed.

## Roles and models

Token efficiency comes from matching the model to the job, not from using the best model
everywhere. Prices per million tokens, Anthropic first-party rates on 2026-10-13: Haiku
5.5 $0.10 in / $0.50 out, Sonnet 5.5 $2 / $10, Opus 5.5 $4 / $20, Fable 5.1 $10 / $50.

| Role | Where | Model | Why |
|---|---|---|---|
| Orchestrator | the session running `/next-ticket` | **Sonnet 5.5** | Reads tickets and reports, runs commands, delegates. It must not do the implementing itself. Start the session with `claude --model sonnet`. |
| Implementer | `.claude/agents/implementer.md` | by ticket `tier`: trivial → **Haiku 5.5**, standard → **Sonnet 5.5**, hard → **Opus 5.5** | The expensive part. Tier is set at grooming, where the information to judge it exists. |
| Reviewers | `ui-reviewer`, `data-integrity-reviewer` | **Sonnet 5.5** | Review needs judgement; Haiku misses too much, Opus is not needed for a checklist. |
| Scout | `.claude/agents/scout.md` | **Haiku 5.5** | Lookups, summaries, docs drift. Anything answered by reading. |
| Groomer | `.claude/agents/groomer.md` | **Opus 5.5** | Turning intent into executable tickets is where mistakes are most expensive downstream. |
| Roadmap architect | `.claude/agents/roadmap-architect.md` | **Fable 5.1** | Runs rarely, with the author in the loop, on the whole app. |

Escalation is mechanical, not discretionary: an implementer that fails its gates twice is
promoted one tier and tried once more with the previous report; a third failure marks the
ticket `blocked`. The orchestrator never starts a `standard` ticket on Opus.

Rough cost per ticket, from the prices above and typical token counts seen in this repo's
history (orchestrator 80k in, implementer 250k to 600k in, reviewer 60k in, scout 30k in;
cache reads cut the real figure further):

| Ticket | Implementer | Order of magnitude |
|---|---|---|
| S, standard | Sonnet | about $1 |
| M, standard | Sonnet | $1 to $3 |
| L, hard | Opus | $3 to $8 |
| any, trivial | Haiku | well under $1 |

Grooming a design document into twenty tickets on Opus is a few dollars once. A
`roadmap-architect` run on Fable is the single most expensive thing in the loop and is
run on purpose, not on a schedule.

## Ticket lifecycle

`draft → ready → in-progress → done → released`, with `blocked`, `needs-human` and
`dropped` as side exits. Definitions and fields are in `backlog/README.md`.

- A ticket is **claimed** by pushing a `ticket/<ID>` branch. `npm run backlog -- next`
  skips claimed tickets, so several sessions can run the loop in parallel without a lock.
- A ticket is **done** when its pull request has merged to `main` with CI green. The
  `done` state is the QA queue.
- A ticket is **released** by `/release`, which also moves its QA note into the changelog.

## Decisions agents may and may not make

The rule that makes the loop autonomous without being reckless: **reversible decisions are
taken and logged; irreversible ones stop the ticket.**

Reversible means it can be undone by a later pull request with no data loss and no bill.
The agent takes the conservative option, records it in `backlog/DECISIONS.md` (ticket,
choice, alternative), and carries on. The QA pass reviews that table and overrules by
filing a ticket.

Irreversible decisions are enumerated in `backlog/README.md` ("What needs a human"):
rules and index deploys, Dexie version bumps, production data changes, anything that
starts a bill, product decisions already recorded in `docs/decisions.md`, client-bundle
dependencies, privacy copy, and live deploys. A ticket that hits one becomes
`needs-human` with the question written into it, and the loop moves on.

## Branching and releases

- `main` is protected by CI (`.github/workflows/ci.yml`). Agents open a pull request per
  ticket and enable squash auto-merge. CI green merges it. Nobody pushes to `main`
  directly.
- Pull requests are the review record for the QA pass; the ticket file is the spec; the
  QA.md section is the human-facing summary. Three artefacts, three audiences.
- Releases are tagged `vX.Y.Z` from `main` by `/release`, which writes `CHANGELOG.md`
  from `backlog/QA.md` and deploys hosting (and rules or indexes only when they changed,
  after diffing the live ruleset as `docs/operations.md` describes).

## Running it

```bash
# Groom new work (author present; ends with an approval question)
claude --model sonnet
> /groom ROADMAP 3.2
> /groom path/to/design-pass.md

# Run the loop (author absent). One ticket per iteration, self-paced.
claude --model sonnet --dangerously-skip-permissions   # or rely on .claude/settings.json
> /loop /next-ticket

# Prepare and do the QA pass
> /qa-pass
# ...walk the checklist on the preview URL...
> /release        # or: /groom qa 2026-10-20: <findings>
```

Parallelism: start a second session and run `/loop /next-ticket` there too. Claims
prevent collisions; dependencies prevent out-of-order merges. Two or three sessions is
the useful ceiling for a backlog this size; beyond that they queue on CI. Cloud sessions
work the same way, and a Routine (scheduled trigger) that starts a fresh session with
`/next-ticket` is the hands-off version.

`.claude/settings.json` pre-approves the commands the loop runs (`npm run …`, read-only
git, branch/commit/push, `gh pr`). Add to it rather than running with permissions off if
you want a tighter leash.

## What the loop cannot do, and how the design copes

- **It cannot see a browser.** Browser verification has been unavailable to agents here
  since 2026-08-13 (`docs/operations.md`). Every ticket therefore says what the human must
  check, and RL-002 adds a component-test net so UI changes are at least render-tested.
- **It cannot deploy.** By design. Production changes are listed in the ticket and
  surfaced in the QA checklist.
- **It cannot groom its own work.** Discovered work becomes a `draft` ticket; the author
  approves it at the next `/groom`.
- **It cannot resolve a product question.** `needs-human` exists for that, and the QA
  pass batches those questions so they cost one sitting, not one interruption each.

## Keeping this true

This file changes when a skill, an agent, a ticket field, or a status changes. The
contract table in `docs/README.md` points here for those. `AUDIT.md` is now a historical
record: new findings are tickets, filed with `/groom`, and the `/audit-next` skill was
removed on 2026-10-13 because two queues with two pickers is one too many.
