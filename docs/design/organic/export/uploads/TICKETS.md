# Branching redesign: tickets

Source: Claude Design export `Branching.dc.html` (options 3a to 3e) on the Organic design system.
Target: `hpeppitt/recipe-app`.

Decisions already made:
- Version tree page gets a three-way toggle: **Tree (3a) · Timeline (3b) · Map (3c)**.
- 3d sibling carousel replaces `VariationChips` on the recipe page.
- 3e "What changed" diff is kept as an on-demand comparison; its entry points are decided in ticket 5.
- The whole app is rethemed to Organic now. Screens with no design yet are listed in ticket 8 for follow-up in Claude Design.
- Change tags and diffs are computed client-side from ingredients. No schema or Firestore changes.
- Delivery: feature branch plus draft PR.

Suggested order: 1 → 2 → 3 → (4, 5, 6 in parallel) → 7. Ticket 8 is design work, not code.

---

## 1. Organic theme foundation

**Why:** every other ticket builds on the Organic tokens; doing it first means the branching screens are built once, not restyled later.

**Scope**
- Map Organic tokens into the Tailwind `@theme` in `src/index.css`: bg/surface/text, accent (terracotta) and accent-2 (sage) 100 to 900 ramps, neutral ramp, divider, `--shadow-sm/md/lg`, radii.
- Repoint the existing semantic tokens (`primary-*`, `surface*`, `text-*`, `border*`) at Organic values so current screens pick up the theme without a rewrite of all 28 files that use them.
- Load Caprasimo (headings) and Figtree (body) from Google Fonts; set heading/body font families.
- Restyle shared UI primitives to match Organic components: `Button` (pill, primary/secondary/ghost), `Chip`/tags, `SegmentedControl` (`.seg`), `Input`, `ConfirmDialog`, `Skeleton`, `EmptyState`, `TopBar`.
- Swap icons to Lucide at stroke-width 2.75 if the app does not already use it (check bundle size; tree-shaken `lucide-react`).
- Focus ring: 2px accent `:focus-visible`, no browser default.

**Open question:** Organic has no dark palette, and the app supports light/dark/system (`useTheme`, ~53 `dark:` classes). Options: (a) ship light-only and hide the toggle until a dark Organic is designed, or (b) keep a temporary dark mapping. Needs a call before this ticket starts. See ticket 8.

**Done when**
- All existing screens render in Organic colours and type with no unstyled elements.
- Text contrast still meets the WCAG AA notes in `index.css` (accent on bg is only 3:1, so body-size accent text uses `accent-700`).
- `docs/` updated (architecture/decisions) per CLAUDE.md.

---

## 2. Branch diff logic (`src/lib/recipeDiff.ts`)

**Why:** the Timeline sheet (3b), carousel cards (3d) and diff screen (3e) all show what changed vs the parent. Recipes don't store this.

**Scope**
- Pure function `diffRecipes(parent, child)` returning:
  - Ingredient changes matched by normalised name: `changed` (amount/unit edit), `added`, `removed`.
  - Method changes per step (word-level insert/delete spans for highlighting, as in 3e step 4).
  - Time/servings deltas (e.g. "+5 min bake").
- `summariseChanges(diff, max)` producing short tags: `+1 banana`, `−50 g sugar`, `+ purée swirl`, `+ 80 g walnuts`.
- No imports from `services/` or `hooks/` (lib rule).
- Unit tests using `src/test/factories.ts`.

**Done when**
- Amount edits show as one "changed" row, not a remove plus an add.
- Tests cover renamed-but-similar ingredients, unit changes, null amounts, grouped ingredients, and an identical parent/child (empty diff).

---

## 3. Version tree page shell + Tree view (3a)

**Why:** replaces the current `VersionTreePage` with the refined indented tree and sets up the toggle the other views plug into.

**Scope**
- Header: back button, Tree / Timeline / Map segmented control, family title (Caprasimo 30px), subtitle "N versions · N cooks · started by X in Month".
- Toggle state reflected in the URL (e.g. `?view=timeline`) so back/forward and shared links keep the view.
- Tree view per 3a: root card on surface, children with rounded-elbow connectors (3px), rails for continuing siblings, nodes show emoji, title, `"prompt" · author`.
- Terracotta marks the ancestry path to the current recipe and the current node ("Here" tag, accent ring); other lines neutral-400.
- Generalise connectors for any depth (the mock hard-codes depth 2); keep horizontal scroll for deep chains (existing behaviour).
- Sticky primary CTA "Branch from \"<current title>\"" → `/recipe/:id/vary`.
- Keep existing loading, cloud-error and "no variations yet" states, restyled.

**Done when**
- Works on trees of depth 0 to 5+ and with mixed local/cloud recipes.
- Tapping a node navigates to that recipe.

---

## 4. Timeline view (3b subway map)

**Scope**
- Horizontal, sideways-scrolling SVG. Trunk = original line; each child subtree that diverges is a coloured line (accent, accent-400, accent-2, then cycle ramp steps).
- Stops ordered left to right by `createdAt`, so the x-axis reads as time. Lines labelled as directions (prompt-derived), not generations.
- Current recipe drawn as the filled terracotta stop.
- Tap a stop → bottom sheet: line name and stop number, title, `"prompt" · author · relative time`, change tags (ticket 2), **Open** and **Branch here** buttons.
- Layout algorithm in `src/lib` with tests (line assignment, collision-free y lanes, x by time with minimum spacing).

**Done when**
- Readable for families of 1 to ~30 versions; scroll position starts with the current stop in view.
- Stops are keyboard focusable buttons with accessible names.

---

## 5. Map view (3c radial) + "What changed" diff screen (3e)

**Map (3c)**
- Radial layout: root in centre (dark fill), dashed rings per generation, children spread by subtree size.
- Ancestry path to current recipe in terracotta (thicker stroke, tinted nodes); current node with accent ring.
- Bottom card: "Generation N · by X", title, **Open**.
- Expand button (maximise) for a full-screen/zoomable map. Note the design says best up to ~20 versions; define fallback (pinch-zoom, or prompt to switch to Timeline).
- Radial layout math in `src/lib` with tests.

**Diff screen (3e)**
- New route, e.g. `/recipe/:id/changes` (compares to parent; optional `?vs=<id>` for sibling compare from the carousel).
- Header "What changed", parent vs this-version pills, "<Author> asked: \"prompt\"" bubble (sage), Changes only / Side by side toggle.
- Ingredient rows: `~` changed (accent tint), `+` added (sage), `−` removed (neutral), old value struck through.
- Method with inline insert/delete highlights.
- Footer: **Cook parent** / **Cook this one**.
- **Entry points (to confirm):** "See what changed" link on any branch's recipe page near the lineage breadcrumb; **Compare** on carousel cards (ticket 6); optional link in the Timeline stop sheet.

**Done when**
- Root recipes (no parent) don't show the entry point.
- Side-by-side layout works at 320px width.

---

## 6. Sibling carousel on recipe page (3d)

**Scope**
- Replace `VariationChips` in `RecipeDetailPage` with a scroll-snap carousel: "N ways people took it" heading over the family name.
- Cards (290px, 32px radius, tinted backgrounds rotating accent-200 / accent-2-200 / surface): emoji, "N branches" tag, prompt as Caprasimo headline, `title · author`, change tags (ticket 2), **Compare** (→ 3e) and **Open**.
- Pagination dots; "The original" row linking to the root.
- Network icon in header links to the tree page.
- Decide which set it shows: the design shows children of the viewed recipe. Confirm whether, on a leaf, it should fall back to siblings.

**Done when**
- Swipe, keyboard and screen reader navigation all work; dots track the snapped card.
- `VariationChips` removed with no dead imports.

---

## 7. Review, docs and PR

- Run `ui-reviewer` subagent on all changed pages/components.
- `/preflight`: build, lint, tests, mobile-viewport smoke test, docs drift check.
- Update `docs/capabilities.md`, `docs/architecture.md`, `docs/decisions.md` (Organic adoption, three tree views, client-side diff), and `CHANGELOG.md`.
- Push feature branch, open draft PR.

---

## 8. Screens without an Organic design yet (for Claude Design)

These exist in the app but have no mockup in the export. They will get the theme from ticket 1 automatically but need proper designs. Already designed in other export files (Explore/Recipe, Social/Auth/Generate, Tab Bar) and so not listed: Library, Recipe detail, Profile, Auth modal, Recipe chat/generate, Bottom nav, dedup flow.

| Screen / component | File | Notes |
| --- | --- | --- |
| Recipe edit | `src/pages/RecipeEditPage.tsx` | In-place editing of ingredients/steps/metadata |
| Settings | `src/pages/SettingsPage.tsx` | Includes theme toggle; depends on dark-mode decision |
| Shared recipe (link import) | `src/pages/SharedRecipePage.tsx` | Both `/shared` and `/shared/:id` |
| Suggest a change modal | `src/components/recipe/SuggestChangeModal.tsx` | Collaboration flow |
| Suggestion thread | `src/components/recipe/SuggestionThread.tsx` | Replies, approve/decline |
| Notifications / Activity | `src/components/notifications/NotificationBell.tsx` | New Activity tab from the 5-slot nav has no screen design |
| Avatar editor | `src/components/profile/AvatarEditor.tsx` | |
| Tree intro (onboarding) | `src/components/recipe/TreeIntro.tsx` | Its diagram mirrors the old tree on purpose (decisions.md 2026-08-07); must be redrawn to match 3a |
| Lineage breadcrumb | `src/components/recipe/LineageBreadcrumb.tsx` | Only if the chosen recipe page layout keeps it |
| Nutrition panel, serving stepper, metadata pills | `src/components/recipe/*` | Check against 2a to 2c; redesign if not covered |
| Email link status, stranded identity notice | `src/components/auth/EmailLinkStatus.tsx`, `StrandedIdentityNotice.tsx` | Edge-case auth states |
| Confirm dialog, empty states, error states, loading skeletons | `src/components/ui/*` | System-level patterns, one sheet covers them |
| Dark mode | app-wide | Organic is light-only; needs a dark palette or a decision to drop dark mode |
| Desktop / wide layout | app-wide | Designs are 390px mobile; define tablet/desktop behaviour for the responsive web app |
