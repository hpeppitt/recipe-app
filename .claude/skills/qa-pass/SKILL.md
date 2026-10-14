---
name: qa-pass
description: Prepare the human QA pass. Collates every ticket merged since the last release, the pending decisions, reviewer notes and standing browser checks into one checklist, and points at a preview URL. Run by the author when they want to review before a release.
---

# Prepare the QA pass

The author's time is the scarce resource in this loop. This skill makes a QA session a
twenty-minute walk with a checklist rather than an archaeology exercise.

## Steps

1. Ground truth:
   ```bash
   git fetch origin main && git log --oneline $(git describe --tags --abbrev=0)..origin/main
   npm run backlog -- list done
   ```
   The first command lists commits since the last tag; the second lists the tickets they
   closed. They should agree; if a merged `RL-` commit has no `done` ticket or vice versa,
   fix the ticket status first and say so.
2. Preview build. If `.github/workflows/preview.yml` exists and the author has added the
   secret (RL-013), trigger it with `gh workflow run preview.yml` (or the GitHub MCP
   `actions_run_trigger`) and record the channel URL from the run output. Otherwise tell
   the author to run `npm run build && npx firebase hosting:channel:deploy qa --expires 7d`
   locally, and give them that command.
3. Write `backlog/QA-CHECKLIST.md` (overwrite; it is generated), containing in order:
   - The preview URL or the command to get one, and the standing checks from `backlog/QA.md`.
   - One section per `done` ticket: title, the "what to check" bullets from its QA.md
     section, reviewer notes, and a checkbox per item.
   - The full `backlog/DECISIONS.md` table with an accept / overrule checkbox per row.
   - Any ticket in `needs-human` with its question, so the author answers them in the
     same sitting.
4. Commit the checklist (`QA pass prepared <date>`) and push.
5. Final message: the preview URL or command, the number of tickets and decisions to
   review, and the two things most likely to need attention. Then stop. The author does
   the pass.

## After the pass

The author either runs `/release`, or files findings with `/groom qa <date>: <notes>`
(each finding becomes a ticket, and the loop runs again before the next `/qa-pass`). An
overruled decision is also a `/groom` input.
