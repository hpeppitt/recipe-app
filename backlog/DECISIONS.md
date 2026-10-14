# Pending decisions

Reversible choices agents made on their own while implementing tickets. Every entry is a
question for the human QA pass: accept it (delete the row or mark it accepted and move the
reasoning to `docs/decisions.md` if it is worth keeping), or overrule it (file a ticket with
`/groom`). The list is cleared by `/release`.

Format: one row per decision, newest first.

| Date | Ticket | Decision taken | Alternative not taken | Status |
|---|---|---|---|---|
| 2026-10-14 | RL-018 | Kept the old `suggestions` index (`recipeId` ASC, `createdAt` DESC) alongside the two new ones, so the pre-RL-018 client keeps working until the new rules go live and a deploy does not prompt to drop it. | Remove it now, since the new client never issues that query. Safe to remove in a later ticket once RL-022 has shipped. | pending |
