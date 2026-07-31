# Changelog

**Reconstructed from git history on 2026-07-31.** This project has no release history: at
the time of writing `package.json` is `0.1.0`, there are zero git tags, and there are 105
commits spanning 2026-02-16 to 2026-07-31. The entries below are dated milestones grouped
from commit history, not releases that were ever cut, and no semantic version has been
retrofitted onto them.

Real tagging starts at the end of roadmap Phase 1, which will be `v0.2.0` — the first
version this project can actually point at. From then on this file is maintained per
release, newest first.

---

## Unreleased

### Added

- **Documentation knowledgebase.** `docs/` with capabilities, architecture, data model,
  operations, and decisions; this changelog; `README.md` rewritten from the stock Vite
  template as the front door. `CLAUDE.md` demoted to a pointer so each fact has one home.
- `ROADMAP.md` and the `roadmap-architect` subagent: the strategic layer above `AUDIT.md`,
  with four phases, sequencing rationale, and an explicit not-doing list.
- **CI.** `.github/workflows/ci.yml` runs build, lint, and tests on every pull request and
  every push to `main`. The 0-error, 153-test baseline was previously protected by local
  habit alone.

### Removed

- Root dependency on `@google/genai`. Nothing in `src/` has imported it since generation
  moved to Firebase AI Logic; the only importer is `functions/src/index.ts`, which declares
  it in its own `package.json`.

### Fixed

- Documentation drift found while writing the above: `VITE_USE_EMULATORS` and the
  `emulators` / `dev:emulated` scripts were undocumented despite being how suggestion reply
  threads were verified, and the Firestore collection list omitted the
  `suggestions/{id}/messages` subcollection and the `rateLimits/{uid}` collection.

---

## 2026-07-30 — Audit backlog cleared

All 78 findings in `AUDIT.md` closed and verified (PR #4). The last of them:

- Suggestion reply threads, so a rejected suggestion can be discussed rather than
  dead-ending. Implemented as a `messages` subcollection and verified against the Firestore
  emulator suite, which was added for exactly this reason: suggestions cannot be deleted, so
  testing against the live project would have left permanent records.
- Curated ingredient densities, making volume↔weight conversion work instead of refusing
  every such conversion.
- Converted units are pluralised, so a scaled measure no longer reads "2 cup".

## 2026-07-29 — UX sweep

Second audit pass merged (PR #3), covering the 45 UX findings from three parallel reviews:

- Unit system toggle (original / metric / imperial) with temperature conversion in
  instruction text.
- Per-serving macro estimates on generated recipes.
- Follower and following lists on your own profile.
- Accessibility and mobile work throughout: 44px touch targets, dark-mode contrast brought
  to AA, dialogs associated with their headings, empty states given actions, and design-system
  drift pulled back onto the shared `ui/` primitives.

## 2026-07-28 — Firebase AI Logic; the big remediation pass

- **Gemini calls moved to Firebase AI Logic** (PR #2). The API key is now held server-side by
  a Google-hosted proxy and the browser never sees one; the user-supplied-key flow and its
  localStorage storage were removed. App Check is enforced on this path. Model pinned to
  `gemini-3.6-flash` after `gemini-2.0-flash` was shut down on 2026-06-01.
- **77 audit fixes** (PR #1) across security, infrastructure, functionality, and UI:
  Firestore rules and indexes brought into the repo, cloud-aware duplicate detection,
  double-tap save guards, delete cascading to the cloud, ownership-aware actions,
  unsaved-work guards, real loading and error states, and the lint gate taken to zero errors.
- A server-side Gemini proxy Cloud Function written and committed but left inert, as the
  escalation path if quota abuse ever appears.

## 2026-02-25 — Shared library and social layer

- The library feed became a shared repository of all published recipes rather than a private
  one.
- Anonymous auth persistence, email-link account upgrade, user profiles, follows, and GA4
  analytics.
- Duplicate detection at prompt time, tree-aware back navigation.

## 2026-02-24 — Recipe Lab

- The app: AI recipe generation, branching variations, the version tree, the local library,
  and shareable view-only recipe links.
- Authentication, favourites, anonymous identity, and the first social features.
- Firebase Hosting configuration.

## 2026-02-16 — Initial commit

Project scaffold.
