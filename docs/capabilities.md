# Capabilities

Every feature, its status, where it lives, and what gates it. Verified against the code on
2026-07-31.

Status values: **shipped** (works end to end), **partial** (works with a stated limit),
**cut** (deliberately not built — see [decisions.md](decisions.md)).

Gates: **local** works with no Firebase project configured; **firebase** needs
`VITE_FIREBASE_*`; **auth** needs a signed-in user; **appcheck** additionally needs
`VITE_RECAPTCHA_SITE_KEY`.

## Recipes

| Feature | Status | Gate | Where | Notes and limits |
|---|---|---|---|---|
| AI recipe generation from a chat prompt | shipped | firebase + appcheck + auth | `services/gemini.ts`, `pages/RecipeChatPage.tsx`, `hooks/useRecipeChat.ts` | Model is `gemini-3.6-flash` via Firebase AI Logic, with a `responseSchema` on the model config so the shape is enforced rather than merely requested. In local-only mode the composer is disabled with an explanatory notice — there is no proxy to call. |
| Multi-turn refinement in one session | shipped | firebase + appcheck | `services/gemini.ts` (`toChatSession`) | History is managed by the AI Logic SDK, not reassembled client-side. |
| Save a generated recipe | shipped | local (cloud publish needs firebase) | `hooks/useRecipeChat.ts` | Dual write: Dexie always, Firestore when configured. In-flight guard plus a disabled "Saving…" button prevents double-tap duplicates. |
| Variations (branching) | shipped | firebase + appcheck | `/recipe/:id/vary` | Parent recipe is passed as context; child gets `parentId`, `rootId`, `depth`. |
| Version tree view | shipped | local | `pages/VersionTreePage.tsx`, `lib/tree.ts` | Renders the whole tree from `rootId`. Cloud-only recipes (published by someone else, never local) have no local tree to draw. |
| Tree explainer (onboarding) | shipped | local | `components/recipe/TreeIntro.tsx`, `lib/onboarding.ts` | Teaches the branching model, which nothing previously did: the welcome panel described it in prose and `Create Variation` gave no hint it makes a child rather than editing in place. Shown once, on a **root** recipe, and only from the second recipe opened onward, so it lands when there is context for it. Variations are skipped deliberately: their breadcrumb and parent preview are already a live example. |
| Lineage breadcrumb + variation chips | shipped | local | `components/recipe/LineageBreadcrumb.tsx`, `VariationChips.tsx` | |
| Manual recipe editing | shipped | local (cloud re-publish needs firebase) | `pages/RecipeEditPage.tsx`, `lib/recipeEdit.ts`, `/recipe/:id/edit` | Owner only, enforced in the page and independently in rules. Edits in place on the same id, so the recipe keeps its tree position. Every content field is editable except `totalTime`, which is derived from prep + cook. Steps are renumbered on save. Re-publishes only if a published copy already exists — editing is not a decision to publish. **Not versioned**: a favouriter can see the recipe change under them, which is how every recipe site works. |
| Recipe photos | **cut permanently** | — | — | Text-first by decision. No speculative `imageUrl` field. |
| Delete a recipe | shipped | auth | `pages/RecipeDetailPage.tsx`, `services/firestore.ts` (`deletePublishedRecipeTree`) | Owner only. Cascades to the cloud copy and the subtree. |
| Per-serving macro estimates | shipped | firebase + appcheck | `components/recipe/NutritionPanel.tsx`, `types/recipe.ts` (`Nutrition`) | Optional field: recipes generated before it exists render no panel. Estimates come from the model, not a nutrition database. |
| Serving scaling | shipped | local | `components/recipe/ServingStepper.tsx`, `lib/scale.ts` | Display only, never persisted, and resets when you move to another recipe. Scales **ingredient amounts only**: times do not scale (doubling a traybake does not double its roasting time), nutrition is already per serving, and instruction text is left alone — "divide into 12 balls" cannot be fixed by arithmetic, which is a stated limit rather than an oversight. Counts round to halves with a floor of ½ so a small factor never reads as "omit this". |
| Unit system toggle (original / metric / imperial) | partial | local | `hooks/useUnitSystem.ts`, `lib/units.ts`, `SettingsPage` | Display-time conversion, stored amounts are untouched. Volume↔weight uses a curated ingredient-density table, so conversions outside that table stay in their original unit. |
| Temperature conversion in instruction text | shipped | local | `lib/units.ts` (`convertTemperatures`) | |

## Library and discovery

| Feature | Status | Gate | Where | Notes and limits |
|---|---|---|---|---|
| Browse the shared library | partial | firebase for cloud recipes | `pages/LibraryPage.tsx`, `hooks/useRecipeLibrary.ts` | The feed is every published recipe merged with the local library. Reads the newest 200 cloud docs per visit with no pagination or caching — a real cliff, roadmap item 3.1. |
| Search | partial | local | `LibraryPage`, `db/recipes.ts` | Substring match over title, description, tags, and ingredient names. No stemming or semantics; "rice" matches "licorice". |
| Favorites filter | shipped | auth | `hooks/useFavorites.ts` | |
| Following filter | partial | auth | `services/firestore.ts` (`getRecipesByUsers`) | Firestore `where('createdBy.uid','in',…)`, chunked at 30 uids per query. |
| Duplicate detection before generating | partial | local + firebase | `hooks/useRecipeChat.ts`, `lib/search.ts`, `services/firestore.ts` (`searchPublishedRecipes`) | Runs on the first message of a session only. Scores local and cloud candidates, reserving 2 of 5 panel slots for cloud matches. Cloud failure degrades to local-only, silently. Sees only the newest 200 published recipes. |
| Explore / paginated browse | **cut for now** | — | — | Roadmap item 3.1; the 200-doc read pattern is the reason it matters. |
| Full-text search (Algolia/Typesense) | **cut** | — | — | Dependency or bill for a library measured in hundreds. |

## Sharing and collaboration

| Feature | Status | Gate | Where | Notes and limits |
|---|---|---|---|---|
| Share a recipe by link | shipped | local (shape differs) | `lib/share.ts` | With Firebase: `/shared/:id` reading Firestore. Without: `/shared#r=<lz-string>` with the recipe compressed into the URL. `pickShareUrl` chooses; only published recipes get a cloud link. |
| View a shared recipe signed out | shipped | firebase | `pages/SharedRecipePage.tsx` | `firestore.rules` allows unauthenticated reads of `recipes` and `profiles` on purpose. |
| Favorite someone's recipe | shipped | auth | `hooks/useFavorites.ts` | Dual write: local Dexie for instant UI, Firestore for the owner's notification and the counter. |
| Suggest a change | shipped | auth | `components/recipe/SuggestChangeModal.tsx` | Any signed-in user, on the detail or shared page. |
| Approve / reject a suggestion | shipped | auth | `pages/RecipeDetailPage.tsx`, `services/firestore.ts` (`updateSuggestionStatus`) | Owner only, enforced in rules. Approval adds the suggester to `collaborators` via `arrayUnion` and notifies them. |
| Reply thread on a suggestion | shipped | auth | `components/recipe/SuggestionThread.tsx`, `suggestions/{id}/messages` | Two participants only, immutable once sent, and replies stay open after approval or rejection — a rejection is exactly when the suggester wants to ask why. |
| Reporting / moderation | **cut** | — | — | Cut with the private-circle decision. First thing to rebuild if the audience goes public. |
| Circle membership enforcement | **not built** | — | — | Any signed-in user (anonymous auth is one tap) can publish into the shared library today. Roadmap 1.6, and a hard gate on the first invite. |

## Identity and social

| Feature | Status | Gate | Where | Notes and limits |
|---|---|---|---|---|
| Anonymous sign-in | shipped | firebase | `contexts/AuthContext.tsx` | One tap. Gets a food-themed display name derived from the uid (`lib/identity.ts`). |
| Passwordless email sign-in | shipped | firebase | `services/firebase.ts` (`sendEmailSignInLink`, `completeEmailSignIn`) | Magic link; no passwords anywhere. |
| Anonymous → email upgrade | shipped | firebase | `completeEmailSignIn` | Links the email onto the existing anonymous account, so the uid — and therefore everything published under it — survives. **This was broken until 2026-08-07**: the completion ran before Firebase restored the session, so `auth.currentUser` was null, the linking branch was unreachable, and every upgrade silently created a second account and abandoned the first. Fixed with `await auth.authStateReady()`. If the email already belongs to another account, linking is impossible (Firebase cannot merge accounts) and the user is told so; local recipes follow them, published ones stay behind. |
| Email-link outcome reporting | shipped | firebase | `components/auth/EmailLinkStatus.tsx`, `contexts/AuthContext.tsx` (`linkState`) | Every magic-link failure used to be silent — expired, already used, or opened in another browser all left the user on a signed-out page with no message. Now reports completing / needs-email / expired / email-taken / success, and the cross-device case prompts for the address and retries rather than dead-ending. |
| Stranded-identity notice | shipped | firebase | `components/auth/StrandedIdentityNotice.tsx`, `lib/migration.ts` | Makes the row above honest: when a failed migration leaves published recipes behind, a dismissible banner in `AppShell` names the count and the old display name and offers a prefilled mailto to `SUPPORT_EMAIL` carrying the old uid. Shown only when at least one recipe was actually stranded, and only once — nothing the user does in the client can move them, so re-showing it is nagging. |
| Profiles | shipped | firebase | `pages/ProfilePage.tsx`, `hooks/useProfile.ts` | Auto-created on first sign-in. Public read. |
| Custom avatars | shipped | auth | `components/profile/AvatarEditor.tsx` | Three types: `generated` (initials + colour from uid), `emoji` (food emoji + background), `uploaded` (cropped square, 128×128 base64 JPEG in the profile doc). Recipe cards and detail pages use the generated avatar regardless; custom avatars appear on profile pages and the library header. |
| Follow / unfollow | shipped | auth | `hooks/useFollow.ts` | Counts maintained on profile docs via `increment()`; rules constrain foreign writes to a ±1 `followerCount` bump. |
| Follower / following lists | shipped | auth | `ProfilePage` | Own profile only. |
| Notifications | shipped | auth | `components/notifications/NotificationBell.tsx`, `hooks/useNotifications.ts` | Real-time via `onSnapshot`. Types: `favorite`, `suggestion`, `suggestion_approved`, `suggestion_rejected`, `suggestion_reply`, `follow`. Created fire-and-forget so they never slow the triggering action. |
| Sign out | shipped | auth | `ProfilePage` | Anonymous users included — they are warned first, since signing out of an anonymous account is unrecoverable. |

## Data and settings

| Feature | Status | Gate | Where | Notes and limits |
|---|---|---|---|---|
| Theme (light / dark / system) | shipped | local | `hooks/useTheme.ts`, `SettingsPage` | |
| Export all recipes | shipped | local | `SettingsPage` | JSON download, with an on-screen confirmation because a phone hides its downloads. |
| Import recipes | shipped | local | `lib/import.ts` | Validates and reports counts; skips malformed entries rather than failing the batch. No dedup on import. |
| Clear local recipes | shipped | local | `SettingsPage` | Named for what it does: local only. Cloud copies survive by decision — withdrawing a published recipe means deleting it individually. |
| Local-only favorites | **cut** | — | — | Would orphan on sign-in with no migration path. The control stays hidden when signed out. |
| GA4 analytics | shipped | firebase + `VITE_FIREBASE_MEASUREMENT_ID` | `services/analytics.ts` | Events: `sign_in`, `sign_out`, `recipe_created`, `recipe_updated`, `recipe_viewed`, `recipe_shared`, `recipe_deleted`, `recipe_favorited`, `recipe_unfavorited`, `suggestion_submitted`, `suggestion_reviewed`, `profile_updated`, `user_followed`, `user_unfollowed`. |
| Client error reporting | **not built** | — | — | Nothing surfaces a client-side failure today. Roadmap 1.2, and the reason several limits in this table are stated as "silently". |
| View counts | partial | firebase | `services/firestore.ts` (`incrementRecipeViews`) | Raw increments per page load, not unique per user. Deliberate. |

## Routes

| Route | Page | Auth |
|---|---|---|
| `/` | LibraryPage | open |
| `/create` | RecipeChatPage | auth-gated |
| `/recipe/:id` | RecipeDetailPage | open; owner actions conditional |
| `/recipe/:id/edit` | RecipeEditPage | owner only; refuses with an explanation otherwise |
| `/recipe/:id/vary` | RecipeChatPage | auth-gated |
| `/recipe/:id/tree` | VersionTreePage | open |
| `/settings` | SettingsPage | open |
| `/shared` | SharedRecipePage | open (recipe decoded from the URL hash) |
| `/shared/:id` | SharedRecipePage | open (recipe read from Firestore) |
| `/profile` | ProfilePage | own profile |
| `/profile/:uid` | ProfilePage | open |

`/`, `/profile`, and `/settings` render inside `AppShell` (top bar + bottom nav). The rest
are detail views carrying their own back affordance.
