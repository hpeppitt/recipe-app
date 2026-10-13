# Backlog

The tactical work queue for Recipe Lab, one markdown file per ticket under `tickets/`. It
is what the autonomous dev loop (`/next-ticket`) consumes and what `/groom` produces. The
strategic layer above it is `ROADMAP.md`; the process around it is
[docs/agent-workflow.md](../docs/agent-workflow.md).

In-repo rather than an issue tracker, for the same reason `docs/` is in-repo: a ticket is
reviewed and closed in the pull request that implements it, offline, with no API round trip
and no second system to keep in sync. Parallel sessions coordinate through git, not through
this directory: a ticket is claimed by pushing a `ticket/<ID>` branch, and `npm run backlog
-- next` skips any ticket with such a branch on `origin`.

## Commands

```bash
npm run backlog -- list [status]       # one line per ticket
npm run backlog -- next                # the ticket an agent should pick up now, or NONE
npm run backlog -- show RL-003
npm run backlog -- set RL-003 status in-progress
npm run backlog -- validate            # run before committing ticket edits
```

## Ticket format

```markdown
---
id: RL-003
title: Gate the suggestions listener on a signed-in user
status: ready
priority: P1
size: S
tier: standard
risk: reversible
area: [data]
reviewers: [data-integrity-reviewer]
depends_on: []
source: AUDIT FUN-17
files: [src/hooks/useSuggestions.ts]
---

## Context
Why this exists and what the reader needs to know. Link, do not restate, docs/ and AUDIT.md.

## Acceptance criteria
- [ ] Observable, checkable statements. Each one is either true or false after the change.

## Out of scope
What the implementer must not drift into.

## Verification
Which gates prove it: tests to add, commands to run, and what the human QA pass must
check in a browser that the agent cannot.

## Notes
Decisions taken during implementation, with the reversible ones also logged in
backlog/DECISIONS.md.
```

### Fields

| Field | Values | Meaning |
|---|---|---|
| `status` | `draft` | written but not groomed; `/next-ticket` never picks it |
| | `ready` | groomed and unblocked |
| | `in-progress` | claimed; a `ticket/<ID>` branch exists on `origin` |
| | `done` | merged to `main`, waiting for the human QA pass |
| | `released` | deployed to live after a QA pass |
| | `blocked` | waiting on `depends_on` or an external fact; say which in Notes |
| | `needs-human` | an irreversible or product decision; see the list below |
| | `dropped` | decided against, kept for the record |
| `priority` | `P1` ships before anything else, `P2` the default, `P3` when idle |
| `size` | `S` under an hour of agent time, `M` a session, `L` more than one |
| `tier` | `trivial` / `standard` / `hard` | which model implements it; see docs/agent-workflow.md |
| `risk` | `reversible` / `irreversible` | whether an agent may decide alone; see below |
| `reviewers` | subset of `ui-reviewer`, `data-integrity-reviewer`, or empty | run after implementation |
| `depends_on` | ticket ids | all must be `done`, `released` or `dropped` first |
| `source` | free text | `ROADMAP 2.3`, `AUDIT FUN-17`, `design-pass §4`, `qa 2026-10-20` |
| `files` | paths | the files the groomer expects to change, so the implementer starts there |

## What needs a human

Agents decide everything reversible and log the decision. These are not reversible, and a
ticket that needs one gets `status: needs-human` rather than a guess:

- Deploying `firestore.rules` or `firestore.indexes.json` to production.
- Any Dexie schema version bump (users have the previous version on disk).
- Deleting or rewriting production data, including "cleanup" of other users' documents.
- Anything that starts a bill: enabling Blaze, adding a paid provider, raising a quota.
- Changing the product decisions recorded in `docs/decisions.md`.
- Adding a dependency that ships in the client bundle (dev dependencies are reversible).
- Changing what the app says about privacy, data retention, or who can see what.
- Deploying to live. That is `/release`, run by the author after `/qa-pass`.

A reversible decision taken by an agent goes in `DECISIONS.md` with the ticket id, the
choice made, and the alternative, so the QA pass can overrule it cheaply.
