# Data inventory

What Recipe Lab stores, where, and who can read it. This is the factual basis for the
draft policies in `src/content/legal/` (RL-044). Every row in "Today" was checked against
the code on 2026-10-15; the file in the last column is where the write happens. Anything
that could not be checked in the repo is listed in [claims-to-verify.md](claims-to-verify.md).

Three sections, kept apart on purpose:

1. **Today**: what the code on `main` does now.
2. **Planned**: what changes before release, and which ticket delivers it. The policies are
   written for that release state, with every dependent statement marked
   `[DEPENDS ON RL-0xx]`.
3. **Corrections to the groomer's inventory** in RL-044.

## 1. Today

"Clearing browser data" below means the user clearing site data for the app in their
browser. "Delete recipes on this device" is the Settings control (`clearAllRecipes` in
`src/db/recipes.ts`): it empties the Dexie `recipes` and `favorites` tables and nothing else.

### On the device: IndexedDB

| Item | Where | Contents | Who can read it | Retention | Written by |
|---|---|---|---|---|---|
| Recipes | IndexedDB `RecipeAppDB`, table `recipes` | Full `Recipe` (`src/types/recipe.ts`): title, description, ingredients, instructions, notes, times, servings, difficulty, tags, emoji, nutrition estimate, the originating `prompt`, `chatHistory` (every message of the generation conversation, each assistant message carrying a recipe snapshot), `createdBy` `{ uid, displayName }`, `collaborators` (uid and display name), tree ids, timestamps | Only code running on this device in this browser | Until the user deletes the recipe, uses "Delete recipes on this device", or clears browser data. For a verified account, own recipes cleared with "Delete recipes on this device" come back through the RL-078 sync the next time the app opens. Signing out of a verified account removes that account's own rows (RL-085); they reload from the cloud on the next sign-in. The sync (RL-078) also removes own rows the server snapshot lacks, and rows of other uids that signed in on this device. Imported rows owned by an account of this device are stored as `'local'` (RL-086), so the sync never removes them | `src/db/recipes.ts` (`createRecipe`, `cacheRecipe` after a successful publish from the chat save and after a verified owner's successful cloud edit in `src/pages/RecipeEditPage.tsx`, `updateRecipe`, `importRecipes`, `migrateRecipesUid`, `applyOwnRecipeSync` from the own-recipes listener in `src/hooks/useOwnRecipesSync.ts`; `clearOwnRecipes` deletes on a verified sign-out from `src/contexts/AuthContext.tsx`) |
| Bookmarks (local favourites) | IndexedDB `RecipeAppDB`, table `favorites` | `{ uid, recipeId, createdAt }` | This device only for anonymous accounts. For a verified account the table is also pushed to cloud favourites on upgrade (RL-034) and filled from them once per session on each device (RL-043) | Until unfavourited, "Delete recipes on this device", or clearing browser data | `src/db/favorites.ts` |
| Firebase Auth session | IndexedDB `firebaseLocalStorageDb` (Firebase Auth SDK default persistence; name confirmed in `node_modules/@firebase/auth`) | The signed-in Firebase user: uid, email (if any), display name, and the tokens that keep the session alive | This device; sent to Google with Auth and Firestore requests | Until sign-out or clearing browser data | Firebase Auth SDK, started by `getAuth` in `src/services/firebase.ts` |
| App Check token | IndexedDB `firebase-app-check-database` (name confirmed in `node_modules/@firebase/app-check`) | A short-lived App Check token from the reCAPTCHA v3 attestation | This device; sent with Firebase AI Logic requests | Refreshed automatically (`isTokenAutoRefreshEnabled: true`); lifetime set by Google, not verified | `initializeAppCheck` in `src/services/firebase.ts`, only when `VITE_RECAPTCHA_SITE_KEY` is set |
| Firebase heartbeat | IndexedDB `firebase-heartbeat-database` (`node_modules/@firebase/app`, `MAX_NUM_STORED_HEARTBEATS = 30`) | One entry per day: the date and the Firebase SDK user-agent string | This device; summarised in a header the SDK sends to Firebase services | Rolling, at most 30 daily entries | Firebase App SDK, from `initializeApp` |
| Firebase Installations | IndexedDB `firebase-installations-database` | An installation id used by GA4 | This device and Google | Not verified | Removed with GA4 by RL-058 (2026-10-15); no longer created, but may remain on devices that ran GA4 earlier |

### On the device: localStorage

All keys except `emailForSignIn` are in `STORAGE_KEYS` (`src/lib/constants.ts`) and written
through `src/services/storage.ts`. None is cleared by "Delete recipes on this device".

| Key | Contents | Retention | Written by |
|---|---|---|---|
| `recipe-app-theme` | `system`, `light` or `dark` | Until changed or browser data cleared | `setTheme`, from `hooks/useTheme.ts` |
| `recipe-lab-unit-system` | `original`, `metric` or `imperial` | Same | `setUnitSystem`, from Settings |
| `recipe-app-library-tab` | The last Library tab chosen | Same. **No longer written or read since RL-098** (2026-10-19), which removed the tabs; a value already on a device stays until browser data is cleared | (was `setLibraryTab`) |
| `recipe-app-intro-state` | Which one-time explainers were dismissed and how many recipes were opened (`lib/onboarding.ts`) | Same | `setIntroState` |
| `recipe-app-device-id` | A random id generated on first load when Firebase is configured | Same. **Never read for any purpose and never sent anywhere** (only call: `getDeviceId()` in `AuthContext`, result unused) | `getDeviceId` |
| `recipe-app-anonymous-uid` | The anonymous account's Firebase uid | Removed on sign-out and when an email account signs in | `setAnonymousUid`, from `AuthContext` |
| `recipe-app-previous-uids` | JSON list of every uid that has signed in on this device, anonymous and email | **Never cleared by the app**; only by clearing browser data. Never sent anywhere | `addPreviousUid`, from `AuthContext` |
| `recipe-app-email-for-linking` | The email address an anonymous user asked to add | Removed when the link completes successfully. Stays if the link is never opened or fails | `sendEmailLinkForLinking` in `services/firebase.ts` via `setEmailForLinking` |
| `emailForSignIn` | The email address a signed-out visitor asked to sign in with | Same as above | `sendEmailSignInLink` in `services/firebase.ts`, writing `localStorage` directly |
| `recipe-app-terms-acceptance` | **RL-047, in the repo, not yet released.** `{ version, acceptedAt, email }`: the Terms version ticked on an email form, the client time it was sent, and **the email address it was ticked for** (trimmed, lower-cased), so it is only recorded for that account | Removed once written to `termsAcceptance/{uid}`, when the send fails, on sign-out and on declining the Terms. Stays if the link is never opened | `setTermsAcceptance`, from `AuthModal`, `EmailLinkingForm` and `EmailLinkStatus` |

### On the device: other

| Item | Where | Contents | Notes |
|---|---|---|---|
| Offline app shell | Cache Storage (Workbox precache, `vite.config.ts`) | The app's own HTML, JS, CSS, icons and fonts | No user data. No runtime caching of Firestore, Auth or AI calls |
| Photos attached to a generation | Memory only (React state for previews, a ref for retry, the AI Logic SDK chat history) | Up to 6 downscaled JPEGs (at most 1024px, 600 KB each) per chat, as base64 | Since RL-118 (UI from RL-119). Sent to Gemini with the message; never written to IndexedDB, localStorage, Firestore, `chatHistory`, `prompt`, analytics or error reports. Gone when the chat page is left or the tab closes. A photo can show people, addresses or handwriting |
| Cookies | none set by the app | none | No `document.cookie` anywhere in `src/`. Third-party scripts can set their own: reCAPTCHA (Google). GA4 cookies may remain from before RL-058. Their names and lifetimes are not in this repo |

### In the cloud: Firebase Authentication

| Item | Contents | Who can read it | Retention | Written by |
|---|---|---|---|---|
| Firebase Auth user | uid; email address (email accounts); display name (generated from the uid by `lib/identity.ts` for anonymous accounts, user-chosen otherwise); whether anonymous; whether the email is verified; sign-in metadata kept by Firebase | The user's own client; the operator in the Firebase console | Until the operator deletes it. No self-service deletion. Anonymous users are not cleaned up by any code here | `services/firebase.ts` (`signInAnonymously`, `sendSignInLinkToEmail`, `signInWithEmailLink`, `linkWithCredential`, `updateProfile`) |
| Sign-in emails | Firebase Auth sends the passwordless link to the address entered | Google, the user's mail provider | Not controlled by the app | `sendSignInLinkToEmail` |

### In the cloud: Cloud Firestore (project `recipe-lab-3832b`)

Read rules are in `firestore.rules`; every client write needs a verified email except the two
noted. The operator can read everything in the Firebase console.

| Collection | Contents | Who can read it | Retention | Written by |
|---|---|---|---|---|
| `recipes/{id}` | Everything in the local recipe **except `chatHistory`**: content, the originating `prompt`, `createdBy` uid and display name, `collaborators` uid and display name, `favoriteCount`, `viewCount`, timestamps | **Anyone, including signed-out visitors** | Until the owner deletes it from the recipe page. "Delete recipes on this device" does not touch it (product decision 5) | `publishRecipe` in `services/firestore.ts`. **Called automatically on every save** of a generated recipe (`hooks/useRecipeChat.ts`), on edit when a copy exists, and on share |
| `recipes` `viewCount` | A raw +1 per page view, no identity stored | Anyone | With the recipe | `incrementRecipeViews`; open to signed-out visitors |
| `profiles/{uid}` | `displayName`, `photoType`, `photoEmoji`, `photoBgColor`, `photoURL` (an uploaded avatar as a 128x128 JPEG `data:` URL, at most 100000 characters), `recipeCount`, `followerCount`, `followingCount`, `createdAt`. No email | **Anyone** | Indefinite. The rules allow the owner to delete it but no UI does | `createOrUpdateProfile` (from `AuthContext.ensureProfile`, `hooks/useProfile.ts`, `AvatarEditor`) |
| `favorites/{uid}_{recipeId}` | `uid`, `recipeId`, `recipeOwnerId`, `createdAt` | The owner only | Until unfavourited | Written by `addCloudFavorite`, `pushLocalFavoritesToCloud`. Read by `isCloudFavorite` and, once per session per verified uid, `getCloudFavorites` (RL-043), which copies `uid`, `recipeId`, `createdAt` into the device's Dexie `favorites` |
| `termsAcceptance/{uid}` | **RL-047, in the repo; rules deployed by RL-051.** `version` (the Terms date), `acceptedAt` (client time, ms), `recordedAt` (server time). Latest acceptance only, no history | The owner only (and the operator in the console) | Overwritten on re-acceptance. The rules allow the owner to delete it (for RL-057) but no UI does | `recordTermsAcceptance` in `services/firestore.ts`, from `AuthContext` and `TermsUpdateDialog` |
| `follows/{a}_{b}` | `followerId`, `followingId`, `followerDisplayName`, `createdAt` | The two parties | Until unfollowed | `followUser` |
| `suggestions/{id}` | `recipeId`, `recipeOwnerId`, `recipeTitle`, `recipeEmoji`, `suggestedBy` uid and display name, `message` (free text; the suggest-mode inputs are capped client-side at 200 characters per why, 1000 for the note and 2000 for the composed message, but the Firestore rules enforce no size limit, so the stored field is not capped server-side), `status`, `createdAt` | The suggester and the recipe owner | **Indefinite. Nobody can delete one** (`allow delete: if false`) | `createSuggestion`, `updateSuggestionStatus` |
| `suggestions/{id}/messages/{id}` | `fromUid`, `fromDisplayName`, `text`, `createdAt` | The two parties | **Indefinite. Immutable, no delete** | `addSuggestionMessage` |
| `notifications/{id}` | `recipientUid`, `type`, `recipeId`, `recipeTitle`, `recipeEmoji`, `fromUid`, `fromDisplayName`, `message` (at most 500 UTF-16 units of the suggestion or reply text), `read`, `createdAt` | The recipient | **Indefinite. No retention limit.** The rules let the recipient delete, but the app has no control that does; the sender can never delete | `addCloudFavorite`, `createSuggestion`, `addSuggestionMessage`, `updateSuggestionStatus`, `followUser` (all fire-and-forget) |
| `writeWindows/{uid}_{action}` | **RL-048 and RL-049, in the repo; rules deployed by RL-051.** Per uid and action (`suggestion`, `reply`, `notification` or `recipe`): `windowStart` and `at` (server timestamps), `count` (writes in the current hour, or day for `recipe`), `last` (the path of the last suggestion, reply, notification or recipe counted) | The owner only (and the operator in the console) | **Indefinite. Never deleted** (the rules forbid delete, since a delete would reset the limit). Kept for rate limiting | `createSuggestion`, `addSuggestionMessage` in `services/firestore.ts`, and since RL-049 `notify()` and `publishRecipe`'s create branch, in the same transaction as the content |
| `clientErrors/{id}` | `source`, `message` (500 chars), `stack` (2000 chars), `route` (path only, no query or hash), `context` tag, `at` (client time), `uid` (or null when signed out), `receivedAt` (server time), `userAgent` (first 300 chars) | **No client.** The operator in the console | **Indefinite. No retention limit yet** (RL-010, `needs-human`) | `reportError` in `services/telemetry.ts`; open to signed-out visitors; at most 10 per session |
| `rateLimits/{uid}` | Would hold a per-uid generation counter | No client | Not written today | Only the **undeployed** `generateRecipe` Cloud Function (`functions/src/index.ts`). There is no per-account rate limit on generation today |

### Data sent to other services today

| Service | What is sent | When | Code |
|---|---|---|---|
| Firebase Hosting (Google) | Ordinary web requests for the app's files | Every visit | `firebase.json` `hosting` |
| Firebase Authentication (Google) | Email address, auth tokens | Sign-in, link, session refresh | `services/firebase.ts` |
| Cloud Firestore (Google) | Everything in the Firestore table above | Normal use | `services/firestore.ts`, `services/telemetry.ts` |
| Firebase AI Logic, Gemini Developer API backend (Google), model `gemini-3.6-flash` | The system instruction, every message the user types in the session and the conversation so far (the SDK chat keeps history), and for a variation the parent recipe's content as JSON. Photos attached in the chat (up to three per message, downscaled JPEG, resent with each later turn), never stored by the app (RL-118, RL-119; RL-120 wording). Limits: at most 1024px per photo and 6 per chat, resent through the SDK history, held in memory only. No uid, email or display name is put in the prompt by app code | Each generation turn | `services/gemini.ts` (`GoogleAIBackend`) |
| App Check with reCAPTCHA v3 (Google) | Whatever Google's reCAPTCHA v3 script collects from the browser to score it. Not visible in this repo | On load when `VITE_RECAPTCHA_SITE_KEY` is set | `services/firebase.ts` |
| Google Analytics 4 (Google) | Events `sign_in` (method), `sign_out`, `recipe_created`, `recipe_updated`, `recipe_viewed`, `recipe_shared`, `recipe_deleted`, `recipe_favorited`, `recipe_unfavorited` (recipe id), `suggestion_submitted` (recipe id), `suggestion_reviewed` (suggestion id, action), `profile_updated` (field), `user_followed`, `user_unfollowed` (**the other user's uid**). The GA4 User-ID was set to the Firebase uid of **every** signed-in user, anonymous included. No consent gate | **Removed 2026-10-15 (RL-058).** The same event names now go to PostHog (next row) | `services/analytics.ts` |
| PostHog (`posthog-js`, in the repo, not in production) | The GA4 event list above, plus `$ai_generation` (provider, model, latency, random session and trace ids; no prompt or response text), unhandled errors and promise rejections, and PostHog log lines (`recipe-app-web`). The PostHog distinct id is the Firebase uid; for an anonymous account that is its random anonymous uid, with no email or name. `posthog-js` runs with its defaults (autocapture, pageviews, IP and GeoIP, a `ph_<key>_posthog` cookie and localStorage entry). The author accepted these defaults on 2026-10-17 as the only user | Only after the user allows analytics, and only when `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST` are set at build. No build sets them today | `services/analytics.ts`, `services/gemini.ts`, `contexts/AuthContext.tsx` |
| PostHog from `functions/` (`posthog-node`, `@posthog/ai`, not deployed) | Each `generateRecipe` call: model, latency and token usage under the caller's uid, in `privacyMode` (no prompt or response text). No exception autocapture | Only when the caller sends `analyticsConsent: true` and the function has the PostHog variables. No client calls the function today. `functions/` is not deployed | `functions/src/index.ts` |
| Share links | A `/shared#r=...` link carries the recipe content and `createdBy` uid and display name compressed in the URL hash. The hash is not sent to the server; it goes wherever the user pastes the link | When a recipe is shared without a cloud copy | `lib/share.ts` |

### Rights the app can honour itself today

- **Export**: "Export my recipes" in Settings downloads the local Dexie `recipes` table as JSON
  (`exportAllRecipes`). "Download my data" (RL-056) downloads local recipes and bookmarks plus,
  for a signed-in non-anonymous account, the cloud data it can read (profile, published recipes,
  favourites, follows, suggestions and replies, notifications, terms acceptance, write counters).
  Other users' ids and names are redacted. It does not include the Auth user record or
  `clientErrors`; the operator runbook (RL-055) covers those.
- **Deletion**: per-recipe delete (for a verified account the cloud copies the user owns, then
  the local subtree; otherwise the local subtree only);
  unfavourite; unfollow; "Delete recipes on this device" (local `recipes` and `favorites`; for a verified account own recipes reload through the RL-078 sync).
- **Correction**: display name and avatar on the profile; editing one's own recipes.
- **Not possible in the app**: deleting the account, the profile, suggestions, replies,
  notifications (sent or received), error reports, or the Auth user.

## 2. Planned before release

| Change | Ticket (status on 2026-10-15) | Effect on this inventory |
|---|---|---|
| GA4 removed | RL-058 (done 2026-10-15) | GA4 events, the GA4 User-ID and `firebase-installations-database` go away. `VITE_FIREBASE_MEASUREMENT_ID` removed |
| Consent banner and Settings control | RL-052 (built in the repo 2026-10-15; inert until `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST` are set) | `recipe-app-analytics-consent` localStorage key holding `{ analytics, at, version }`, plus a `recipe-app-ga-cookies-cleared` flag. Leftover `_ga` cookies deleted once |
| PostHog project, host and settings | RL-053 (needs-human) | Host (EU recommended), IP handling and data retention chosen by the author and recorded |
| PostHog product analytics | RL-054 (ready; client wiring in the repo since 2026-10-17, see section 1) | Events go to PostHog only after opt-in, users known by uid only; an anonymous account by its random anonymous uid (author's decision 2026-10-17). `posthog-js` keeps a `ph_<key>_posthog` cookie and localStorage entry |
| Terms acceptance record | RL-047 (built in the repo 2026-10-15; rules pending RL-051) | Owner-only `termsAcceptance/{uid}` with `version`, `acceptedAt`, `recordedAt`, plus the `recipe-app-terms-acceptance` key holding the pending acceptance with the normalised email (rows in section 1) |
| Per-user limits on suggestions and replies | RL-048 (built in the repo 2026-10-15; rules pending RL-051) | New `writeWindows/{uid}_{action}` counters, never deleted |
| Per-user limits on notifications and recipe creates | RL-049 (built in the repo 2026-10-15; rules pending RL-051) | Two more `writeWindows` ids per user (`_notification`, `_recipe`), never deleted by clients; erased by the RL-055 script |
| Operator data-request runbook | RL-055 (built in the repo 2026-10-15; `scripts/data-request.mjs`, runbook in `docs/operations.md`) | Export and erasure of one uid by the operator on email request; suggestions and replies on other people's recipes are anonymised, not deleted. Suggestions on the erased user's own recipes are kept with the owner side anonymised (`recipeOwnerId` becomes `deleted-user`, the user's replies anonymised, the other party's text untouched; RL-060), except a self-suggestion, which is deleted with its thread. Other users' favourites of those recipes are deleted. Follower, following and favourite counters on other users' documents are decremented |
| Self-service download | RL-056 (ready) | "Download my data" in Settings |
| Self-service account deletion | RL-057 (needs-human) | "Delete my account" in Settings |
| `clientErrors` TTL | RL-010 (needs-human) | A retention period (30 days suggested) on `receivedAt` |
| Legal pages | RL-045 (built as drafts), sign-off RL-046 (needs-human, still pending) | `/terms`, `/privacy`, `/cookies` render these drafts |

Gaps no ticket closes yet, for the author: no retention limit on `notifications`, no control
for a recipient to delete a notification, `recipe-app-previous-uids` never cleared, and the
email-for-link keys kept when a link is never opened.

## 3. Corrections to the groomer's inventory

The ticket's starting inventory was checked line by line. What changed:

1. **localStorage keys.** `STORAGE_KEYS` also held `LIBRARY_TAB` (`recipe-app-library-tab`),
   which the list omitted. RL-098 removed that key (see the table above). The rest of the list is right.
2. **Device id.** Listed as stored, which is true, but it is never read for a purpose and never
   leaves the device. Stated so the policy does not overstate it.
3. **Previous uids.** Never cleared by the app, including on sign-out. Not stated before.
4. **Email-for-link keys.** Both are removed only when a link completes successfully, so a
   link never opened leaves the address in localStorage.
5. **Firebase IndexedDB stores.** Named exactly: `firebaseLocalStorageDb` (Auth),
   `firebase-app-check-database`, and `firebase-heartbeat-database`, which the list missed.
   Installations (`firebase-installations-database`) is used only by GA4, so it leaves with
   RL-058. Firestore keeps no IndexedDB cache: the app uses `getFirestore` with no persistence.
6. **Cache Storage.** The Workbox offline shell was missing. It holds no user data.
7. **Publishing is automatic.** Saving a generated recipe as a verified user publishes it
   (`hooks/useRecipeChat.ts`); it is not a separate opt-in. The policies say so.
8. **Published recipes also carry `collaborators`** (uid and display name of approved
   suggesters), not only `createdBy`.
9. **Follows store `followerDisplayName`**, and suggestions store `recipeTitle` and the
   suggester's display name. Notifications copy up to 500 units of a suggestion or reply.
10. **clientErrors fields.** Also `source`, `context` and `at`. The 300-character user agent,
    uid, message, stack and route are correct; the route never includes the query or hash.
11. **Notifications.** The list said users cannot delete notifications they sent. True, and
    also: recipients have no control to delete the ones they received, although the rules
    allow it.
12. **Profiles.** The rules let the owner delete their own profile, but no UI does. The
    profile holds no email address.
13. **"Clear All Data"** is now labelled "Delete recipes on this device" in Settings. It clears
    local recipes **and** local bookmarks, and no localStorage keys. For a verified account the cleared own recipes load again through the RL-078 sync.
14. **Export**: "Export my recipes" covers local recipes only. "Download my data" (RL-056) adds local bookmarks and the user's readable cloud data.
15. **GA4 was removed by RL-058 (2026-10-15).** Before that it ran without consent when configured and set the GA4 User-ID to the uid
    of every signed-in user including anonymous ones. Its events include another user's uid
    (`target_uid`). RL-058 removes it; the policies are written for after that.
16. **Abuse limits.** The only per-account generation rate limit is in the undeployed Cloud
    Function, so no per-account limit exists today. Today's abuse control on the AI path is
    App Check with reCAPTCHA v3. Per-user limits on suggestions and replies are RL-048.
17. **`SUPPORT_EMAIL` exists** as a constant in `src/lib/constants.ts`, so the drafts use it
    rather than a placeholder. Its comment says to change it before inviting anyone whose mail
    should not reach that address.
