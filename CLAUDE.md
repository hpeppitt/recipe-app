# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Recipe Lab — a recipe management app with AI-powered recipe generation and branching version control. Each recipe can spawn variations, forming a navigable tree. Includes user authentication (anonymous + passwordless email), favorites, creator attribution, change suggestions, real-time notifications, user profiles with custom avatars, follow system, and GA4 analytics.

## Tech Stack

- **React 19 + Vite 7 + TypeScript** — mobile-first SPA
- **Tailwind CSS v4** — utility-first styling with `@tailwindcss/vite` plugin
- **Dexie.js** (IndexedDB) — local structured storage
- **React Router v7** — client-side routing
- **Firebase Auth** — anonymous + email link (passwordless) authentication
- **Firebase Firestore** — shared cloud storage for published recipes, favorites, suggestions, notifications, profiles, follows
- **Firebase Analytics (GA4)** — event-based analytics tracking via `src/services/analytics.ts`
- **Firebase AI Logic** (`firebase/ai`) — Gemini access (model: `gemini-2.0-flash`) via a
  Google-hosted proxy that holds the API key server-side. The browser never sees a Gemini
  key, and App Check is enforced on this path. Replaced direct `@google/genai` calls.
- **Zod** — structured AI output validation
- **lz-string** — URL-safe compression for recipe sharing links (fallback when Firebase not configured)

## Commands

- `npm run dev` — start dev server
- `npm run build` — type-check + production build
- `npm run lint` — ESLint
- `npm test` — Vitest (unit tests for `src/db` and `src/lib`; node env with fake-indexeddb, setup in `src/test/setup.ts`)
- `npm run preview` — preview production build

## Dev Cycle

- **`AUDIT.md`** (repo root) is the working backlog: checkboxed findings with IDs (SEC/INFRA/FUN/UI) grouped by severity. Fix top-down within a band.
- **`/audit-next`** fixes exactly one AUDIT.md finding, verifies it, checks it off, and commits (`Fix <ID>: ...`). Loopable via `/loop /audit-next`.
- **`/preflight`** is the pre-commit gate: build + lint + tests + mobile-viewport browser smoke test of the core flows.
- **Subagents**: `ui-reviewer` (run after UI/component changes) and `data-integrity-reviewer` (run after changes to `firestore.ts`, `src/db/`, favorites/recipe-chat hooks, or `firestore.rules`). Both read-only.
- A PostToolUse hook (`.claude/hooks/typecheck-lint.sh`) runs `tsc -b` + ESLint after every edit to `src/**/*.ts(x)` and feeds errors back automatically.
- New pure logic in `src/db`/`src/lib` should come with tests; use `src/test/factories.ts` (`makeRecipe`, `makeIngredient`).

## Environment Variables

Firebase config via `.env` (see `.env.example`):

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID` (optional, enables GA4 analytics)
- `VITE_RECAPTCHA_SITE_KEY` — required for recipe generation; App Check is enforced on the
  Firebase AI Logic path, so without it the Gemini proxy rejects requests
- `VITE_APPCHECK_DEBUG_TOKEN` (local dev only) — register the token App Check logs to the
  console under App Check > Apps > Manage debug tokens, or enforcement blocks localhost

There is deliberately no Gemini API key variable. `VITE_*` values are inlined into the
client bundle at build time, so a key placed there would be published. AI Logic provisions
and holds the key server-side instead.

When these are not set, Firebase auth/Firestore is disabled and the app works in local-only mode.

## Project Structure

```
src/
├── main.tsx, App.tsx, index.css
├── types/          recipe.ts (Recipe, CreatedBy, Collaborator, Favorite, AppUser), api.ts, social.ts (Suggestion, AppNotification), profile.ts (UserProfile, Follow)
├── schemas/        recipe.schema.ts (Zod schemas for AI output validation)
├── db/             database.ts (Dexie), recipes.ts (CRUD + tree queries), favorites.ts
├── services/       gemini.ts (Firebase AI Logic client), storage.ts (localStorage), firebase.ts (Auth + Firestore + App Check init), firestore.ts (cloud CRUD), analytics.ts (GA4 events)
├── contexts/       AuthContext.tsx (AuthProvider + useAuth hook)
├── hooks/          useRecipe, useRecipeLibrary, useRecipeTree, useRecipeChat, useTheme, useFavorites, useNotifications, useSuggestions, useProfile, useFollow, useUserRecipes
├── lib/            utils.ts, tree.ts, prompts.ts, constants.ts, share.ts, identity.ts
├── components/
│   ├── auth/       AuthModal
│   ├── notifications/ NotificationBell (bell icon + dropdown panel)
│   ├── profile/    AvatarEditor (emoji picker + image upload)
│   ├── layout/     AppShell, BottomNav, TopBar
│   ├── recipe/     RecipeCard, RecipeContent, IngredientList, InstructionList,
│   │               MetadataPills, LineageBreadcrumb, VariationChips, SuggestChangeModal
│   ├── chat/       ChatMessage, RecipeCardMessage, ChatInput, TypingIndicator
│   ├── tree/       (empty — tree rendering is inline in VersionTreePage)
│   └── ui/         Button, Input, Chip, Skeleton, EmptyState, ConfirmDialog, FAB, Spinner, Avatar
└── pages/          LibraryPage, RecipeChatPage, RecipeDetailPage, VersionTreePage, SettingsPage, SharedRecipePage, ProfilePage
```

## Routes

| Route | Page | Purpose |
|---|---|---|
| `/` | LibraryPage | Browse recipes with search, favorites/following filters, notification bell |
| `/create` | RecipeChatPage | Chat-based new recipe creation (auth-gated) |
| `/recipe/:id` | RecipeDetailPage | View recipe with ownership-aware actions (delete/suggestions) |
| `/recipe/:id/vary` | RecipeChatPage | Chat-based variation creation (auth-gated, parent as context) |
| `/recipe/:id/tree` | VersionTreePage | Visual branching tree of all variations |
| `/settings` | SettingsPage | Theme, data export/import/clear |
| `/shared` | SharedRecipePage | View-only recipe from URL hash (lz-string encoded) |
| `/shared/:id` | SharedRecipePage | View shared recipe from Firestore; supports favorite + suggest |
| `/profile` | ProfilePage | Own profile: avatar editor, stats, recipe feed, sign out |
| `/profile/:uid` | ProfilePage | Public profile: stats, recipe feed, follow button |

## Key Architecture

- **UUIDs** (`crypto.randomUUID()`) for recipe IDs — used as both IndexedDB keys and Firestore document IDs
- **Dual storage**: recipes saved to IndexedDB (local) and published to Firestore (cloud) simultaneously
- **`createdBy`** field on every recipe stores `{ uid, displayName }` snapshot at creation time
- **Ownership model**: `recipe.createdBy.uid === user.uid` determines if user is the owner
  - Owners can: delete, view suggestions, approve/reject suggestions
  - Non-owners (on shared page): can favorite, suggest changes
- **Sharing**: when Firebase configured, shares via `/shared/:id` (Firestore); otherwise falls back to `/shared#r=<lz-string>` (URL-encoded)
- **Favorites**: dual-write to local Dexie (instant UI) + Firestore (generates owner notifications)
- **Suggestions**: stored in Firestore `suggestions` collection; real-time subscription via `onSnapshot`
- **Collaborators**: when a suggestion is approved, the suggester is auto-added to the recipe's `collaborators` array via `arrayUnion`
- **Notifications**: stored in Firestore `notifications` collection; real-time unread count via `onSnapshot`; generated automatically when someone favorites or suggests a change to your recipe
- **Profiles**: stored in Firestore `profiles` collection; created automatically on first sign-in; supports 3 avatar types (generated/emoji/uploaded)
- **Follows**: stored in Firestore `follows` collection; follower/following counts maintained on profile docs via `increment()`
- **View tracking**: `viewCount` on recipe docs incremented on each view (RecipeDetailPage + SharedRecipePage)
- **Analytics**: GA4 events tracked for sign-in, recipe CRUD, favorites, suggestions, follows, profile updates via `src/services/analytics.ts`
- **Avatar types**: `generated` (deterministic initials + color from UID), `emoji` (food emoji + custom bg color), `uploaded` (image scaled to 128x128 base64 JPEG)

## Firestore Collections

| Collection | Key | Purpose |
|---|---|---|
| `recipes` | recipe UUID | Published recipes; includes `favoriteCount`, `viewCount`, `collaborators` |
| `favorites` | `{uid}_{recipeId}` | Global favorite records; used for notification generation |
| `suggestions` | auto-ID | Change suggestions with `status: pending/approved/rejected` |
| `notifications` | auto-ID | Per-user notifications; `type: favorite/suggestion`, `read: boolean` |
| `profiles` | user UID | User profiles; avatar settings, follower/following counts |
| `follows` | `{followerId}_{followingId}` | Follow relationships between users |

## Auth Flow

1. User browses library and views recipes without signing in
2. On `/create` or `/recipe/:id/vary`, if Firebase is configured and user is not authenticated, `AuthModal` appears
3. User picks "Continue Anonymously" (Firebase anonymous auth) or "Sign in with Email" (magic link, no password)
4. Email link flow: user enters email → receives magic link → clicks it → app detects sign-in link on load via `completeEmailSignIn()` → user is authenticated
5. On first sign-in, a Firestore profile doc is auto-created with default values
6. Anonymous users get a food-themed display name (e.g. "CrispyWaffle") auto-generated from their UID
7. Display name and avatar can be customized on the Profile page
8. `AuthProvider` wraps the entire app in `App.tsx`; `useAuth()` provides user state everywhere

## GA4 Analytics Events

| Event | When |
|---|---|
| `sign_in` | User signs in (anonymous or email) |
| `sign_out` | User signs out |
| `recipe_created` | Recipe saved (includes `is_variation` flag) |
| `recipe_viewed` | Recipe detail or shared page loaded |
| `recipe_shared` | Share link copied |
| `recipe_deleted` | Recipe deleted |
| `recipe_favorited` / `recipe_unfavorited` | Favorite toggled |
| `suggestion_submitted` | Change suggestion sent |
| `suggestion_reviewed` | Suggestion approved or rejected |
| `profile_updated` | Avatar or display name changed |
| `user_followed` / `user_unfollowed` | Follow toggled |

## Known Decisions & Gotchas

- **`zod-to-json-schema` removed** — Zod v4 is incompatible; JSON schema is hardcoded in `lib/prompts.ts` instead
- **Dexie `update()` not used** — circular type issue with `ChatMessage.recipe`; uses `get()` + `put()` pattern instead
- **Dexie schema v3** adds `collaborators` field migration; v2 adds `favorites` table + `createdBy` migration
- **Trailing comma stripping** in `gemini.ts` `parseRecipeJson()` — safety net for Gemini JSON quirks
- **Recipe generation requires Firebase** — it runs through AI Logic, so local-only mode
  cannot generate (the composer is disabled with an explanatory notice). Users no longer
  supply their own key; `getApiKey`/`setApiKey` were removed
- **Prompts are still client-side** — see `RISK-1` in `AUDIT.md`. An inert Cloud Function
  proxy in `functions/` owns the prompts server-side and rate-limits per account, kept as
  the escalation path if quota abuse ever appears (needs the Blaze plan)
- **`RecipeChatPage`** is shared between `/create` and `/recipe/:id/vary` routes; behavior differs based on presence of `:id` param
- **All recipes loaded for library** — client-side filtering is fine for local IndexedDB up to thousands of recipes
- **Firebase is optional** — `firebase.ts` checks env vars before initializing; all auth/Firestore functions are safe no-ops when unconfigured
- **`AppUser` type** is a plain object extracted from Firebase `User` to avoid passing Firebase class instances through React state
- **Cloud notifications use `addDoc` fire-and-forget** — notification creation in `firestore.ts` is non-blocking (`.catch(() => {})`) to avoid slowing down the favorite/suggest action
- **Firestore rules + indexes live in the repo** (`firestore.rules`, `firestore.indexes.json`, wired via `firebase.json`); deploy with `firebase deploy --only firestore`. Rules enforce ownership server-side and constrain counter updates to exact +/-1 bumps. Known limitation: client-side cross-UID migration (`migrateFirestoreUid`) is denied by rules and fails silently; a proper fix needs a Cloud Function
- **Ownership fallback**: when `createdBy.uid === 'local'` (pre-auth recipes) or auth is disabled, user is treated as owner
- **Profile avatars are only custom on profile pages and library header** — recipe cards and detail pages use the generated avatar (deterministic from UID) for simplicity; click through to profile to see the custom avatar
- **Uploaded avatars stored as base64 JPEG** in Firestore profile doc — images are cropped to square and scaled to 128x128 to keep doc size small
- **Following filter** fetches recipes from Firestore (not local Dexie) using `where('createdBy.uid', 'in', followedUids)` — supports up to 30 followed users per query chunk
- **View counts are raw** (not unique per user) — simple increment on each page load
