# Recipe Lab documentation

The knowledgebase for this repo. In-repo markdown is the single source of truth: it is
reviewed in the same pull request as the change that would otherwise invalidate it, which
is the only mechanism that keeps documentation true.

## Index

| File | Answers |
|---|---|
| [capabilities.md](capabilities.md) | What can the app do? What is shipped, partial, or cut? What gates each feature? |
| [architecture.md](architecture.md) | How is it put together? Where are the seams? |
| [data-model.md](data-model.md) | What is stored, where, in what shape, and who is allowed to touch it? |
| [operations.md](operations.md) | How do I run, test, verify, and deploy it? |
| [decisions.md](decisions.md) | Why is it like this? What was tried and rejected? |

Two documents sit outside `docs/` on purpose:

- [`../README.md`](../README.md) — the front door: what this is, how to get it running.
- [`../CHANGELOG.md`](../CHANGELOG.md) — dated milestones, reconstructed from git history.

And two are working backlogs rather than documentation:

- [`../ROADMAP.md`](../ROADMAP.md) — the strategic layer: phases, sequencing, what is
  explicitly not being built.
- [`../AUDIT.md`](../AUDIT.md) — the tactical backlog of audit findings. Fully cleared as
  of 2026-07-30; kept because the fix notes on each finding record why each fix took the
  shape it did.

## Maintenance contract

A knowledgebase that lies is worse than none. What updates when:

| If you change… | Update |
|---|---|
| A user-visible feature | `capabilities.md` |
| A module boundary, service, or route | `architecture.md` |
| `src/db/database.ts`, `firestore.rules`, `firestore.indexes.json`, or a stored type in `src/types/` | `data-model.md` |
| An npm script, env var, or deploy step | `operations.md` |
| Anything where the *reasoning* matters, or you reject an approach | `decisions.md` |
| Anything a user would notice, at release time | `CHANGELOG.md` |

Enforcement is a step in `/preflight`: it checks the working diff against the table above
and reports drift. It reports rather than blocks, because a doc gate that fails a build
gets bypassed rather than obeyed.

`CLAUDE.md` deliberately holds no facts that are duplicated here. It points at these files
instead, so there is one copy of each fact rather than two that disagree. If you find
yourself adding a fact to `CLAUDE.md`, it belongs in `docs/` with a pointer from
`CLAUDE.md`.

Every claim in these files was verified against the code on 2026-07-31, not written from
memory. Keep it that way: if you cannot point at the file and line, do not assert it.
