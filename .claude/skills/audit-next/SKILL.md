---
name: audit-next
description: Fix the next unchecked finding in AUDIT.md, verify it, check it off, and commit. One finding per invocation. Use for grinding down the audit backlog, including via /loop.
---

# Fix the next audit finding

Work on exactly ONE finding per invocation. Small diffs stay reviewable.

## Steps

1. Read `AUDIT.md`. Pick the FIRST unchecked item, scanning High severity first, then Medium, then Low. Announce which ID you picked (e.g. "FUN-2") and restate the defect in one sentence.
2. Read every file the finding references plus enough surrounding code to understand the conventions. Re-verify the defect still exists; if it was already fixed incidentally, check it off with a note "(fixed as side effect of <ID>)" and pick the next item instead.
3. Implement the smallest fix that fully resolves the finding. Match existing code style. Do not refactor unrelated code, do not fix neighboring findings opportunistically (they get their own iteration), do not add dependencies without strong justification.
4. Verify:
   - `npm test` must pass (the PostToolUse hook already covers tsc + eslint on each edit).
   - If the fix touches pure logic (`src/db`, `src/lib`), ADD OR UPDATE a test that fails before the fix and passes after.
   - If the finding is a UI/* item or otherwise user-visible, verify in the browser: start `npm run dev`, use the claude-in-chrome tools at a 390px-wide mobile viewport, reproduce the original symptom path, and confirm the fix. Check the console for new errors. Stop the dev server if you started it.
5. Update `AUDIT.md`: check the box and append a short parenthetical, e.g. `(fixed: guarded with isSaving state)`.
6. Commit the fix and the AUDIT.md update together: `git add` only the files you touched, message format `Fix <ID>: <one-line summary>`.
7. Report: finding ID, what changed, how it was verified, and how many unchecked items remain in each severity band.

## Blocked or ambiguous?

If a finding needs a product decision (e.g. how aggressive dedup should be), do NOT guess silently: implement the most conservative reasonable option, note the decision in the AUDIT.md parenthetical, and flag it in your report. If a finding cannot be fixed client-side (e.g. needs a Cloud Function), leave the box unchecked, add `(blocked: <reason>)` to the item, skip to the next one, and say so in your report.
