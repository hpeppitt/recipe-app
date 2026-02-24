# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Recipe Lab — a recipe management app with AI-powered recipe generation and branching version control. Each recipe can spawn variations, forming a navigable tree.

## Tech Stack

- **React 19 + Vite 7 + TypeScript** — mobile-first SPA
- **Tailwind CSS v4** — utility-first styling with `@tailwindcss/vite` plugin
- **Dexie.js** (IndexedDB) — local structured storage
- **React Router v7** — client-side routing
- **@google/genai** — Gemini API (model: `gemini-2.0-flash`)
- **Zod** — structured AI output validation
- **lz-string** — URL-safe compression for recipe sharing links

## Commands

- `npm run dev` — start dev server
- `npm run build` — type-check + production build
- `npm run lint` — ESLint
- `npm run preview` — preview production build

## Project Structure

```
src/
├── main.tsx, App.tsx, index.css
├── types/          recipe.ts, api.ts
├── schemas/        recipe.schema.ts (Zod schemas for AI output validation)
├── db/             database.ts (Dexie), recipes.ts (CRUD + tree queries)
├── services/       gemini.ts (AI client), storage.ts (localStorage helpers)
├── hooks/          useRecipe, useRecipeLibrary, useRecipeTree, useRecipeChat, useTheme
├── lib/            utils.ts, tree.ts, prompts.ts, constants.ts, share.ts
├── components/
│   ├── layout/     AppShell, BottomNav, TopBar
│   ├── recipe/     RecipeCard, RecipeContent, IngredientList, InstructionList,
│   │               MetadataPills, LineageBreadcrumb, VariationChips
│   ├── chat/       ChatMessage, RecipeCardMessage, ChatInput, TypingIndicator
│   ├── tree/       (empty — tree rendering is inline in VersionTreePage)
│   └── ui/         Button, Input, Chip, Skeleton, EmptyState, ConfirmDialog, FAB, Spinner
└── pages/          LibraryPage, RecipeChatPage, RecipeDetailPage, VersionTreePage, SettingsPage, SharedRecipePage
```

## Routes

| Route | Page | Purpose |
|---|---|---|
| `/` | LibraryPage | Browse core recipes with variation counts, search |
| `/create` | RecipeChatPage | Chat-based new recipe creation |
| `/recipe/:id` | RecipeDetailPage | View recipe, variations, lineage, delete |
| `/recipe/:id/vary` | RecipeChatPage | Chat-based variation creation (parent as context) |
| `/recipe/:id/tree` | VersionTreePage | Visual branching tree of all variations |
| `/settings` | SettingsPage | API key, theme, data export/import/clear |
| `/shared` | SharedRecipePage | View-only recipe from a shared link (data in URL hash) |

## Key Architecture

- **UUIDs** (`crypto.randomUUID()`) for recipe IDs — cloud-sync ready
- **`rootId`** on every recipe enables single-query tree fetching
- **`depth`** field enables sorting/indentation without tree traversal
- Chat sessions are ephemeral (component state, not persisted to DB)
- Gemini service uses `responseMimeType: 'application/json'` for reliable structured output
- Multi-turn chat history maintained in-memory per session
- Theme uses CSS custom properties with `.dark` class toggle on `<html>`
- **Sharing** uses `lz-string` to compress recipe JSON into a URL hash fragment (`/shared#r=<compressed>`); no backend needed

## Known Decisions & Gotchas

- **`zod-to-json-schema` removed** — Zod v4 is incompatible; JSON schema is hardcoded in `lib/prompts.ts` instead
- **Dexie `update()` not used** — circular type issue with `ChatMessage.recipe`; uses `get()` + `put()` pattern instead
- **Trailing comma stripping** in `gemini.ts` `parseRecipeJson()` — safety net for Gemini JSON quirks
- **`RecipeChatPage`** is shared between `/create` and `/recipe/:id/vary` routes; behavior differs based on presence of `:id` param
- **All recipes loaded for library** — client-side filtering is fine for local IndexedDB up to thousands of recipes
- **Share links are self-contained** — recipe display data is encoded in the URL hash; internal fields (id, parentId, rootId, depth, chatHistory) are stripped via `SharedRecipe` type in `lib/share.ts`
