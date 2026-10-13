---
name: next-ticket
description: The autonomous dev loop body. Picks the next ready ticket, implements it with a worker sized to the ticket, reviews it, verifies the gates, opens a pull request, merges it when CI is green, and records what the human QA pass must check. One ticket per invocation; loop with `/loop /next-ticket`. Run this in a session started with the Sonnet model.
---

# Work the next ticket

You are the orchestrator. You read little, delegate the expensive parts, and keep the
record straight. The expensive parts are the implementer (sized by the ticket's tier) and
the reviewers. Everything else is a command or a short read.

Preconditions: a clean working tree on `main` (or the designated integration branch) that
matches `origin`. If the tree is dirty, stop and say so.

## 1. Pick

```bash
git fetch origin main && git checkout main && git reset --hard origin/main
npm run backlog -- next
```

`NONE` means stop and report what is waiting and why (the command says). Otherwise note
the id, tier and reviewers from the line; `npm run backlog -- show <ID>` once, to brief
the worker. Do not read the ticket's files yourself.

## 2. Claim

```bash
git checkout -b ticket/<ID>
npm run backlog -- set <ID> status in-progress
git commit -am "<ID>: claim" && git push -u origin ticket/<ID>
```

The pushed branch is the claim; a parallel session's `next` will now skip this ticket.

## 3. Implement

Spawn the `implementer` agent with `model` chosen by tier: `trivial` → `haiku`,
`standard` → `sonnet`, `hard` → `opus`. The prompt is the ticket id plus any constraint
from step 1 the ticket does not already say. Wait for it.

- `BLOCKED` → go to step 8 with status `needs-human` or `blocked` as it says.
- `PARTIAL` or gates failing → send it back once with the specific failure. If it fails
  again, promote one tier (haiku → sonnet → opus) and retry once more with a fresh agent
  and the previous attempt's report. A third failure is `blocked`; go to step 8.

## 4. Review

Spawn, in parallel, every reviewer the ticket lists (`ui-reviewer`,
`data-integrity-reviewer`; both run on Sonnet) with the branch's diff range
`origin/main...HEAD` and the ticket id. If the list is empty, skip.

A `high` finding goes back to the implementer (same model) with the finding verbatim, one
round. Repeat the reviewer once. A `high` that survives two rounds is `blocked`. `med` and
`low` findings are logged under the ticket's section in `backlog/QA.md` as "reviewer
noted" so the QA pass sees them; they do not block.

## 5. Docs drift

Spawn `scout` (Haiku) with: "Does `origin/main...HEAD` need a docs/ update?" If it reports
drift the implementer did not cover, send that list to the implementer (same model) as a
one-line task. Do not write docs yourself; the implementer has the context.

## 6. Gates

Run them yourself, in this order, and stop at the first failure (back to step 3's retry
rule):

```bash
npm run build && npm run lint && npm test && npm run backlog -- validate
```

## 7. Ship

1. Make sure `backlog/QA.md` has a `### <ID> <title>` section under "Since the last
   release" with: what changed in one paragraph, what the human must check in the browser,
   and any reviewer notes. If the implementer did not write it, write it from its report.
2. Tick the ticket's acceptance criteria if the implementer did not, and set
   `npm run backlog -- set <ID> status done`.
3. Commit everything with a conventional message: `<ID>: <ticket title>` and a body listing
   the acceptance criteria met. Push.
4. Open a pull request from `ticket/<ID>` to `main` titled `<ID>: <ticket title>`, body
   from the ticket's acceptance criteria plus the QA note. Use `gh pr create` if available,
   otherwise the GitHub MCP `create_pull_request` tool.
5. Enable auto-merge (squash) so CI green merges it: `gh pr merge --auto --squash` or the
   `enable_pr_auto_merge` tool. If auto-merge is unavailable on the repository, wait for
   CI (subscribe with `subscribe_pr_activity` in a cloud session, or poll `gh pr checks`
   at most every two minutes locally) and merge when green. A red CI is yours to fix:
   back to step 3's retry rule, then push again.
6. After the merge, delete the remote branch so the claim is released.

## 8. Stop states

- `needs-human`: set the status, append the question to the ticket's Notes, commit on the
  ticket branch, push, and open the PR as a draft titled `<ID>: needs a decision`. Delete
  nothing. Report the question in your final message.
- `blocked`: set the status, write why in Notes, commit and push the branch, open a draft
  PR, and report. The next `/next-ticket` run picks a different ticket.

## Report

Your final message, in under 150 words: ticket id and title; outcome (merged / needs-human
/ blocked); model used for the implementer and whether it was promoted; reviewer findings
count by severity; the one thing the QA pass most needs to look at; what `npm run backlog
-- next` would pick next. No em dashes.

## Never

Never groom, never widen a ticket, never edit `firestore.rules` or `firestore.indexes.json`
or a Dexie version block unless the ticket says the author has approved it, never deploy,
never merge with red CI, never skip a reviewer the ticket lists, never spend Opus on a
`trivial` or `standard` ticket that has not failed twice.
