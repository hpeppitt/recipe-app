# Recipe Lab — full product spec

Brief for building the app from scratch. Covers every screen, behaviour and decision made in the design canvases, including the review comments that overrode earlier picks. Where a comment and an older pick disagree, the comment wins and is marked **[decided by comment]**.

## Overrides (author, 2026-10-20)

Where this spec and a shipped author decision disagree, the shipped decision stands. This list wins over the text below.

- Dark theme stays 20a Warm night, not 20b (2.1).
- No Compare on carousel cards; a leaf recipe shows no carousel (6.1, 3d).
- Nutrition stays per serving with tiles, no Total toggle or bars (6.1).
- The tree intro stays the inline TreeIntro card with its current timing, not a 16a sheet on the tree page (4, 7.1).
- Back on recipe pages follows history, with the parent only for deep links (4).
- Timeline stays time-scaled with its current lane spacing (7.3).
- Routes keep their current names: `/new` is the Create tab, `/create` the chat, `/profile/:uid`, `/recipe/:id/suggestion/:sid`, avatar editor as a sheet (4).
- Sign-in stays email link only. No Google, Apple, password, invite gate (5d), guest recipes (5e count) or stranded notice (15c). Guests hold device bookmarks only (10).
- v1 is emoji only. Stored photos are allowed from the phase that adds them (decision 3 reversed 2026-10-20), starting with the Phase 1 cook photo.
- v1 excludes: Pantry sheet and Most branched (5), profile extras and Forest (9.1), dedup 7a to 7c polish, family-ordered chips, Grow opening What changed (8), weigh-liquids toggle (9.4), import from link (9.6). These are on the roadmap.
- Delete version reparenting (6.1) and Related family / Move into family (7d) are in v1 but design-first.

Design references (in this project): `App Spec.dc.html` (live spec), `App Prototype.dc.html` (clickable prototype), option canvases `Explore and Recipe`, `Branching`, `Social Auth and Generate`, `Collaboration and Account`, `Recipe Parts and System`, `Revision and Roadmap`, `Roadmap`, plus `Tab Bar`, `User Pill`, `Loading Screen`, `Marketing Site`. Option ids (1a, 3b, 17b…) refer to those canvases. Target repo: `hpeppitt/recipe-app` (React, Tailwind `@theme` tokens in `src/index.css`, Firestore).

---

## 1. Product

Recipe Lab is a recipe app where every recipe is a tree. An **original** can be **branched**: one sentence of change ("less sugar", "vegan, no eggs") and the AI writes a new version. The original never changes. Everyone's versions of a dish live in one **family**, with lineage, diffs and credit.

Principles
- Originals never change. Edits apply to one version; branches below keep their own copy. Changing someone else's recipe is a **suggestion** or a **branch**, never an edit.
- Search doubles as the generate prompt. When nothing matches, the same words become a new recipe. Never a dead end.
- Branching is the unit of credit. Branch counts, "N ways people took it", the family tree. After v1 the signal shifts to **cooks** (section 12).
- Sign-in only when needed. Browsing and reading never ask. Save, branch, suggest, follow trigger a contextual sheet; the pending action runs after sign-in.
- Mobile first at 390px; desktop two-pane from 1024px.

Vocabulary (use in UI copy): original, branch, family, version, generation, "What changed", suggest, "Grow" (the branch CTA verb), "Make it yours" (shared-page branch CTA).

---

## 2. Design system: Organic

Bound system: `_ds/organic-61798556-ec1f-456b-bc98-0c3fb5de5973/styles.css`. Map its tokens into Tailwind `@theme` (ticket 1). Never hard-code values the tokens carry.

- Ground `--color-bg` #f5ead8, surface #ebddc5, text #201e1d. Accent (terracotta) #c67139, accent-2 (sage) #7a8a5e. Each role has a 100–900 OKLCH ramp (`--color-accent-200`, `--color-accent-2-700`, `--color-neutral-300`…). Light steps for tinted fills, 500 base, 700–900 for text on tints and pressed states.
- Type: Caprasimo headings (`--font-heading`), Figtree body (`--font-body`). Google Fonts.
- Radii: 16px base growing to pills (`border-radius: 999px`) for buttons, inputs, chips; 24–36px for cards and sheets; organic blob radius `58% 42% 52% 48% / 46% 56% 44% 54%` for emoji avatars.
- Shadows `--shadow-sm/md/lg`. Icons: Lucide, stroke-width 2.75.
- States: hover tint and pressed one ramp step past base; `:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px }`; disabled 45% opacity. Accent on ground is 3:1 only, so body-size accent text uses `accent-700`.
- Components: `.btn` (primary / secondary / ghost / icon / block), `.tag` (accent / accent-2 / neutral / outline), `.field` + `.input`, `.seg` + `.seg-opt` segmented control, `.card`, `.dialog`, `.washed` photo wrapper (desaturated, lifted). Avoid `.hr`; use whitespace.
- Imagery: photos optional, always in `.washed` with rounded corners. Fallback everywhere is the recipe's **emoji** on a tinted circle or blob. Tints rotate accent-200, accent-2-200, surface.
- Layout: left-aligned, asymmetric; whitespace on the right. Soft circles off-canvas as decoration on empty/auth/cover screens.

### 2.1 Dark theme **[decided by comment: 20b "Olive dusk · sage ground"]**
Set on `[data-theme="dark"]`. Base roles change; every 100–900 ramp is reversed (step N → step 10−N) so "tint fill + 800 text" pairs keep working. Neutral 100/200 are set by hand so input fills sit just above the ground.

| Token | Light | Dark (20b) |
| --- | --- | --- |
| `--color-bg` | #f5ead8 | #181b14 |
| `--color-surface` | #ebddc5 | #242a1e |
| `--color-text` | #201e1d | #eef0e1 |
| muted text | neutral-700 | #a9b099 |
| `--color-accent` | #c67139 | #e38a50 |
| `--color-accent-2` | #7a8a5e | #b9c99c |
| accent-900 / accent-200 | ramp | #46291a / #ffd6bd |
| `--color-divider` | ink 16% | cream 14% |
| `--shadow-*` | ink 14–22% | black 40–55% |

Accent is lifted so it reaches 4.5:1 for body text on the dark ground. (The App Spec table lists 20a "warm night" values; 20b supersedes it.)

### 2.2 Shared primitives
- **Tab Bar** (`Tab Bar.dc.html`): 78px, 5 slots, bg ground, top hairline divider. Icons 30px circle; **Create** is a 44px filled accent circle, kept in line (not raised). Active label accent-700, others neutral-700. Punch list: Create gets an accent-200 pill at rest so it reads as the primary verb. **Activity tab carries an unread count bubble** [decided by comment]. Slots in v1: Explore (compass), Saved (bookmark), Create (plus), Activity (bell), You (user-round). Phase 2: Saved → **Kitchen** (cooking-pot) [decided by comment: 24a].
- **User Pill** (`User Pill.dc.html`): `.tag.tag-neutral` with a 20px initial circle (ramp colour per user) and the first name. Use wherever an author is named inline: dedup matches, "Branching from", related family, carousel cards, search rows **[decided by comment: use in all 7a–7d screens]**.
- **Bottom sheet**: 36px top radius, 44×5 grabber (neutral-400), backdrop neutral-900 at 40–45%, tap backdrop to close.
- **Emoji blob**: 72–76px organic radius, accent-200 (or rotating tint).
- **Hero** (branch pages): 230px photo or emoji on accent-200, floating 44px circular controls.

---

## 3. Data model

Client-side computation wherever possible; no schema change was required for v1 branching work. Fields below are what the UI reads.

**Recipe**
- `id`, `title`, `emoji`, `description`, `photoUrl?` (washed), `authorId`, `createdAt`
- `parentId | null` (null = original/root), `prompt?` (the sentence that made this branch), `rootId` (denormalised for family queries)
- `time`, `difficulty` (Easy / Medium / Hard), `servings` + `servingUnit` (slices, people…), `tags[]` (Vegetarian…)
- `ingredients[]`: `{ amount, unit, name, group? }`. Name before the first comma is the match key for diffs.
- `steps[]`: strings
- `nutrition?` per serving: kcal, carbs g, fat g, protein g (estimated from ingredients; recomputed per branch)
- `relatedFamilyId?` (7d cousin link), `importedFrom?` (URL, Phase 4), `via?` (importer credit)

**User**: `id`, `name`, `avatar` (`{ kind: 'emoji'|'initials'|'photo', emoji?, color, url? }`), `bio`, `location`, `since`, tags, `followers`, `following`, `isGuest`, `signInMethods[]`

**Suggestion**: `id`, `recipeId`, `authorId`, `edits[]` (`{ kind: 'ingredient'|'step'|'general', index?, from, to, why? }`), `status` (open / applied / declined / branched), `replies[]`, `createdAt`

**Activity event**: `type` (branch / suggestion / reply / follow / save / applied), `actorId`, `recipeId?`, `payload` (e.g. the one-line diff "100 g sugar → 80 g"), `read`

**Save**: `userId`, `recipeId`, `collectionId?` (Phase 2)

**Derived (`src/lib`, pure, unit-tested)**
- `diffRecipes(a, b)` → ingredient `changed` / `added` / `removed` matched by normalised name; per-step word-level insert/delete spans; time and servings deltas. Amount edits are one `~` row, not remove + add. Identical → empty diff.
- `summariseChanges(diff, max)` → short tags: `+1 banana`, `−50 g sugar`, `+ 80 g walnuts`.
- Tree layout (3a), timeline lanes (3b), radial layout (3c): all in `src/lib` with tests.
- Scaling: amounts × (servings / base servings); formatted sensibly (fractions for small counts).
- Volume → weight (Settings): tbsp 15 g, tsp 5 g, ml 1 g, l 1000 g as the default density-1 estimate; shown with an "≈" and the original volume on long-press/tooltip.

---

## 4. Navigation and routes

| Route | Screen |
| --- | --- |
| `/` | Explore (1b) |
| `/search?q=` | Search (1a); pantry sheet (1c) opens over it |
| `/recipe/:id` | Recipe page (2a for originals; 2a + 2b hero for branches) |
| `/recipe/:id/changes?vs=` | What changed (2c / 3e); default vs parent |
| `/recipe/:id/tree?view=tree|timeline|map` | Family (3a / 3b / 3c); view in URL |
| `/recipe/:id/vary` | Branch composer (6b) |
| `/recipe/:id/edit` | Edit in place (8a), author only |
| `/recipe/:id/suggestions/:sid` | Suggestion thread (10a) |
| `/create` | Create tab (6c) |
| `/chat` | Generate chat (6a) |
| `/activity` | Activity (11a) |
| `/saved` | Saved (v1) → `/kitchen` (Phase 2) |
| `/profile`, `/u/:name` | Profile (4a); `/u/:name/forest` (4b) |
| `/settings` | Settings (13a); `/settings/avatar` (14b) |
| `/shared/:id` | Shared recipe (12b) |
| `/shared` | Import from link (12c) |
| `/auth/email`, `/auth/check-inbox` | Email sign-in (5b), inbox (5c) |

Back behaviour on recipe pages goes **up the family, not through history**: branch → parent → … → original → the list you came from. Changes and Tree go back to their recipe.

First run: no questionnaire in v1. On the first branch a user opens, show the 16b inline sage card explaining branches, once per device. (28a questionnaire is a Phase 3 decision, see §12.)

---

## 5. Discover

### 5.1 Explore (1b) — `/`
- Header: time-of-day line from the device clock ("Tuesday morning / lunch / evening / late"), Caprasimo 30px "What's cooking", 44px search button (neutral-100, shadow-sm).
- Sections: **Branching fast this week** (horizontal scroll-snap, 200px square tiles, 30px radius); **Most branched** (top 3 rows; rank 1 circle filled accent, others surface); **Pantry entry card** (accent-2-200) opening the 1c sheet.
- Tile: photo in `.washed` when present, else emoji at 76px on a rotating tint. Branch count sits in the meta line, not a badge (punch list); a badge is reserved for "new this week".
- Loading: 19a skeletons. Offline: inline banner over cached sections.
- Phase 3 (23a): sections become "Cooked this week", "Most cooked, [this month ▾]", plus a **Tonight** card (accent-200) after 4 pm when a recipe was planned, saved for tonight or opened in the last hour.

### 5.2 Search (1a) — `/search?q=`
- One pill searches titles and ingredients across originals and branches. Chips: All, Under 30 min, Easy, Branches, Pantry (opens 1c).
- Result rows show the emoji, title, User Pill, and for branches the family label ("Banana bread variation").
- **Write it** sends the query to Chat (6a) as the prompt.
- Empty result: accent-100 card that turns the query into a new recipe.

### 5.3 Pantry sheet (1c)
- Opened from the Explore card and the Pantry chip. Ingredient chips; recipes must use **every** listed ingredient. Count in the CTA updates live ("Show 4 recipes"). Secondary action writes a new recipe with the same constraints.

---

## 6. Recipe

### 6.1 Recipe page (2a; branches add 2b hero) — `/recipe/:id`
Order: title + emoji blob (76px), description (originals) **or** lineage strip (branches), metadata pills, ingredients with servings stepper, method, nutrition (collapsed), suggestions section (10b), sibling carousel (3d), footer.

- **Title** capped at 2 lines with ellipsis so the family label never wraps under it; full title appears in the hero on scroll (punch list).
- **Family label** on branches: bold accent-2-700 "Banana bread variation" under the title.
- **Branch hero (2b)**: 230px photo or emoji on accent-200, floating 44px back / save / menu controls.
- **Lineage (17b) [decided by comment]**: a one-line **version pill** on surface: generation dots (ancestors neutral-500, current accent), "**Generation 3** · from Less sugar", and a **Path** button. Path opens a popover (30px radius, shadow-lg) listing each ancestor with its prompt and author; tapping navigates; each row has **Compare**, opening What changed against *that* ancestor, not only the parent. The sage prompt sentence ("Hana asked for *"extra banana"* on Ola's Less sugar · See what changed") sits under the pill. (The prototype still shows the 17a breadcrumb strip; build 17b.)
- **Metadata pills (18a + comment)**: time (clock), difficulty (gauge), diet tag (leaf), kcal (flame, accent tag), **plus macro pills per serving with icons**: carbs (wheat), fat (droplet), protein (drumstick) [decided by comment].
- **Servings stepper (18a)**: inline in the Ingredients header, −/+ 34px circles on a surface pill. Scaled amounts turn accent-700 and a strip appears: "Scaled ×1.5 from 8. Reset".
- **Ingredients**: tap to tick off while cooking (sage check). Ticking the first ingredient offers **Start cooking** (cook mode: keep screen awake, steps one at a time; no voice) — Phase 1.
- **Nutrition panel [decided by comment]**: collapsed surface card "Nutrition per slice ▾". Expanded: a **Per serving / Total** segmented toggle inside the dropdown, then **bars** (18b style) for Calories, Carbs, Fat, Protein showing share of a 2,000 kcal day (reference 2000 kcal / 260 g / 70 g / 50 g; Total multiplies by current servings, capped at 100%). Footnote: "Estimated from ingredients. Changes with each branch."
- **Made-by row** (Phase 1, 25b): under the pills, neutral-100: avatars, "**Made 31 times** · 27 would make again · Notes".
- **Sibling carousel (3d)**: heading "N ways people took it" over the family name. Shows the children of this recipe; on a leaf, its siblings ("Other ways from here"). Cards 290px, 32px radius, tinted backgrounds rotating; emoji, "N branches" tag, prompt as Caprasimo headline, title · User Pill, change tags from `summariseChanges`, **Compare** (→ What changed vs this recipe) and **Open**. Pagination dots track the snapped card; swipe, keyboard and screen-reader navigable. "The original" row links to root. Network icon in header opens the tree.
- **Footer**: three actions — **Suggest · Cooked · Branch this recipe** (Cooked ships in Phase 1; reserve the slot). On your own recipe, Suggest becomes **Edit**. Save, Branch, Suggest, Follow open the 5a sheet when signed out.
- Menu (ellipsis): Share, Add to shopping list (Phase 2), Delete version (author; 19a dialog "Its 3 branches stay, and move up to Less sugar").

### 6.2 What changed (2c / 3e) — `/recipe/:id/changes?vs=`
- Header "What changed", parent-vs-this pills, sage bubble "<Author> asked: "prompt"".
- Modes: **Changes only / Side by side** (two `minmax(0,1fr)` columns, works at 320px).
- Ingredient rows: `~` changed on accent-100 with old value struck at right, `+` added on accent-2-100, `−` removed on neutral-100 struck. Method: only changed steps, old text struck above new, word-level highlights.
- Footer: **Cook parent / Cook this one**.
- Entry points: version-pill Compare, carousel Compare, Timeline/Map stop cards. Root recipes show no entry point.

### 6.3 Edit in place (8a) — `/recipe/:id/edit`, author only
- Header: Cancel · "Editing" · (Save in footer). Title gets a dashed accent-400 underline; emoji blob gets a pencil badge (opens emoji picker). Pills become pickers with chevrons (time, difficulty, servings).
- Ingredient rows: drag handle, 72px amount pill, name pill (neutral-100), remove ×; focused field gets the accent ring; dashed "Add ingredient". Method uses the same row pattern (collapsed by default, "6 steps ▾").
- Footer: "3 branches below this keep their own copy." + **Save changes**.

### 6.4 Suggest mode (9b) **[decided by comment: multiple changes before sending]**
- Entered from footer Suggest on someone else's recipe. The page becomes the form: a sage banner (accent-2-700) replaces the header: "Tap any line to suggest a change · Cancel".
- Tapping an ingredient opens an inline editor (accent-100 card, 2px accent ring): old amount struck → new amount pill → name, plus "Why? (optional)". **Several lines can be edited before sending**; the footer counts "N changes to suggest" and the CTA is **Send to <Author>**.
- Also allow suggesting on a **method step** with the same inline editor, and a **General note** row at the end of the list for suggestions that aren't one line (punch list).
- Result is a structured edit the author can apply in one tap.

### 6.5 Suggestions on the recipe page (10b) + thread (10a) **[decided by comment]**
- 10b is the main surface: a **Suggestions** section under the method, visible to everyone ("1 open · 2 closed"). Open suggestion card (shadow-md): avatar, name, Open tag, diff row on accent-100, note, "2 replies" link, and for the author **Decline · Apply · ⋯ (Keep as branch)**. Each suggestion also has a **chat/reply action** that routes to the 10a thread. Closed suggestions collapse to one line with an Applied (accent-2) / Declined (neutral) / Branched (accent-2) tag.
- 10a thread — `/recipe/:id/suggestions/:sid`: proposed edit pinned at top as a diff row; chat bubbles (suggester left neutral-100, author right accent-2-200); reply composer; footer **Decline · Keep as branch · Apply**. Apply edits the recipe; Decline notifies; Keep as branch creates a branch credited to the suggester.

---

## 7. Family

### 7.1 Tree page shell — `/recipe/:id/tree?view=`
- Header: back, **Tree / Timeline / Map** segmented control (state in URL), family title (Caprasimo 28–30px), subtitle "N versions · N cooks · started by X in Month".
- Sticky CTA: **Branch from "<current title>"** → `/recipe/:id/vary`.
- First visit shows the **16a intro sheet** once per device: a scaled-down 3a diagram (14px elbows, 36px indent), "Got it" or backdrop dismisses. The intro must mirror the real tree.
- Loading, cloud-error and "no variations yet" states use 19a patterns.

### 7.2 Tree (3a)
- Indented tree. Root card on surface; nodes show emoji, title, `"prompt" · author`. Connectors 3px, 16px elbow radius, 40px per depth; rails continue for any ancestor with later siblings (generalises to any depth; horizontal scroll for deep chains).
- Ancestry path to the current recipe in accent; current node accent-100 fill, 2px ring, "Here" tag. Other lines neutral-400.
- Node count slot: branch count now; cook count + sage "Most cooked" trophy in Phase 3 (31a).
- Tap a node → that recipe.

### 7.3 Timeline (3b)
- Horizontal SVG, x by `createdAt` order (66px spacing), lanes 60px apart. First child continues its parent's lane; other children open a new lane named after their prompt. Lane colours cycle neutral-700, accent, accent-2-600, accent-400, accent-2-400. Ancestry strokes 7px, others 5px. Current stop filled accent.
- First open: lane names pinned at the left for 2 s, then collapse to dots (punch list).
- Tap a stop (keyboard-focusable button, accessible name) → selection ring and a card below: generation, author, change tags, **Open**, **Branch here**. Scroll starts with the current stop in view. Readable 1–~30 versions.

### 7.4 Map (3c)
- Radial: root filled ink at centre, dashed neutral-400 rings 78px per generation, angles split by leaf count. Path nodes accent-200 with accent stroke; current node dashed outer ring. Bottom card "Generation N · by X", title, **Open**. Expand button for full-screen zoom.
- Over ~20 versions: banner suggesting Timeline.

---

## 8. Create and branch

### 8.1 Create tab (6c) — `/create`
- Fill-in-the-sentence: "Write me a *cosy* *weeknight* dish with *mushrooms*." Each underlined word cycles through three options on tap. **Write it** builds the prompt text and hands over to Chat. "My own way" goes to Search.
- Phase 3 (28b): bold terms from the taste profile ("no peanuts", "under 30 min"), tap to drop for this recipe. Phase 4 (30a): two import tiles beneath — Paste a link, Snap a page.

### 8.2 Chat (6a) — `/chat`
- Header "New recipe". Recipe is a collapsible card at the top so a long recipe doesn't push the conversation off; refinement chips above the composer (Make it spicier, Fewer dishes, No dairy…). Save creates an original (sign-in sheet if needed). While the card is collapsed, pin a compact **Save** in the composer row (punch list).
- **Dedup (7a–7d), all with User Pills [decided by comment]**:
  - 7a: after a short typing pause, a sage card above the keyboard: "**Banana bread** is already growing here · 7 versions by 5 cooks", up to 3 matches each with emoji, title, User Pill, meta, **Branch**. Send still works.
  - 7b: on send with a strong match (same dish name or near-identical ingredients): sheet "Someone's already baked this", matches tagged Same / Similar, **Branch Banana bread** / "Mine's different, write a new one".
  - 7c: branching from a dedup match uses the 6b composer with "Branching from 🍞 Banana bread [Hana] · Change"; chips split into **Nobody's tried these yet** (sage, sprout icon) and **Already a branch, open it instead** (neutral, arrow). Free-text "Or describe your change…". CTA **Grow this branch**.
  - 7d: wrote it anyway → new original with a "New original" tag and a **Related family** card shown on both recipes; "Is this really a version of Banana bread? **Move it into that family**. You stay the author."

### 8.3 Branch composer (6b) — `/recipe/:id/vary`
- Close ×, "Branching from" card, one instruction field (accent ring), quick-change chips that append to it. Chips ordered by what this family was branched for before, falling back to the global set (punch list). Line stating the parent is untouched.
- **Grow** shows a skeleton card while generating, then opens What changed for the new branch.

---

## 9. People and activity

### 9.1 Profile (4a) + Forest (4b) **[decided by comment]**
- `/profile`, `/u/:name`. Header: back, **trees icon → Forest view**, share. Blob avatar (84px), name, "Cooking since March · Bristol", bio, tags, Follow + bell. Four stat tiles: Started / Grew / Followers / Saves (Phase 1: Saves → **Cooked**). Tabs **Originals N / Branches N / Collabs N** over a tile grid (4c tiles: photo or emoji on tint, branch tag).
- Own profile: Edit (→ settings/avatar). Guest: 5e "keep my recipes" card. Signed out: "You're browsing".
- **Forest (4b)** `/u/:name/forest`: "Planted **12** recipes. **31** branches have grown from them." Legend (Hana's accent / other cooks' neutral-400). Two-column tiles, each a whole family drawn small as an SVG with the person's nodes in accent, emoji + title + meta. Visual approved; copy ("planted", "forest") is provisional.

### 9.2 Activity (11a) **[decided by comment]** — `/activity`
- Chronological feed, newest first, "Mark all read". Filter chips All / Branches / Suggestions / Follows. Day headers. Row: 40px avatar with a 20px type badge (branch sage, suggestion terracotta, follow/save neutral), "**Sami** suggested a change to **Less sugar**", sub-line states the change in one line from the payload ("Ola: 100 g sugar → 80 g") so no tap is needed to triage (punch list), unread dot accent.
- **Tab bar badge**: unread count bubble on the Activity tab.
- Replaces the NotificationBell dropdown.

### 9.3 Saved — `/saved` (v1)
- Grid of saved tiles. Empty state per 19a. Replaced by Kitchen in Phase 2 (§12).

### 9.4 Settings (13a) **[+ comment]** — `/settings`
- Grouped surface cards. **Account**: avatar + name + "email · Google" → edit; Sign-in methods (count). **Appearance**: Light / Dark / System seg; **Units** Metric / US seg; **Weigh liquids and volumes** toggle — show tablespoons, teaspoons, cups and ml as estimated grams for people who weigh everything [decided by comment]. **Notify me when**: someone branches my recipe, I get a suggestion, someone follows me (44×26 toggles, accent-2-600 on / neutral-400 off). Export my recipes. Sign out (accent-700). Delete account below.

### 9.5 Avatar editor (14b) **[decided by comment]** — `/settings/avatar`
- Full screen: Cancel · Save. 170px blob preview with a food emoji (84px). Six ramp swatches (36px) for the blob colour. 5-column grid of food emoji (🥐 🍞 🍳 🍜 🥟 🍋 🧄 🌶️ 🥑 🍅 🧀 🍰 🥕 🍄 🫖). Footer: **Use a photo** (upload / take photo, circular crop) · **Initials**. Default avatar is initials on a ramp colour; nobody is forced to upload.

### 9.6 Shared recipe (12b) + import (12c) **[decided by comment]**
- `/shared/:id`: the normal recipe page with a slim surface banner at top: avatar, "Shared by **Ola**", **Get the app**. Lineage sentence with "See all 7 versions". Footer **Save · Make it yours** (branch); both trigger the 5a sheet when signed out.
- `/shared`: "Add from a link": URL pill, parsed preview card (emoji, title, "9 ingredients · 6 steps · 35 min"), dedup notice reusing 7b ("There's already a Shakshuka family with 9 versions"), **Add to Shakshuka family** / "Save as a new original".

---

## 10. Sign-in (5a–5e, 15b, 15c)

- **5a contextual sheet**: triggered by first save, branch, suggest or follow. Headline names the action ("Sign in to branch this recipe", "…to save this recipe", "…to follow Ola"). Google, Apple, Email buttons; "Continue as guest" text link with the trade-off in one line. After sign-in the pending action runs automatically.
- **5b email**: Magic link / Password segmented control, remembered per device. **5c check your inbox**: says where the link returns you.
- **5d invite gate** (sage-700 full screen): only at first sign-up, never for browsers; invite deep link pre-fills the code and names the inviter.
- **5e guest profile**: warning card above recipes counting what's at risk; "Keep my recipes" → create account and migrate.
- **15b** (sheet over the landing page): "Finish signing in here" when a link is opened on another device (confirm email, Sign in); expired link and "Signing you in…" are the same sheet with different copy. The page underneath stays put.
- **15c stranded identity notice**: on the profile after signing in to a different account than the guest session: accent-100 card "3 recipes from your guest session", chips naming them, **Not now / Move to my account**.

---

## 11. System patterns (19a), loading, desktop

- **Confirm dialog**: centred `.dialog` 32px radius, Caprasimo 22px headline, body neutral-800, Keep it (secondary) · destructive primary in accent-700.
- **Empty state**: off-canvas circle (accent-2-200 or accent-200), 84px blob icon, Caprasimo 26px headline, one line, one action, bottom-aligned for thumb reach ("Nothing saved yet · Tap the bookmark on any recipe and it'll wait for you here · Explore recipes").
- **Error**: same pattern with "Try again" secondary ("Couldn't load the family · You're offline. Recipes on this device still open").
- **Skeleton**: pill and card shapes pulsing between neutral-200 and 300.
- **Toasts**: short confirmations ("Sent 2 changes to Ola", "Saved").
- **Loading screen** (`Loading Screen.dc.html`): a tree grows from soil over ~7 s (trunk, four branches, leaves, then eight fruits — pantry emoji or terracotta fruit); caption cycles "Turning the soil → Putting down roots → Branching out → Ripening" with a 160px accent progress bar. Use on cold start and long generation waits; loop while waiting.
- **Desktop ≥1024px (21a + 21b modal) [decided by comment]**: tab bar becomes a 220px left rail ("Recipe Lab" wordmark, pill nav items). Middle pane 420px list (search pill + cards) for Explore / Saved / Activity; right pane the recipe with ingredients and method side by side (1fr / 1.4fr). Selecting in the list replaces the right pane without navigation. A **Family** button in the recipe actions opens the 21b family panel as a right-side modal pull-out (420px, surface, Tree / Timeline / Map seg, mini tree, "Branch from this one"; backdrop closes). Phase 2: rail gets Kitchen and the middle pane shows list / pantry / plan.
- Below 1024px the app stays the mobile column. All text boxes reflow; no fixed heights on text containers.
- Accessibility: 44px minimum hit targets, 4.5:1 body text, focus-visible rings, carousel/timeline/map nodes are buttons with names, `prefers-reduced-motion` disables the loading tree sway and skeleton pulse.

---

## 12. Post-v1 features (designed, sequenced in `Roadmap.dc.html`)

Theme: v1 measures recipes by how often they are *branched*; after v1 the app measures how often they are *cooked*. "I made this" is the source of that signal.

**Phase 0 · Ship v1 (2 wks)** — punch list items already folded into §5–§11: 16b first-run card, 9b General note + step suggestions, chat pinned Save, 2-line title cap, Activity rows state the change, Explore time-of-day headline and tile badge.

**Phase 1 · The cooking signal (4 wks)**
- **25a "I made this" sheet**: offered on ticking the last method step or from footer **Cooked**. "You made it. How did it go?" Two buttons are the vote: **Would make again** (sage-700) / **Needs a tweak** (outline). Optional photo (96px dashed accent-400 tile; becomes the recipe photo, washed and credited, if the author has none) and note. Sage row offers to turn the note into a branch ("50 min, less sugar" · **Grow**, pre-filling 6b). "Add the leftovers to the pantry · No thanks". **Save to my cook log**. No stars anywhere.
- **25b Cook log** (`/kitchen/log`, in You until Kitchen exists): "14 cooks · 9 recipes · 3 branches grew from notes"; cards with emoji, title, when · vote, italic note, tag Branched / Again / Tweak. Public **Made N times** row on the recipe page; Notes shows other cooks' notes.
- Footer Suggest · Cooked · Branch; Cook mode toggle; Profile stat Cooked replaces Saves.

**Phase 2 · Kitchen (5 wks)** — **24a Kitchen replaces Saved [decided by comment]**
- `/kitchen`: title, household avatars ("Shared with Ola and Sami"), four tiles: **Shopping list** (accent-200), **Pantry** (accent-2-200), **This week** (stub), **Cook log**; **Saved** row of 84px tiles below. One-time tip "Saved lives in Kitchen now".
- **26a Shopping list**: "11 to buy · 5 already in the pantry"; source chips per recipe (emoji + label ×count, removable, +); items grouped by aisle (Produce, Dairy, Pantry), each line: check circle (sage when done), name (struck when done), amount, source emoji(s). Amounts summed when two recipes want the same thing. Pantry notice (accent-2-100). Footer **Shop mode** (large type, checkbox-only) · **Bought it all** (moves everything to the pantry). Share icon.
- **26b Add from a family**: sheet "Which banana bread are you shopping for?" with radio rows (title, sub, what the branch changes), Makes stepper, **Add 6 things to the list** (excludes pantry items). Shown only from tree, timeline, Explore tiles; from a recipe page the branch is known. Add from a recipe uses the current scale.
- **27a Collections**: after a one-tap save, optional sheet "Saved. Add to a collection?" with collection rows (2×2 emoji thumbnail, name, "7 recipes · shared", radio) + New collection; auto-dismisses after 4 s. Collections listed in Kitchen.
- Desktop rail gets Kitchen.

**Phase 3 · Personal and shared (6 wks)**
- **28b Learned taste profile** (`/settings/taste`): "Learned from 14 cooks and 6 branches. Tap anything to correct it." Cards: Always avoid (you told us; removable chips), You cook a lot of, You tend to change. Avoids are asked inline the first time a recipe is generated. Create tab shows bold profile terms. (Alternative 28a three-question first run: cuisines, avoids, how you cook; recommended against.)
- **29a Household pantry** (`/kitchen/pantry`): household pill with avatars; "Add things, or paste a receipt…" with camera; ageing nudge (accent-100: "Bananas and spinach are a week old. Find something to use them"); groups Fresh / Cupboard of pills each carrying the adder's avatar (aged items tinted accent-100); **Cook from what's here** (sage-700) = 1c with the full pantry pre-filled. Invite reuses 5a with "Join Hana's kitchen".
- **23a Explore by cooking** (§5.1), **31a Cook counts on the tree**: count per node, sage trophy "Most cooked" on the leader; Explore tiles and search rows open the most-cooked branch when it has ≥3× the original's cooks in the last 90 days. Original stays at the top: lineage, not popularity.
- 6b chips learn from the family.

**Phase 4 · Bring recipes in, send them out (5 wks)**
- **30a Import entry** in Create: Paste a link (sage tile) / Snap a page (accent tile); share-sheet target on iOS and Android.
- **30b Review the import**: "Check the import", source pill with "Source kept" tag, title with dashed underline, 8a edit rows; unclear amounts flagged accent-100 "Check", never silently guessed ("8 ingredients, 6 steps read. One amount was unclear."). **Edit first** · **Save and branch** (→ 6b). Recipe keeps "Imported from <url>" and author "via <importer>".
- **27b Shared cookbook** (`/c/:id`): collection with description, public URL, 2-column cards naming the recommended branch, **Follow this cookbook** (new additions land in Activity). Reuses 4c tiles and the 12b shell.

**Not on the roadmap**: hands-free cook mode; weekly plan generation; merging a branch back into its parent (conflicts with "originals never change"; Apply from suggestions covers it); ratings or stars.

---

## 13. Decisions log

Final picks, including comment overrides:

- Explore 1b landing · 1a search · 1c pantry sheet. Recipe 2a (original), 2a + 2b hero (branch), 2c as the What changed screen.
- Family 3a tree · 3b timeline · 3c map (three-way toggle) · 3d carousel replaces VariationChips · 3e diff on demand.
- Author **4a with a trees button to the 4b forest view** (comment); 4b language provisional. 4c tile grid inside 4a tabs.
- Auth 5a–5e. Edge states **15b** sheet + **15c** stranded notice (15a full screen not used).
- Generate 6a chat · 6b branch composer · 6c sentence starter. Dedup 7a–7d, **with User Pills** (comment).
- Edit **8a** in place (comment). Suggest **9b**, **multiple changes before sending** (comment) + General note + step suggestions.
- Suggestions **10b inline as main**, each with a chat action routing to the **10a** thread (comment).
- Activity **11a** chronological + filters, **with tab badge** (comment). (11b "Needs you" grouping not used.)
- Shared **12b** + **12c** (comment). Settings **13a** + **liquid/volume weight estimate** (comment). Avatar **14b** full screen (comment).
- Tree intro **16a** (comment). Lineage **17b** version pill (comment; prototype still shows 17a). Metadata **18a + macro pills**; nutrition **18b bars inside the dropdown with Per serving / Total** (comment). Patterns **19a** (comment). Dark **20b olive dusk** (comment). Desktop **21a with the 21b family panel as a modal pull-out** (comment).
- Kitchen **24a replaces Saved** (comment). Taste **28b** learned (recommended). Collections **27a** now, **27b** Phase 4.
- Photos optional with emoji fallback. No stars. Originals never change.

Open items for the build team: exact Lucide icon set per tab; AI generation provider and prompt templates (not designed); nutrition estimation source; import parser.

---

## 14. Acceptance checklist (v1)

- A signed-out user can open a branch, understand what it is (16b card), and save or branch it, with the pending action completing after sign-in.
- Every recipe page shows lineage (17b pill), macro pills, scaling with the terracotta strip, and the nutrition dropdown with bars + Per serving / Total.
- Diff: amount edits are one `~` row; root recipes show no What changed entry; side-by-side works at 320px.
- Tree, Timeline and Map render families of depth 0–5+ and 1–30 versions; view persists in the URL; intro shows once.
- Suggest mode sends multi-line structured edits incl. a general note; author sees Apply / Decline / Keep as branch inline (10b) and in the thread (10a).
- Activity rows state the change; Activity tab shows the unread count.
- Dark theme (20b) passes 4.5:1 on body text; light passes the WCAG AA notes in `index.css`.
- Desktop ≥1024px: rail + list + recipe; Family button opens the pull-out panel.
- Loading screen plays on cold start; `prefers-reduced-motion` respected.
- No browser-default focus rings; all hit targets ≥44px; no stylesheet hex values outside the token sheet.
