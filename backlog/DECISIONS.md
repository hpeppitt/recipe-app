# Pending decisions

Reversible choices agents made on their own while implementing tickets. Every entry is a
question for the human QA pass: accept it (delete the row or mark it accepted and move the
reasoning to `docs/decisions.md` if it is worth keeping), or overrule it (file a ticket with
`/groom`). The list is cleared by `/release`.

Format: one row per decision, newest first.

| Date | Ticket | Decision taken | Alternative not taken | Status |
|---|---|---|---|---|
| 2026-10-14 | RL-041 | Sharing a local recipe as an anonymous account skips the publish retry and hands out the self-contained `#` link, with no sign-up call to action, so sharing keeps working. | Open the sign-up dialog on Share for unverified users, which blocks sharing until they add an email. | pending |
| 2026-10-14 | RL-041 | Follow and own-profile editing open a new shared `components/auth/SignUpDialog.tsx` that wraps `EmailLinkingForm tone="invite"` the same way `SuggestChangeModal` does. `SuggestChangeModal` keeps its own inline copy. | Show the invite form inline on the page (as `/create` does), or refactor `SuggestChangeModal` onto the new dialog. | pending |
| 2026-10-14 | RL-018 | Kept the old `suggestions` index (`recipeId` ASC, `createdAt` DESC) alongside the two new ones, so the pre-RL-018 client keeps working until the new rules go live and a deploy does not prompt to drop it. | Remove it now, since the new client never issues that query. Safe to remove in a later ticket once RL-022 has shipped. | pending |
| 2026-10-14 | RL-007 | Accepted that the plugin's registration module (`virtual:pwa-register`) and `workbox-window` ship in the client bundle, because the author approved `vite-plugin-pwa` at /groom and the prompt-based update affordance cannot work without them. | Hand-roll `navigator.serviceWorker` registration and a hand-written service worker, which avoids the library but loses precache manifest generation. | pending |
