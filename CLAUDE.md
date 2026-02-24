# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Recipe Lab — a recipe management app with AI-powered recipe generation and branching version control. Each recipe can spawn variations, forming a navigable tree. Includes user authentication (anonymous + passwordless email), favorites, creator attribution, change suggestions, and real-time notifications.

## Tech Stack

- **React 19 + Vite 7 + TypeScript** — mobile-first SPA
- **Tailwind CSS v4** — utility-first styling with `@tailwindcss/vite` plugin
- **Dexie.js** (IndexedDB) — local structured storage
- **React Router v7** — client-side routing
- **Firebase Auth** — anonymous + email link (passwordless) authentication
- **Firebase Firestore** — shared cloud storage for published recipes, favorites, suggestions, notifications
- **@google/genai** — Gemini API (model: `gemini-2.0-flash`)
- **Zod** — structured AI output validation
- **lz-string** — URL-safe compression for recipe sharing links (fallback when Firebase not configured)

## Commands

- `npm run dev` — start dev server
- `npm run build` — type-check + production build
- `npm run lint` — ESLint
- `npm run preview` — preview production build

## Environment Variables

Firebase config via `.env` (see `.env.example`):

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`

When these are not set, Firebase auth/Firestore is disabled and the app works in local-only mode.

## Project Structure

```
src/
├── main.tsx, App.tsx, index.css
├── types/          recipe.ts (Recipe, CreatedBy, Favorite, AppUser), api.ts, social.ts (Suggestion, AppNotification)
├── schemas/        recipe.schema.ts (Zod schemas for AI output validation)
├── db/             database.ts (Dexie), recipes.ts (CRUD + tree queries), favorites.ts
├── services/       gemini.ts (AI client), storage.ts (localStorage), firebase.ts (Auth + Firestore init), firestore.ts (cloud CRUD)
├── contexts/       AuthContext.tsx (AuthProvider + useAuth hook)
├── hooks/          useRecipe, useRecipeLibrary, useRecipeTree, useRecipeChat, useTheme, useFavorites, useNotifications, useSuggestions
├── lib/            utils.ts, tree.ts, prompts.ts, constants.ts, share.ts
├── components/
│   ├── auth/       AuthModal
│   ├── notifications/ NotificationBell (bell icon + dropdown panel)
│   ├── layout/     AppShell, BottomNav, TopBar
│   ├── recipe/     RecipeCard, RecipeContent, IngredientList, InstructionList,
│   │               MetadataPills, LineageBreadcrumb, VariationChips, SuggestChangeModal
│   ├── chat/       ChatMessage, RecipeCardMessage, ChatInput, TypingIndicator
│   ├── tree/       (empty — tree rendering is inline in VersionTreePage)
│   └── ui/         Button, Input, Chip, Skeleton, EmptyState, ConfirmDialog, FAB, Spinner
└── pages/          LibraryPage, RecipeChatPage, RecipeDetailPage, VersionTreePage, SettingsPage, SharedRecipePage
```

## Routes

| Route | Page | Purpose |
|---|---|---|
| `/` | LibraryPage | Browse recipes with search, favorites filter, notification bell |
| `/create` | RecipeChatPage | Chat-based new recipe creation (auth-gated) |
| `/recipe/:id` | RecipeDetailPage | View recipe with ownership-aware actions (delete/suggestions) |
| `/recipe/:id/vary` | RecipeChatPage | Chat-based variation creation (auth-gated, parent as context) |
| `/recipe/:id/tree` | VersionTreePage | Visual branching tree of all variations |
| `/settings` | SettingsPage | Account profile, API key, theme, data export/import/clear |
| `/shared` | SharedRecipePage | View-only recipe from URL hash (lz-string encoded) |
| `/shared/:id` | SharedRecipePage | View shared recipe from Firestore; supports favorite + suggest |

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
- **Notifications**: stored in Firestore `notifications` collection; real-time unread count via `onSnapshot`; generated automatically when someone favorites or suggests a change to your recipe

## Firestore Collections

| Collection | Key | Purpose |
|---|---|---|
| `recipes` | recipe UUID | Published recipes (same ID as local); includes `favoriteCount` |
| `favorites` | `{uid}_{recipeId}` | Global favorite records; used for notification generation |
| `suggestions` | auto-ID | Change suggestions with `status: pending/approved/rejected` |
| `notifications` | auto-ID | Per-user notifications; `type: favorite/suggestion`, `read: boolean` |

## Auth Flow

1. User browses library and views recipes without signing in
2. On `/create` or `/recipe/:id/vary`, if Firebase is configured and user is not authenticated, `AuthModal` appears
3. User picks "Continue Anonymously" (Firebase anonymous auth) or "Sign in with Email" (magic link, no password)
4. Email link flow: user enters email → receives magic link → clicks it → app detects sign-in link on load via `completeEmailSignIn()` → user is authenticated
5. Display name can be set in Settings → stored via `updateProfile()` on Firebase user
6. `AuthProvider` wraps the entire app in `App.tsx`; `useAuth()` provides user state everywhere

## Known Decisions & Gotchas

- **`zod-to-json-schema` removed** — Zod v4 is incompatible; JSON schema is hardcoded in `lib/prompts.ts` instead
- **Dexie `update()` not used** — circular type issue with `ChatMessage.recipe`; uses `get()` + `put()` pattern instead
- **Dexie schema v2** adds `favorites` table and migrates existing recipes to include `createdBy: { uid: 'local', displayName: null }`
- **Trailing comma stripping** in `gemini.ts` `parseRecipeJson()` — safety net for Gemini JSON quirks
- **`RecipeChatPage`** is shared between `/create` and `/recipe/:id/vary` routes; behavior differs based on presence of `:id` param
- **All recipes loaded for library** — client-side filtering is fine for local IndexedDB up to thousands of recipes
- **Firebase is optional** — `firebase.ts` checks env vars before initializing; all auth/Firestore functions are safe no-ops when unconfigured
- **`AppUser` type** is a plain object extracted from Firebase `User` to avoid passing Firebase class instances through React state
- **Cloud notifications use `addDoc` fire-and-forget** — notification creation in `firestore.ts` is non-blocking (`.catch(() => {})`) to avoid slowing down the favorite/suggest action
- **Firestore composite indexes** may need to be created manually for `notifications` (recipientUid + createdAt) and `suggestions` (recipeId + createdAt); Firebase will auto-prompt with a link in console errors
- **Ownership fallback**: when `createdBy.uid === 'local'` (pre-auth recipes) or auth is disabled, user is treated as owner
