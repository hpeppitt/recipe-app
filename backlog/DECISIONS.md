# Pending decisions

Reversible choices agents made on their own while implementing tickets. Every entry is a
question for the human QA pass: accept it (delete the row or mark it accepted and move the
reasoning to `docs/decisions.md` if it is worth keeping), or overrule it (file a ticket with
`/groom`). The list is cleared by `/release`.

Format: one row per decision, newest first.

| Date | Ticket | Decision taken | Alternative not taken | Status |
|---|---|---|---|---|
| 2026-10-15 | RL-044 | `src/lib/legal.ts` imports the three content files and derives `TERMS_VERSION` and the dates from them, so anything that imports `TERMS_VERSION` (RL-047's forms) also bundles the policy text, a few KB. | Keep the dates as literals in `legal.ts` with a test that they match the content files, so importing the version stays light. | pending |
| 2026-10-15 | RL-034 | The pushed favourite's `recipeOwnerId` comes from the Dexie recipe's `createdBy.uid`, falling back to `'local'` (the same fallback the toggle callers use) when the recipe is not in Dexie. Nothing reads the field and no notification is sent. | Read each recipe's cloud document for its owner, one extra read per bookmark. | pending |
| 2026-10-15 | RL-034 | The push tries every Dexie favourite of the new uid, so on the existing-account path favourites the account already had in the cloud are retried and denied (one wasted round trip each). Skips are therefore reported through `favorites-upgrade` only on the linked path and only logged to the console on the existing-account path; a thrown push is reported on both. | Push only the rows migrated from the anonymous uid, which needs `migrateFavoritesUid` to return the moved rows (signature change), and report skips on both paths. | pending |
| 2026-10-15 | RL-008 | Local-only mode (no Firebase) hides the tab control and shows My Recipes only, since Explore could never hold anything there (same rule as FUN-16, no always-empty filters). | Show an Explore tab with a "not available in local-only mode" state. | pending |
| 2026-10-15 | RL-008 | My Recipes lists every root in Dexie, including copies saved from share links, and the old "Mine" chip (own uid only) and first-run welcome card are removed; the welcome copy moved into the My Recipes empty state. | Filter My Recipes to the user's own uid, or keep the welcome card on Explore. | pending |
| 2026-10-15 | RL-008 | Explore lists every published recipe including the user's own (cloud copy), so an own published recipe shows in both tabs. Dedup by id within each tab is unchanged; `searchPublishedRecipes` is untouched. | Exclude the user's own recipes from Explore. | pending |
| 2026-10-14 | RL-041 | Sharing a local recipe as an anonymous account skips the publish retry and hands out the self-contained `#` link, with no sign-up call to action, so sharing keeps working. | Open the sign-up dialog on Share for unverified users, which blocks sharing until they add an email. | pending |
| 2026-10-14 | RL-041 | Follow and own-profile editing open a new shared `components/auth/SignUpDialog.tsx` that wraps `EmailLinkingForm tone="invite"` the same way `SuggestChangeModal` does. `SuggestChangeModal` keeps its own inline copy. | Show the invite form inline on the page (as `/create` does), or refactor `SuggestChangeModal` onto the new dialog. | pending |
| 2026-10-14 | RL-018 | Kept the old `suggestions` index (`recipeId` ASC, `createdAt` DESC) alongside the two new ones, so the pre-RL-018 client keeps working until the new rules go live and a deploy does not prompt to drop it. | Remove it now, since the new client never issues that query. Safe to remove in a later ticket once RL-022 has shipped. | pending |
| 2026-10-14 | RL-007 | Accepted that the plugin's registration module (`virtual:pwa-register`) and `workbox-window` ship in the client bundle, because the author approved `vite-plugin-pwa` at /groom and the prompt-based update affordance cannot work without them. | Hand-roll `navigator.serviceWorker` registration and a hand-written service worker, which avoids the library but loses precache manifest generation. | pending |
