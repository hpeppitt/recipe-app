# Organic rebrand and branching redesign: design brief

Source: Claude Design project b9d99896-31b9-4af3-9db5-216586567a3d ("AI Recipe Branching App", 11 pages,
design system "Organic"). Files: App Prototype, App Spec, Branching (options 3a to 3e), Collaboration and
Account, Explore and Recipe, Loading Screen, Marketing Site, Recipe Parts and System, Social Auth and Generate,
Tab Bar, User Pill. Author's own ticket list from the design export is in this file below.
Tokens: `tokens.css` next to this file. Direction: warm cream ground, terracotta accent, sage second accent,
Caprasimo headings over Figtree body, over-rounded shapes and pills, left-aligned asymmetric layouts, no sharp
corners, no greys, photos washed. Bottom nav in the design has five slots: Explore, Saved, Create (raised
terracotta circle), Activity, You. Explore screen: "What's growing" heading, "Branching fast this week"
carousel of tinted cards (peach, sage) with a "+N this week" badge, "Most branched" ranked list with a number
disc (rank 1 filled terracotta), and a sage "What have you got?" call to action card.

## Decisions the author already made (from the design export)

- Version tree page gets a three-way toggle: Tree (3a), Timeline (3b), Map (3c).
- 3d sibling carousel replaces `VariationChips` on the recipe page.
- 3e "What changed" diff is an on-demand comparison; its entry points are decided in ticket 5.
- The whole app is rethemed to Organic now. Screens with no design yet are listed in ticket 8.
- Change tags and diffs are computed client-side from ingredients. No schema or Firestore changes.
- Delivery: feature branch plus draft PR (this repo's loop opens a normal PR per ticket instead).

Suggested order: 1, 2, 3, then (4, 5, 6 in parallel), then 7. Ticket 8 is design work, not code.

## Tickets as exported

### 1. Organic theme foundation
Why: every other ticket builds on the tokens.
- Map Organic tokens into the Tailwind `@theme` in `src/index.css`: bg/surface/text, accent and accent-2 100 to 900 ramps, neutral ramp, divider, shadows, radii.
- Repoint the existing semantic tokens (`primary-*`, `surface*`, `text-*`, `border*`) at Organic values so current screens pick up the theme without a rewrite of the 28 files that use them.
- Load Caprasimo (headings) and Figtree (body) from Google Fonts; set heading and body families.
- Restyle shared primitives: `Button` (pill, primary/secondary/ghost), `Chip`/tags, `SegmentedControl`, `Input`, `ConfirmDialog`, `Skeleton`, `EmptyState`, `TopBar`.
- Lucide icons at stroke-width 2.75 if not already used (check bundle size; tree-shaken `lucide-react`).
- Focus ring: 2px accent `:focus-visible`.
- OPEN QUESTION: Organic has no dark palette; the app supports light/dark/system (`useTheme`, about 53 `dark:` classes). (a) ship light-only and hide the toggle until a dark Organic exists, or (b) keep a temporary dark mapping.
- Done when: all screens render in Organic colours and type; AA contrast holds (accent text at body size uses accent-700); docs updated.

### 2. Branch diff logic (`src/lib/recipeDiff.ts`)
- Pure `diffRecipes(parent, child)`: ingredient changes matched by normalised name (`changed` amount/unit, `added`, `removed`); per-step method changes with word-level insert/delete spans; time and servings deltas.
- `summariseChanges(diff, max)` producing short tags such as `+1 banana`, `-50 g sugar`, `+ pure swirl`, `+ 80 g walnuts`.
- No imports from `services/` or `hooks/`. Unit tests with `src/test/factories.ts`.
- Done when: an amount edit is one "changed" row; tests cover renamed-but-similar ingredients, unit changes, null amounts, grouped ingredients, identical parent and child.

### 3. Version tree page shell and Tree view (3a)
- Header: back, Tree / Timeline / Map segmented control, family title (Caprasimo 30px), subtitle "N versions, N cooks, started by X in Month".
- Toggle in the URL (`?view=timeline`).
- Tree view: root card on surface, children with rounded-elbow connectors (3px), rails for continuing siblings, nodes show emoji, title, `"prompt" · author`. Terracotta marks the ancestry path and the current node ("Here" tag, accent ring); other lines neutral-400. Connectors for any depth; horizontal scroll for deep chains.
- Sticky primary CTA `Branch from "<current title>"` to `/recipe/:id/vary`.
- Keep loading, cloud-error and "no variations yet" states, restyled.
- Done when: works at depth 0 to 5+, mixed local and cloud; tapping a node opens that recipe.

### 4. Timeline view (3b subway map)
- Horizontal scrolling SVG. Trunk is the original line; each diverging child subtree is a coloured line (accent, accent-400, accent-2, then cycle ramp steps). Stops ordered by `createdAt`; lines labelled as directions, not generations. Current recipe is the filled terracotta stop.
- Tap a stop for a bottom sheet: line name and stop number, title, `"prompt" · author · relative time`, change tags (ticket 2), Open and Branch here.
- Layout algorithm in `src/lib` with tests (line assignment, collision-free lanes, x by time with minimum spacing).
- Done when: readable for 1 to about 30 versions; scroll starts with the current stop in view; stops are keyboard focusable buttons with accessible names.

### 5. Map view (3c radial) and "What changed" diff screen (3e)
- Map: root in centre (dark fill), dashed rings per generation, children spread by subtree size; ancestry path in terracotta (thicker); current node with accent ring; bottom card "Generation N · by X", title, Open; expand button for full screen or zoom; design says best up to about 20 versions, so define a fallback (pinch-zoom or prompt to switch to Timeline). Radial math in `src/lib` with tests.
- Diff screen: new route `/recipe/:id/changes` (vs parent; optional `?vs=<id>`). Header "What changed", parent vs this-version pills, "<Author> asked: prompt" bubble (sage), Changes only / Side by side toggle. Ingredient rows: `~` changed (accent tint), `+` added (sage), `-` removed (neutral), old value struck through. Method with inline insert/delete highlights. Footer Cook parent / Cook this one.
- Entry points to confirm: "See what changed" link on a branch's recipe page near the lineage breadcrumb; Compare on carousel cards; optional link in the Timeline sheet.
- Done when: root recipes show no entry point; side by side works at 320px.

### 6. Sibling carousel on the recipe page (3d)
- Replace `VariationChips` in `RecipeDetailPage` with a scroll-snap carousel: "N ways people took it" over the family name.
- Cards (290px, 32px radius, tints rotating accent-200 / accent-2-200 / surface): emoji, "N branches" tag, prompt as Caprasimo headline, `title · author`, change tags, Compare (to 3e) and Open. Pagination dots; "The original" row linking to the root. Network icon in the header links to the tree page.
- Confirm which set it shows: the design shows children of the viewed recipe; on a leaf, fall back to siblings?
- Done when: swipe, keyboard and screen reader work; dots track the card; `VariationChips` removed with no dead imports.

### 7. Review, docs and PR
- `ui-reviewer` on changed pages. `/preflight`. Update `docs/capabilities.md`, `docs/architecture.md`, `docs/decisions.md` (Organic adoption, three tree views, client-side diff) and `CHANGELOG.md`.

### 8. Screens without an Organic design yet (follow-up in Claude Design, not code)
Recipe edit, Settings (theme toggle, depends on the dark-mode decision), Shared recipe (`/shared` and `/shared/:id`), Suggest a change modal, Suggestion thread, Notifications and the Activity tab (new in the 5-slot nav, no screen design), Avatar editor, Tree intro (its diagram must be redrawn to match 3a; decisions.md 2026-08-07), Lineage breadcrumb, Nutrition panel / serving stepper / metadata pills (check against 2a to 2c), Email link status and stranded identity notice, confirm dialog / empty / error / loading states, dark mode, and desktop or wide layout (designs are 390px mobile). These get the theme from ticket 1 automatically.

## Not in the export but in the design project

`Marketing Site.dc.html` is a marketing website mockup (features, sign-up links). It is not an app screen.
