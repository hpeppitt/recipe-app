# QA ledger

What has landed on `main` since the last release and what the human QA pass must check.
`/next-ticket` appends a section per ticket; `/qa-pass` collates this file, the pending
decisions, and the preview build into a checklist; `/release` moves the accepted entries
into `CHANGELOG.md` and clears this file.

## Standing checks

Things no agent can verify here, so every QA pass covers them at a 390x844 viewport:

- Explore loads, rows render, search and the favourites filter work.
- A recipe detail page: action row, breadcrumb, branch carousel, the version tree.
- `/create` shows the composer for a verified account and the sign-up call to action otherwise.
- A `/shared/:id` link opened signed out, in a fresh browser profile.
- The browser console shows no errors or unhandled rejections on that walk.
- `TreeIntro` renders legibly on the second root recipe opened (AUDIT UI-16, never yet seen in a browser).

## Since the last release

### RL-301 data-request.mjs requires --project

- On the next real data request, run `export` with `--project recipe-lab-3832b` and check the first line ends `target PRODUCTION`. Run one against the emulator (`--emulator`, no `--project`) and check it uses `demo-recipe-lab`.
- A bare run without `--project` should exit 1 and print the required-flag message.

### RL-295 Pure deploy helpers in scripts/deploy-lib.mjs

- Nothing to check in a browser. The helpers are pure and covered by `scripts/deploy-lib.test.mjs`; the runner (RL-296) is what uses them.
