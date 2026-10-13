---
name: groom
description: Turn raw input (a roadmap section, audit findings, a design document, QA notes, free text, or a path to a file) into groomed backlog tickets, then present them for the author's sign-off. Run by the author before setting the loop off; the loop never grooms its own work.
---

# Groom the backlog

Grooming is the one place product judgement enters the loop, so it uses the most capable
worker and ends with the author's approval. This skill runs in the main session (Sonnet
is fine); the thinking happens in the `groomer` agent (Opus).

## Steps

1. Identify the input. `$ARGUMENTS` is one of: a path (read it and pass the path on), a
   ticket id already in `draft`, a roadmap item (`ROADMAP 3.2`), an AUDIT id, or free
   text. If it is empty, groom every ticket currently in `draft` and stop if there are none.
2. Spawn the `groomer` agent (it is defined with `model: opus`; do not override it
   downward) with: the input, the instruction to write tickets under `backlog/tickets/`
   with `status: draft`, and the current `npm run backlog -- list` output so it can see
   ids and dependencies. One spawn, not one per item.
3. When it returns, run `npm run backlog -- validate`. Fix anything it reports yourself if
   it is mechanical; send it back to the groomer otherwise.
4. Present to the author, in this order: the groomer's ticket table, its questions, its
   deliberately-not-ticketed list. Then ask one question with AskUserQuestion: approve all,
   approve with edits (they say which), or discard. Do not flip anything to `ready` before
   the answer.
5. On approval, `npm run backlog -- set <ID> status ready` for each approved ticket
   (tickets whose `risk` is `irreversible` and whose human part could not be split stay
   `needs-human`). Commit the ticket files with message `Groom: <n> tickets from <source>`
   and push to the current branch. Do not open a pull request for grooming alone.

## Rules

- The author owns the roadmap and the decision to do a thing. The groomer owns turning
  that decision into executable tickets. Keep those separate: do not let grooming expand
  scope beyond what the input asked for.
- A design document is groomed into many small per-screen tickets with the design's
  specifics copied into them; the implementer never sees the original. Say so to the
  author when presenting, so they know what detail made it in.
- Never groom in the middle of `/next-ticket`. If implementation discovers work, it files
  a `draft` ticket and the next `/groom` run picks it up.
