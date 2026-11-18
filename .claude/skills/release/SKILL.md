---
name: release
description: Cut a release after the author has completed a QA pass. Bumps the version, writes the CHANGELOG from the QA ledger, tags, clears the ledgers, and runs the live deploy. Only the author runs this; the loop never does.
---

# Release

Run only when the author says the QA pass is done. Everything here is visible to users.

## Steps

1. Confirm with the author which version this is (patch / minor) and that any `needs-harry`
   tasks and pending decisions they wanted resolved first are resolved. Use
   AskUserQuestion once if they did not say.
2. On a fresh `main`:
   - Bump `package.json` version (`npm version <patch|minor> --no-git-tag-version`).
   - Move the "Since the last release" sections of `docs/QA.md` into `CHANGELOG.md`
     under a new `## vX.Y.Z — <date>` heading, rewritten for a user: what they can now do,
     what was fixed, in that order. Drop reviewer notes and internal detail.
   - Accepted rows in `docs/PENDING-DECISIONS.md`: those worth keeping become entries in
     `docs/decisions.md`; then clear the table. Overruled rows must already have board tasks.
   - Reset `docs/QA.md` to its standing checks; delete `docs/QA-CHECKLIST.md`.
   - For every `done` task for this release, add the label `released` and a comment with
     the version: `board.sh task edit <ID> --add-label released` then
     `board.sh task edit <ID> --append-notes "Released vX.Y.Z"`.
3. Gates: `npm run build && npm run lint && npm test`.
4. Commit `Release vX.Y.Z`, tag `vX.Y.Z`, push with tags.
5. Deploy, in this order, saying what each will change before running it:
   - `npm run build && npx firebase deploy --only hosting`
   - Only if `firestore.rules` or `firestore.indexes.json` changed since the last tag:
     diff the live ruleset first (the recipe is in `docs/operations.md`), then
     `npx firebase deploy --only firestore:rules` and/or `--only firestore:indexes`.
   - Never deploy `functions/` from here unless the functions work has landed and the author says so.
6. Verify as `docs/operations.md` describes: `no-cache` on `/`, `immutable` on an asset,
   and the bundle hash in `index.html` matching `dist/`.
7. Final message: version, tag, what was deployed, the live URL, and anything deferred.
