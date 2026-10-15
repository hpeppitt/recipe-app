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
| [agent-workflow.md](agent-workflow.md) | How is it developed? The autonomous loop, the two human touchpoints, which model does which job, what agents may decide alone. |
| [tech-stack-review.md](tech-stack-review.md) | Proposal (2026-10-13): is Firebase + Gemini still the right stack for sharing with friends at hobby cost? Awaiting the author's decision, RL-001. |
| [legal/data-inventory.md](legal/data-inventory.md) | What personal data is stored where, who can read it and for how long, today and after the planned privacy tickets. The basis for the draft policies in `src/content/legal/`. |
| [legal/claims-to-verify.md](legal/claims-to-verify.md) | What the draft Terms, Privacy and Cookie policies say that the author must confirm before they go live (RL-046). |

Two documents sit outside `docs/` on purpose:

- [`../README.md`](../README.md) — the front door: what this is, how to get it running.
- [`../CHANGELOG.md`](../CHANGELOG.md) — dated milestones, reconstructed from git history.

And three are working backlogs rather than documentation:

- [`../ROADMAP.md`](../ROADMAP.md) — the strategic layer: phases, sequencing, what is
  explicitly not being built.
- [`../backlog/`](../backlog/README.md) — the tactical layer: one groomed ticket per file,
  plus the pending-decisions and QA ledgers the autonomous loop writes for the author.
- [`../AUDIT.md`](../AUDIT.md) — the 2026-07 audit, now historical. Its open findings became
  tickets on 2026-10-13; it is kept because the fix notes record why each fix took the shape
  it did.

## Maintenance contract

A knowledgebase that lies is worse than none. What updates when:

| If you change… | Update |
|---|---|
| A user-visible feature | `capabilities.md` |
| A module boundary, service, or route | `architecture.md` |
| `src/db/database.ts`, `firestore.rules`, `firestore.indexes.json`, or a stored type in `src/types/` | `data-model.md` |
| An npm script, env var, or deploy step | `operations.md` |
| What is stored, sent to a third party, or kept for how long | `legal/data-inventory.md`, and the policy text in `src/content/legal/` (bump its `lastUpdated`) |
| Anything where the *reasoning* matters, or you reject an approach | `decisions.md` |
| A skill, an agent, a ticket field or status, or the dev process | `agent-workflow.md` and `../backlog/README.md` |
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
