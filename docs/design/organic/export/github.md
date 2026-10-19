repo: hpeppitt/recipe-app
branch: main

## Last sync
date: 2026-10-14T00:00:00Z

### Updated in this project
- Ticket 8 screens: edit, suggest, suggestion thread, activity, shared, settings, avatar, auth edge states
- Tree intro, breadcrumb, metadata/nutrition, system patterns, dark Organic, desktop two-pane

## Screen map
| Project screen | Repo files |
| --- | --- |
| Explore and Recipe.dc.html — Explore (1a–1c) | src/pages/LibraryPage.tsx, src/components/recipe/RecipeCard.tsx, src/components/layout/BottomNav.tsx |
| Explore and Recipe.dc.html — Recipe page (2a–2c) | src/pages/RecipeDetailPage.tsx, src/components/recipe/LineageBreadcrumb.tsx, src/components/recipe/MetadataPills.tsx |
| Branching.dc.html (3a–3e) | src/pages/VersionTreePage.tsx, src/components/recipe/VariationChips.tsx, src/components/recipe/TreeIntro.tsx |
| Social Auth and Generate.dc.html — Author (4a–4c) | src/pages/ProfilePage.tsx, src/types/social.ts |
| Social Auth and Generate.dc.html — Auth (5a–5e) | src/components/auth/AuthModal.tsx, src/pages/ProfilePage.tsx |
| Social Auth and Generate.dc.html — Generate (6a–6c) | src/pages/RecipeChatPage.tsx (not read in detail), src/types/recipe.ts |
| Tab Bar.dc.html | src/components/layout/BottomNav.tsx |
| Collaboration and Account.dc.html (8–15) | src/pages/RecipeEditPage.tsx, SettingsPage.tsx, SharedRecipePage.tsx, src/components/recipe/SuggestChangeModal.tsx, SuggestionThread.tsx, src/components/notifications/NotificationBell.tsx, src/components/profile/AvatarEditor.tsx, src/components/auth/EmailLinkStatus.tsx, StrandedIdentityNotice.tsx |
| App Prototype.dc.html + App Spec.dc.html (final) | all of the above |
| Recipe Parts and System.dc.html (16–21) | src/components/recipe/TreeIntro.tsx, LineageBreadcrumb.tsx, MetadataPills.tsx, src/components/ui/*, src/index.css |
