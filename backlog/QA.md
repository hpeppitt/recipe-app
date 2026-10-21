# QA ledger

What has landed on `main` since the last release and what the human QA pass must check.
`/next-ticket` appends a section per ticket; `/qa-pass` collates this file, the pending
decisions, and the preview build into a checklist; `/release` moves the accepted entries
into `CHANGELOG.md` and clears this file.

## Standing checks

Things no agent can verify here, so every QA pass covers them at a 390x844 viewport:

- Explore loads, rows render, search and the favourites filter work.
- A recipe detail page: action row, breadcrumb, branch carousel, the version tree.
- `/create` shows the composer for a verified account and the sign-up call to action otherwise.
- A `/shared/:id` link opened signed out, in a fresh browser profile.
- The browser console shows no errors or unhandled rejections on that walk.
- `TreeIntro` renders legibly on the second root recipe opened (AUDIT UI-16, never yet seen in a browser).

## Since the last release

### RL-178 Typing-pause dedup card (7a)
- On a phone, open a new chat and type "banana bread" slowly. After the pause the sage card appears above the composer and stays above the keyboard: "<title> is already growing here", up to three rows with author pill, time and difficulty, and a Branch pill.
- Branch opens the branch composer for that recipe with the typed text in the instruction box; the match title opens the recipe. Back in a new chat, Send still generates (the on-send panel may still offer matches first).
- At 320px the meta line wraps under the author pill and the card never takes more than about 40% of the screen with the keyboard up (it scrolls inside). Hide matches puts the cursor back in the composer.
- Type something unrelated: the card goes on the next pause. Hide matches removes it for the rest of the chat.
- Network panel: one `recipes` query for the whole chat (first pause), none on later pauses or on Send, and none for a second new chat opened within 5 minutes.
- VoiceOver: "N similar recipes already here" once, when the card first appears.

### RL-177 Same/Similar and chip helpers (pure lib)
- No UI yet (RL-178 to RL-180). Nothing for the human to look at beyond the unit tests.

### RL-176 Avatar editor takes the 14b layout

- At 390px, light and dark, open the editor from the You tab avatar and from Settings' Account row. Check Cancel and Save on top, the 170px blob preview, six swatches (selected one ringed), five-column emoji grid, and the "Use a photo" and "Initials" footer.
- Pick an emoji and a colour, Save, and see it on the profile. Upload a photo (preview, then Save). Tap Initials and Save. Tab through the controls with a keyboard.
- Known: Initials saves as `generated` (colour from the uid), so the preview does not use the chosen swatch. Emojis from the old grid (for example the pizza) show no selected cell.
- Reviewer noted: the photo upload has no `img.onerror`, so a HEIC or corrupt file fails silently (pre-existing). An emoji outside the 15-emoji grid shows no selection.

### Author decisions 2026-10-20 (legal wording renamed to Saved)

- The Terms and Privacy Policy wording changed from favourite to save (headings, counts, erasure, analytics and notification lines) with no `lastUpdated` date change and no `TERMS_VERSION` bump, so nobody is asked to re-accept. The author will review all policy text before production.
- On a phone, open a recipe's Vary screen (the first screen, "What would you change?"): tap Add photos, pick one to three photos. Thumbnails and the Gemini privacy notice appear, a fourth photo shows the limit line, and Grow this branch is disabled while a thumbnail spins. With a photo and no text, Grow works and the variation uses the photo. Then reload the page: no photo is left anywhere (the screen opens empty, and the history entry holds nothing).
- Reviewer noted (low): Back or Close on the vary screen discards typed text and attached photos silently (text already did; photos are more effort to redo). The privacy notice appears only once a photo is picked, not before (same as the chat composer).
- Resize keeps state (author asked): at 1280px on Explore set a tag filter, scroll the list, open a recipe, scroll it, change servings, tick an ingredient, start a suggestion and type some text. Resize below 1024px: the recipe fills the screen with the same servings, ticks, draft and scroll, and no nav. Resize back to 1280px: the list has the same tag and place, the recipe is unchanged. Repeat with the More sheet open. Also narrow first: open a recipe at 390px, change servings, widen past 1024px: the list appears beside it and nothing resets. After narrowing, Back shows the list with its tag and place. At 390px with no resize, Back from a recipe still gives a fresh list, as before. Check light and dark. Then, beside the list at 1280px and again at 390px, open a branch from the carousel and a lineage crumb: the recipe swaps in place (beside the list at 1280px, with no skeleton flash at 390px), and Back returns to the previous recipe, then the list.
- Reviewer noted (low): a browser Back or Forward to a recipe from the other list while the list is kept hidden mounts that page hidden (an unneeded read). The scroll hand-off uses refs fed by scroll events, so a clamped window offset at the exact moment of a resize may jump slightly; check on a device. EmailLinkStatus remounts on a resize (judged unreachable mid-flow).
- Explore at 390px and 1280px, on a throttled network: no list jump while the Branching fast this week query runs (a grey placeholder holds the row's space, then the row or Newest replaces it).

### RL-133 Ingredient reorder and collapsed method

- On a phone, open Edit and drag an ingredient by its grip up and down with a thumb: it swaps as you pass a neighbour's middle, inputs keep their text, and the page still scrolls when you drag anywhere else. Check the handle is easy to hit at 320px without crowding the amount field.
- With a keyboard and VoiceOver: Tab to a grip, press the arrow keys, hear "Moved to position N of M" and keep focus on that row's grip. Save and confirm the recipe page shows the new order.
- Method starts collapsed with "N steps" and a chevron. Clear every step and Save: it opens and focuses the first step.
- Reviewer noted: the grip icon (neutral-500) is about 2.7:1 in light (spec). Drag, auto-scroll near the header and footer, and the lifted-row style need a real-phone check. Touch-screen-reader reorder (VoiceOver swipe, no arrow keys) has no pick-up and move mode; a gap.
- Reviewer to note: a pointer drag past the first or last row stops there; moving between ingredient groups is out of scope (a row keeps its group).

### RL-132 Edit page fact pills are native pickers

- On iOS Safari and Android Chrome at 390px, open a recipe's Edit page: Servings, Prep, Cook and Difficulty are four pills in one wrapping row, each opening the native picker, with the chevron visible and a focus ring on keyboard focus. Check the ring contrast in dark theme.
- A recipe with 37 minutes prep or 30 servings shows that value selected; save keeps it unless you pick another.
- Reviewer noted (low): the resting ring (neutral-400) is about 1.7:1 in light (spec-mandated). An off-list value cannot be reselected after changing it (per ticket). Check native option colours in dark on Windows Chrome.

### RL-128 The 17b version pill replaces the breadcrumb

- At 390x844 and 320px open a depth-3 branch: the pill reads "Generation 4 · from <parent>" on one line (ellipsis with a long parent title, no wrap), dots with the last in terracotta. Open Path: check the dot rings, the connecting lines, "you are here" on the last row.
- Tap Compare on the root row and read the diff; tap the parent row's title and confirm it opens that recipe and the panel closes. Escape returns focus to Path.
- Dark theme: the root's ring (primary text colour) and ancestors' accent rings are visible. At 1024px in the pane, opening an ancestor keeps the list beside it.
- A chain deeper than six shows six dots (the cap is a groomer choice).
- Reviewer noted (low): a lineage fetch failure looks like loading forever (`useRecipeLineage` has no error flag).
- Reviewer noted (low): "Generation N · from <title>" truncates at 320px with no title attribute.
- Reviewer noted (low): `aria-controls` points at an id that is absent while the panel is closed.
- Reviewer noted (low): the current row has no `aria-current`.

### RL-117 Dark Organic (Warm night 20a), Light / Dark / System in Settings

- Settings, Appearance: the Theme segment reads Light, Dark, System, with System selected on a fresh profile. Each choice applies at once and survives a reload with no cream flash before the dark page appears.
- In Dark, and again in System with the phone's OS set to dark, on a phone: walk Explore (the Branching fast carousel tints and the selected row at 1024px), a branch recipe (lineage strip, tile tints, the More menu's pending badge, footer buttons), the tree's three views (tree lines, timeline line colours and sheet chips, the map rings), What changed, the chat (user bubble, send button, typing dots), edit (photo badge, chips), the profile (pencil badge), Settings (toggles, segments), Activity (icon badges, Mark all read), the sign-in sheet and a confirm dialog (the scrim must darken the page, not wash it cream). Primary buttons are terracotta `#e8925a` with dark text; nothing is cream on pale or dark on dark.
- In System, switch the OS between light and dark with the app open: the app follows without a reload, and the browser bar colour follows too. Then pick Light and confirm the OS no longer changes it.
- Skeletons in dark pulse more strongly than in light (hand-set neutral-200 to flipped neutral-300); say if it is too much.
- Switch back to Light at the end and confirm light looks as before; the only light change is the More badge and profile pencil text, now cream instead of white.
- Reviewer noted (low): Avatar initials are `text-white` on `hsl(h, 55%, 50%)`, about 3:1 or less on some hues in both themes (aria-hidden, pre-existing).
- Reviewer noted (low): Input and Chip borders use `border-border`, about 1.5:1, below the 3:1 non-text minimum in both themes (pre-existing).
- Reviewer noted (low): SegmentedControl radios (now including Theme) have no roving tabindex or arrow keys.
- Reviewer noted (low): check once in a real browser that the `dark:backdrop:bg-black/60` scrim on the sheet and confirm dialog darkens the page in dark.
- Reviewer noted (low): the terms update dialog keeps Tailwind's built-in `shadow-xl` (black 10%), so in dark its shadow barely shows; left so light stays unchanged.

### RL-116 Explore and Saved beside the recipe from 1024px

- At 1280x800 in desktop Chrome and Safari: open a recipe from Explore (a row and a Branching tile) and from Saved. The list stays on the left at 420px with the open row tinted and ringed; the recipe sits on the right with its own scroll; the URL is `/recipe/<id>`.
- Scroll the list down, select several recipes in turn: the list does not jump or reload, and each new recipe starts at its top. Browser Back steps back through the recipes, then to the list alone at the same scroll; Forward reopens them beside the list.
- Reload on a recipe opened from a list: the two panes stay (the browser keeps the history state). Paste its URL in a new tab or open a shared link: the recipe shows alone, centred, with no list.
- Resize across 1024px on a recipe opened from the list: below it the recipe shows full screen as before, above it the list comes back; nothing crashes.
- At 390px: Explore, Saved and a recipe look and behave exactly as before (no list beside the recipe, no Family button, ingredients above the method).
- Check the recipe pane at 1024px (narrow: mobile title and emoji sizes, footer buttons wrap, nothing scrolls sideways) and 1440px (44px title, 96px emoji, 36px 48px padding, ingredients beside the method), and the Family, Edit or Suggest, and Branch buttons in the footer. With VoiceOver, choosing a row reads "Showing <title>" and focus stays on the row.
- Reviewer noted: the selected row uses `bg-accent-100` with themed text, which would be unreadable if the dark theme were enabled; RL-117 must remap or pair it.
- Reviewer noted: the share, sent and saved toasts centre on the viewport, not the pane, and ignore the 220px rail.
- Reviewer noted: the consent banner is in flow above an `h-dvh` pane, so the pane footer sits below the fold while the banner shows.
- Reviewer noted: `@container` on the recipe page's main column contains fixed descendants; a trap for future code that puts a fixed element inside it.
- Reviewer noted: the pane's Back icon steps through the recipes viewed (history push), and links from inside a recipe drop the pane; both logged in DECISIONS.md.
- Reviewer noted: after a recipe fails in the pane, choosing another row recovers it; the error's "Back to library" still goes to `/`.

### RL-115 Left rail from 1024px

- At 1280x800 and 1024x768 the 220px rail shows with the Recipe Lab wordmark, pill items, the active item highlighted, and the Activity badge (verified email) after the label. Create is a plain item, no terracotta circle.
- At 1023px the bottom bar returns unchanged.
- Reviewer noted: the Activity badge stays on the icon at lg, not after the label as 21a draws it; acceptable (inside the rail, aria-label unchanged, one markup path).
- Tab order runs top to bottom through the five links. On /new at 1280 the Create actions sit at the bottom of the viewport. The update prompt, if shown, sits beside the rail, not under it.

### RL-127 Saved wording, no Explore Favourites chip

- Explore as a verified user: no Favourites chip; All, Following and a tag chip still filter; a saved recipe shows the bookmark marker.
- A second account saves one of your recipes: Activity reads "<name> saved your recipe <title>". An older favourite notification reads the same way.
- Your profile and another cook's show "<n> views · <n> saves"; a recipe someone saved shows "1 save" or "<n> saves" under the title.
- Settings, Delete recipes on this device: the help text says "saves".
- Share a recipe in the self-contained mode: the note reads "...works without the cloud. Recipients can keep a copy, but they can't suggest changes."

### RL-126 Branching fast this week

- On the preview against the live project, at 390x844 and 320px: with two branches published this week on one family and one on another, Explore shows "Branching fast this week", the busier family first with "+2 this week". Tiles swipe and snap; Tab reaches each tile. VoiceOver reads a tile as its title and "2 new branches this week".
- Console: no Firestore "requires an index" error (proves no deploy is needed). Network: one `runQuery` for the week, none after switching tabs and coming back.
- With no branches this week (use `npm run dev:emulated`), the "New this week" or "Newest" row shows instead, with nothing flashing between the two.
- Tap the emoji area of a tile (not the title): it opens the recipe. VoiceOver reads the title plus "N new branches this week" as one stop.
- Reviewer noted (low): a failure is cached for the page session, so Newest stays until reload.
- Reviewer noted (low): the 7-day `since` is fixed at first call, so it goes stale in a long-open tab.
- Reviewer noted (low): the author's clock can back-date a branch out of the window.
- Reviewer noted (low): badge contrast computed at 6.0:1.
- Check the badge text (accent-2-100 on accent-2-700) is legible on all three tile tints and does not wrap at 320px.

### RL-125 The Create tab sentence builder

- At 390x844 and 320px: the Create tab opens the sentence "I want something quick with chickpeas for two." and the nav shows Create active (terracotta label).
- Tap each word through all three options and back to the first; the sentence wraps cleanly at 320px and the green circle stays clipped in the top right.
- Write it opens the chat with the built text (for example "Something one-pan with salmon for a crowd") in the composer, unsent; as a verified user, send it and a recipe comes back. Signed out or anonymous, the chat shows the sign-up screen as before.
- Describe it my own way opens Search with the keyboard up.
- VoiceOver: each word reads as a button with the hint "Tap the underlined words"; after a tap the new sentence is announced. Tab to each word and check the focus ring.
- RL-097's check "Create opens the chat full screen with no bar" now reads "Create opens the sentence builder, with the bar".
- With the cookie consent banner showing (fresh browser profile), open Create: Write it and Describe it my own way stay above the nav without scrolling, on a solid background, and the sentence scrolls under them if it must.
- The word buttons have 4px of extra tap height above and below; check the underline and focus ring still look right and lines do not spread apart.
- Reviewer noted (low): the app is light only (RL-065), so the page has no `dark:` classes. If the dark theme is ever re-enabled, the decorative green circle (`bg-accent-2-200`) and the `text-accent-700` words need themed tokens.

### RL-124 The /search screen

- At 390x844 and 320px, signed out and as a verified user: Explore's Search opens `/search` with the keyboard up. Typing an ingredient of a known recipe (for example "walnut") finds it; a branch shows "<original> variation" in green under its title.
- Each chip (All, Under 30 min, Easy, Branches) filters and reads as pressed in VoiceOver; the input reads "Search recipes, or describe a dish". Open a result and go Back: the query and chip are restored.
- A nonsense query shows the peach card. Write it (card and pill) opens the chat with the text in the composer and nothing sent; as a verified user, send it and a recipe comes back.
- Search more shared recipes widens the search. With the network off on a fresh load, device results show with "Shared recipes couldn't load." and Try again works once back online.
- The Explore tab stays highlighted on `/search`. Explore no longer has an inline search pill; its "No results" state is gone with it.
- At 320px the pill's Write it shows the sparkle icon only (named "Write it" to VoiceOver); from 360px up it shows the text too. VoiceOver announces the scope line and "<n> results" as the query changes.
- Reviewer noted (low): the author link's `-my-3` hit area overlaps the row's padding; check visually that it does not crowd the time and difficulty text or catch taps meant for the row.
- Reviewer noted (low): the disabled pill Write it is at 45% opacity; check it still reads as a control yet clearly unavailable.

### RL-123 searchLibrary (pure logic)

- Nothing user-visible yet; the Search screen (RL-124) carries the QA entry.

### RL-122 The favourite heart is a Save bookmark

- At 390x844 save and unsave from an original, a branch (floating control over the hero) and a `/shared/:id` link. The icon turns terracotta with a check when saved, and the recipe appears in and leaves the Saved tab. On `/shared/:id` the banner has no control; only the footer Save.
- VoiceOver: the header and floating control read "Save, toggle button, selected" when on ("Save, toggle button" when off); the `/shared/:id` footer reads "Saved, toggle button, selected" when on. Signed out, Save opens the sign-in sheet.
- Reviewer noted (low): the footer's accent check on its hover background is about 2.75:1 (the text "Saved" also shows, so the state is not icon only).
- Reviewer noted (low): the Explore marker test checks only the sr-only "Saved" text, not the icon.
- Explore rows for saved recipes show a small terracotta check bookmark after the title. The Favorites chip, profile counts and notification text still say "favourite" (left for the author, see the ticket Notes).

### RL-121 The Saved page also lists favourites, with offline, failed and deleted cases shown honestly

- On the preview against the live project as a verified user at 390x844. On browser A favourite two recipes by someone else and save one shared link with "Save to my library". On browser B, same account, fresh profile, open Saved: all three show, newest kept first. Devtools Network shows one `recipes/{id}` read per favourite, and none on a second visit to Saved.
- Go offline, reload, open Saved: the device's rows show and "<n> saved recipes need a connection to show." counts the rest.
- Ask the other account to delete a favourited recipe: "1 saved recipe was deleted by their authors." shows and the row is gone; nothing else changes.
- Anonymous account: bookmark a recipe, open Saved, it is listed. Your own favourited recipe is not in Saved.
- The empty state now reads "Tap the bookmark on any recipe and it'll wait for you here." Failed reads and Try again are covered by tests only; the control is the Save bookmark since RL-122.
- Reviewer noted (low): the session cache is not keyed by uid or cleared on sign-out, so it holds memory and may show a stale recipe until reload; this matches "per session".
- Reviewer noted (low): `withTimeout` swallows rejections, so `reportError` is attached to the read before wrapping.

### RL-119 The chat composer has an Add photos button with removable thumbnails, and sent photos show in the user bubble

- Release together with RL-120's Privacy Policy change, after the author has signed off that wording.
- On the preview as a verified user at 390x844 (and 320px, no horizontal scroll), `/create`:
  - An image-plus button sits at the left inside the pill. iOS Safari: Add photos offers camera and library; photograph a printed recipe, and a HEIC library photo arrives as JPEG and is accepted; the recipe follows the printed one. Check a portrait photo comes out upright.
  - Android Chrome: three photos of a fridge, no text; a recipe comes back using what is visible; the bubble shows three photos and "Suggest a recipe based on these photos." and stays within its width.
  - The notice "Photos are sent to Google's Gemini to write your recipe and are not saved. Leave out people and personal details." shows above the first thumbnail and disappears when the last is removed; at 320px with three thumbnails it wraps without pushing the composer off screen.
  - A fourth photo is refused with "You can add up to 3 photos at a time." and the button is dimmed at three; a 25 MB file and a GIF are refused with their messages (a GIF only if the picker lets you choose it).
  - Remove a thumbnail (the X is a 44px target on a 28px circle), then add the same file again. Focus moves to the next X, or to Add photos after the last.
  - Send is dimmed while a thumbnail shows its spinner.
  - Try a real 48 MP photo (decoding is not bounded, see RL-118).
  - On a variation (`/recipe/:id/vary`): the first screen (Grow this branch) has no attach button, by decision (see DECISIONS.md). Send the first message, then attach a dish photo in the follow-up and ask to make it like that.
  - Go offline, send with a photo, see the connection error, come back online, Try again: the photo is resent and a recipe arrives.
  - Send photos in two chats of 3, then try a seventh: the chat limit copy shows and your text and photos stay in the composer.
  - Save, open the recipe: no photo anywhere; in devtools the Dexie row's `chatHistory` and the Firestore document contain no `data:image` or long base64.
  - Text-only create and refine, and the suggestion chips, still work as before. With VoiceOver the attach, thumbnail and remove controls announce as labelled, and a photo error is announced once.
  - The composer gets taller with the tray; check the newest message still scrolls into view above it.
- After attaching three photos at 320px, the newest bubble is still visible above the taller composer (the page scrolls when the tray, notice or an error appears).
- Reviewer noted (low): the pixel guard runs after a full decode, so a huge photo can still spike memory first; check a real 48 MP photo on a device.
- Reviewer noted (low): `src/content/legal/terms.ts` lines about 40 and 53 still describe only typed text going to Google; Terms were deliberately not changed.
- Reviewer noted (low): `src/content/legal/privacy.ts` about line 24 says "the prompt you typed", which is wrong for a photos-only send.
- Reviewer noted (low): index.html has no `viewport-fit=cover`, so `env(safe-area-inset-bottom)` is 0 and the taller composer's bottom padding relies on the fixed 1.75rem.
- jsdom covers the behaviour (picks, limits, remove, late results, focus), not layout, hit-area size, real decoding or focus rings.

### RL-120 The Privacy Policy covers photos added to the recipe chat

- Read `/privacy` on a phone and sign off the four changed paragraphs before release: "The short version" (third paragraph), and "AI recipe generation" What, Who sees it and How long. This is legal text; the wording is in the ticket and awaits your approval.
- The page header shows "Last updated 19 October 2026".
- Sign in as an existing user: no Terms update dialog appears (Terms and `TERMS_VERSION` are unchanged).
- The EXIF claim ("removes the location and camera details") rests on the canvas redraw in `downscaleToJpeg`, read in code only. Check with a geotagged photo in RL-119's walk if you want proof.

### RL-118 useRecipeChat can send up to three downscaled photos with a message to Gemini

- The UI for this arrived with RL-119 (see its entry). The human check (attach photos, generate, save, confirm nothing image-shaped is stored) is there.
- Text-only generation should behave exactly as before; a normal create and refine on the preview is enough.
- `downscaleToJpeg` was tested in jsdom against a stubbed image and canvas only (sizes, white fill, quality retry, caps, URL revoke); real decoding and JPEG output are unverified until RL-119's browser walk.
- Decision (mine): over the photo limits the hook sends nothing, keeps the typed text with the caller and resolves to `'message-limit'` or `'chat-limit'`. Only photos in turns that generated count towards the 6 per chat, so a failed send or an abandoned dedup match costs nothing. Logged in DECISIONS.md.
- Decoding is not bounded yet: a file under 20 MB can decode to 100 MP or more. There is a guard that rejects over 60 megapixels after decoding and before drawing (`MAX_SOURCE_PIXELS`). The real fix (`createImageBitmap` with resize options) and a check with a real 48 MP phone photo are for RL-119's browser QA.
- Decision 3 got a dated line saying your approval of RL-118 at /groom was taken as confirmation that in-memory generation photos fit it. That is still yours to confirm; correct it if not.
- Reviewer noted (low), privacy handoff (resolved: RL-120 is merged and live; the release-together gate sits in the RL-119 entry): RL-120 (privacy text) must land BEFORE or WITH RL-119, never after. The moment photos are exposed these lines become inaccurate, because they say only typed text goes to Google and the conversation stays only on the device: `src/content/legal/privacy.ts` lines about 26, 123, 126, 127 and 205, and `src/content/legal/terms.ts` lines about 40 and 53.
- Reviewer noted (low): a photographed fridge, dish or handwritten recipe can show people, addresses or handwriting, and it goes to Google with the message (`docs/legal/claims-to-verify.md` item 13 now covers images).
- Reviewer noted (low): EXIF orientation is honoured by current browsers when drawing through an `Image`; check a portrait phone photo comes out upright in RL-119.
- Reviewer noted (low): the previews, the SDK chat history and the retry ref each hold a copy of the photos, about 15 MB worst case per chat, in memory only.
- Reviewer noted (low): previews are keyed by `Date.now()`, so two sends in the same millisecond would overwrite each other. Only possible in tests, because the hook blocks a second send while one is in flight.
- Reviewer noted (low): `/create` and `/recipe/:id/vary` render the same `RecipeChatPage` element type, so React may reuse one hook instance if the app moves straight between them, keeping photos, previews and the session. This was already true for `chatRef` and messages.
- Reviewer noted (low): generation errors are now passed through `redactInlineData` before logging and reporting, in case the SDK echoes photo data; ordinary errors are reported unchanged.

### RL-114 The tree explainer is redrawn in the 16a language

- Clear the intro state in local storage, open two root recipes: the card appears on the second, above the recipe, with the heading "Every recipe can grow branches", a mini tree, three numbered steps, a full-width Got it and (only if the recipe has variations) See the tree.
- Compare the mini tree with the real tree page: same 3px lines, rounded terracotta elbows, a neutral line for the branch not taken, "Here" tag in dark terracotta. Check the terracotta path reads to "extra banana".
- Got it hides the card for good (reload and open another root recipe) and focus lands on the recipe area, not the top of the page. See the tree hides it and opens the tree.
- At 320px: nothing scrolls sideways, "extra banana" and the Here tag fit (the node wraps if it must). jsdom cannot check layout, so this and the 52px Got it height are unverified by tests.
- Decision (mine): the heading is an h2 (the page has an h1 title and the recipe body hides its own h2). Got it moves focus to the page's main region (a temporary tabindex of -1 that is removed on blur).
- At 320px check that "extra banana" with the Here tag may wrap to two lines and the terracotta elbow should still join the middle of the node. jsdom cannot verify this.
- Reviewer noted (low): ROADMAP.md:41, backlog/QA-CHECKLIST.md:350 and backlog/LAUNCH-DECISIONS.md:34 say to look at TreeIntro in a browser for the first time (RL-012, needs a human); the card is now the redrawn one, so confirm it against this card.
- Reviewer noted (low): the diagram elbow is 14px with a 36px indent where the live tree uses 28px and 44px (design spec); logged in DECISIONS.md.
- Reviewer noted (low): the sheet-on-tree-page variant from the design remains the author's open question (it conflicts with the "Teaching the tree" timing rules).
- Unchanged by design: timing (second root recipe, once), inline placement. The design's sheet on first tree visit is an open author question.

### RL-113 A shared recipe opens straight to the recipe layout with a "Shared by" banner, Save and Make it yours

- Open a `/shared/:id` link signed out, as an anonymous account and as a verified account (not the author):
  - A slim cream banner "Shared by <author pill> ... Open Recipe Lab", then the title beside the emoji blob, the description and the usual recipe body. The author pill opens their profile; Open Recipe Lab goes to the library. A flat heart sits to the right of the banner.
  - Footer (at the end of the page, not pinned): Save (outlined) and Make it yours (terracotta), with a ghost "Suggest a change" under them. Save is the favourite: tapping fills it and the label reads "Saved"; the heart in the banner follows it. Verified saves to the cloud, anonymous keeps a bookmark on this device, signed out opens the sign-in sheet.
  - Make it yours opens the variation composer for that recipe; signed out or anonymous you get the sign-up screen there.
  - Suggest a change as verified: the page becomes suggest mode (as on a recipe page); Send shows "Sent to <author>" over the shared page. As anonymous or signed out: the sign-up dialog "Sign in to suggest a change", the page stays.
  - Your own recipe's link: no heart, no Save and no Suggest, only Make it yours.
  - A branch (a variation) shows a sage line "<author> asked for "<prompt>"." under the description. An author with no name reads "Someone"; a blank prompt reads "<author> made this variation."
- Open a hash link (`/shared#r=...`, for example from Copy share link in local-only mode): the banner has no heart, and the footer has only "Save to my library". Tap it once: it saves a copy that still names the original author, and the button becomes "Open in my library" with focus on it; tap it and the saved recipe opens. There is no Save, Make it yours or Suggest here.
- A broken hash (`/shared#r=abc`) shows "Invalid Link" with Go to Recipe Lab. Offline on `/shared/:id` shows "Couldn't Load Recipe" with Try Again.
- At 320px: a very long author name wraps inside the banner, a very long title and prompt wrap, nothing scrolls sideways, and the footer buttons keep their labels (the Save icon hides under 360px). jsdom cannot check any of this layout, nor the 44px hit areas on the author pill and Open Recipe Lab (they are 32px pills with an extended tap area).
- Decision (mine): the old "Read-only copy" badge and the "Shared from Recipe Lab" footer line are gone (the banner replaces them); the hash page keeps its one-line note "Saves a copy on this device...". Collaborators render as author-style pills.
- Dark classes were removed from the shared page; the favourite error text is `text-danger-700` only (light-theme token, no contrast guard needed).
- The favourite error (a failed cloud save) now shows just above the footer buttons, since the footer Save is the main control; it used to be at the top of the page. A hash link whose copy cannot be saved shows "Couldn't save a copy. Try again." there too.
- Moving from one shared link to another (a different id or hash) resets suggest mode, the saved copy and the save button.
- A link with no author name reads "Shared by Someone".
- Reviewer noted (low): the author appears twice, in the banner and in the Added-by pill in the recipe content. The ticket asks for both; confirm it is intended.
- Reviewer noted (low): collaborators render as non-link UserPills while the author pill is a link.
- Reviewer noted (low): the hash link lost its explicit "Read-only copy" cue; the hint "Saves a copy on this device..." remains.
- Reviewer noted (low): a hash link whose `createdBy.uid` equals the importer's own uid saves a Dexie row that looks like an own recipe, and `planOwnRecipeSync` could remove it on the next sync (RL-086 corner case, pre-existing; worth a ticket if RL-086 means never).
- Reviewer noted (low): the `'local'` owner-id fallback for a missing `createdBy` would be rejected by the suggestion rule, so the user would see the generic "didn't send" message (unlikely).
- Reviewer noted (low): local-bookmark failures are not shown (same as before).
- Reviewer noted (low): the deleted modal's real-hook path (a `RateLimitedError` thrown by `createSuggestion` through `useSubmitSuggestion`) is no longer exercised end to end, only by rejecting `onSend`.
- Reviewer noted (low): the footer button class string is duplicated between RecipeDetailPage and SharedRecipePage, and the "Sent to" toast is ad hoc markup on both pages.

### RL-112 Branching a recipe opens the 6b composer: one instruction, quick-change chips, a promise, Grow this branch

- On the preview as a verified user, open a recipe and choose Branch this recipe (or approve a suggestion as the owner):
  - Header "New variation" with Close. A cream pill "Branching <title>" with the recipe emoji; tap it to open and close the parent preview (a screen reader says expanded or collapsed).
  - Heading "What would you change?" over a terracotta-outlined box with "e.g. less sugar, and add walnuts". Grow this branch is greyed until there is text, and stays greyed for spaces only.
  - Tap "Less sugar" then "Gluten-free": the box reads "less sugar, gluten-free" and the caret stays at the end of the box. Type a trailing comma first and check there is no double comma.
  - The line "<title> stays exactly as it is. Yours becomes a new version in its family, credited to you." sits above Grow.
  - Tap Grow this branch: the page becomes the chat with your text as the bubble and a "Growing your branch…" card (three grey bars) in place of the dots; then the recipe card arrives with Save Variation. Save it: the recipe page opens as before. Close with the unsaved variation still asks "Discard this variation?".
  - Approve a suggestion on your recipe: the composer opens with the suggestion already in the box, ready to Grow.
  - A signed-out or anonymous visitor still sees the sign-up screen, not the composer.
- At 320px: chips wrap to more rows, a long recipe title is cut with an ellipsis inside the pill, nothing scrolls sideways. 16px text means iOS does not zoom.
- Screen reader: after Grow it says "Growing your branch…" once (not also "Generating recipe..."), then "<title> is ready".
- iOS Safari and Android Chrome: with the keyboard open, check Grow this branch stays reachable (the footer is sticky inside the page, not fixed or vh-sized; Android Chrome 108+ may leave it behind the keyboard until the page pans, see RL-111). On a touch device the box is not auto-focused, so the keyboard does not open over the chips; on desktop it is focused on open.
- Decision (mine): the old parent preview row stays above the chat after the first message; only the first screen changed. The chips are generic and static, as the ticket says.
- The page has one hidden live region that is always mounted; it says "Growing your branch…" on the first turn and the visible card is hidden from assistive tech (the ticket asked for role=status on the card; changed so the text change is announced, see DECISIONS).
- On a touch device a chip tap does not put focus back in the box, so the keyboard does not open over the other chips and Grow; tap the box to type. On a mouse the box keeps focus with the caret at the end (ticket asked for refocus everywhere; see DECISIONS).
- Reviewer noted (low): the textarea border is primary-600 (accent-700), not the ticket's accent, so it is valid in both themes.
- Reviewer noted (low): the old "Describe the modification..." placeholder is still reachable on the first turn after a failure (the chat input shows empty, the instruction is the user bubble above).
- Reviewer noted (low): the screen-reader announcements (Growing your branch… then "<title> is ready") need a real VoiceOver and NVDA check; jsdom only proves the DOM.
- Reviewer noted (low): check the 16px textarea and the keyboard on Android Chrome (no interactive-widget in the viewport meta, so the sticky Grow button may sit behind the keyboard).

### RL-111 The new-recipe chat follows 6a: Close header, Organic bubbles, a collapsible recipe card, refinement chips and a pill composer

- On the preview as a verified user at 390px (and 320px, no horizontal scroll), open Create:
  - Header: an X "Close" and "New recipe" (a variation reads "New variation"). Under "What would you like to cook?" the starter chips are small terracotta-tint pills; tap one to generate.
  - Your message is a terracotta bubble on the right (cream text, no timestamp any more). While it works, three dots in terracotta tints bounce (still with reduced motion on) and the label sits beside them.
  - The recipe arrives as a rounded card: emoji blob, title, "<time> · <difficulty> · <n> ingredients", a round chevron toggle. The newest card is open; tap the chevron (or Read full recipe on a closed card) to open and close it. Closed cards list up to 8 ingredient names joined with " · " and "…" after that.
  - Chips "Make it spicier", "Fewer dishes", "No dairy" sit above the composer once a recipe exists, scroll sideways at 320px, and vanish while a reply is generating. Tap one: it sends as if typed. The composer placeholder reads "Ask for a change…". Refine by typing too.
  - Card rule to judge: a new card opens and the previous one closes, unless you opened or closed that previous card by hand, in which case it stays as you left it.
  - Save an older version ("Save This Version") and the newest ("Save Recipe"); each shows a bookmark and "Saving…" while it saves.
  - Trigger the similar-recipes panel with a common dish ("banana bread"): sage card with a branch icon, Open, Branch from this, Create New Recipe Anyway.
  - Go offline, send a message, then Try again: the error is a terracotta-tint box. Press Back or Close with an unsaved recipe: "Discard this recipe?".
  - Signed out (or anonymous) at /create: the Sparkles sign-up screen with the email form under it, "You can keep browsing..." and Back to recipes.
- iOS Safari and Android Chrome: tap the composer and check the pill and the chips stay above the keyboard (the bar is sticky inside the page, not a fixed or vh-sized bar). index.html has no interactive-widget setting, so on Android Chrome 108+ the layout viewport does not resize for the keyboard and the sticky composer may sit behind it until the browser pans; the viewport meta is not changed here because it affects the whole app. The composer text is 16px, not the design's 15px, so iOS does not zoom on focus (see DECISIONS).
- Send is a 40px circle with a 44px hit area; the card toggle is 36px with a 44px hit area. Screen reader: a new recipe is announced once as "<title> is ready", and the typing label is announced once.
- The variation chat keeps the old parent preview row ("(original)") once the first message is sent; the first screen is now the RL-112 composer.
- Close goes back one entry; with no history (cold load or a deep link to /create) it goes to the library instead of doing nothing. A failed reply or save shows the error box, announced as an alert, and the screen reader does not say "<title> is ready".
- Reviewer noted (low): the chip row scrolls horizontally with the scrollbar hidden and no fade or peek cue, so "No dairy" may be off-screen at 320px.
- Reviewer noted (low, for RL-112): the parent preview toggle has no aria-expanded and its chevron is not aria-hidden.
- Reviewer noted (low): the card title is an h3 under the h1 with no h2, and collapsed and expanded cards both produce h3 "Notes", so heading navigation is flat.
- Reviewer noted (low): `min-h-[46px]` on the Save button sits beside Button's `min-h-11` and `cn` has no tailwind-merge (2px, no real impact).
- Reviewer noted (low): card expansion is keyed by message index; safe because messages are append-only, but a future reset or insert would need real ids.

### RL-110 The edit page follows 8a, with a sticky footer that says how many branches keep their own copy

- Edit an original that has three branches and a leaf, at 390px and again at 320px (no horizontal scroll at either):
  - Header: Cancel on the left, "Editing" centred. There is no Cancel at the bottom any more. The title has a dashed terracotta underline (accent-600, darker than the design's accent-400 so it reads as a field; say if you want the lighter one) beside a 72px emoji blob with a pencil badge. Tap the blob: focus goes to the Emoji field below it.
  - Pills: Servings, Prep and Cook are pill fields with icons and short labels; Difficulty is still the three-way control with a gauge icon (not a select).
  - Ingredient rows: Amount (76px), Unit and Name pills with a remove X and a Notes pill under each. At 320px the Name and X wrap onto a second line instead of being squeezed. Add and remove an ingredient and a step with the dashed buttons; the step numbers renumber.
  - Footer stays pinned to the bottom while scrolling, above the home indicator. On the original with three children it reads "3 branches below this keep their own copy."; on a recipe with one child "1 branch below this keeps its own copy."; on a leaf there is no line. Edit a branch that has children of its own: only direct children are counted.
  - Type -2 in an ingredient amount and clear nothing else, then tap Save changes: the page scrolls so that amount is in view, clear of the header and the footer, with focus in it and "Amounts can't be negative." above the list. Try the same with an empty title, a bad Servings ("abc") and with no steps.
  - Tap Cancel after changing something: "Discard changes?" appears; Discard leaves, the dialog's Cancel stays. With no changes Cancel leaves at once.
- Reviewer noted (low): the pill borders (neutral-400 on neutral-100, the spec's value) are about 1.7:1 against the 3:1 non-text minimum, while the title underline was bumped to accent-600; the rationale is inconsistent, revisit.
- Reviewer noted (low): the ingredient pills use placeholders as their only visible labels, which disappear once a value is typed (aria-labels exist); consider a visually hidden column header or a one-time visible Amount/Unit/Name legend.
- Reviewer noted (low): with the keyboard open neither iOS nor Android resizes the layout viewport (index.html has no interactive-widget), so the sticky footer sits behind the keyboard and Save is only reachable after dismissing it or scrolling to the end.
- Reviewer noted (low): the ingredient row wraps below a 360px viewport (360px phones wrap, 375 and 390 do not) and the remove X then sits on the second line.
- Reviewer noted (low): the heading jumps from h1 "Editing" to h3 for Ingredients, Instructions and Notes (the ticket specified h3); the disabled label "No Changes" is title case next to "Save changes".
- Reviewer noted (low): opening the edit page now runs one extra lineage lookup (a Dexie live query plus one cloud tree read) for the footer note; it cannot block Save.
- iOS Safari only: tap into the Notes or a step with the keyboard up and check Save changes is still reachable by scrolling and is not stuck behind the keyboard in a way you cannot get past. The footer is sticky inside the page (not a fixed or vh-sized bar), so this is the expected-to-work case but jsdom cannot test it.
- The footer's save-failure message and the "no longer in your account" state are unchanged and now sit in the sticky footer above the branch note.
- Reviewer-style note: the ingredient remove button is now named "Remove ingredient N, <name>" (or "Remove ingredient N" while the name is empty). Only the offending ingredient inputs are marked invalid after a failed Save, and the title and number-field errors are announced as alerts.

### RL-109 Email-link outcomes show as one sheet over the page the link opened

- On the preview at 390x844 and 320px (no horizontal scroll, headlines and bodies wrap, nothing hidden under the home indicator). jsdom cannot open a real Firebase link, so this walk is the only check of the real flow:
  - Request a link and open it in the same browser: a bottom sheet "Signing you in…" with a spinner in a grey circle and no buttons. Escape and tapping the dimmed backdrop do nothing. It then closes on its own for a plain sign-in. For an anonymous (guest) account that added its email, it turns into "You're signed in, and your bookmarks came with you" with a sage check and "Got it".
  - Open a fresh link in a different browser: the sheet "Finish signing in here" with the phone icon, the "different browser" explanation, the Terms box, the "Email" pill field with focus in it (iOS may not raise the keyboard without a tap), and "Sign in". Unticked, Sign in is disabled and Enter shows the tick-the-box error; ticked, Sign in turns the sheet into "Signing you in…". Escape or the backdrop closes it.
  - Open an already used link: "That sign-in link has expired" with the hourglass icon and one "OK" button. OK, Escape and the backdrop each close it, and it does not come back.
  - The email-taken case (as a guest, add an email that already has an account, then open that link): "That email already has an account" with the warning triangle and the body "...so bookmarks you made here as a guest stay on this device under your guest name rather than moving across. Request a new link to continue." and OK.
  - In every case the page underneath stays where the link landed (Explore for a fresh link), and after closing you are still on it.
- VoiceOver on iOS: each sheet is announced by its headline, then its body (the body is the dialog's description); on the spinner the text is read once (the spinner itself is silent); in the email sheet focus starts in the Email field; closing returns to the page.
- In a real browser (Chrome desktop and Chrome on Android), press Escape twice quickly while "Signing you in…" shows: the sheet stays (or reappears at once) and the outcome sheet then shows.
- Dismiss the email sheet after typing an address and ticking the box, then open another cross-device link: the field is empty, the box unticked and no error shows.
- Reviewer noted (low): the needs-email catch that clears the stored acceptance is dead code, because `runEmailLinkCompletion` never rejects (pre-existing). On a failure the sheet re-shows the error or needs-email state with no message from this component.
- Reviewer noted (low): in the spinner sheet the focused heading sits inside `role="status"`, so VoiceOver may read "Signing you in…" twice.
- Reviewer noted (low): OK is 44px tall while Sign in and Got it are 52px.
- Reviewer noted (low): a link finishing while the RL-108 sign-in sheet is open would stack two native dialogs (not traced).
- Reviewer noted (low): the dark-theme contrast of the accent circles was judged only from the token pairs.
- Reviewer noted (low, second round on the Sheet native-close handler): the handler has no `dialog.isConnected` guard, so a native close pending in the same tick the Sheet unmounts could call `showModal()` on a detached node (a console InvalidStateError; narrow race, completing sheet only; fix: `if (!openRef.current || !dialog?.isConnected || dialog.open) return;`). In the dismissible native-close path a parent that ignores `onClose` leaves the dialog closed while `open` stays true (same as before; AuthModal's `onDismiss` is the only case). No Sheet test covers rapid open toggling or unmount, and the mocked `close()` does not queue a real close event.

### RL-108 Sign-in is a contextual sheet whose headline names the action

- On the preview, signed out, at 390x844 and 320px (no horizontal scroll, the 26px headline and the 34px "Check your inbox" wrap cleanly, the sheet clears the home indicator):
  - Tap the heart on a recipe and on a `/shared/:id` link: a bottom sheet "Sign in to save this recipe" with a heart icon, "Continue with email", and the text link "Continue without an account" with "Bookmarks stay on this device only. You can add an email later." under it. The guest link signs in anonymously and closes the sheet.
  - Open someone's profile and tap Follow: "Sign in to follow <name>" with the person icon, "Continue with email" and "Not now", and no guest link. Same for Share on an unpublished recipe ("Sign in to share this recipe"), Suggest as an anonymous account ("Sign in to suggest a change") and the avatar or name on your own profile as anonymous ("Sign in to edit your profile"). The plain Sign in buttons on Profile, Activity and a suggestion you cannot open say "Sign in to continue".
  - Continue with email: the heading "Continue with email", the Terms box, the "Email" pill field with the keyboard up, "Send me a link", the footnote and the sage "New here?" note, and Back. Try to send with the box unticked (button disabled; Enter shows the tick-the-box error), then ticked.
  - After sending: "Check your inbox" with the address in a grey pill (try a very long address at 320px), "Use a different email" back to the field, and Close. The copy says the link brings you back to Recipe Lab, not to this page.
  - Open the link on the same device, then request another and open it on a different device (the cross-device email prompt). Either way you land on the app, not the page you started from, and nothing you were doing runs on its own: tap it again.
  - No Apple, Google or password option anywhere.
- VoiceOver on iOS: opening each sheet reads its title ("Sign in to save this recipe", then "Continue with email" on the next step, "Check your inbox" after sending), focus stays in the sheet, and closing returns focus to the button that opened it.
- In the sign-up sheets (Follow, Share, Suggest, edit profile) Continue with email puts focus and the keyboard in the Email field, and Back is disabled while a link is sending.
- Reviewer noted (low): the sent step's 280px `bg-accent-200` circle sits behind themed text colours, so it would be illegible if dark mode returned; pin the colours then.
- Reviewer noted (low): the email pill (`bg-neutral-100`) has almost no contrast with the `bg-surface` sheet, and it uses `break-all`.
- Reviewer noted (low): the invite tone shows "Sending..." text while AuthModal shows a Spinner.
- Reviewer noted (low): AuthModal's body copy "Sign in to save recipes and get credited as the creator." is the same for every caller, including the plain continue callers on Activity, the suggestion thread and the profile (the ticket said keep the existing reason copy).
- Reviewer noted (low): `index.html` has no `viewport-fit=cover`, so the `env(safe-area-inset-bottom)` padding in the two auth sheets does nothing today, and `Sheet` itself has none. Follow-up if cover mode is ever enabled: put `pb-[max(1.75rem,env(safe-area-inset-bottom))]` in `Sheet.tsx`.
- Reviewer noted (low): `onAuthenticated` can fire more than once (the auto-dismiss effect and the guest handler both call it). Every caller's handler is idempotent; this predates the ticket.
- Reviewer noted (low): closing the sheet mid-send and reopening it can show a stale sent step.
- Reviewer noted (low, product call): AuthModal shows the guest link for the plain Sign in callers (Activity, suggestion thread, profile) as before. Decide whether the guest option should be offered there.
- Reviewer noted (low): the copy "Sign up to start cooking up recipes" (RecipeChatPage) is kept; RL-111 restyled the chat gate but kept its copy. The shared page's "Sign up to suggest a change" copy went with the modal in RL-113.

### RL-107 Suggesting a change turns the recipe page into a form (9b)

- Needs a verified non-owner account and a cloud recipe: use the preview or `npm run dev:emulated` (suggestions cannot be deleted on live). Footer Suggest and More, Suggest a change both enter the mode; an anonymous or unverified account gets the sign-up dialog and the page stays put.
- In the mode: sage banner "Tap any line to suggest a change" with Cancel replaces the header; title and "by <author> · <time> · <n> servings"; the pills, stepper, nutrition, suggestions and carousel are gone, and the footer is Send. Scale was reset to the stored servings.
- Change two amounts with a why on one, add a note, Send. Toast "Sent to <author>"; then, as the owner, open the thread and read the composed message ("Change 2 cloves garlic to 4 cloves. <why>", one line per change, blank line, then the note).
- Cancel with edits asks "Discard your suggestion?" (Keep editing / Discard); Cancel with none just leaves. Undo (X) closes an editor; Escape in an editor does the same.
- At 320px the editor fits: old amount, arrow, 84px input and Undo may wrap to a second line (reasoned, not measured), nothing clips. Check the Send button and the "n changes to suggest" text at 320px too.
- Keyboard: Tab to an ingredient, Enter opens it with focus in "New amount"; Undo or Escape returns focus to the row.
- Failure: go offline and Send, expect "That didn't send. Check your connection and try again." above the footer with the edits kept.
- Decision for you: Escape discards that row's edit (same as Undo); an opened but unchanged row counts as no change. The suggestion message has no length limit in the rules, so none is enforced here.
- Caps: the why input stops at 200 characters and the note at 1000; if the composed message passes 2000 characters Send is disabled and a line above the footer says so. Cancel is disabled while a send is in flight. A row with a why but no changed amount shows a hint line.
- Not done: IngredientList.tsx was not touched (suggest mode renders its own rows), so the tick-off rows are unaffected.
- Thread page: the pinned message now keeps its line breaks (`whitespace-pre-line`) so the composed lines read as lines.
- Reviewer noted (low): Escape in an editor discards that row's typed amount and why without a confirm (spec).
- Reviewer noted (low): the amount input is h-11 visible rather than 38px visible with a 44px hit area.
- Reviewer noted (low): the row button's aria-label replaces its content, so the current amount is not announced and duplicate ingredient names give identical row names.
- Reviewer noted (low): the unchanged check is a plain string compare ("1  cup" vs "1 cup" counts as a change).
- Reviewer noted (low): the "Sent to" toast is ad hoc markup, not a shared component.
- Reviewer noted (low): suggest mode shows amounts as stored by the author (not converted to the viewer's unit setting, not scaled), so a metric viewer sees "1 cup" and may reply in grams; the recorded old amount is always the author's stored value.
- Reviewer noted (low): the SuggestMode send-button helper uses a regex name for /^Send to/ (the page test uses the exact name), and there is no test for the More sheet path for unverified users; the sendingRef guard is belt and braces (the disabled button already prevents a second send).

### RL-106 A suggestion opens as a full thread screen

- Setup: two verified accounts (preview or `npm run dev:emulated`), one owning a recipe and one who has suggested a change on it. Check at 390px and 320px.
- From each side, tap Replies (owner), Reply (suggester) or a closed row on the recipe page: it opens `/recipe/:id/suggestion/:suggestionId`. Header: Back, "Suggestion", and an Open, Approved or Declined tag. The suggestion is pinned on top in a rounded card: avatar, "<name> on <recipe title>", age, then the message.
- Reply both ways. Your bubbles are on the right in sage, theirs on the left in grey with an avatar, each with a time under it. The view should scroll to the newest reply on open and after each send, and the input should keep focus after sending (jsdom cannot check either).
- A long unbroken message (a URL or a 200-character word) must wrap inside its bubble at 320px, with no sideways scroll. Bubbles stop at 260px wide.
- The reply bar sits at the bottom above the home indicator on an iPhone (safe area). The send button is grey when empty and takes the primary colour once there is text; its tap area is 44px.
- Go offline and send: within 5 seconds "Couldn't send that reply. Please try again." shows above the reply box and the text stays in it.
- Send more than 30 replies in an hour (emulators): "You've sent a lot of replies recently. Try again in a while." and the draft stays.
- As the owner on a pending suggestion: Decline asks "Decline this suggestion?" and the suggester is notified; the tag turns Declined and the buttons go. On another pending one, Approve opens the variation composer with the message filled in. The suggester never sees these buttons, and neither does the owner once the suggestion is closed.
- Deep link the thread URL signed out, as a guest, or as a third verified account: "Couldn't open this suggestion" with a Back button, and no reply box. Signed out there is also a Sign in button that opens the sign-in dialog.
- With the network cut before opening the thread (so nothing is cached), the spinner gives way after about 8 seconds to "Couldn't load this suggestion" / "Check your connection and try again. If it keeps happening you may not have access to this suggestion." with Retry; reconnect and tap Retry and the thread should load.
- Switch between two threads with back and forward: a half-typed reply, an error or an open Decline dialog on one must not appear on the other.
- Keyboard: on an iPhone (Safari) and on Android (Chrome), tap the reply box and confirm the reply pill stays visible above the on-screen keyboard. The page is `h-dvh`, which does not shrink for the keyboard in iOS Safari or Chrome Android's default resize mode, so this is the likeliest layout bug.
- With a screen reader on, a reply from the other person arriving while the thread is open should be announced (the list is `aria-live="polite"`). Say if opening the thread reads out the whole history.
- Reviewer noted (low): the placeholder (`text-neutral-600` on `bg-neutral-100`) is about 4:1.
- Reviewer noted (low): the reply input has no `maxLength`, and rules-side length caps on replies were not verified.
- Reviewer noted (low): leaving the page mid-send loses the draft and any error, the same as the old inline thread.
- Reviewer noted (low): the `useSuggestionReview` double-fire guard reads render state; a `useRef` guard would be stricter (same as RL-105).
- Reviewer noted (low): switching threads mid-Approve resets the in-flight guard, and the old hook instance can still navigate to the variation composer when its approve resolves (rare).
- Reviewer noted (low): a send still in flight when the user leaves the thread loses its error and draft silently (same as before).
- Reviewer noted (low): an empty snapshot that arrives after the 8-second timeout swaps the connection copy for the "Couldn't open this suggestion" copy.
- Reviewer noted (low): Retry loops through the same denial if the rules or an index are missing. If the thread never loads for a participant, check the rules and index deploy state (RL-022) before blaming the network.

### RL-105 Suggestions are a section under the recipe body, with open cards and closed rows

- Setup: needs two verified accounts (preview or `npm run dev:emulated`). As the owner of a recipe with one pending and two closed (one approved, one declined) suggestions, open it at 390px. Then repeat as the suggester, and at 320px.
- The section sits after the method, nutrition, notes and credits, and before the branch carousel (it used to be above the recipe body). Owner heading "Suggestions" with "1 open · 2 closed" beside it; the suggester sees "Your suggestion" and only their own. With nothing to show there is no section.
- Open suggestion: a raised card with the suggester pill (taps to their profile), the age, an "Open" tag, the message, then Decline, Replies and Approve at 44px. At 320px the three labels must stay on one line (the Replies icon hides under 400px; reasoned, not measured). The suggester sees one "Reply" button instead.
- Replies, Reply and a closed row open the thread screen (since RL-106; they used to expand the thread inline). Closed rows show "Approved" or "Declined" tags and the message on one line, cut with an ellipsis.
- Decline (was Reject) still asks "Decline this suggestion?", then notifies the suggester. Approve still adds them as a collaborator and opens the variation composer with the message.
- Pending suggestions are no longer the first thing on the page; the owner is nudged by the badge on More and by the Activity tab. Say if that is too quiet.
- A failed Decline shows "Couldn't decline that suggestion. Please try again." (a failed Approve is unchanged).
- Reviewer noted (low): `SuggestionList` hand-rolls its button classes instead of using `ui/Button`, so it drops the active scale and uses `opacity-50` where Button uses 45.
- Reviewer noted (low): the danger alert is `text-danger-600`, about 3.7:1 on a dark surface; the project pattern for alerts is `text-danger-700 dark:text-danger-300`, which conflicts with the no-`dark:` rule. Revisit when RL-117 brings dark back.
- Reviewer noted (low): the open card's `bg-surface shadow-md` is nearly invisible in dark mode (design note).
- Reviewer noted (low): the non-owner button reads "Reply", not "<n> replies · join the chat".
- Reviewer noted (low): focus does not move into the thread when it expands. (Moot since RL-106: the thread is its own screen.)
- The Replies icon is hidden under 400px so the three labels fit; "Working…" on the approving card gets less padding. Reasoned, not measured.

### RL-104 The recipe page footer shows Edit or Suggest beside a wider Branch this recipe button

- At 390px and 320px check three cases. Your own recipe: "Edit" (pencil) beside "Branch this recipe". Someone else's cloud recipe: "Suggest" beside "Branch this recipe". A recipe saved on this device: "Edit" plus "Branch this recipe", as before (pre-existing behaviour). A Branch-only footer cannot occur today.
- At 320px every label sits on one line, nothing clips (widths come from the content, split about 1:2; the icon on Edit and Suggest is hidden under 360px; this is reasoned, not measured, so look closely at Suggest and Branch this recipe). The footer stays at the end of the page and scrolls with it, with clear space under it on an iPhone home indicator.
- Edit opens the editor, Suggest turns the page into suggest mode (RL-107; verified accounts, others get the sign-up dialog), Branch opens the variation screen; signed out, Branch shows the existing sign-up screen on /vary.

### RL-103 Method steps get numbered discs and nutrition is a collapsed card under the method

- On a recipe with nutrition, find the "Nutrition per serving" card below the method (before notes and tags). It is closed on load. Open and close it by tap, then with the keyboard (Tab to it, Enter or Space); the chevron flips. Open shows Calories, Carbs, Fat, Protein tiles (g units, no unit on calories) and "Estimated from ingredients. Changes with each branch." Moving to another recipe shows it closed again.
- Scale servings with the stepper while the card is open: the numbers must not change.
- A recipe without nutrition shows no card at all.
- Method at 390px and 320px: sage-cream numbered discs. Try a very long step and four macro tiles with three-digit values (for example 1,250 kcal): nothing overflows sideways, text wraps. The card header and each step feel like 44px targets (jsdom cannot check this).
- Tap a step to tick it: disc fills green with a check and the text is struck; Tab to a step and press Space toggles it. Ticks vanish on reload. Oven temperatures still follow the units setting.
- The open (newest) chat recipe card shows the same collapsed Nutrition card after the method (steps there are not tickable); nutrition renders only inside the expanded body. The shared page (/shared/:id) got the new method and the card too.
- Note: the old "estimated, per serving (of N)" line is gone; the count no longer appears in the card.
- Reviewer noted (low): the nutrition card's mt-[18px] and Method's mt-[26px] are overridden by the parents' space-y-4 and space-y-5, so spacing drifts 2 to 4px from the spec.
- Reviewer noted (low): ticked step text is line-through opacity-60 and the ticked disc check is about 3.7:1 contrast; verify at QA.
- Reviewer noted (low): the compact preview hides the nutrition card. That matches the old compact behaviour (it was `!compact` before too).
- Reviewer noted (low): SharedRecipePage had pre-existing dark: classes (removed in RL-113).
- Steps with repeated numbering across groups (1, 2 in each group) tick independently.

### RL-102 The recipe body shows pills, an inline servings stepper, the Scaled strip and tick-off rows

- Open a recipe with nutrition and one without, at 390px and 320px: the pills wrap cleanly (author, time, difficulty, kcal, and prep and cook when both are set). The kcal pill appears only with nutrition. Tap the author pill: their profile opens. A local-only recipe has no author pill.
- The servings stepper sits at the right of the Ingredients heading and does not overflow at 320px (also try a long group name and long ingredient names and notes, which should wrap).
- Scale up and down with the stepper: a terracotta "Scaled ×n from N." strip appears, amounts turn terracotta, and Reset (underlined) restores the stored count and removes the strip. Moving to another recipe starts unscaled. The minus and plus buttons and Reset feel like 44px targets on a phone (jsdom cannot check this).
- Tap rows to tick and untick (whole row is the target); ticked rows get a sage circle with a check and a struck name. With a keyboard, Tab to a row and press Space: it toggles and a focus ring shows on the circle. Ticks vanish on reload.
- Switch units in Settings and confirm amounts on the recipe page still convert.
- The chat recipe card and the parent preview in the chat still read well: same row layout without the circle, servings as a pill, no author pill, no stepper.
- Shared recipe page (/shared/:id) also picks up the new pills and rows (RL-113 later replaced its header and author chip with the banner).
- The nutrition card now sits below the method (moved by RL-103).
- Reviewer noted (med, follow-up ticket): RecipeDetailPage.tsx still renders its old "Added by" avatar button below the content, so every recipe with a named author now shows the author twice (the new pill and Added by). Remove one in a follow-up.
- Reviewer noted (med, resolved by RL-113): SharedRecipePage now renders through RecipeContent, so it has the kcal pill, and the Added by button is gone.
- Reviewer noted (low): the unticked circle border-neutral-400 on bg-surface is probably under 3:1 non-text contrast (ticket-specified value). Check at QA; use neutral-500 or 600 if it fails.
- Reviewer noted (low): UserPill is 12px while the other pills are 13px (RL-088 component).
- A one-serving recipe now reads "1 serving" in the servings pill, not "1 servings".
- A very long author name is clipped inside the pill at 320px (the author link is "Open author, <name>").

### RL-101 A branch shows the sage lineage strip

- Open branches at depth 1, 2 and 4 or more, at 390px and 320px: a sage rounded strip under the title and family label. Depth 1 reads root, current. Depth 2 reads root, parent, current. Depth 4+ reads root, "+N", parent, current. Nothing overflows sideways at 320px, with long titles or long author names (the crumbs wrap).
- Tap every crumb: each opens that recipe. Tap "+N": the middle crumbs appear inline. Crumb targets feel 44px tall (jsdom cannot check this, look on a phone).
- The sentence reads "<author> asked for "<prompt>" on <parent author>'s <parent title>." Tap the author name: their profile opens. A branch with no prompt reads "Branched from <parent title>."
- "See what changed" opens the diff against the parent. An original recipe shows no strip.
- VoiceOver: the nav is read as "Recipe lineage", the last crumb as "current page", and the +N button as "Show N more".
- The old breadcrumb and Prompt box are gone; LineageBreadcrumb.tsx and its (nonexistent) test were removed, nothing else imported it.
- After pressing "+N", focus moves to the first revealed crumb; navigating to another branch collapses the strip again.
- Reviewer noted (low): the crumb cut `slice(0, 18)` counts UTF-16 units, so an emoji at the cut could split; the root emoji prefix is not counted in the 18 (undocumented, fine for the spec).
- Reviewer noted (low): the author link in the sentence has no enlarged hit area (inline links are exempt).
- Reviewer noted (low): until the lineage loads the sentence omits the parent ("<author> asked for "<prompt>"." or "Branched from a recipe."). A permanent lineage failure leaves it that way, there is no retry.
- Reviewer noted (low): crumb rows use a 24px row gap so wrapped 44px targets do not overlap; at 320px a depth-3+ chain must be tapped crumb by crumb.

### RL-100 The recipe page header follows 2a and 2b, with the More menu as a sheet

- Open an original recipe at 390x844 and 320px: title in the heading font beside a 76px emoji blob, description under it, buttons (back, version tree, heart, More) in a flat row. A very long title wraps and does not push the blob off screen.
- Open a 2-deep branch at 390x844 and 320px: a 230px peach hero with a large emoji, the four buttons floating over it, the title, and a bold green "<root emoji> <root title> variation" label. The label appears only once the family has loaded (no wrong label while it loads). The description is not shown.
- On an iPhone with a notch (or PWA mode), the floating buttons sit below the notch, readable over the peach hero.
- More opens a bottom sheet. As owner: Edit recipe, Delete, See the family, Copy share link. As a non-owner on someone else's cloud recipe: Suggest a change, See the family, Copy share link. Each does what the old menu item did, except Suggest a change, which now enters suggest mode (RL-107) (Edit opens the editor, Delete asks to confirm, Copy share link shows "Link copied" or the manual-copy box, See the family opens the tree). The Version tree button in the header also opens the tree.
- Close the sheet with Escape and by tapping outside: focus returns to the More button. The pending-suggestions count badge still shows on More, and a screen reader reads "More options, N suggestions pending".
- Signed out, tap the heart: the sign-in prompt opens. Back still returns to where you came from.
- Reviewer noted (med): index.html has no viewport-fit=cover, so env(safe-area-inset-top) is 0 and the floating branch buttons can sit under the status bar or notch in an installed PWA / standalone mode. Decide whether to add viewport-fit=cover (it needs safe-area handling elsewhere and changes the whole app, so it was not done here) and check in standalone mode.
- Reviewer noted (med, author to confirm): the recipe header is no longer sticky, so back, heart and More scroll away on a long recipe. The ticket spec does not ask for sticky; system back still works.
- Reviewer noted (low): removing RecipeContent's h2 leaves a heading jump from h1 to h3 on the recipe page until later tickets add section headings.
- Reviewer noted (low): EllipsisVertical in ui/icons.tsx is now unused.
- Reviewer noted (low): 320px wrapping is untested (jsdom).

### RL-099 Explore opens with a row of newest-recipe tiles

- Swipe the row sideways on iOS Safari and Android Chrome: tiles snap to the left edge, no scrollbar shows, and the page itself does not scroll sideways.
- Check the 200px tiles at 320px wide: a long title wraps to two lines, a long author name clips inside its pill, nothing overflows.
- Tab through it: each tile, then its author pill, in order, with a visible focus ring. The tile link reads "Open <title>" to a screen reader; the author link is easy to hit (44px).
- The heading says "New this week" when every tile is under 7 days old, otherwise "Newest". Tiles with variations show a sage "n branches" tag (singular for 1).
- Open the search pill and type, pick Favorites or a tag chip: the row disappears; clear it and the row returns. It is also absent in local-only mode and while loading.
- No vertical wobble in the row; the author focus ring is not cut off at the bottom; a tap on the lower title line opens the recipe, not the profile.
- Reviewer noted (low): the same recipe appears twice on the page (tile "Open X" and row "X") and each title is an h3 twice in the headings list.
- Reviewer noted (low): the tile link's focus ring outlines the whole li (title and meta) rather than just the square.
- Reviewer noted (low): the local-only absence test is vacuous with respect to the guard (the feed is undefined there anyway) and only protects against local records ever being fed to the tile source.

### RL-098 Explore replaces the Library at /

- Check signed out, anonymous and verified, at 390x844 and at 320px wide (no horizontal page scroll; only the chips row scrolls sideways).
- The kicker above "What's growing" matches the day and time of day (morning 5 to 12, afternoon 12 to 17, evening 17 to 22, night otherwise).
- The old header bell, profile and settings buttons and the My Recipes / Explore tabs are gone. Your own recipes are on You, other people's kept copies on Saved.
- Tap the Search button: a pill opens and the keyboard focus is in it. Type a word: the list filters, the "N results" line shows, and with more pages "Searching the N recipes loaded so far" shows with Load more. Escape (hardware keyboard), the X, or the Search button again clears the search, closes the pill and puts focus back on the Search button.
- Chips: All, Favorites (not signed out), Following and the people you follow (verified accounts that follow someone), then the tags. Tap a tag: the list refetches; tap it again or Clear tag to clear. Check the row scrolls sideways at 320px.
- Rows: emoji circle, title (a long title truncates), the author pill and time, a heart when favourited, a sage branch count when it has variations. The row opens the recipe; the author pill opens the author's profile and is easy to hit. With a screen reader the row reads as just the title.
- Load more appends the next page.
- Load the page, then turn the network off and return to it (or reload from cache): the terracotta "You're offline. Showing what was loaded before." banner shows above the list.
- Turn the network off and load / fresh: "Could not load" in the terracotta error layout with the offline copy and Try again.
- A local-only build (no Firebase env) lists the device's recipes under the same header with only the All chip and no author pill, and "You haven't created a recipe yet" when empty.
- Reviewer noted (low): the row link has `aria-label={title}` while the h3 title is a separate heading, so screen readers hear the title twice, and the link name leaves out the Favorited and branch text. This matches the ticket's "named exactly the title"; `aria-hidden` on the h3 would remove the repeat.
- Reviewer noted (low): a very long author name at 320px is cut off hard with no ellipsis, because the pill is an inline-flex box (the same UserPill limit as RL-091).
- Reviewer noted (low): no tests cover the Following filter listing recipes, the "No recipes from followed users" empty state, a followed-person chip opening their profile, or the local-only loading skeleton. The old LibraryPage tests had none of these either, so nothing was dropped.
- Reviewer noted (low): the Privacy and Cookie Policy text still says "last Library tab", which the app no longer stores. The author needs to reword it.

### RL-097 Five-slot bottom nav

- On iOS Safari and Android Chrome at 390x844, and at 320px wide: the bar shows Explore, Saved, a raised terracotta Create circle, Activity and You, sits above the home indicator, and nothing on Explore, Saved, Activity or You is hidden behind it when scrolled to the bottom.
- Each tab opens its page and only that tab turns terracotta (Explore only on /). Create opens the chat full screen with no bar. (Superseded by RL-125: Create opens the sentence builder at `/new`, with the bar, and turns terracotta there.)
- Signed in with a verified email and an unread notification: the Activity badge shows the count, and clears after Mark all read on Activity. No badge signed out, anonymous or unverified (even with unread items), or in a local-only build. With a screen reader the link reads "Activity, 3 unread".
- Settings opens from the gear on You and Back returns to You. Settings has no bar now; check its last row (Sign out) clears the home indicator.
- Tab with a keyboard: focus moves through the bar left to right.
- The update bar ("Update available") now sits above the nav; on pages without the nav it floats about 22px higher than before.
- The New recipe button (FAB) on the library is gone; Create in the bar replaces it. The library header still has its own bell, profile and settings buttons until RL-098.
- Reviewer noted (low): the always-mounted fixed role=status `UpdatePrompt` wrapper holds an 8px strip that can eat taps; `pointer-events-none` on the wrapper and `pointer-events-auto` on the card would fix it (pre-existing).
- Reviewer noted (low): the nav links have no focus-visible style beyond the browser default.
- Reviewer noted (low): `useNotifications` is now subscribed up to three times on / (nav, library bell, Activity page) until RL-098 removes the bell; a shared context would fix it.
- Reviewer noted (low): nothing asserts Create is never `aria-current`. (Superseded by RL-125: Create is now current on `/new`, and that is tested.)

### RL-096 Another cook's profile (Organic 4a)

- Open /profile/<uid> of another cook signed out, anonymous and verified, at 390x844 and 320px (no horizontal scroll): Back icon top left (goes back, or home on a deep link), blob avatar, heading-font name, full-width "Follow <name>" button. Check a very long display name.
- Follow and Unfollow as verified: label flips to "Following" (secondary). Signed out and anonymous: the button opens "Sign in to follow <name>" (RL-108). Turn the network off and tap Follow: the error line shows under the button.
- Four tiles (Originals, Branches, Followers, Following) fit at 320px and are not tappable. The views and favourites line is hidden when both are 0.
- Started and Grew tabs: Started has recipes with no parent and "<n> branches" or "No branches yet"; Grew has recipes with a parent and the prompt in quotes, or "Branched" when there is none.
- Another cook's Started tiles show "<n> branches" only when n is above 0 and never "No branches yet" (only that author's own recipes are fetched, so a root other people branched could be wrongly labelled). Originals and Branches show "–" until recipes load.
- Loading skeleton, "User not found" (bad uid) and the terracotta load error with Try again (network off) all have the Back button.
- Reviewer noted (med): when `getUserRecipes` fails the hook returns an empty list, so the public profile shows 0 and "Nothing here yet." with no error or retry. It needs an error flag in `useUserRecipes`; for /groom, the ticket did not cover it.
- Reviewer noted (low): the test mock always returned `isLoading: false`, so the skeleton path was untested before this round (now covered).
- Reviewer noted (low): the name heading is an h2 on a page with no h1, and the sign-up dialog title falls back to "this cook" while the button falls back to "Anonymous".

### RL-095 Own profile (You tab layout)

- As a verified user, anonymous, signed out, and in a local-only build, at 390x844 and 320px (no horizontal scroll): identity row (blob avatar, heading-font name, "Cooking since <Month YYYY>" or "Guest · this device only"), Settings icon top right going to /settings.
- Anonymous: the guest card reads "Your bookmarks only live on this device" and "Add an email to keep them if you switch or lose this device." with the email form and Terms box inside it. Tapping the avatar or name still opens the sign-up prompt.
- Four tiles (Originals, Branches, Followers, Following) fit at 320px; Followers and Following toggle their lists. The "<n> views · <n> favourites" line is hidden when both are 0.
- Started and Grew grids: counts match the tiles, tints rotate, "<n> branches" or "No branches yet" under Started, the prompt in quotes under Grew. A branch you made of someone else's recipe appears under Grew only. Check a very long display name and recipe title at 320px.
- Network off before the first sync: the "You're offline" line shows; a fresh sign-in shows two skeleton tiles for up to 6 seconds.
- Signed out: "You're browsing" with Sign in. Local-only: "Your recipes" heading, tabs and grid, no identity or stats.
- Public profile load error (turn the network off, open /profile/<uid>): terracotta error state with "Try again".
- Reviewer noted (low): the following list has no error state, so a failed fetch reads "Not following anyone yet" (pre-existing), and both lists use a "Loading..." text line.
- Reviewer noted (low): if `useLocalLibrary` never resolves the skeleton shows forever (the 6s cap only covers the sync wait).
- Reviewer noted (low): `handleSaveName` has no in-flight guard or try/catch and the name Input has only a placeholder, no label (pre-existing).
- Reviewer noted (low): the `EmailLinkingForm` `bare` branch has no direct test and its mis-indented `!bare &&` block is cosmetic.
- The name edit field now stacks above Save and Cancel beside the avatar; check it at 320px. A branch with a blank prompt shows "Branched" under Grew.
- The pencil badge on the avatar is kept from the old layout (not in the spec); say if it should go. Stat tiles now always show, even at zero.

### RL-094 Avatar sheet

- As a verified user on the preview, tap the avatar on My Profile and the Account row in Settings: both open the "Edit avatar" bottom sheet (Photo, Initials, Emoji). An anonymous user still gets the sign-up prompt from the profile avatar, and the Settings row still goes to the profile.
- Emoji: save an avatar on each of the six swatches (selected one is ringed), pick a few emoji, Save closes the sheet and the profile and Settings row show it. Switch to Initials and save. Photo: Upload a photo, check the crop preview, save.
- Tap the backdrop or press Escape: the sheet closes without saving, and reopening starts from the saved avatar.
- At 320px check six swatches fit on one row with no horizontal scroll, and the emoji grid stays 5 columns. Camera capture ("Take photo") and a colour for Initials are out of scope.
- Failure: with the network off, Save shows "Couldn't save your avatar. Try again." and keeps the sheet open (a Firestore write may queue offline instead of failing, so this may not trigger).
- Reviewer noted: Emoji mode is tall (about 980px against a 90dvh panel), so Save sits below the fold on a phone and the preview scrolls away (consider a sticky Save footer).
- Reviewer noted: Escape or a backdrop tap is allowed while Save is in flight, so a failed save's alert can be lost (needs `dismissible={!saving}` with the saving state lifted).
- Reviewer noted: the selected emoji ring is primary-600 (accent-700) rather than the ticket's accent, and the emoji preview also gets the 52px heading font.
- Swatch ring is 1px ground then 2px text (not the ticket's 3px and 5px) because only 2.4px separates swatches at 320px; check it reads as selected.

### RL-093 Settings grouped list

- Settings is now Account, Appearance, Your data, Legal, then a Sign out card. At 390x844 and again at 320px (no horizontal scroll, long email truncates, Units segments wrap under the label) walk every row.
- Export my recipes: the "Exported N recipes" line shows under the row. Download my data: Preparing, then the status line. Import recipes: pick a file, status line shows. Delete recipes on this device: confirm copy is unchanged for verified and for anonymous or signed-out.
- Terms, Privacy and Cookie rows open their pages. With PostHog configured, the analytics switch toggles by tap and by keyboard (Tab to it, Space); track is green on, grey off.
- Sign out as a verified account signs out at once; as an anonymous account the "Sign out of this anonymous account?" confirm shows. The profile no longer has a Sign Out button.
- Back returns to the previous page, or to the profile when Settings was opened directly.
- Account row: the Avatar is forced to 40px with a child selector, as on the Activity page. The row only goes to `/profile` for now (RL-094 adds the avatar sheet). The old "Add an email to keep your recipes" line is gone from Settings; the profile still carries it.
- Legal text still quotes the old labels: `terms.ts:84` says 'Use "Export All Recipes" in Settings', and `privacy.ts`, `cookies.ts` and `terms.ts` quote "Delete Recipes on This Device". It is legal text, so it needs the author's decision.
- Reviewer noted (low): the second-round fixes (Units control sized to fit the card, whole-row analytics switch, rules between rows only, restored anonymous help line) were not re-reviewed or measured at 320px, and nothing asserts the Units track fill, so check those on the 320px walk. Export, import and delete-on-device have no try/catch or in-flight guard (unchanged from before this ticket; for /groom). A verified user with no display name shows as "Anonymous" in the Account row, as on the profile. The history case of the Back button (navigate(-1)) is untested.

### RL-092 Activity page component

- No route yet (RL-097 adds `/activity`), so nothing is visible in the app. Check it with RL-097's entry: with unread notifications, open Activity and confirm Today and Earlier groups, the type badges on the avatars, the unread dots, and that a row marks read and opens the recipe (or the profile for a follow).
- Mark all read now shows "Couldn't mark those as read. Try again." if the write fails (the bell still swallows it). Hard to trigger by hand; the test covers it.
- Signed out, anonymous or unverified shows the 19a empty state with Sign in; local-only shows it with no action.
- The Avatar is forced to 40px with a CSS child selector because `Avatar` has no 40px size; replace with a real size if another screen needs it.
- The first line of a row (who, verb, title) wraps with `break-words` rather than truncating; check a long unspaced name and title at 320px with RL-097 that the unread dot stays visible.
- Reviewer noted (low): `text-accent-700` on Mark all read would be about 2.5:1 on a dark surface (moot while light only, RL-065; RL-117 brings dark back, so re-check then). Mark all read has no in-flight disable, so a double tap sends two writes. `open()` awaits `markRead` with no catch, so a rejection means no navigation (the bell has the same flaw). The error state has no retry action (the ticket's copy says reopen). `useNotifications` starts with `isLoading` false for a signed-in user, so "Nothing here yet." can flash for a frame; fix in the hook. The full-page empty state is `min-h-[70dvh]` under the header, so the page may scroll slightly above the bottom nav.

### RL-091 Saved page component

- No route yet (RL-097 adds `/saved`), so nothing is visible in the app. Check it with RL-097's entry: save a shared link with "Save to my library", open Saved, and confirm the row (emoji circle, title, author pill, time, chevron) opens the recipe.
- Empty copy deliberately differs from the design ("Tap the bookmark" would be false: hearts do not fill Saved). Revert if you decide favourites belong here.
- Local-only mode: Saved is always empty.
- Reviewer noted (med): a very long author name is clipped hard at the pill's edge with no ellipsis, because `UserPill` is an inline-flex box that `text-overflow` cannot cut inside. The row does not break and the chevron stays visible. A proper fix is a truncating name span inside `UserPill` with `min-w-0 max-w-full`; do it in the first ticket that shows long names (RL-092 or RL-096), or file one. Check a long name at 320px with RL-097.
- Reviewer noted (low): `useLocalLibrary` returning `undefined` is the only loading signal, so a Dexie failure would leave the skeleton up (not verified that the hook can throw). The `min-h-[44px]` on the row is redundant. The full-page empty state is `min-h-[70dvh]` under the header, so the page may scroll slightly above the bottom nav; check with RL-097.

### RL-090 Soft dialogs, empty, error and skeleton states

- At 390x844: delete a recipe. The dialog is centred, has two equal-width buttons, and Delete is dark terracotta (check its contrast, cream on accent-700).
- Open a version tree while offline: the error state is bottom-aligned and left-aligned, with the terracotta circle off the top left and a secondary "Try again" with a rotate icon.
- Open What changed on a root recipe: the "This is the original" state uses the sage circle top right and the bottom-aligned layout. Its sprout emoji sits on the blob.
- Reload a recipe on a slow connection (throttle in dev tools): skeleton blocks pulse between two beiges. With reduced motion on, nothing pulses.
- Not polished on purpose: LibraryPage empty states (RL-098 replaces them). Empty-state action buttons are 44px tall, not the design's 46px.
- Deviation: the error boundary's crash screen keeps "Back to library" (no "Try again"), because a retry would re-render the same crashing child. The reviewer judged this acceptable.
- Reviewer noted (med): the full-page EmptyState has `overflow-hidden` on its own root, which sits inside the page padding, so at 320 to 390px the off-canvas circle may end in a hard edge about 16px short of the screen edge, and text may sit about 40px in instead of 24px. Check on the 390x844 walk; if it shows, move the clipping to the page or drop the page padding around the state.
- Reviewer noted (med): the profile load error in `ProfilePage` keeps the old styling (sage circle, emoji, "Try again" without `RotateCw`). It is the same kind of failure as the other three error screens. RL-095 rebuilds that page, so convert it there.
- Reviewer noted (low): `role="alert"` wraps the whole EmptyState on the What changed error (message and button), while the version tree error has none. The compact variant does not size a node icon. `ConfirmDialog`'s new inner div is not re-indented. No test asserts the circle is `aria-hidden` or covers the reduced-motion gate.

### RL-089 Sheet primitive

- Nothing visible yet: no screen uses `Sheet`. RL-108 and RL-094 carry the visual checks (36px top radius, grabber, 45% backdrop, tap-to-close, Escape).
- No slide-up animation was added (optional in the ticket), so reduced motion needs no handling.
- Reviewer noted (med): the panel bottom padding is a fixed `pb-7`, with no safe-area term. `index.html` has no `viewport-fit=cover`, so `env(safe-area-inset-bottom)` is 0 today and the sheet should not sit under the iOS home indicator. If cover mode is ever turned on, change it to `pb-[max(1.75rem,env(safe-area-inset-bottom))]`. Check on a real iPhone when RL-108 lands.
- Reviewer noted (low): the dialog uses `max-h-[90%]` and the panel `max-h-[90dvh]`, so they can differ by a few pixels while browser chrome collapses. There is no `onClose` handler on the dialog, so closing must always go through `open` (no `<form method="dialog">` inside a sheet, RL-094/RL-108/RL-109). Dialog text defaults to `CanvasText`, so children set their own colour. The tests fire a synthetic `cancel`, so real Escape is unverified until a screen uses the sheet.

### RL-088 Shared Organic pieces

- Nothing visible yet. After RL-100, check at 390px that the blob on a recipe title is the soft organic shape, not a circle.
- Reviewer noted (med): the user pill initial is white from Avatar's generated colour (`hsl(h,55%,50%)`), roughly 1.7 to 2.3:1 on yellow and green hues. The design's neutral-900 would only flip which hues fail. Not patched here; the initial is decorative and the name sits beside it. A separate ticket could pick the text colour from the background luminance.
- Reviewer noted (low): Avatar `sm` text is 9px, the design says 10px. `UserPill` has no truncation, so a very long name can overflow at 320px unless the caller's parent has `min-w-0`. The new `Link` and `Image` icon exports collide with react-router's `Link` and the global `Image`, so alias them at import. `IconButton` has no test and no `disabled` prop; add `disabled` in the first ticket that uses it for an async action.

### RL-087 Organic text helpers

- Nothing to check until RL-098/RL-101/RL-102.

### RL-075 Branch carousel on the recipe page

- On a recipe with 3 or more children, swipe the carousel on iOS Safari and Android Chrome: cards snap and the dots follow. Tab through with a keyboard (focus rings visible, every Open reachable). With VoiceOver, cards announce "1 of 3". Open opens the branch; the network button opens the tree; "The original" row shows on a variation and not on a root.
- A leaf and a lone root with no children show no section. Check long prompts (three lines, clipped) and long titles at 320 px.
- Reviewer noted (moot while light only, RL-065): two of the three card tints are light-only with themed text, unreadable if dark mode returns; pin the text then. The active dot is also about 2.6:1 on a dark surface (moot).
- Reviewer noted (low): a failed cloud tree fetch for someone else's recipe looks the same as a leaf because useRecipeTree swallows errors. At 320px the next card peeks only 2px. If the root is not yet loaded, "The original" row is missing and the family name falls back to the viewed title.
- Dots are 24x44 hit areas around 8px marks, with a border so inactive ones are visible. Lowest text contrast on the tinted cards is 7.45:1 (text-secondary on surface-secondary).

### RL-070 Timeline view of the version tree

- On families of 1, about 8 and about 30 versions, open `?view=timeline` (or the Timeline switch) from a deep version. It should start scrolled to the filled terracotta stop with its ring; a family of 1 shows one stop labelled "Original" and does not scroll.
- Swipe scroll is smooth on iOS Safari. Tapping a stop opens the bottom sheet with sensible change tags; Open and Branch here go to the right pages. Escape and a tap outside close it and focus returns to the stop.
- A keyboard user can Tab through the stops (left to right) and press Enter or Space to open the sheet; the focus ring is visible.
- Reviewer noted (med, design call for the author): line colours accent-400 and accent-2-400 are about 1.7:1 against the cream surface, so those lines and hollow stops are faint on a bright screen. A darker palette or thicker lines would fix it.
- Reviewer noted (low): index.html has no viewport-fit=cover, so the env(safe-area-inset-bottom) padding is dead code until it is added. showModal does not lock body scroll on iOS. Accessible names collide when two lines share a label and stop number. The 6.5px per char label estimate can run a label 20 to 40px past the width for wide capitals.
- Check at 390 and 320 px: line labels do not run into stops, long titles and prompts wrap in the sheet, both sheet buttons stay 44px tall.

### RL-068 Tree view connectors and path

- On families of depth 0, 2 and 6, open the tree from different versions. Check the terracotta path runs from the original to the "Here" node and stops there, rails stop at the last sibling, and tapping a node opens it.
- At 320 px, a deep chain scrolls sideways inside the tree area while the page header and the Branch bar stay put. Tab to the tree area to scroll it with the arrow keys; node focus rings should be visible on both card colours.
- TreeIntro looked different from the tree after this ticket; RL-114 redrew it to match.
- Reviewer noted (med, design call for the author): the terracotta path differs from the neutral lines by hue only (about 1.8:1 by luminance), so colour-blind users cannot trace it. A thicker path line or a darker accent would fix it.
- Reviewer noted (low): the `"prompt" · author` line truncates the author when the prompt is long. `setView` uses replace, so the Timeline and Map tickets must keep that in mind.

### RL-067 Version tree page shell

- On a family with at least three versions from two accounts, open the tree. Check the subtitle numbers and month, that the "Branch from" button label shows the current recipe's title and opens the variation composer, and that Back from the tree returns to the recipe in one press.
- Check at 390 and 320 px: the bar stays at the bottom, the last node scrolls clear of it, and the long title truncates to one line. On an iPhone, the bar clears the home indicator.
- The view switch is hidden for now (only Tree exists); `?view=anything` still shows the tree.
- Reviewer noted (med): if a family has no record with a null parent (a partial cloud tree), the page shows "Recipe not found" for a recipe that exists, with no title or Branch bar; the tree hook exposes no error, so a failed tree fetch cannot reach Try again either (likely pre-existing).
- Reviewer noted (low): loading and error states have no `role="status"` or `role="alert"`; the 30px title has no `break-words` for an unbroken long title at 320px; `env(safe-area-inset-bottom)` is always 0 until `index.html` gets `viewport-fit=cover`; the "cooks" count undercounts when pre-auth `'local'` recipes mix with real accounts; the new `ancestorChain` returns no ancestors if a recipe is missing from its own tree list.

### RL-066 recipeDiff

- Covered by tests and has no UI yet; nothing to check in a browser.

### RL-065 Light only

- Update the PWA first (tap Reload on the update bar) before checking: the old shell keeps serving until then, and a returning user with a stored `dark` preference may briefly see dark.
- In Settings, the Theme row (and the Appearance heading) is absent; Units is still there.
- With the OS set to dark mode, hard reload: Library, a recipe and the version tree still show the light Organic look, and the browser chrome (theme-color) is cream, not dark grey.
- If your browser has `recipe-app-theme` set to `dark` from before, the app is still light.

### RL-062 Organic colours and self-hosted type

- On the preview build at 390x844, walk the standing checks and confirm the cream ground, terracotta buttons and links, Caprasimo headings and Figtree body on Library, a recipe, the version tree, Settings and `/shared/:id`.
- No heading looks fake-bold (Caprasimo has one weight).
- DevTools Network shows no request to any Google Fonts host and both fonts load from `/fonts/`. An offline reload still shows the fonts.
- Dark mode is interim: dark surfaces with terracotta links until RL-065 hides it. Check it is legible, not that it is pretty.
- Include a fraction such as one third in an ingredient quantity: the Figtree latin subset may not cover U+2153 and U+2154, which would fall back to the system font.
- Reviewer noted (med, moot since RL-111: the chat bubble no longer shows a timestamp): the 10px chat timestamp is `text-primary-200` on primary-600 at exactly 4.50:1 (`ChatMessage.tsx:15`); use `primary-100` or `on-accent`.
- Reviewer noted (med): only Figtree is preloaded, so on a cold first visit headings flash in the system font and reflow; preloading Caprasimo is a one-line fix in `index.html`.
- Reviewer noted (low): small all-caps 14px Settings and edit-page section headings now render in Caprasimo and may look heavy (RL-063 or QA call); heart icons and bullet glyphs are about 3:1 (non-text); `public/icon.svg` and the PWA icons are still indigo and now clash with the cream manifest colours (needs its own ticket); dark-mode borders `dark:border-primary-800` nearly vanish until RL-065 hides dark (moot after RL-065: light only).

### RL-063 Shared UI primitives restyled to Organic

- At 390x844 check buttons (primary, secondary, ghost, danger, disabled), chips and the filter chips on Library, the unit `SegmentedControl` in Settings, inputs on the edit page, the delete confirm dialog, skeletons while a recipe loads, and an empty state.
- Tab through each with the keyboard and confirm the accent focus ring is visible.
- Disabled buttons are at 45% opacity: check they are still readable.
- EmptyState stays centred (left-alignment not attempted, so no caller was at risk).
- Primary button uses accent-700 fill (5.72:1) rather than the design's #c67139 swatch (3.03:1); author's call, a class-name change only.
- Reviewer noted (med): Skeleton default `rounded-card` vs a caller's `rounded-full`: `cn` has no tailwind-merge, so the `ProfilePage.tsx:407` avatar placeholder may render as a rounded square. Check it.
- Reviewer noted (med): the focus ring uses primary-500, about 2.7:1 on the Input's surface-secondary fill (below the 3:1 non-text minimum). primary-600 would clear it.
- Reviewer noted (med): secondary Button and inactive Chip edges use `border-border`, roughly 1.3:1, so they read as plain text rather than tappable. `border-border-strong` would fix it. This follows the ticket's spec, so it is a design call for the author.
- Reviewer noted (low): Input error border danger-500 is about 2.6:1.
- Reviewer noted (low): a long unbroken tag in an EmptyState title could overflow at 320px.
- Reviewer noted (low): the ConfirmDialog button row does not wrap.
- Reviewer noted (low): LibraryPage still hand-rolls `font-semibold`, `rounded-lg` and a `rounded-xl` search input that will not match the pill Input (page tickets).

### RL-085 Verified sign-out removes the account's own recipes from the device

- On the preview, as a verified user with some own recipes and one saved copy of someone else's
  recipe, sign out. My Recipes keeps only the saved copy. Sign back in: the account's recipes
  return once the sync lands.
- Repeat as an anonymous user with a bookmark: sign out (through the confirmation) and confirm
  the bookmark and the recipe it points at are still on the device.
- Data loss to accept or reject: the AI conversation (`chatHistory`) is never in the cloud, so a
  verified sign-out deletes those conversations from the device for good. They are not shown
  anywhere in the UI today, but they were in "Download my data".
- Legal copy not edited (author reviews wording): `src/content/legal/privacy.ts` "Recipes and
  bookmarks on your device", "How long:" line still lists only delete, "Delete Recipes on This
  Device" and clearing browser data. It should add that signing out of an email account removes
  that account's recipes from the device.
- Known gap (RL-078 reviewer note): an apply already running when sign-out happens is fine,
  because Dexie runs the two `rw` transactions on `recipes` one after the other and the clear
  comes second. A server snapshot that arrives after `signOut()` resolves but before React
  re-renders and stops the listener can still start an apply after the clear and re-add the
  rows. `recipes` reads are public, so the listener is not denied after sign-out. The window is
  a few milliseconds against a network round trip; closing it fully would mean the hook checking
  the current uid before applying (`src/hooks/useOwnRecipesSync.ts`, not in this ticket).

### RL-081 Delete Recipes on This Device copy for verified users

- As a verified user on the preview, open Settings at 390 px in both themes. Read the helper text under "Delete Recipes on This Device" and the confirm dialog. Confirm the delete, reload, and see the account recipes return. This is the author's read of the wording.
- Signed out or anonymous, the old text still shows ("cannot be undone").
- Needs the author: src/content/legal/privacy.ts lines 57 and 217 and cookies.ts:69 describe Delete Recipes on This Device as removing recipes; for a verified account they reload, so the wording overstates the removal (bump lastUpdated if edited).
- Reviewer noted (low): SettingsPage.tsx:33 drops the sync hook's !isLoading guard; handleClear has no in-flight guard (pre-existing); the promise 'load again' fails while sync status is error.

### RL-032 Remove the cloud uid migration and the stranded-identity notice

- On the emulator or preview: bookmark a recipe as anonymous, then sign in with an email that
  already has an account. The bookmark and any local recipes carry over, and the removed stranded-identity notice does not appear (the RL-109 sign-in sheet may briefly show "Signing you in…", which is expected).
- Publish a recipe as a verified user: it still publishes, and the profile's `recipeCount` no
  longer rises (nothing read it).
- Stale wording for the author (not edited, `src/content/legal/` is out of the loop's scope):
  check the legal drafts for any mention of the stranded notice or of a profile recipe count
  being maintained. A leftover `recipe-app-stranded-identity` key on an old device is harmless.
- Reviewer noted (low, pre-existing): `AuthContext` `runMigration(...).then(...)` at the two `onAuthStateChanged` drift paths has no `.catch`, so a Dexie migration rejection is unhandled and skips `setAnonymousUid` / `clearAnonymousUid` / `addPreviousUid`. It is now the only failure source.
- Not deleted: `SUPPORT_EMAIL` (still used by the legal pages and their test); the unused
  `STRANDED_IDENTITY` storage key was removed. `docs/tech-stack-review.md` still mentions the
  notice (a dated review, left as written).

### RL-086 Imports are Saved copies the sync never removes

- As a verified user on the preview: Settings, export, then delete one recipe from its page, then import the file. The deleted recipe comes back and is still there after a reload (before this change the sync removed it). The message reads "Import complete: 1 added. {n} already in your account, left as they are." Check it at 390 px in both themes.
- No page uses the Created, Branched and Saved split yet (RL-084), so "under Saved" shows today as: the restored recipe is not back on Explore or the public profile, and it is stored with owner `'local'` (DevTools, IndexedDB `RecipeAppDB` > `recipes`, its `createdBy.uid`).
- Worth a look: `canManageRecipe` treats `'local'` as owner, so the restored copy shows edit and delete. Try editing it; it should not create a cloud copy.
- Legal wording: `src/content/legal/privacy.ts` says imported recipes are kept on the device, which still holds; no change made. Author to confirm nothing about owner stamping needs saying.
- Reviewer noted (med, data): a restored import stamped `'local'` passes `canManageRecipe`, so as a verified user the edit page looks for a cloud copy, finds none, and shows "This recipe is no longer in your account." and can never save (`RecipeEditPage.tsx` 93-98 and 206-224); if the id does exist in the cloud the write is denied (`createdBy` is immutable) and shows "Couldn't save". Nothing is corrupted or published. Pre-auth `'local'` rows already behave this way; needs a ticket (hide Edit for non-own rows, or a clearer message).
- Reviewer noted (med, data): Share on such a row for a verified user throws "Publishing needs the signed-in creator" before any write, and the page silently falls back to a self-contained link with no explanation (`RecipeDetailPage.tsx` 154-170). Safe: imports are never published.
- Reviewer noted (low): an import done before the listener's first snapshot (or for an own recipe this device never had) cannot see the cloud-backed row, so it stamps `'local'` and counts it as added; the next snapshot overwrites it with the cloud copy and the row becomes Created or Branched, and the message was briefly wrong.
- Reviewer noted (low, UI): the old "Nothing to import ... no valid recipes found" message in `import.ts:84` has an em dash between those words (pre-existing, breaks the no-em-dash rule); the skipped-as-invalid wording differs between messages; the success message never says where imports land ("Find them under Saved" once the tab exists); the status line is mounted only when it has content so a repeat message may not be re-announced.

### RL-084 Created, Branched and Saved split in lib/library.ts

- Nothing to check in a browser until the rebrand's tab ticket uses `splitLibrary`. No page calls it and My Recipes is unchanged.
- Decision needed from the author: should pre-auth `'local'` rows on a device with Firebase configured count as Created (they predate accounts and are probably yours) or Saved (they are in no account)? The code keeps them in Saved because that claims nothing. Changing it is a one-line edit to the ownership test in `splitLibrary`.
- Reviewer noted (low): `splitLibrary` reads `r.createdBy.uid` and would throw on a row with no `createdBy` (`library.ts:119`); use `r.createdBy?.uid` if the rebrand feeds it cloud docs.
- Reviewer noted (low): `childCount` is keyed by root id, so every Branched card shows 0 children and sub-variations of an own branch are not counted; the rebrand's Branched tab ticket should decide whether to count them.
- Note for the author: once `'local'` rows are decided, `docs/architecture.md` "single decision point" paragraph for `canManageRecipe` (about 151-153) and a short `docs/decisions.md` entry need updating, since `splitLibrary` is a second ownership test that does not treat `'local'` as own.

### RL-080 Deleting a recipe is cloud first for a verified owner

- On the preview as a verified user, delete a recipe that has a variation. The app goes home, and both the recipe and the variation are gone from My Recipes and from Explore (reload Explore to be sure).
- Set DevTools to offline and delete another recipe. "Deleting..." shows for up to 10 seconds, then a dialog titled "Couldn't delete this recipe" reads "It's still saved in your account and on this device. Check your connection and try again." (a count line follows only when the cloud reported one, so offline it should have none). There is no "Leave anyway".
- Press Cancel: the dialog closes, you stay on the recipe, and it is still listed in My Recipes.
- Delete it again while offline, go back online, and press "Try again": the app goes home and the recipe leaves My Recipes and Explore.
- Check the dialog at 390 px in both themes: readable, buttons not squashed.
- As an anonymous user, deleting a recipe still goes straight home with no dialog.
- Worth a look: pressing Escape during "Trying again..." closes the dialog while the retry keeps running; if it succeeds the app still goes home.
- Reviewer noted (med, data): the unmount guard drops the local delete after a late `failed === 0` for a saved copy of someone else's recipe (the sync only removes own rows), so a user who swipes back during the up-to-10 s wait keeps the recipe on the device; fix is to always run `deleteRecipeTree` on `failed === 0` and guard only navigation and state (`RecipeDetailPage.tsx:231`). Try it with a saved copy.
- Reviewer noted (med, data): a timed-out cloud delete is not cancelled, so "It's still saved in your account" can stop being true when connectivity returns; the sync then removes the local row after Cancel, and a Try again during the first attempt runs two deletes (safe, but surprising). A delete queue is out of scope.
- Reviewer noted (med, UI): Escape is not blocked while a delete or retry is busy (`ConfirmDialog.tsx:44`), so the dialog closes with no feedback while the work continues; the first Delete dialog has the same gap.
- Reviewer noted (med, UI): a failed local delete or a failed `getSubtreeIds` is only logged and leaves the Delete dialog open with no message (`RecipeDetailPage.tsx` 201-211 and 256-259).
- Reviewer noted (low): the stale dialog after a late success, `trackRecipeDeleted` firing before the delete is confirmed, the `rootId` fallback to `id`, no live region for a repeat failure, and focus dropping while the buttons are disabled.

### RL-079 My Recipes and the own profile wait for the first cloud sync

- At 390x844 in both themes, sign a verified account that has recipes into a fresh browser profile. My Recipes should go from three skeleton rows to the list with no empty-state flash. The own profile shows two skeleton rows, then the list.
- Set DevTools to offline and reload: My Recipes shows "You're offline. Showing the recipes saved on this device." above the list. Go back online and the line disappears.
- Check the offline line's contrast in dark mode.
- An anonymous or signed-out visitor never sees the line or the skeleton.
- If the sync never lands, the skeleton gives way to the usual empty state after 6 seconds.
- Reviewer noted (med): offline with an empty Dexie (a fresh device) the offline line sits above "You haven't created a recipe yet" with a Create button, so a verified user with cloud recipes is told they have none (`LibraryPage.tsx` 276-280 and 378-385); needs an offline-specific empty message.
- Reviewer noted (med): if the first sync is still `waiting` after 6 s online, the page shows the "no recipes" empty state with no syncing hint; a softer empty state or a "Still syncing" line would avoid reading slowness as no data (`useOwnRecipesWaiting.ts:19`).
- Reviewer noted (low): the 6 s timer starts at page mount, not when the My Recipes tab is shown, so switching from Explore after 6 s skips the skeleton; the own profile does not subscribe to online/offline and has no offline note; the offline `role="status"` line mounts with its text already in it, which some screen readers do not announce.

### RL-078 A verified user's own recipes stay in step on every device

- Against the emulators (`npm run emulators` plus `npm run dev:emulated`) or the preview, sign the same verified account into two browser profiles, A and B.
- Save a recipe on A: it appears in B's My Recipes and profile without a reload.
- Edit it on A: B's open detail page shows the edit.
- Delete it on A: it leaves B's My Recipes.
- Set B offline in DevTools and reload: B's My Recipes still lists the remaining recipes.
- Sign B out: no console errors.
- On your own phone and computer, confirm any pre-wipe recipe from the old uid is gone after the first sync. Note any that remain (their uid was not in that device's list of previous uids).

- Also check: save a copy from a share link of a recipe authored by an account that has signed in on this device, then sign in as the verified user and see whether the copy survives the first sync (reviewer expects it to be removed).
- Reviewer noted (med, data): the tidy rule removes any row whose `createdBy.uid` is in the device's previous-uids list, but a saved copy keeps its original author's uid and is never published. A copy of a recipe by another account (or an earlier anonymous uid) that signed in on this device is deleted by the first sync (`recipeSync.ts` 99-105). The ticket text assumed that case was rare; it needs a saved-copy marker on the row or an accepted limit. Needs the author's call and probably a ticket.
- Reviewer noted (low): after a listener error (permission-denied and similar) the sync stays in `error` until the uid changes or the app reloads, and `recipe-sync` is reported once per session across uids; RL-079 must surface `error`.
- Reviewer noted (low): a failed first Dexie apply leaves the status at `waiting` with no retry until a later snapshot with a change, so RL-079 should not show an indefinite spinner on `waiting`.
- Reviewer noted (low): an apply already in flight finishes for the old uid after a uid change (RL-085 sign-out clearing could see rows re-added); every metadata-only event reads the whole recipes table.
- Needs the author: `src/content/legal/privacy.ts:57` retention wording ("until you delete a recipe, use 'Delete Recipes on This Device', or clear your browser data") no longer covers the sync removing own rows the cloud lacks and tidying other accounts' rows; legal text was left unchanged, bump `lastUpdated` if edited.

### RL-083 Editing a recipe is cloud first for a verified owner

- On the preview as a verified user, edit a recipe and tap Save. The recipe page opens with the save toast, and the edit shows on its `/shared/<id>` link.
- Edit again, set DevTools to offline, and tap Save. Within about 5 seconds the form shows "Couldn't save your changes. Check your connection and try again." above the footer's Save changes button, the draft is still there, and Save changes works again.
- Go back online and tap Save. The recipe page opens and the edit is on the `/shared/<id>` link.
- Check the error at 390 px in both themes: readable, red, in the sticky footer above the branch note and the Save changes button.
- Reviewer noted (med, UI): the save error uses `text-danger-600`, about 3.7:1 on the dark surface; use `danger-500` or `dark:text-danger-300` (`RecipeEditPage.tsx:518`).
- Reviewer noted (med, UI): (fixed by RL-110: the page's own header Cancel is now disabled while saving) the TopBar back arrow was not guarded while a save is in flight, so a user could leave mid-save and never see a failure, or be pulled back by a late success (`RecipeEditPage.tsx` about 168-181 and 261). During the offline save, check that Cancel is disabled.
- Reviewer noted (med, UI): a save that times out at 5 s may still land, so "Couldn't save" can be wrong; the edit then appears once the sync arrives.
- Reviewer noted (med, data): the page pre-checks the cloud copy and then `publishRecipe` does its own `getDoc`, so a delete on another device between the two reads would let an edit take the create path (daily window used, `recipeCount` bumped, recipe resurrected); an update-only publish would close it (`RecipeEditPage.tsx` 208-211, `firestore.ts` 73-99).
- Reviewer noted (med, data): a timed-out publish keeps running; if the user retries and succeeds, the stale first write can land later and revert the cloud to the older edit while Dexie holds the newer until the sync arrives.
- Reviewer noted (med, data): the edit is built from the render-time recipe and `put` over the whole Dexie row, so changes that arrived after the form opened are overwritten in both stores (last write wins; the fetched cloud copy is unused).
- Reviewer noted (low, data): Dexie keeps the user's tag casing until the next sync lowercases it; Dexie-only edits for an unverified owner of a cloud copy can diverge from it; tests lack a late-landing publish case and the Dexie-write-failure-after-publish branch.
- Reviewer noted (low): anonymous and local-only edits also navigate with `saved: 'cloud'`; "Saving…" is not announced; after "no longer in your account" the only exit is Cancel.

### RL-082 Saving a generated recipe is cloud first

- On the preview as a verified user, generate a recipe and save it. The recipe page opens with "Recipe saved", and the recipe is on Explore.
- Generate again, set DevTools to offline, and tap Save. After about 4 seconds the chat page shows "Couldn't save the recipe. Check your connection and try again.", the Save button works again, and nothing new appears in My Recipes.
- Go back online and tap Save on the same card. Exactly one copy appears in My Recipes and on Explore.
- The save error sits in the same red box as generation errors and has no "Try again" button (that button re-runs generation, so it is deliberately not offered).
- Reviewer noted (med, data): a publish that times out at 4 s may still land, so "Couldn't save" is not strictly true; a user who leaves instead of retrying gets a public recipe with no Dexie row until RL-078's listener fills it (`useRecipeChat.ts` about 320-329). A distinct timeout message ("taking longer than expected, tap Save again") would help.
- Reviewer noted (med, data): the built recipe is cached in `builtRef` and keyed only on the card, so a session change between a failed save and its retry reuses the old `createdBy.uid` and `publishRecipe` throws; key it on `user?.uid` too (`useRecipeChat.ts` about 315-317).
- Reviewer noted (med, UI): `saveRecipe` does not clear the previous error when a retry starts, so the old message shows next to "Saving…" (`useRecipeChat.ts` about 276-283).
- Reviewer noted (med, UI): the auto-scroll effect in `RecipeChatPage.tsx` (about 106-108) does not depend on `error`, so a save error from an older card can land off-screen.
- Reviewer noted (low): the error box has no `role="alert"`; tests lack a late-landing-publish retry case and a concurrent double-tap case; the timeout test spends a real 4 s.

### RL-069 Pure timeline layout

- Nothing to check in a browser: `layoutTimeline` is covered by tests and has no UI until RL-070.

### RL-076 Pure sync plan for a verified user's own cloud recipes

- Nothing to check in a browser yet. `planOwnRecipeSync` is pure and unused until RL-078 wires the listener, which is the ticket that makes it visible.
- Reviewer noted (low): the plan treats the snapshot as complete, so RL-078 must skip `snapshot.metadata.fromCache` and any narrowed query, or an offline device would lose its cached own rows (`recipeSync.ts` about 75-78).
- Reviewer noted (low): a Dexie row with no `createdBy` would throw and abort the whole plan (`recipeSync.ts:101`); the type forbids it.
- Reviewer noted (low): a valid cloud doc by another author sharing an id with an own local row protects that row; no test covers it.

### RL-061 Share on an unpublished recipe asks anonymous and signed-out users to sign up

- On the preview build, as an anonymous user, open a recipe saved from a share link and tap Share: the sign-up dialog shows and nothing is copied.
- As an anonymous user, open a published recipe from Explore and tap Share: its `/shared/<id>` link is copied with no dialog.
- Add an email, open the link, return to the recipe and tap Share: a `/shared/<id>` link is copied if you created it, otherwise a self-contained link.
- Repeat the first step signed out.
- Check the dialog at 390 px in light and dark mode, and on "Not now" note where keyboard focus lands (expected: top of the page, not the More options button; see reviewer note).
- Reviewer noted (med): focus is not restored to the More options button after the dialog closes (`RecipeDetailPage.tsx` about 529-532 and 139, with `SignUpDialog.tsx:28`); fix is a ref on the button focused in onClose.
- Reviewer noted (med): a failed or timed-out published check shows the sign-up dialog, so a user on a slow connection with a published recipe sees "Sign up to share" after up to 4s; consider a distinct "could not check, try again" message (`RecipeDetailPage.tsx` about 130-141).
- Reviewer noted (med): the Share item is only visually disabled while auth loads, with no text or aria hint (`RecipeDetailPage.tsx` about 533-536).
- Reviewer noted (med): the "Preparing share link..." role=status node mounts with its text so some screen readers will not announce it; pre-existing (`RecipeDetailPage.tsx` about 830-838).
- Reviewer noted (low): the early return that opens the dialog does not clear shareFallback or shareCopied, so an earlier "Copy this link" card or "Link copied" toast can sit beside the dialog (`RecipeDetailPage.tsx` about 121-141).
- Reviewer noted (low): the isSharing double-tap guard reads a stale closure value but is safe in practice (`RecipeDetailPage.tsx:120`).
- Reviewer noted (low): tests stub showModal and close so they cannot catch focus behaviour, and there is no test for the auth-loading disabled state or the 4s timeout path (`RecipeDetailPage.test.tsx`).

### RL-059 Published recipes store their tags in lower case, so the curated Explore chips find them

- On the preview build, as a verified user, generate a recipe whose AI tags include a capitalised cuisine (for example ask for "an Italian pasta dinner") and save it.
- Open Explore and tap the `italian` chip (or whichever chip matches the cuisine): the new recipe is listed.
- Open the recipe's own page: its tags still show as generated (for example "Italian"), not lower-cased.
- Reviewer noted (low): a non-string tag would make `normalizeTags` throw before any write, so nothing partial is stored; the recipe schema types tags as strings, so this is theoretical. (low) Re-publishing a recipe rewrites previously mixed-case published tags, which is intended; nothing backfills old documents (RL-042 wipes them).
- Reviewer noted (low): no test covers `publishRecipe` applying `normalizeTags` itself, only the pure function, in line with the repo's lib-tests convention.

### RL-060 Erasing a recipe owner keeps other people's suggestion threads, with the owner side anonymised

- The Privacy Policy marker `[DEPENDS ON RL-060 ...]` is gone from "Suggestions and replies". Re-read that paragraph during the RL-046 sign-off.
- The erase table in `docs/operations.md` ("Data requests") changed for suggestions on the erased user's own recipes. Read it before the next real erasure request.
  - Reviewer noted (low): a reply by a suggester in a kept thread now notifies `deleted-user` (`src/services/firestore.ts` about lines 637-645). It is newly reachable in this direction because those threads used to be deleted; practical impact is near zero because the thread is not reachable in the app.
  - Reviewer noted (low): the permanent fix for the stray-reply lookup is a collection-group `fieldOverride` for `messages.fromUid` in `firestore.indexes.json`. It is outside this ticket and needs a deploy, for the author to decide.

### RL-054 Product events go to PostHog, only after consent (PR #68)

- Build the preview with `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST` set. In a fresh browser profile with the network panel open, load the app: the consent banner shows and there is no request to the PostHog host.
- Choose "No thanks", use the app, reload: still no PostHog request, and no `ph_*_posthog` cookie or localStorage entry.
- In Settings, turn analytics on: events appear in PostHog's live view. Create a recipe: a `recipe_created` and an `$ai_generation` event arrive, and neither carries the prompt or recipe text.
- Signed in anonymously, the person in PostHog is the anonymous uid. After signing in with an email, it is the account uid, with no email or name.
- Turn analytics off in Settings: requests stop straight away.
- Build without the two variables: no banner, no Settings toggle, no console errors.
- Read `/privacy` and `/cookies`: the PostHog sections match what you saw.

### RL-056 A signed-in user can download all their data, local and cloud, from Settings

- Run `npm run emulators` and `npm run dev:emulated` (or use the preview build). Sign in with a verified email account, favourite a published recipe, follow another account, and make a suggestion on someone's recipe. Settings, Data, "Download my data": the button shows "Preparing..." and is disabled, then a `recipe-lab-data-<date>.json` downloads and a status line says so. Open it: valid JSON, `version`, `exportedAt`, `uid` at the top, and the favourite, the follow and the suggestion (with any replies) are in `cloud`. Local recipes and bookmarks are in `local`.
- Search the file for the other account's uid and display name: neither appears. They show as `other-user-1`, and the other person's reply text is still present.
- Signed in anonymously (and signed out): the button reads "Download my data (this device only)", and the file has `cloud: null` and the note that anonymous accounts keep data on this device only.
- Failure display: stop the emulators (or go offline) and click it as a verified user. Expect an alert saying the online data could not be read, and a file with the local part and an `errors` list. A signed-in but unverified email account sees "1 part could not be fully read" (suggestions are verified-only) and the rest of its data.
- Double-tap the button: one file only. The status text names the missing parts in plain words and says "Verify your email to include suggestions" for an unverified account. The helper line under the button explains the difference from Export All Recipes.
- Reviewer noted, not fixed (low): the status messages appear conditionally rather than in an always-present live region; the filename date is UTC, so it can be a day off near midnight; the status regions follow the page's existing pattern.
- Check it at 390px wide and in dark mode: the button is at least 44px tall and the status text is readable.
- Privacy Policy wording may now point at this download (author re-signs per RL-046). Lines that could now point at it (not edited, author-owned): `src/content/legal/privacy.ts` line 29 ("To see, export, correct or delete...") and line 208 (the portability line, which already carries a `[DEPENDS ON RL-056]` marker); `src/content/legal/terms.ts` line 84 ("Use Export All Recipes ... to keep a copy") could also mention Download my data.

### RL-043 A verified user's cloud favourites appear on every device they sign into

- Run `npm run emulators` and `npm run dev:emulated`. In browser profile A sign in with a verified email account and favourite a published recipe (Explore). In browser profile B (fresh, no local data) sign in to the same account, open Explore and pick Favorites: the recipe appears with a filled heart once its page is loaded. Open the recipe: the heart is filled.
- In a profile signed in anonymously, open the Library and a recipe with the network panel open: there is no `favorites` list query (no `runQuery`/Listen request on `favorites`).
- On B, unfavourite the hydrated recipe, then reload: it stays removed locally (the cloud doc was deleted by the unfavourite, so the next session's read does not bring it back).
- Reviewer noted (not fixed): (med) a failed or timed-out first fetch is never retried this session, because the uid is marked hydrated before the fetch; the cheap fix is `hydratedUids.delete(uid)` on a null result, deliberately not applied to keep the once-per-session contract, and the author may prefer a retry. (med) An unfavourite whose cloud delete failed or timed out comes back next session, because the removal set is in memory. (low) "Delete Recipes on This Device" followed by a new session re-adds every verified cloud favourite as a row for recipes no longer on the device: confirm the UI tolerates such rows, and consider the Settings copy. (low) `pushLocalFavoritesToCloud` right after hydration can report inflated `skipped` counts for rows already in the cloud. (low) The module-level `hydratedUids` and `removedThisSession` sets leak across tests that reuse a uid.
- Known limit, see backlog/DECISIONS.md: on B, the Favorites filter on My Recipes does not show the favourite (its recipe is not in this device's Dexie), and on Explore it shows only once the recipe's page has been loaded.

### RL-036 The recipe editor rejects negative amounts and enforces the same size caps as the rules

- On the edit page type `-1` as an ingredient amount and press Save. "Amounts can't be negative." should appear under Ingredients, Save should be blocked, and a screen reader should announce it.
- Paste a title over 200 characters: "Titles can be at most 200 characters." appears by the title and Save is blocked.
- Add more than 100 ingredient rows or 100 step rows (blank rows do not count): the matching "at most 100" error appears and Save is blocked.
- Reviewer noted (not fixed, page is outside this ticket's files): (med, fixed by RL-110: Save now focuses and scrolls to the first invalid field and the footer is sticky) Save on RecipeEditPage did not scroll or focus to the first error; (med) the title, servings, prep and cook errors rendered by Input.tsx have no role=alert, aria-describedby or aria-invalid, so they are not announced; (low) 'Amounts can't be negative.' does not name the row; error text uses text-danger-500 (about 3.8:1 on a light surface); the 100-item caps are only reachable on Save and the message does not say how many to remove; the rules-sync test checks only the three numbers, not that hasBoundedContent is still wired into create and update. Worth one follow-up ticket for the edit form's error focus and announcements.


### RL-035 Unit abbreviations are never pluralised

- Open a recipe with an ingredient in `pt` or `qt` at an amount of 2 or more. It should read "2 pt" or "2 qt", not "pts" or "qts". Cups should still pluralise ("2 cups"), including after switching units so that a volume converts to cups.

### RL-033 Hosting sends X-Frame-Options DENY and X-Content-Type-Options nosniff

- On the preview channel (RL-013) or after release, run `curl -sI` on the site root and on an `/assets/` file. Both should show `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff`, and the Cache-Control values should be unchanged (`no-cache` on the root, `public, max-age=31536000, immutable` on the asset).
- Then complete an email-link sign-in end to end. Firebase Auth helper pages are served under `/__/auth/` on the hosting domain when it is the auth domain, so this is the check that matters. If sign-in breaks, see the risk note in `docs/operations.md` (hosting section).
- Open the app in a normal tab (not a test profile) and confirm reCAPTCHA and App Check still work, so recipe generation is not blocked.

### RL-030 Mark all notifications read works with more than 500 unread

- Tests only. Optional: seed 501 unread notifications on the emulator for one account, open the bell and tap Mark all read; all should clear, with no error.
- Reviewer noted, not fixed: (a) a notification deleted between the read and its chunk's commit fails that whole chunk (the batch is atomic); earlier chunks stay committed and a retry recovers. (b) `NotificationBell.tsx` passes `markAllRead` straight to `onClick`, and `useNotifications.ts` (line 54) awaits `markAllNotificationsRead` without a catch, so a rejection is not shown to the user: it surfaces only as an unhandled promise rejection in the console and the button does nothing visible. Not changed.

### RL-027 The library's cloud fetch ignores responses that arrive after a retry or unmount

- Tests only. Optional: on Explore over a slow connection, tap Retry and confirm the newest result wins.
- Reviewer notes, not fixed (hook out of scope), for a future ticket: (a) after a tag change there is a one-commit window where `loadMore` can run with the new tag and the old cursor; (b) the double-tap guard reads the `loadingMore` state closure, so two same-tick calls can both pass; (c) `loadMore` has no timeout, so Load more can spin forever offline.

### RL-009 Tag chips on the Explore tab

- Author deploy (production, not done by the agent): `firebase deploy --only firestore:indexes`, then wait until the new `recipes` index (`tags` ASC + `createdAt` DESC) shows READY in the console. It only needs to be READY before the client release carrying the chips; it rides in the RL-022 index step in `docs/operations.md`.
- On Explore at 390 px: the tag chip row scrolls sideways with no page overflow, chips are easy to tap, the active one is clearly filled in light and dark mode, and tapping it again clears it.
- With the index READY, tap a few tags: the feed refetches and shows only tagged recipes; an empty tag shows "No recipes tagged X yet" with Clear tag. Before the index is READY a tapped chip shows Could not load.
- The tag row now scrolls with the content (not sticky); the tab control, search and filter row stay sticky. Check 390 px and 320 px.
- Reviewer noted (not fixed): the `scrollbar-none` class is undefined (pre-existing, shared with the filter row); the All chip and the tag chips look identical; `hover:bg-border` equals `surface-tertiary` in dark mode (pre-existing); the active tag chip is not scrolled into view; the tag persists while hidden under Following or My Recipes (intended, a momentary lens).
- Tags are AI free text and may be capitalised ("Italian"); the filter matches lower case exactly. Check whether real recipes match the curated list.

### RL-052 Analytics load only after the user opts in through a consent banner, and the choice can be changed in Settings

- The banner only exists when `VITE_POSTHOG_KEY` is set at build time, and it is not set on production until RL-054. With no key: load the app in a fresh profile and expect no banner and no Privacy switch in Settings. This is the production state.
- To see the rest, build or run with `VITE_POSTHOG_KEY=phc_test` (any value; nothing is sent). Fresh profile: the banner shows at the top of the page, in normal flow (a deliberate change from "above the nav": fixed bottom items would collide with it), with the exact copy, a Cookie Policy link, and two equal buttons "Allow analytics" and "No thanks".
- "No thanks" hides it and it stays hidden after a reload. Repeat with "Allow analytics" (clear site data between).
- Settings > Legal shows "Privacy: allow analytics", reflecting the choice; flipping it changes it, and a banner never comes back after a choice. In a fresh profile, choosing in Settings makes the banner disappear.
- At 390 px in light and dark: banner readable, buttons at least 44 px tall, link works, nothing hidden behind it. On a page with a FAB (Library) while the banner shows: the FAB is visible and tappable. Trigger an update prompt or a recipe toast: it is not hidden by or hiding the banner. The last content of a long page is not clipped. Tab through it with the keyboard; the page stays usable (no overlay, no focus trap).
- Set a fake `_ga` and `_ga_TEST` cookie in devtools on the site domain (and any key setting), reload: both are gone and a later `_ga` cookie you add is left alone (it runs once). This runs with or without the key.
- To test re-asking: bump `CONSENT_VERSION` in `src/lib/consent.ts` and reload; the banner returns. The PostHog request checks are in RL-054.
- Reviewer noted (low): the banner only mounts inside AppShell routes (`/`, `/profile`, `/settings`), so a visitor who lands on `/shared/:id`, `/recipe/:id` or `/create` is not asked until they reach a shell page (analytics stay off meanwhile, which is the safe direction); the Cookie Policy page has no control to change the choice (Settings does). Banner moved from above the BottomNav to the top of the page to avoid the FAB, update prompt and toasts (deviation from the ticket wording, recorded in the ticket Notes).


### RL-058 GA4 is removed, and the analytics seam sends product events nowhere until PostHog is wired in

- On the preview build, open devtools. Network: filter `google-analytics` and `googletagmanager`, load the app, sign in, create and view a recipe; expect no request to either host. Application > Cookies: expect no new `_ga` or `_ga_*` cookie (clear site data first; old ones may remain from earlier visits).
- The GA4 property in the Google console can now be deleted by the author; this is optional and nothing in the repo depends on it. Remove the `VITE_FIREBASE_MEASUREMENT_ID` repository variable in GitHub if it is set (it is no longer read).

### RL-055 The operator can fulfil an access, export or erasure request for one uid from a written runbook and a dry-run-first script

- No UI change. Read the new "Data requests" section in `docs/operations.md` end to end; it is what you will follow per request.
- Emulator rehearsal: start the emulators (`npx -y firebase-tools emulators:start --only auth,firestore --project demo-rl055`, Java on `PATH`), sign up two accounts through `npm run dev:emulated`, have each publish a recipe, favourite, follow, suggest on and reply to the other's recipe. Run `node scripts/data-request.mjs export <uid> --emulator` and open the JSON in the temp dir: it should be complete, and the other account should appear only as `other-user-1` with no display name while its reply text is still there. Run `erase <uid> --emulator` (dry run) and read every line, then `erase <uid> --emulator --execute`, and check in the emulator UI that the other account's thread still reads, with "deleted-user" in place of the erased one.
- Check `node scripts/data-request.mjs erase <uid> --execute` without `--confirm` refuses (it does so before any network call).
- Decide the pending RL-055 rows in `backlog/DECISIONS.md`, especially the deletion of other people's suggestions on an erased owner's recipes and whether the Privacy Policy should say so.
- First real request: authenticate with `gcloud auth application-default login`, run export and the dry run against production, expect a WARNING about the `messages.fromUid` collection-group index (harmless, see the runbook), and keep a log entry without the exported file.
  - Reviewer noted (low): the collaborator scan reads every recipe (documented shortcut); redaction does not search free text for names typed into suggestions or replies; the batch-retry path was checked by reading only; the script was never run against production credentials.


### RL-048 Suggestions and replies are rate-limited per user in the rules, and the client says so when a limit is hit

- **LOUD: deploy order gap. Neither order is safe for suggestions and replies.** Follow the combined order in `docs/operations.md` (client, then rules) and run the rules deploy straight after the client release. Until the rules are live, every suggestion and reply from the new client fails with the generic message; once they are live, any tab still on the old client cannot suggest or reply until it reloads. No fallback was built (pending in `backlog/DECISIONS.md`).
- Needs a browser against `npm run emulators` plus `npm run dev:emulated` (no agent ran this walk). Temporarily lower the reply cap to 3 in BOTH `REPLY_CAP` (`src/lib/rateLimit.ts`) and `replyCap()` (`firestore.rules`); `npm test` fails if they differ. Then:
  - Send replies quickly on one suggestion: the first three send; the fourth shows "You've sent a lot of replies recently. Try again in a while." under the reply box (readable in light and dark), and the draft stays in the box. In the emulator UI, `writeWindows/{uid}_reply` has `count` 3 and `last` naming the third message's path, and no fourth message exists.
  - In `clientErrors`, one entry with context `rate-limited-reply` and your uid for that attempt.
  - Suggestions still work normally below their cap: send one, see the toast "Sent to <author>" (recipe page and shared page), and `writeWindows/{uid}_suggestion` has `count` 1. Optionally lower the suggestion cap the same way and confirm "You've sent a lot of suggestions recently. Try again in a while." in suggest mode.
  - Offline: stop the Firestore emulator and send a reply and a suggestion. Within about 5 seconds each shows the generic message ("Couldn't send that reply. Please try again." / "That didn't send. Check your connection and try again."), not the rate-limit message. They no longer queue and send later, which is a behaviour change.
  - Put both caps back and confirm `npm test` passes, so the numbers in the rules and `rateLimit.ts` match (10 and 30).
- On the preview build, after RL-051 deploys the rules: send replies quickly past 30 in an hour (or lower the cap on a preview only) and confirm the message, then confirm the `rate-limited-reply` entry in `clientErrors` in the console.
- Reviewer and implementer notes, not fixed:
  - A timed-out transaction may still commit later; the user sees a failure for a reply that landed, and resending counts twice against the cap.
  - A client clock more than a minute fast may see a window reset denied after the hour, shown as the generic failure; a slow clock waits a little longer than an hour.
  - A user can move their own window without writing content; that only limits themselves.
  - Review fix: one window bump now admits exactly one suggestion or message (the window's `last` names it). Before the fix, one bump in a batch admitted any number; the emulator proves both.
  - Notification creates are still not tied to a suggestion or reply and are unthrottled (pre-existing, RL-049).
  - Reviewer noted (low): the thread load-error text in SuggestionThread.tsx uses text-danger-600 with no dark variant (pre-existing); the suggest modal tests do not assert the draft survives an error; after a limit error Send stays enabled and the error stays until the next send; the modal textarea has no accessible label (pre-existing).


### RL-049 Notification and recipe-publish writes are rate-limited per user in the rules

- **LOUD: deploy order gap, now wider than RL-048.** Follow the combined order in `docs/operations.md` (client, then rules, back to back). Between the client release and the rules deploy, no notification is written for anything (favourites, follows, suggestions, replies, reviews all still land, silently un-notified) and every first publish fails (the recipe stays on the device with "Saved on this device"). Once the rules are live, any tab still on the old client can neither notify nor publish a new recipe until it reloads. No fallback was built (pending in `backlog/DECISIONS.md`).
- Needs a browser against `npm run emulators` plus `npm run dev:emulated` (no agent ran this walk). Temporarily lower the caps in BOTH places: `NOTIFICATION_CAP` and `RECIPE_CAP` in `src/lib/rateLimit.ts`, and `notificationCap()` and `recipeCap()` in `firestore.rules` (for example 3 and 2); `npm test` fails if they differ. Then:
  - Normal use still notifies: with a second verified account, favourite one of its recipes and follow it. The other account's bell shows both notifications. `writeWindows/{your uid}_notification` has `count` 2 and `last` naming the follow notification's path.
  - Past the notification cap: unfavourite and favourite again until the cap is passed. Every favourite still lands (heart filled, `favoriteCount` moves) and no error appears anywhere; the other account stops receiving notifications after the cap. `clientErrors` has one `rate-limited-notification` entry with your uid per skipped notification.
  - Publish limit from the chat save: generate and save new recipes until the recipe cap is passed. The over-cap save still opens the recipe page with "Saved on this device" and "You've published a lot today. Try again tomorrow." (not the generic "It couldn't be shared..." sentence), the recipe is in My Recipes on this device, and no `recipes/{id}` document was created. `clientErrors` has a `rate-limited-recipe` entry.
  - Share on that recipe: the link is copied as the self-contained link and the toast also says "You've published a lot today. Try again tomorrow."
  - Edit an already-published recipe while at the cap and save: it re-publishes normally (the cloud title changes), since an update is not limited.
  - Offline: stop the Firestore emulator and save a new recipe. After about 4 seconds the recipe page says "Saved on this device" with the generic sentence, and the recipe does not appear in the cloud later when the emulator comes back (it no longer queues; Share retries). Favourite something offline: the favourite behaves as before and no notification is written later.
  - Put the caps back and confirm `npm test` passes (60 and 30).
- On the preview build, after RL-051 deploys the rules: favourite and follow normally and confirm notifications arrive; save one new recipe and confirm "Recipe saved". A user at the daily cap sees the message for up to a day (plus a minute of clock-skew margin) from their first publish of that window, not from their last.
- Implementer notes, not fixed:
  - A limited notification is skipped, not delayed: the recipient never gets it.
  - Review fix: the create transaction re-reads the recipe, so a late-landing save-time publish followed by Share no longer resets `favoriteCount`, `viewCount` and `collaborators` or counts twice. Optional check: on the emulator, favourite a freshly saved recipe from a second account, then Share it from the first; the counts stay.
  - Review fix: publishing a recipe whose `createdBy.uid` is not the signed-in uid is rejected before any read, as the rules denied it before.
- Reviewer noted, not fixed:
  - UI (med): the `{ saved, note }` navigation state is never cleared, so after a reload or going back to that history entry the toast "Saved on this device / You've published a lot today. Try again tomorrow." can reappear for 8 s even after the limit has reset. The saved toast already had this problem; the note makes it misleading.
  - UI (low): the saved toast and the share toasts all sit at `bottom-24 z-50` and can overlap each other, the update prompt and the FAB. No manual dismiss, and 3 s or 8 s auto-dismiss is short for the rate-limit explanation. A `role="status"` region mounted already filled may not be announced by screen readers.
  - Data (low): the `recipeCount` bump is not atomic with the recipe (fire-and-forget; may stay low if it fails). `notify()` transactions fail offline and drop silently, and concurrent `notify()` calls contend on one window document and can be lost after the SDK's retries. All five notification types share one pool of 60 per hour, so spamming favourites or follows can starve that sender's suggestion and reply notifications. The rules tests are string checks; the build never runs the rules.
### RL-047 Sign-up requires accepting the current Terms, recorded privately per account with version and time

- **LOUD: do not release before RL-046 signs off the policies. Deploy in the combined order in `docs/operations.md` ("The pending release order"): the client carrying RL-047 goes live before ANY rules deploy, because `firestore.rules` deploys as one unit and now includes the RL-047 guards.** Rules first would stop every verified user on the old client from creating recipes, suggestions or messages until they reload.
- **Author decision needed: RL-051 asks for your own `termsAcceptance/{uid}` to exist before the rules go live, but the client cannot write it until the rules are live** (no rule matches before then). Either accept on the live app straight after the rules deploy, or create the document by hand in the console beforehand. Both are written up in `docs/operations.md`; RL-051's wording should be adjusted to whichever you choose.
- Needs a browser, against `npm run emulators` plus `npm run dev:emulated` (no agent ran this walk). At 390 px and 320 px, light and dark:
  - Sign-in sheet, email step: with the box unticked the "Send me a link" button is disabled and "Tick the box above to continue." shows under it; Enter shows "Tick the box..." with the box outlined; tick it and the hint goes and the link sends. Same on Profile's "Add Email" banner, the sign-up sheet (Follow, then Continue with email) and `/create` as anonymous, where the box sits above the email field.
  - Open the link from the Auth emulator in the same browser. In the Firestore emulator UI, `termsAcceptance/{uid}` has exactly `version` (today's TERMS_VERSION), `acceptedAt` (a number) and `recordedAt` (a timestamp). No dialog appears. Signed in as another account, reading that document is denied.
  - Cross-device: open the link in a private window. The "Finish signing in here" sheet (RL-109) has the box above the field, Sign in stays disabled with the hint, and Enter while unticked shows the error; after it completes, the document exists and no dialog appears.
  - Account binding: tick the box and request a link for address A, then sign in as a different verified account B on the same browser. B gets the dialog; A's tick is not recorded for B.
  - A failed send (stop the Auth emulator, then send) leaves no `recipe-app-terms-acceptance` key in local storage.
  - An existing verified account with no document (delete it in the emulator UI, then reload): the blocking "Accept the Terms to continue" dialog appears with focus on its title. Escape does not close it. Open each policy link: the new tab shows the policy readable with no dialog over it; navigate to the library in that tab and the dialog appears there. Accept is disabled until the box is ticked; Accept records the document and closes it, and its width does not jump between Accept, the spinner and Retry. Repeat and press "Decline and sign out": you are signed out, a double tap does nothing extra, and recipes saved on the device are still listed.
  - A read error does not block: stop the Firestore emulator and reload while signed in. No dialog appears and the app keeps working; one `terms-check` report is attempted. Start the emulator again and switch tabs away and back (or toggle the network): with no document, the dialog now appears.
  - A failed Accept: with the dialog open, stop the Firestore emulator and press Accept. Within about 5 seconds an inline error and a Retry button appear, and Decline still works.
  - Anonymous accounts are never asked: continue anonymously and browse; no box, no dialog.
- Keyboard and screen reader: the box is a real checkbox named "I accept the Terms of Service and have read the Privacy Policy", announced as required and described by the hint while unticked, with a visible focus ring; the send button is described by the same hint; the needs-email prompt is no longer announced as one alert, only its error is; the dialog is announced by its title and traps focus.
- On the preview build, after the rules deploy (RL-051): sign up with the box unticked (button disabled), ticked (works), then confirm `termsAcceptance/{uid}` in the console has the three fields and that another account cannot read it. Your own existing verified account will see the dialog once.
- Expect `terms-check` reports in `clientErrors` (at most one per session) between the client release and the rules deploy; that is the designed fallback, not a fault.
- Reviewer notes, not fixed:
  - (med) An unaccepted user sees usable app content for a network round trip before the dialog appears, because `setIsLoading(false)` and `setUser` run before `checkTermsOnce` resolves, so they can start an action under the old terms.
  - The checkbox's policy links are `text-xs` `inline-block py-2` (about 32 px tall) inside a label, below 44 px, and are interactive content nested in a label.
  - The AuthModal's "Continue Anonymously" step and "sent" step show no policy link, and the Cookie Policy is linked from no form (only Settings and the dialog).
  - `ensureProfile` and the "Signing you in…" sheet (a banner before RL-109) now wait on the terms check (up to about 10 s on a bad connection: the 5 s read bound plus the 5 s stored-entry write bound).
  - `recordTermsAcceptance` gives up at 5 s, but the write stays queued and may commit later (idempotent, harmless).
  - `acceptedAt` has no lower bound in the rules (0 or negative is accepted), and a re-acceptance overwrites the previous record (latest only, by design).
  - Acceptance is client-attested: it proves a verified-email account wrote a record with the current version and the server stamped the time, not that the user saw the text.
  - The version test does not check that the `termsAcceptance` write rule uses `termsVersion()` rather than a second literal.
  - Tests do not strictly cover the push-after-terms ordering, the completion-versus-listener race, sign-out then sign-in re-checking, or a read timeout end to end.
  - The draft terms still carry `[DEPENDS ON RL-047]` markers (policy wording for RL-046).
  - (low) The retry needs an `online` or tab-visible event, so a read that keeps timing out while the tab stays visible and online is not retried after its 3 attempts until a reload (an optional timed retry would help).
  - (low) The link completion awaits the terms check before `ensureProfile` and the sheet update (up to about 10 s on a bad network).
  - (low) In `EmailLinkStatus` the catch that clears the entry never runs, because `runEmailLinkCompletion` never rejects; after a wrong address or an expired link the entry (bound to that address) stays until sign-out. Harmless because it is email-bound.
  - (low) A failed resend clears the entry of a still-valid earlier link; that fails safe to the dialog.
  - (low) An already-accepted account keeps its stored entry until sign-out (email-bound, harmless).
  - (low) The Spinner inside Accept and Decline gives the button the accessible name "Loading", and Accept stays enabled while a decline is in flight.
  - (low) After Accept or Decline, focus lands at the top of the document, because the dialog opens from an async effect and has no element to return focus to.
  - (low) The checkbox's invalid outline shows for any form error, including "Failed to send".
  - (low) Policy links are about 32 px tall (noted above).
  - The pre-existing choose-step error in the AuthModal ("Failed to continue") still uses `text-danger-600` with no dark variant; only the errors this ticket added or touched were moved to `text-danger-700 dark:text-danger-300`.
  - After the rules are live, a recipe save whose cloud create is denied only logs to the console and keeps the recipe local-only with no mention of Terms (`useRecipeChat`), and suggestion and reply failures show generic messages.

### RL-045 Terms, Privacy and Cookie pages are reachable from Settings and the sign-up forms

- **LOUD: these pages carry DRAFT text. The release that carries them waits for the author's sign-off in RL-046.** Note that once the Preview deploy secret is set, the preview channel from RL-013 publishes main at a public link, draft pages included.
- Open Settings, scroll to Legal, open each of the three pages at 390 px in light and dark, signed out and in local-only mode. Check the draft notice at the top is prominent, the last-updated date reads well, bracketed placeholders ([STATE], [AUTHOR TO CONFIRM: ...]) show exactly as written, nothing scrolls sideways, and the back button returns to Settings. Also try 320 px.
- Open the sign-in sheet (Continue with email) and the email form on Profile or the chat gate: since RL-047 the "Read our ..." line is gone and the Terms box carries the two links instead. Each opens in a new tab and the half-typed email is still there. Check this in the installed PWA too (unverified from code: in an installed PWA a target=_blank link may open in an in-app browser view).
- Reviewer notes (low): focus is not moved and there is no skip link when arriving at a legal page from Settings in the same SPA instance, so screen-reader and keyboard users get no announcement (focusing the h1 or main on document change would fix it); the new-tab path loads fresh so it is fine. The TopBar back button has no focus-visible style (pre-existing). Nothing in Settings marks the three pages as drafts (the on-page notice is prominent). The [DEPENDS ON RL-047] text in terms.ts says users must accept the terms while the forms only pointed at the policies; RL-047 has since replaced that pointer with a required acceptance box, so re-check the wording in RL-046. Draft notice contrast is estimated at about 7:1 light and 12:1 dark, not measured.
- NOT verified: whether target=_blank in an installed standalone PWA opens an in-app browser or hands off to Safari or Chrome (on iOS that could take the user out of the app context). Test on a device.
- Back on a legal page goes back in the app, or to Settings when the page was opened in a fresh tab.
- Needs a browser: all of the above. Unit tests cover content, structure and hrefs only.

### RL-044 A grounded data inventory and draft Terms of Service, Privacy Policy and Cookie Policy exist in the repo

- Nothing user-visible changes. The drafts are not rendered anywhere until RL-045, and must not be released before your sign-off in RL-046.
- Read `docs/legal/claims-to-verify.md` first (33 items), then the three drafts in `src/content/legal/` (`terms.ts`, `privacy.ts`, `cookies.ts`). Every `[AUTHOR TO CONFIRM]`, `[DEPENDS ON RL-0xx]` and `[STATE]` must be resolved before publishing.
- Check `docs/legal/data-inventory.md` section 1 against your own understanding of the app, and its section 3 for the corrections to the groomed inventory.
- The policies are written for the release state. They are untrue until these ship: RL-058 (GA4 removed; today GA4 runs without consent when configured), RL-052 and RL-045 (consent banner and Settings control), RL-053 and RL-054 (PostHog), RL-055 (email request runbook), RL-047 (terms acceptance), RL-048 (suggestion and reply limits), RL-010 (clientErrors retention). Self-service export (RL-056) and deletion (RL-057) are deliberately not promised.
- Confirm `SUPPORT_EMAIL` in `src/lib/constants.ts` is the address you want published in all three documents.
- Author-owned files the inventory contradicts, left untouched for you: `README.md` (around lines 25 and 104, "a shared feed the whole circle can browse" and "invite-only by design") describes a closed audience, but recipes and profiles are readable by anyone, signed-out visitors included. `README.md` (around lines 113 to 115, "Publishing requires only a signed-in user", "world-writable in practice") is stale: every client write now needs a verified email. `ROADMAP.md` (around line 684, decision 7) says "anyone may read, favourite and follow anonymously", which decision 1a supersedes. `ROADMAP.md` (around lines 636 and 675) still says "Clear All Data"; the control is now "Delete Recipes on This Device".

### RL-037 Re-publishing a recipe never overwrites its cloud collaborators

- Collaborator survives an edit: on browser profile A, signed in as the recipe owner, approve a suggestion on a published recipe. On browser profile B, signed into the same account, open that recipe (it has no collaborator locally), edit the title and save. Open `/shared/:id` and confirm the suggester is still listed as a collaborator.
- First publish: generate and publish a brand-new recipe. Its `/shared/:id` page shows no collaborators, and the recipe count on your profile goes up by one.
- Re-publish does not count: edit that same recipe and save. The recipe count on your profile stays where it was.
- Known limit, not a regression: profile B's local copy still has no collaborator after the edit. Pulling cloud collaborators into Dexie is out of scope.
- Reviewer note (med, pre-existing, not a regression, worth its own ticket): the existence check is a plain `getDoc` and the create branch is a non-merge `setDoc`. Online, `getDoc` reads from the server, so it is accurate. But the app uses a bare `getFirestore(app)` with no persistence (memory cache only). If an earlier read in the same session cached "no such doc" (for example `getPublishedRecipe` returned null) and the client then goes offline, `getDoc` can return `exists()` false from that cache for a doc that exists. The create branch then queues a full `setDoc`. On reconnect it passes `isOwnerUpdate`, which constrains neither counters nor collaborators, and overwrites the cloud doc: `favoriteCount` and `viewCount` reset to 0 and `collaborators` is replaced with the local copy. The caller's `withTimeout` gives up first, but the SDK keeps the queued write until reload. The old code did exactly the same. Suggested follow-up: `getDocFromServer`, a transaction, or `updateDoc` first with a create fallback.
- Reviewer note (low): two devices first-publishing at once both take the create branch, and the second plain `setDoc` overwrites the first (unchanged). If the doc is deleted between `getDoc` and the merge `setDoc`, the merge becomes a create without counters and the create rule denies it, so nothing is corrupted. The emulator probe used a hand-built REST `updateMask` (`title`, `ingredients`, `instructions`, `createdBy.*`, `createdAt`, `rootId`, `depth`), a subset of what the SDK sends for a real Recipe (for example `parentId`). It proves the rules and merge-mask behaviour, not the SDK's field serialisation.

### RL-034 An anonymous user's local bookmarks become cloud favourites on the verified account when they add an email

- Linked path, on the preview build in a fresh browser profile: continue as anonymous, publish nothing, heart two recipes on Explore (published by someone else) and note each one's favourite count. Heart a third recipe that exists only in your local library (never published). Add an email from the same browser and open the link there. Both Explore recipes should show as favourited and each favourite count should be one higher. The third stays a local bookmark (still in the Favorites filter, count unchanged).
- Existing-account path: as a new anonymous session, heart two published recipes, then add an email that already has an account and open the link in the same browser. After sign-in both should show as favourites on that account and each count should be one higher.
- A second sign-in (sign out, then sign in again by email link) must not push or bump again: the counts stay where they were.
- Console and `clientErrors`: on the linked path, exactly one `favorites-upgrade` report per upgrade and only when something was skipped (the third, never-published recipe in the first walk causes one, with "1 of 3" in the message). No report when every bookmark pushed. On the existing-account path skips are only logged to the console (`[auth] favourites carry-over ...`) and never reported, because favourites the account already had in the cloud are denied as updates on a healthy upgrade.
- Reviewer note (med): if `migrateRecipesUid` or `migrateFavoritesUid` rejects on the existing-account path, `runMigration`'s `Promise.all` rejects and the push is skipped (the catch sets `linkState` to error), so the carry-over is silently dropped and nothing calls the push again. The failure mode already existed for the migration; it now also drops the carry-over.
- Reviewer note (low): the cloud heart on `SharedRecipePage` can show empty right after a linked upgrade when the landing URL is a recipe the user bookmarked. The lookup fires as soon as `emailVerified` flips and is not re-run after the push, so tapping it runs `addCloudFavorite` on an existing doc (an update, denied) and shows the toggle error until reload.
- Reviewer note (low): on the existing-account path `migrateFavoritesUid` is an upsert, so an anonymous row overwrites the existing row's `createdAt` for the same recipe. Cosmetic: it can reorder favourites locally and differs from the cloud doc.
- Reviewer note (low): `recipeOwnerId` falls back to `'local'` for bookmarks whose recipe is not in Dexie, which is most shared-recipe bookmarks. Nothing reads it today; backfill if anything starts to.
- Reviewer note (low): a bookmark whose push failed shows an empty heart on `SharedRecipePage` (cloud only) but a favourite in Library (Dexie), and unfavouriting it calls `removeCloudFavorite` on a missing doc, denied, one `unfavorite` report (the RL-041 note).
- Reviewer note (low): the Dexie rows are snapshotted once at the start of the sequential push, so an unfavourite during the push (up to N times 5 s offline) is followed by the cloud doc being created, so local and cloud diverge.
- Note for the author: favourites pushed this way do not appear on other devices until RL-043 pulls cloud favourites down. Unfavouriting one later removes both the local and the cloud copy.
- Not driven by the agent: the two real upgrade paths need Firebase Auth. Only the batch writes were checked on the Firestore emulator (see the ticket Notes).

### RL-031 Blocked or corrupt localStorage never throws out of services/storage.ts

- Open the preview build in Safari with Block all cookies on, and in Chrome with cookies and site data blocked for the site. The library should load, and the unit toggle should not crash (they just will not be remembered after a reload).
- Not covered: code outside `storage.ts` that touches localStorage directly. `src/services/firebase.ts` lines 109, 225 and 230 (`emailForSignIn` for the email-link flow) can still throw when storage is blocked.
- Reviewer note (med, for the author): the email-link sign-in flow in `services/firebase.ts` still touches localStorage directly at those three places, so with storage blocked starting or completing email-link sign-in may throw. That is the sign-up path RL-041 routes users to, so it is the more important place to fix next. The `'emailForSignIn'` key is a literal and is not in `STORAGE_KEYS`.
- Reviewer note (low): Safari "Block all cookies" can also block IndexedDB, which is outside this ticket and not audited (Dexie start-up). With storage blocked every write warns; callers are not hot paths, though `RecipeDetailPage` persists inside a setState updater, so StrictMode in dev warns twice.
- Reviewer note (low): `docs/data-model.md` has no section for the nine `STORAGE_KEYS` plus that literal, and the device id fallback (`crypto.randomUUID` exists only in secure contexts, so plain http falls back to `getRandomValues`, then `Math.random`) is documented nowhere else.

### RL-029 Profile stats and the following list load in a constant number of round trips

- Own profile: the total views, total favourites and each recipe's counts should match the previous release for published recipes, and show zero for recipes you never published. Compare against the last release if you can.
- Following list (Profile, Following): same people in the same order as before, and it should load noticeably faster when you follow many users.
- Note: own-profile counts now come from one query on `createdBy.uid`, which has no limit, so there is no cap on published recipes. A local recipe whose cloud copy has a different `createdBy.uid` would now show zero; none are expected.

- Reviewer note (med, data, edge case): a published recipe whose cloud `createdBy.uid` differs from the signed-in uid now shows zero views and favourites on its owner's own profile; the old per-id `getDoc` returned the real counts. Example: a user published under an old uid and `migrateFirestoreUid` was denied (rules forbid changing `createdBy.uid`), so local Dexie was re-stamped to the new uid while the cloud doc kept the old one. This arguably is more truthful (the recipe is no longer theirs in the cloud), but it is a behaviour change for that cohort, and "none expected" is optimistic given the known-broken migration. RL-042 wipes production data, which should empty the cohort. No test covers it.
- Reviewer note (low, data): the `useOwnRecipes` effect still has no cancelled flag and no uid stamp, so a slow response for user A can overwrite user B's stats map (keyed by recipe id, so A's ids cannot render on B's recipes; the window shrank from N sequential reads to one), and a failed fetch is swallowed with neither `reportError` nor `console.error`, unlike the RL-026 sibling hooks. Adding a cancelled flag and `reportError(err, 'load-own-stats')` would close it.
- Reviewer note (low, data): `getFollowingProfiles` issues an unbounded `Promise.all` of `getDoc` calls, so a user following hundreds of accounts bursts hundreds of reads and one transient failure rejects the whole list (the old sequential loop also rejected on the first failure). Probably fine at current scale; if follows grow, chunk at 30 with `documentId() in [...]` and restore the order. No follow cap was found in the rules or app.
- Reviewer note (low): `src/hooks/useUserRecipes.test.tsx` line 10 still mocks the removed `getRecipeStats`; harmless, but deleting it makes a grep for the removed function come back clean. No test covers a late stale response for `useOwnRecipes`.

### RL-028 The My Recipes empty state does not depend on the search text

- On the My Recipes tab, type a search that matches none of your recipes. Confirm "No results" with a Clear search button, and not "You haven't created a recipe yet". Tap Clear search and confirm the list returns. (Tests only; no behaviour changed. The Mine chip this ticket was written for no longer exists.)

- Reviewer note (low, real behaviour, not fixed here): a whitespace-only search is inconsistent. `LibraryPage.tsx` (the `search ?` branch near line 259 and the result-count condition near line 215) treats `search` as active when it is `"  "`, but `filterFeed` in `src/lib/library.ts` (near line 105) trims it and treats it as inactive. A user with no recipes who types a space sees "No results / Nothing matches" instead of the first-run screen, and a user with recipes sees the full list under an "N results" heading. Using `search.trim()` for the page's branch and count conditions would fix it. No test covers this.
- Reviewer note (low, test gaps): nothing covers My Recipes with the favourites filter on and no search (by the code, "No favorites yet" with Show all), nor an Explore search that matches nothing ("No results" with Load more and the "loaded so far" note). The empty-state button is found with `getByText('Clear search', { selector: 'button' })` because the search box's clear icon shares the aria-label; that is correct but would stop matching if `Button` ever wrapped its children in a span.

### RL-026 Follow, cloud favourite and profile recipe hooks ignore stale responses and report failures

- On the preview build, signed in with a verified account, open a profile you follow and then go straight to one you do not (via a recipe's "Added by" link). Confirm the button never shows "Following" on the second profile, not even for a frame.
- Go offline (devtools) on a profile and tap Follow. Confirm "Couldn't update that. Check your connection and try again." appears under the button in red (light and dark mode), the button still says "Follow", and the message clears when you go back online and tap again.
- On a shared recipe you do not own, go offline and tap the heart. Confirm the same message appears at the top of the page and the heart does not fill. Online again, tap it: the message clears and the heart fills.
- With the console open and the clientErrors collection visible, load several profiles and shared recipes you do not follow or favourite. Both should stay quiet: normal not-following and not-favourited views must not log or report anything (the lookups are queries now because a get of a missing doc is denied by the rules).
- Open Library, Explore, Following: confirm "No recipes from followed users" no longer flashes before the feed loads.
- Offline toggles give up after 5 seconds and show the error. A timed-out write may still commit when connectivity returns, so the button can then differ from the server until the next lookup (reload to resync). Not solved here.
- (med, UI) The favourite error on `SharedRecipePage` renders at the top of main, not near the heart in the sticky header, so a scrolled-down user may not see it, it shifts the recipe down by about 40px, and the heart is not optimistic so a tap looks like nothing happened. A message in the sticky header or a toast would be better.
- (med, UI) A failed `getRecipesByUsers` or `getUserRecipes` fetch is stored as an empty list with no error exposed, so the Library Following filter says "No recipes from followed users" and a public profile says "No recipes yet" for a failed fetch, with no retry (the ticket stopped at report and settle).
- (low) There is no lookup-pending state, so right after navigating the Follow button is enabled and shows Follow until the lookup resolves, and a fast tap on an already-followed profile sends a follow that the rules deny. Disable the button until the lookup settles, or ignore a lookup that arrives after a toggle.
- (low) A failed lookup settles as not following, and the later toggle error is generic.
- (low) The cloud heart has no in-flight feedback or `aria-pressed`.
- (low) The follow and favourite error stays until the next toggle or id change.
- (low) `useFollowingList` swallows a failure into empty lists with only a beacon, so the Following filter then looks like "you follow nobody". It also issues `getFollowingIds` twice (RL-029).
- (low) A verified user's cloud favourite on `SharedRecipePage` never writes Dexie, so `useFavoriteIds` and the Library favourites filter do not show it (pre-existing `localRecipe ?? cloudRecipe` divergence).
- (low) Tests do not cover a double tap against the in-flight guard, no query for unverified or signed-out users, or the service-level rejection path of `isFollowing` and `isCloudFavorite`.

### RL-025 Scaled amounts snap to an eighth and decimals render with a leading zero

- On a recipe with "1/2 tsp" and 4 servings, scale to 1 and confirm the one-eighth glyph shows ("⅛ tsp").
- Check a decimal with no glyph reads "0.44", not ".44" (and "1.44" with a whole part).
- Check the glyph renders in light and dark mode and at 320px. The one-eighth glyph can fall back to a different font; look at it on a real phone.
- (med, for the author) `formatAmount` is unit-blind and also receives converted metric and imperial values (`IngredientList.tsx` ~L52-61; `units.ts` ~L212-214 rounds converted values under 10 to two decimals). A converted amount whose fraction rounds to .12 or .13 now shows the eighth glyph where it used to show a decimal: 2.13 g shows "2⅛ g" (was 2.13), 7.12 ml shows "7⅛ ml", 0.13 g shows "⅛ g". Values from 10 up and whole numbers such as 125 ml are unaffected. The same class already existed for ⅓ and ¼ on metric units (2.33 g shows 2⅓), but .12 and .13 are common two-decimal conversion outputs, so it is noticeably wider. Fix: skip the glyph path for metric units (pass the unit or an isMetric flag), or only use the eighth within about 0.005 of 0.125. The ticket asked to match the eighth "after its two-decimal rounding", so this was left as specified.
- (low) `scale.ts` treats only counts specially; tsp, tbsp, cup, g and ml are handled alike, so the eighth also applies to g and ml scaling (0.5 g at a quarter of the servings shows "⅛ g", where it showed "¼ g" before).
- (low) 1/6 (0.1667) now snaps to the eighth, which undershoots by 25 percent instead of overshooting by 50 percent, an improvement. 0.1, 0.0625 and 1/12 stay as raw decimals. An eighth teaspoon times 3 (0.375) still snaps to a third.
- (low) U+215B sits in the Number Forms block with the third glyphs, so it is as safe as them in San Francisco, Segoe UI and Roboto, but a fallback font may draw it at a different size or weight, and the `font-medium` wrapper may not apply to it.
- (low) Raw amounts like 0.999 or 1.001 at factor 1 (stored, AI or shared-link values) still render as raw decimals. This was the old behaviour and `scaleAmount` cannot produce them.

### RL-024 Self-contained share links are validated against the recipe schema

- Open a hash share link made by the app (Share with Firebase off, or an unpublished recipe): it still renders and Save a copy works.
- Edit a hash link so the payload lacks `ingredients` (or build one by hand): the page shows Invalid Link, not a blank page.
- If you have an old hash link from before nutrition or attribution existed, open it: it should still render.

- Reviewer note (low): `decodeRecipeFromHash` casts its result `as SharedRecipe`, but `createdBy` is required in that type and optional in practice (old links lack it). `SharedRecipePage` uses `?.` and falls back to `{ uid: 'local', displayName: null }`, so nothing breaks, but a future caller doing `decoded.createdBy.uid` would crash on an old link. Returning `Omit<SharedRecipe, 'createdBy'> & { createdBy?: CreatedBy }` would fix it (out of scope).
- Reviewer note (low): the `NutritionSchema` comment says "Optional throughout" but its four macro fields are required, so a link with partial nutrition (for example only calories) now shows Invalid Link. No code path produces partial nutrition today.
- Compatibility, checked: `group` (nullable, required on ingredients and steps) has existed since the first commit, the same one that introduced share links, so every stored recipe has had it, and `nutrition` (added 2026-07-28) is `nullish`. Content field types are unchanged since then and the schema has no `.min`, `.max` or refinements. Hand-edited or lax links (a string `servings`, an ingredient missing `unit` or `notes`, an unknown `difficulty`) now show Invalid Link with no coercion; nothing the app emits looks like that.

### RL-021 The Following feed shows the newest 50 recipes from followed users

- Ordering note for RL-022: the `recipes` index (`createdBy.uid` ASC, `createdAt` DESC) must be READY before this client is released. If the client goes out first, the ordered query fails and the Following filter shows an empty list for every follower.
- After RL-022, follow an account with more than 50 recipes (or confirm on live) and check the Following filter on Explore lists the newest first.
- Reviewer note (low): `useFollowingRecipes` (`src/hooks/useUserRecipes.ts`, the `.catch` around lines 91-94) sets an empty list and never calls `reportError`, so until the index is READY every follower silently sees an empty Following list. The only protection is the ordering note in `docs/operations.md`, and `/release` is manual. Reporting the error, or an index-status check before the hosting deploy, would close it.
- Reviewer note (low): the new test asserts orderBy before limit, two `getDocs` calls for 31 uids and the merge order. It does not assert the chunks passed to `where('createdBy.uid','in',...)` (30 and 1) and inspects only the first call's query shape.
- Reviewer note (low): the emulator does not enforce composite indexes, so a wrong index would only show up on live.
- For the author: `ROADMAP.md` lines ~24-25 say rules and indexes are deployed, which is not true for the new `recipes` index until RL-022. Lines ~52-53 cite `firestore.ts:836-845` for the following filter, which is now `migrateFirestoreUid`; `getRecipesByUsers` is near line 981. Left untouched as author-owned.
- RL-022 criterion 3 says "built" while `docs/operations.md` says READY (same meaning), and RL-022 does not name the `recipes` index.

### RL-020 clientErrors reports must carry receivedAt equal to the server time

- Rules change only. Not live until RL-022 deploys the rules; until then the old rule still accepts any `receivedAt`.
- After RL-022, trigger a handled error in the app (for example, a deliberately failing publish on the preview build) and confirm a `clientErrors` document appears in the Firebase console with `receivedAt` set to a server timestamp.
- Reviewer note (for RL-010): a report written without `receivedAt` is still accepted (the ticket allows it), so it would have no TTL field and never expire; documents written before this rule may also hold other values. A TTL policy acts only on timestamp-typed fields, so this change helps RL-010 by guaranteeing that any `receivedAt` that is present is a real server timestamp, but it does not cover absent or older values.

### RL-019 Avatars render only data:image photos, and profile rules enforce the prefix and a size cap

- Needs the rules deployed (RL-022) to enforce the cap; the Avatar change is live with the build.
- On the preview build, signed in with a verified email, upload an avatar and confirm it renders on your profile page and in the library header.
- If any old profile has a non-data photoURL (an https link), confirm it now shows initials, not a broken image. Its owner can still change displayName.
- Avatar upload through `npm run dev:emulated` (rules plus UI together) was not run by an agent.
- Reviewer note (low): `AvatarEditor` seeds `imageURL` from `currentPhotoURL`, which for a legacy profile could be an https URL. The Upload tab preview then shows initials, and Save without picking a file would write that same URL back. The rule only checks `photoURL` when the value changes, so an unchanged value is not denied. UI oddity only, no security effect.
- Reviewer note (low): `data:image/svg+xml` is accepted. It is script-inert inside an `<img>`, so not a security issue.
- Reviewer note (low): the 100000 cap in `firestore.rules` and the `'data:image/'` prefix in `Avatar.tsx` must be kept in sync by hand.
- Reviewer note (low): the typical `AvatarEditor` size of 4 to 8 KB was estimated, not measured.
- Reviewer note (low, data): `migrateFirestoreUid` copies the old profile to the new uid with `setDoc`, which is a create, so an old profile holding a non-data `photoURL` now also fails `photoURLOk`. That path is already broken by design (the old uid's profile delete is denied), so nothing new is lost; it needs the server-side migration path.
- Reviewer note (low, data): `toDataURL('image/jpeg')` falls back to PNG on a browser without JPEG support, and a noisy 128x128 PNG could approach about 87 KB of base64, still under the 100000 cap. Theoretical only.
- Reviewer note (low, data): the owner branch of the profile update still has no other field constraints, so an owner can set their own `followerCount` or `recipeCount` to anything. Pre-existing and out of scope here.
- Reviewer note (low, data): the `Avatar` guard also requires `photoType === 'uploaded'`, so a bad URL with that type falls to initials, never to the emoji, which matches the intent (the ticket wording "falls through to emoji" is loose).
- Residual risk: every `photoURL` in `src` is a profile field and reaches an `<img>` only through `Avatar` (the only `<img>` in `src/**/*.tsx`). Recipes `createdBy`, suggestions and follows are arbitrary maps, so a `photoURL` key can be stored there, but nothing reads or renders it. A future component that renders a photo from those maps would bypass the rule; route any such rendering through `Avatar`.

### RL-013 Deploy a Firebase Hosting preview channel for every QA pass

- You must add these yourself; an agent cannot. Until you do, the Preview workflow skips with a note and does not fail.
- Secret: Settings, Secrets and variables, Actions, New repository secret `FIREBASE_SERVICE_ACCOUNT`, the JSON key of a service account with Firebase Hosting Admin only (see "Preview deploys" in `docs/operations.md`).
- Variables (Actions, Variables tab): `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, `VITE_RECAPTCHA_SITE_KEY` (needed for generation), and optionally `VITE_FIREBASE_MEASUREMENT_ID`. Copy the values from your `.env`.
- First run: Actions tab, Preview, Run workflow. Open the finished run and read the job summary for the "Preview URL" line; open it on a phone. Confirm the app loads and sign-in works.
- The preview uses live Firebase data and is public to anyone with the link.
- For the author (outside this ticket, left untouched): the `/qa-pass` skill (`.claude/skills/qa-pass/SKILL.md`, step 2) says to "record the channel URL from the run output", but `gh workflow run` prints no run URL. The URL is only in the job summary and a log line, so the skill needs `gh run list --workflow preview.yml` then `gh run view <id> --log` to get it, and a branch for the skipped case (no secret: the run succeeds with a skip note and no URL).
- For the author: `preview.yml` pins `FirebaseExtended/action-hosting-deploy` by the floating tag `@v0` while passing it the service account secret. That matches how `ci.yml` pins its actions (by tag), but a full commit SHA would be stricter. The service account only needs Firebase Hosting Admin, and whether that alone suffices for channel deploys is untested until the first real run.
- Not verified: the workflow itself. It was parsed as YAML and read for correctness (triggers, env gating, permissions), but it has never run; the first real run needs your secret and variables.

### RL-008 Split the Library into "My Recipes" and "Explore" tabs

- At 390 px in light and dark: both tabs, the tab control above search, and every empty state. My Recipes empty: "You haven't created a recipe yet" with Create a recipe (goes to `/create`). Explore empty (fresh emulator): "Nothing published yet". Favorites empty, Following empty, and "No results" in each tab.
- Tab memory: pick Explore, reload, Explore is still selected. Pick My Recipes, reload, it stays.
- Search in each tab only searches that tab. On Explore with more than 30 published recipes, search for something: the "Searching the N recipes loaded so far. Load more to search further." note shows, Load more stays, and pressing it grows N and can add results.
- Favorites filter in each tab as an anonymous account (local bookmarks) and as a verified account. Following chip as a verified account who follows someone: shown on Explore only, never on My Recipes, never for anonymous or signed-out users.
- Your own published recipe appears once in My Recipes and once in Explore. Variation counts on cards look right in both tabs.
- Local-only mode (no Firebase env): no tab control, My Recipes only, no network errors.
- Offline: My Recipes still lists local recipes. Explore shows "Could not load" with the offline copy after about 6 seconds, and Try again works once back online.
- The old first-run welcome card is gone; its explanation now lives in the My Recipes empty state. Check it reads well as a first screen.
- Failed Load more: on Explore with more than 30 recipes, go Offline in devtools and press Load more. "Could not load more recipes. Try again." appears in red above the button, the loaded list stays, and pressing Load more again once online loads the page and clears the message.
- Favorites on Explore with more pages to fetch: the empty state reads "No favorites in the N recipes loaded so far. Load more to look further.", not "No favorites yet".
- Reviewer notes (medium, not fixed): `SegmentedControl` is a radiogroup, not tabs, so there is no tablist/tabpanel association or arrow-key handling; (moot after RL-065: the theme picker is gone.) Back from a recipe remounts LibraryPage, so search text, filters, scroll position and loaded Explore pages reset (only the tab is remembered). The sticky header is now about 220px tall (56px bar, 44px tabs, 44px search, 44px chips), a third of a 320x568 viewport. No scroll reset on tab switch, and search and the favourites filter carry across tabs without a signal.
- Reviewer noted (med, data): `useFollowingList()` runs on every Library mount whichever tab is active, so any signed-in user, anonymous included, makes two `getFollowingIds` reads plus one `getProfile` per followed user. Its `Promise.all` has no `.catch` and no cancellation guard, so a rejected read is an unhandled rejection (and a stuck `isLoading`) on every visit, and a slow response after a uid change can overwrite fresh state. The reads are allowed by the rules, so no `permission-denied`. Gate it on `tab === 'explore' && emailVerified` and add a catch and a cancelled flag (RL-026 territory; `ProfilePage` has the same issue). The component test mocks `useFollowingList`, so it never catches this.
- Reviewer noted (med, data): variation counts on My Recipes depend on whether Explore has been opened. `cloud.recipes` is null until Explore starts, so a local root with cloud-only variations shows a lower count until the user visits Explore, then a higher one. On Explore a root whose variations sit on unfetched pages undercounts until Load more. Dedup itself is correct. Accept as the price of lazy loading, or document it.
- Reviewer noted (low, data): the Following list bypasses `buildFeed`, so it has no roots-only filter, no dedup and no variation chip, and `getRecipesByUsers` uses `limit(50)` per 30-uid chunk with no `orderBy`, so those 50 are arbitrary, not the newest (predates this ticket). `useFollowingRecipes` has no cancellation, and there is a one-frame flash of "No recipes from followed users" on entering Following. The favourites filter reads Dexie only, so a verified user on a new device sees only locally held favourites until something syncs cloud favourites down. `loadMore` guards with state, not a ref, so two clicks in one tick could fetch the same cursor twice (a wasted read, no visible corruption). Two page-1 fetches under StrictMode in dev only. No test for pages kept across tab switches, Load more appending, the favourites filter per tab, or Following results.
- Reviewer noted (med, UI, second round): the new "Could not load more recipes. Try again." message uses `text-danger-600` (#dc2626) at 12px, about 3.7:1 on the dark `bg-surface` (#111827), under 4.5:1 for small text (about 4.8:1 in light mode). Use `text-danger-700 dark:text-danger-300`, the pattern in `SettingsPage.tsx` line 171 and `RecipeChatPage.tsx` line 423. `RecipeDetailPage.tsx` line 587 and `SuggestionThread.tsx` copy the same class and have the same dark-mode issue (the `SuggestionThread.tsx` part is moot since RL-106 deleted it; `SuggestionThreadPage.tsx` uses `text-danger-700 dark:text-danger-300`). Check it in the dark-mode walk.
- Reviewer noted (low, second round): `loadMoreError` is not cleared on a page-1 reload or a tab switch, so a stale but still-true message can show on returning to Explore; the conditionally mounted `role="status"` notes may not be announced by some screen readers; the failure test does not pin the in-flight state, the absence of the alert on a page-1 failure, or the last-page "No favorites yet" copy.
- Reviewer notes (low, not fixed): a Following selection silently re-activates when returning to Explore. Layout shift when the shared-recipes note and the Following chip row appear. Skeleton height may not match the cards. The followed-user avatars sit ungrouped inside the filter row. Load more shows "Loading…" text, not the shared Spinner.

### RL-007 PWA manifest and precached app shell

- Install on a phone (Add to Home Screen): the "RL" icon shows, the app opens standalone with the right status bar colour (cream, one theme-color meta, no media query).
- Offline: load the app online once, go Offline in devtools (or airplane mode), reload `/` and a local recipe. Both should render from cache. Cloud-only recipes and Create will not work offline, which is expected.
- Update prompt: deploy or preview two builds (bump any text, rebuild), revisit with the old one open. An "Update available" bar appears above the bottom nav; Dismiss hides it without reloading, Reload applies the new build.
- Email-link sign-in with the service worker active: request a link, open it in the same browser, confirm you are signed in.
- Deep link: on a first visit open `/recipe/:id` directly. The service worker should register (devtools Application tab), and the update bar can appear on any route, including pages without the bottom nav.
- Reviewer notes (medium): the update bar (z-40, roughly 56 to 116px from the bottom) overlaps the FAB (bottom-20, z-30) and covers about 60px of the last page content, because `main` has `pb-16` and does not grow, until Dismiss. On routes without the bottom nav it floats 56px above the screen edge.
- Reviewer notes (low): Reload discards unsaved edits with no confirmation. At 320px the label may wrap to two lines. No `env(safe-area-inset-bottom)` on the bar or BottomNav (`viewport-fit=cover` is not set, so fine today, relevant once installed standalone). The theme-color meta is a single `#f5ead8` tag with no media query (RL-065). A component test for the bar would need a mock for `virtual:pwa-register`.
- After the hosting deploy: `curl -sSD - -o /dev/null https://recipe-lab-3832b.web.app/sw.js` shows `no-cache`, and `/assets/*.js` still shows `immutable`.

### RL-006 Split the bundle at route boundaries

- Standing walk, watching for a visible loading flash: Library, Settings, Profile, a recipe, its edit page, its tree, Create. A brief spinner on the first visit to a route is expected. The bottom nav and top bar should stay put on Settings and Profile while it shows.
- Offline chunk load: load the app, set devtools Network to Offline, then open a route you have not visited this session (for example Settings or Create). You should see the error fallback with "Back to library", not a blank page.

### RL-005 Distinguish "recipe not found" from "could not load" on a cold first load

- Cold load: open a shared link (`/recipe/<id>`) in a fresh browser profile or a private window. It should show the recipe, never "Recipe not found".
- Slow or offline read: in devtools Network, set throttling to Offline (or block the Firestore host), open a shared recipe you have not viewed on this profile, and wait about 6 seconds. You should see "Could not load this recipe" with "Try again". Go back online and tap it: the recipe appears.
- Same check on `/recipe/<id>/edit`, which used to say "Recipe not found" in this case.
- A made-up id with a working connection should still say "Recipe not found."
- Where the defect was: not in `useRecipe` or `RecipeDetailPage`, which already branched on
  `cloudError`. `RecipeEditPage` ignored it, so a cold-load timeout there said "Recipe not found".
  `RecipeEditPage.tsx` is outside the ticket's file list; the ticket asked to establish the cause
  first.
- Reviewer noted (med, UI): the error state is hand-rolled JSX duplicated in `RecipeEditPage.tsx`
  and `RecipeDetailPage.tsx` instead of the shared `EmptyState` with its `action` slot, which
  `VersionTreePage` and `ProfilePage` use, so type scale and spacing differ slightly. A cheap
  follow-up.
- Reviewer noted (low): the error text has no `role="alert"` and the emoji is not `aria-hidden`
  (fixing `EmptyState` would cover every caller); "Try again" is primary here and secondary on the
  tree and profile pages; copy uses "Could not load" here and "Couldn't load" on `VersionTreePage`,
  `ProfilePage` and `RecipeChatPage`.
- Noticed by the implementer: `useRecipe.test.tsx` waits through the real 6 second timeout, which
  adds about 6 seconds to the suite. Fake timers would remove it.

### RL-004 Guard RecipeContent against malformed documents and add an error boundary

- Standing walk, plus a look at a recipe detail page and a shared recipe in light and dark mode.
- No real recipe lacks an array today (`publishRecipe` writes complete documents), so the
  missing-array guard is covered by tests only. If you can edit a cloud recipe in the emulator
  and delete `ingredients`, the page should show "This recipe has no ingredients to show." and
  the rest of the recipe.
- Boundary fallback: temporarily throw in a page's render in dev. You should see "Something went
  wrong" with "Back to library"; on a shell page the bottom nav stays. Tapping the button goes
  home, and navigating elsewhere clears the fallback.
- Reviewer noted (med): if the failing route is `/` itself (the library throws on a corrupt cloud
  document, the likeliest crash), "Back to library" resets the boundary and navigates to `/`, the
  pathname does not change, the page throws again and the fallback returns at once, so the button
  looks dead. Consider a Reload action on the fallback.
- Reviewer noted (med, a11y): the fallback has no `role="alert"` and no focus move, so focus drops
  to `<body>` when the crashed page unmounts and screen reader users hear nothing.
- Reviewer noted (low): the boundary in `AppShell` and the one around `Routes` nest correctly (the
  nearest catches, no double report), but an error thrown by `AppShell` itself falls to the outer
  one and the nav disappears. The `RecipeContent` missing-section notice uses `role="status"` on
  content already present, which is not announced, and has no matching heading. An empty array
  (not absent) still renders a heading with an empty body. Indentation inside
  `<RouteErrorBoundary>` in `App.tsx` is off.

### RL-041 Anonymous and signed-out users can only bookmark locally, and every other action routes to sign-up

- Release ordering: RL-041 must ship in the same release as RL-040's rules, and be live before
  RL-022 deploys them. With the rules live and an older client, anonymous favourites, follows and
  the first-sign-in profile write all fail with `permission-denied`.
- On the preview build, as an anonymous account (Continue without an account), with the console open:
  - The sign-in sheet's guest link says bookmarks stay on this device only.
  - Bookmark a recipe from its detail page and from a `/shared/:id` link, then open the
    Favorites filter: both appear.
  - Open someone's profile and tap Follow: "Sign in to follow ..." opens, with the email form behind Continue with email,
    and nothing is followed.
  - Open your own profile and tap the avatar, then the name: each opens "Sign in to edit your
    profile" rather than the editor.
  - Share a local recipe: you get a self-contained link, with no publish attempt.
  - Console clean throughout: no `permission-denied`, and no `clientErrors` reports.
- Signed out: Follow on a profile opens the same sign-up sheet; the heart opens the sign-in
  sheet.
- Verified upgrade: as an anonymous account, add an email from your profile and open the link in
  the same browser. Afterwards your profile shows your email (no reload needed), and a
  `profiles/{uid}` document exists for the same uid with the generated name. Then follow someone
  and publish a recipe: both succeed and your recipe count goes up. Local bookmarks are still
  there (pushing them to the cloud is RL-034).
- As a verified account: favouriting, following and profile editing behave exactly as before.
- Not run by the agent: any browser walk. Covered by unit, hook and component tests only.
- Reviewer noted (med, data): verified users reading a missing doc probably still throw
  `permission-denied`, because the `follows` and `favorites` read rules dereference `resource.data`
  (`useFollow.ts` line 26 and `useFavorites.ts` line 130 have no `.catch`). That would beacon as an
  unhandled rejection on most profile and shared-recipe views for a verified user. Unconfirmed
  against the emulator; check the console as a verified account. Same class as RL-026.
- Reviewer noted (med, data): `runMigration` still calls `migrateFirestoreUid` on uid drift for
  anonymous accounts. Its `favorites` and `notifications` queries are denied, the error is
  swallowed so nothing beacons, but it is wasted work and console noise.
- Reviewer noted (med, data): after an upgrade, unfavouriting a bookmark made while anonymous runs
  `removeCloudFavorite` on a doc that was never created. The delete is probably denied and
  reported as `unfavorite`, once per old bookmark, until RL-034 pushes local bookmarks to the cloud.
- Reviewer noted (med, data): profile creation on the upgrade is fire-and-forget with no retry, and
  `setUser` runs before it resolves. If it fails or loses the race, `followUser` fails its whole
  batch on the missing follower profile (and `useFollow.toggle` has no catch). Making `followUser`
  ensure the follower profile first would close it.
- Reviewer noted (med, UI): the anonymous sign-out confirm on `ProfilePage.tsx` (about line 359) is
  stale. It talks about copies already shared and never says the real loss, the device bookmarks.
  The `AuthModal.tsx` choose-step subtitle (about line 81) still says "get credited as the creator"
  and its code comment says "credited identically". The `EmailLinkingForm` email input has no
  accessible name (placeholder only). The favourite tap does nothing after a signed-out user picks
  Continue Anonymously, so they must tap again, and the heart looks dead in local-only mode.
- Reviewer noted (low): favourite state diverges for an upgraded user on `/shared/:id` (cloud
  only) versus the detail page (Dexie); `EmailLinkingForm` default copy says "keep your recipes
  safe" and "secure your account"; its error and success lines have no `role="alert"` or
  `role="status"` and its layout is tight at 320px; `SignUpDialog` duplicates the
  `SuggestChangeModal` gate markup and has no max height; `aria-expanded` is misleading on the
  profile edit buttons for anonymous users; an anonymous sign-out then a new anonymous sign-in
  orphans the old bookmarks, which the confirm dialog should say; link completion may run twice
  under StrictMode in dev.
- For the author (docs outside this ticket, left untouched): `README.md` line 41 ("everyone else
  can favourite and suggest"), lines 26 to 30 (feature list has no verified-email qualifier) and
  lines 113 to 115 ("world-writable in practice", which goes stale when RL-022 deploys the RL-040
  rules). `CHANGELOG.md` is due at release for the user-visible changes.

### RL-018 Suggestions and their reply threads are readable only by the recipe owner and the suggester

- Rules and index change; nothing differs in the live app until RL-022 deploys. Ordering for
  RL-022: build the two new `suggestions` indexes and release this client first, then deploy
  these rules. With the rules live and the old client still cached, its unfiltered query is
  denied (the emulator denies it even for the owner) and the suggestions list goes blank.
- On the preview build, with a recipe that has suggestions from two different accounts:
  - The owner (verified) sees every suggestion and can open each reply thread.
  - The suggester (verified) sees only their own suggestion and its thread.
  - A third verified account sees no suggestions section, and the console is clean.
  - An anonymous account sees no suggestions section, and the console is clean.
- Approve and reject as the owner, and reply from both sides: all still work.
- Not run by the agent: the three-account app walk. The rules were probed on a demo-project
  emulator (`demo-rl018`) over REST: 18 of 18 as expected, and the same script against the
  previous rules allowed all 10 cases that should now be denied.
- For the author: this narrows who can see what. Suggestions and reply threads were readable by any
  signed-in account, anonymous included. After RL-022 only the recipe owner and the suggester, each
  with a verified email, can read them. That matches what the UI already showed, so no privacy copy
  changes.
- Reviewer noted (low): `subscribeRecipeSuggestions` passes no `onSnapshot` error callback, unlike
  `subscribeSuggestionMessages`. If the rules deploy before the new indexes finish building, a
  verified user hits an uncaught listener error in the console and the list silently shows nothing.
  Add an error callback that calls `reportError`.
- Reviewer noted (low): the page-level `isOwner` is still `canManageRecipe`, true for any local copy.
  A non-creator with a local copy sees approve and decline buttons on their own suggestion, and
  pressing approve is now denied at the `getDoc` in `updateSuggestionStatus` instead of at the
  update. Check the approve and reject handlers surface the rejection and do not leave an unhandled
  rejection.
- Reviewer noted (low): a legacy suggestion with a wrong `recipeOwnerId` never appears in the
  owner's query and a direct read is denied, so it stays unreviewable (the update rule keys on the
  same field already); the suggester still sees it. A suggestion on a deleted recipe is not shown to
  anyone. RL-042 wipes legacy data.

### RL-016 Recipe writes have a bounded createdAt, capped title and array sizes, and an immutable createdAt

- Rules change; nothing differs in the app until RL-022 deploys `firestore.rules`.
- After the RL-022 deploy, on live: publish a new recipe, then edit an existing published one
  and save. Both succeed and the edit shows on the shared page.
- Expected and accepted: a device whose clock runs more than a minute fast cannot publish.
- Not run by the agent: the `npm run dev:emulated` publish, edit and re-publish walk. The rules
  were probed over REST on a demo-project emulator (19 of 19 as expected; the same script against
  the previous rules allowed all 9 of the cases that should now be denied).
- Reviewer noted (med, for RL-036): (fixed since by RL-036: `lib/recipeEdit.ts` now has title 200, ingredient 100 and step 100 caps matching the rules) the editor had no
  title or list cap matching the rules. A recipe saved over a cap writes Dexie, then the cloud
  update is denied and the user gets the local-only toast, so the owner sees the edit while everyone
  else sees the old version. Over-cap content on a new recipe falls back to a local-only link.
- Reviewer noted (med, for RL-036): `createdAt` on import (`lib/import.ts`, `recipe.schema.ts`)
  accepts floats, future and huge values. A future or fractional `createdAt` on a later share is
  denied by the create rule and `handleShare` quietly falls back to a self-contained link.
- Reviewer noted (low): re-publish always sends the local `createdAt`, so a legacy cloud doc with
  no `createdAt`, or an imported copy whose local value differs from the cloud one, is denied as a
  changed key. A stored recipe already over a cap cannot take any owner update, including approving
  a suggestion (the collaborator write), and shrinking it is subject to the same check. RL-042
  wipes legacy data, so this should not occur on fresh data. The caps are checked on every owner
  update, not only when those keys change; scoping them to updates that touch those keys would
  fix the approval case.
- Noticed by the implementer (low): `ImportedRecipeSchema` accepts any number for `createdAt`
  (`z.number()`, not `.int()`), and `useRecipe` falls back to `createdAt ?? 0` for a cloud doc
  with none, which the immutability rule would deny on re-publish.

### RL-015 Notification creates need a verified email, a known type, a fixed key set and a capped message

- Rules change; nothing differs in the app until RL-022 deploys `firestore.rules`.
- After the RL-022 deploy, from a second verified account, favourite a recipe and follow its
  owner. Sign in as the owner and confirm the bell shows both notifications.
- Optional: file a suggestion longer than 500 characters. The owner's notification shows it
  cut with a trailing ellipsis; the suggestion itself shows the full text.
- Not run by the agent: the app against the emulator. The rules were probed on a demo-project
  emulator (19 of 19 as expected, including the 500 and 501 limit and the 250 and 251 emoji limit).
- Reviewer noted (low): the rule does not type-check or cap `recipientUid`, `recipeId`,
  `recipeTitle`, `recipeEmoji`, `fromDisplayName` or `createdAt`, so a verified user can still send
  an oversized `recipeTitle` or a wrong-typed field to any recipient. Out of scope for this ticket;
  worth a follow-up only if you want full shape validation.
- Reviewer noted (low): `updateSuggestionStatus` reads `suggestion.recipeTitle` with no fallback. A
  legacy suggestion without it would make the SDK throw on `addDoc` after the status write landed,
  which surfaces as a failed review. The suggestions create rule also does not require `message`
  to be a string. RL-042 wipes legacy data, so this should not occur.

### RL-040 Every client cloud write except view counts and error reports requires a verified email, and the decision is recorded

- Rules and docs only; nothing changes in the app until RL-022 deploys `firestore.rules`.
- Release order: RL-041 (the client half) must ship in the same release, and before RL-022
  deploys these rules. Deploying the rules without RL-041 leaves the client attempting writes
  the rules now deny.
- Once deployed, anonymous users lose every cloud write: favourites, follows, notifications
  (create, mark read, delete) and their profile. They keep local bookmarks only. Check on the
  preview with an anonymous account that favourite and follow fail quietly or are hidden
  (per RL-041), and with a verified account that all of them still work.
- An anonymous first sign-in no longer creates a cloud profile; check the profile page still renders for that account.
- Signed out, open a `/shared/:id` link: the view count still increments and the console shows
  no permission errors. A crash report from a signed-out session still lands in `clientErrors`.
- Confirm the generation question in the ticket Notes: generation is unchanged by this decision.
- Reviewer noted (med, for RL-041): `linkWithCredential` keeps the uid and does not re-fire
  `onAuthStateChanged`, and the profile is only ensured at `AuthContext.tsx` lines 237 and 255. An
  anonymous account whose profile create is now denied, then upgraded by email link, ends up
  verified with no profile doc. Then `followUser` fails its whole batch on the missing
  `profiles/{followerId}`, and the `publishRecipe` profile `updateDoc` fails and is only logged, so
  `recipeCount` drifts. RL-041 should ensure the profile once the user becomes verified, or make
  `followUser` and `publishRecipe` create it when missing.
- Reviewer noted (low): a verified user can still bump any recipe's `favoriteCount` or any
  profile's `followerCount` by 1 with no backing favourite or follow doc, and can create a
  notification for any `recipientUid` with arbitrary content (shape checks are RL-015). An owner can
  set `favoriteCount` and `viewCount` to any value.
- For the author (docs outside this ticket, left untouched): `README.md` line 41 ("everyone else can
  favourite and suggest") and lines 113 to 114 ("Publishing requires only a signed-in user ... so
  today the shared library is world-writable in practice") now state the old rule. `ROADMAP.md`
  lines 684 to 685 (the current boundary statement) is wrong, and the landed 1.6 entry at lines
  310 to 313 and 322 to 325 is history that RL-040 supersedes.

### RL-039 Production dependencies have no known critical or high advisories that npm audit fix can resolve

- Lockfile-only change (`npm audit fix`, no `--force`). On the preview build do the standing walk,
  with attention to two areas.
- Navigation (react-router went to 7.18.4): click through Link flows (home, recipe, version tree,
  shared link), trigger `useNavigate` flows (delete a recipe returns home, sign-in return), open
  a deep link and a bad URL, and use the browser Back and Forward buttons. Redirects must land
  in-app and Back must not loop.
- Live Firestore listeners: signed in, open a recipe and confirm suggestions and the library update
  live; open `/shared/:id` signed out and confirm the console is empty.
- 4 high advisories remain by design (@grpc/grpc-js chain, Node-only, not in the bundle). See the
  ticket Notes for the table.

### RL-023 Deleting a recipe waits for the cloud delete and tells the user when published copies remain

- On the preview build, signed in with a verified email, open a published recipe, set the network
  to Offline in devtools, and delete it. The Delete button reads "Deleting..." and is disabled for
  up to 10 seconds, then a dialog reads "Removed from this device, but N published copies could not
  be removed from the shared library." with "Try again" and "Leave anyway". After a timeout the
  copy states no number ("...the shared library did not confirm its published copies were
  removed."). The page does not navigate on its own.
- Go back online and press "Try again": the app goes home, and the recipe's `/shared/:id` link
  no longer loads.
- Repeat and press "Leave anyway": the app goes home and the `/shared/:id` link still works.
- Online, delete a published recipe: it goes home as before, with no dialog. Also try one with an
  unpublished local variation beneath it: still no dialog.
- As an anonymous user, deleting a local recipe goes straight home and never shows the dialog.
- For the author: a recipe published anonymously before the verified-email gate is orphaned
  when its unverified owner deletes it. The delete is local only, so the cloud copy stays at
  `/shared/:id` and no dialog says so.
- Not run by the agent: no browser. Covered by a mocked-Firestore unit test of the owner filter only;
  there is no page test for `handleDelete`.
- Reviewer noted (high, fixed): the first pass attempted deletes on never-published local ids, which
  the rules deny, so the dialog showed a false failure and "Try again" never cleared. Leftover ids
  are now read with `getDoc` first and skipped when missing or foreign. Round 2 confirmed it.
- Reviewer noted (med): the `emailVerified` gate is stricter than the delete rule, so an
  unverified owner of a pre-gate public copy cannot remove it (ticket-mandated, see the orphan
  note above). Offline, Firestore queues the deletes: after the timeout dialog they can still land
  once the network returns, even after "Leave anyway", and each "Try again" queues a duplicate set.
- Reviewer noted (med, UI): Escape is not blocked while `busy`, so it can close the delete dialog
  mid-delete (leaving a bare "Deleting..." page for up to 10 seconds) or act as "Leave anyway"
  during a retry. Consider `onCancel` preventDefault on `ConfirmDialog` when busy, and a neutral
  Escape on the failure dialog.
- Reviewer noted (low, UI): the dialogs remount when the recipe disappears mid-delete (different
  child index, no key); at 320px the footer ("Leave anyway" and "Trying again...") may wrap or
  squash, so check it; busy state has no `aria-busy` or live region, and focus is lost after a
  failed retry; the "Deleting..." page has no spinner; the copy does not say the copies are still
  public; the "all N variations" line at about `RecipeDetailPage.tsx:528` does not use `pluralize`.
- Reviewer noted (low): `trackRecipeDeleted` fires before the local delete succeeds and again on a
  re-click; a failed `getDoc` on a missing doc still produces a phantom failure (rare, commented);
  no test for the `getDoc` rejection fallback or retry-after-partial-success.

### RL-017 Suggestions must name the real recipe owner, and approval adds the collaborator before marking approved

- Needs the rules deploy (RL-022) before the owner check is live on the preview.
- On the preview build, as user B suggest a change on user A's published recipe. As A, approve it:
  B appears in the recipe's collaborators, and B receives the "suggestion approved" notification.
- If an approval fails, the page shows "Couldn't approve that suggestion. Please try again." and
  stays put (no jump to the variation composer); the suggestion still reads as pending.
- Not run by the agent: the full approve flow against `npm run dev:emulated`. The create rule was
  probed on a demo-project emulator (correct owner allowed, wrong owner and missing recipe denied).
- Reviewer noted (med): approve now needs the recipe update to succeed, so it can fail for good on
  legacy data (suggestion whose cloud recipe was deleted, or a wrong `recipeOwnerId` that matches
  the reviewer but not the recipe's `createdBy`). The "Please try again" text will mislead there.
  Decline still works. Cleanup is deferred to RL-042.
- Reviewer noted (med): `recipeOwnerId` comes from the local Dexie `createdBy.uid` but the rule
  checks the cloud recipe's. A local copy whose uid differs (for example after the blocked uid
  migration) is denied, and the modal says "That didn't send. Check your connection", which
  blames the network for a permanent denial.
- Reviewer noted (low): if the cloud writes succeed but `addLocalCollaborator` throws, the UI shows
  "Couldn't approve" while the suggestion is already approved, with no retry path. A partial
  failure (collaborator written, status not) leaves the owner's local view without the collaborator
  until a retry. The in-flight guard reads React state, so a same-tick double click could send the
  notification twice.
- Reviewer noted (low): the `?? 'local'` owner fallback in `RecipeDetailPage.tsx` and
  `SharedRecipePage.tsx` only produces a doomed write. Check `danger-600` contrast in dark mode.

### RL-003 Gate the suggestions listener on a signed-in user

- Open a `/shared/:id` link in a fresh signed-out profile (private window) and confirm the
  browser console is empty: no `permission-denied`, and no new `clientErrors` document.
- Sign in and open one of your recipes: suggestions still appear and update live.
- Sign out on a recipe page: the suggestions area empties, nothing stale from the account.
- Reviewer noted (low): the comment in `useSuggestions.ts` and the ticket say the keying matches
  `useSuggestionThread`; it does not (that hook keys on suggestion id only and relies on an empty
  list when signed out). The test does not cover a `recipeId` change for the same user. A signed-in
  user who hits a real denial still gets an uncaught listener error, which is out of scope here.

### RL-002 Add a component and hook test harness

- No visible change. Check only that `npm test` is green on the preview branch and that the
  app still loads (`AuthContext` gained two exports, nothing else in `src/` changed).

### RL-071 Pure radial layout for the Map view

- Nothing to check in a browser: `layoutRadial` is covered by tests and has no UI until RL-072.

### RL-072 Map view of the version tree

- On families of 1, about 8 and over 20 versions, open `?view=map` (or the Map switch). Check the dashed rings, the thicker terracotta path from the centre to the ringed current node, and that selecting a node updates the card (eyebrow, title) and Open goes to that recipe.
- Over 20 versions the notice "This family is big for the map. The timeline reads better." appears above the map and Show timeline switches to Timeline without adding a history entry.
- Full screen map (top right of the map) pans by scrolling at twice the scale, selecting still updates the card, and it closes with Escape and with Close map, returning focus to the expand button.
- Check at 390 and 320 px: nodes on outer rings are small (about 22px at 320 with 3 generations) but each keeps a 44px tap target; confirm taps on crowded rings hit the node you meant.
- Reviewer-relevant contrast: terracotta path on the node discs is 2.69:1 (3.03:1 on the page); neutral-400 edges and rings are 1.68:1 and the node outline 1.50:1 on its disc. All are from the Organic spec, so a darker palette is a design call.
- Reviewer noted (med): hit buttons are a fixed 44px while ring gaps shrink with scale, so on 4 or more generations at 320px parent and child targets overlap and the deeper node wins (documented; the notice, which now also fires from 5 generations, is the answer). At low scale outer-ring buttons can extend past the column edge.
- Reviewer noted (low, design call for the author): path outline on node discs is 2.69:1, edges and rings 1.68:1, node outline 1.50:1, all under 3:1; a selected non-current node's ring is close in geometry to the current ring.
- Reviewer noted (low): Android back does not close the full-screen map, and body scroll is not locked behind it.


### RL-073 What changed screen

- Open `/recipe/<a variation id>/changes` and `/recipe/<id>/changes?vs=<cousin id>`. Check the rows read correctly against the two recipes: `~` changed rows with the old amount struck through, `+` added, `-` removed, method words inserted (highlighted) and deleted (struck).
- Check the Changes only / Side by side toggle, the time and servings line, the prompt bubble, and that both pills open their recipes.
- A root recipe (no `?vs=`) shows "This is the original". The links now exist (recipe page and Timeline sheet, RL-074).
- Check Side by side at 320 px: two columns about 140 px wide, long words wrap, no sideways page scroll, and the sticky footer buttons (44 px) never hide the last row.
- With VoiceOver, rows announce Changed, Added or Removed, and old values are read as "was ...".
- Reviewer noted (moot while the app is light only, RL-065): the tinted cells use light-only tints with themed text, so they would be unreadable if dark mode returns. Pin the text to fixed tokens then.
- Reviewer noted (low): SegmentedControl has no arrow-key roving (shared, pre-existing). The BackButton is duplicated from VersionTreePage.


### RL-074 What changed entry points

- Open a variation's recipe page. "See what changed" is the button in the lineage strip under the title; tap it, check the screen, then Back returns to the recipe.
- Open a root recipe and confirm there is no such link.
- In the Timeline, open a child stop's sheet. The ghost "See what changed" button sits between the change tags and Open / Branch here; it opens the changes screen. The root stop's sheet has no such button. Check the sheet at 320 px.
- Reviewer noted (moot while the app is light only): in dark mode primary-600 text and the forced primary-600 focus ring are about 2.6:1 on the dark surface, a token-level issue shared with the ghost Button.
- Reviewer noted (low): the forced ring on the ghost button differs slightly from the neighbouring buttons' primary-500 ring.

### RL-064 Lucide icons at stroke 2.75

- At 390x844 walk Library, Recipe, Edit, Chat, Profile, Settings, Shared recipe, Version tree and What changed. Every icon should be the heavier Lucide style, none missing, none mis-sized.
- Look closely at the 14 to 16 px icons (serving stepper plus and minus, profile pencils, search clear X, chat parent chevron, card heart). At stroke 2.75 these may look blobby. If so, drop the stroke width for small sizes.
- Filled hearts (favourited) should still read as a filled heart with a slightly heavier outline.
- Icon-only buttons keep their 44 px target and focus ring (Tab through the Library header and recipe page header).
- Reviewer noted (med, needs your eyes): stroke 2.75 is about 40% heavier than a normal Lucide icon at 14 to 16 px (stepper plus and minus, search clear X, profile pencils, chat chevron, card heart); the 14 px profile badge pencil is most at risk of blobbing. If it looks heavy, the fix is a strokeWidth prop on Icon (about 2.25 for small ones); do not change it before this check.
- Reviewer noted (low): the filled heart gains about 10 percent of size from the 2.75 outline; BottomNav active state is colour only and slightly weaker against the heavier inactive icons; the chat Send button is 40 px (w-10 h-10) rather than 44 px, probably pre-existing and worth a follow-up ticket.

### RL-130 Macro and diet pills

- At 390 and 320 px open a recipe with nutrition and a "vegetarian" tag. Pills run author, time, difficulty, leaf diet, kcal, carbs, fat, protein, and wrap cleanly.
- Open a recipe without nutrition: no macro pills. A recipe with no diet tag shows no leaf pill.
- Check the neutral pills' contrast if dark mode returns. The chat card passes no tags, so it gets macros but no diet pill.
- Reviewer noted: the chat card shows macros but no diet pill (out of scope, it passes no tags).
- Reviewer noted: the order test does not assert servings or prep/cook after protein.

### RL-134 Branch entry points open the sign-in sheet

- At 390 px, signed out and as an anonymous guest: tap Branch this recipe (recipe page), Make it yours (shared link), the tree page "Branch from" bar and a Timeline stop's Branch here. Each opens "Sign in to branch this recipe" and does not navigate. Not now closes it and leaves the page as it was.
- Signed in with a verified email: the same four taps go straight to the branch screen with no sheet flash.
- Visiting /recipe/:id/vary directly while signed out still shows the full-page sign-up screen.
- Reviewer noted: after Not now on a Timeline Branch here, the stop sheet stays open with no hint why Branch did nothing (intentional).
- Reviewer noted: the Timeline view mounts two SignUpDialog instances (one in TimelineView, one on the page); harmless.

### RL-135 A sign-in link returns to the page it was asked from and remembers the action

- Emulators (`npm run emulators`, `npm run dev:emulated`), 390 px, signed out: open `/recipe/<id>`, tap Save, Continue with email, send a link. The sent sheet says "The link brings you back to this page." Open the link in the same browser: you land on `/recipe/<id>` signed in, and the link sheets behave as before (nothing shows after a plain sign-in). Nothing runs the Save yet (RL-136).
- In devtools, Application > Local Storage: after that send `recipe-app-pending-action` holds `{"kind":"save","recipeId":"<id>","at":...}`. Repeat for Suggest and Branch on the recipe page, Save, Suggest and Make it yours on a shared link (kinds save, suggest, branch), and Follow on `/profile/<uid>` (kind follow, uid). A plain Sign in (Activity, the You tab) sends with the key removed. Continue without an account removes it.
- Open a link sent from `/profile/<uid>` in another browser (needs email): the "Finish signing in here" sheet shows over the profile page, which used to show no sheet because it sits outside the shell. Check one sheet only, never two, on `/` as well.
- Below 1024px, a recipe opened from Explore now also shows a link sheet if one is due (it used to be hidden there).
- On a self-contained `/shared#r=...` link, signed out: Save, send a link, open it. You land on the same shared recipe (the hash is kept on `/shared` only), not on not-found, and the address bar keeps the `#r=...` after the sign-in parameters are cleared. Check a very long recipe too: the whole hash rides in the link's continue URL.
- Reviewer noted: a link to a local-only recipe, opened on another device, lands on not-found (that recipe is not on the other device).
- Reviewer noted: the link completion's `replaceState` drops `history.state`, so a link opened in the same tab on a recipe shown beside the list at lg loses the list and shows the recipe alone.
- Reviewer noted: `TermsGate` and `EmailLinkStatus` can open together after a link; check their stacking in the emulator walk.
- Reviewer noted: `src/content/legal/cookies.ts` and `privacy.ts` do not yet list the `recipe-app-pending-action` key (author reviews policies before go-live).

### RL-136 After the sign-in link returns, the remembered action runs once

- Emulators (`npm run emulators`, `npm run dev:emulated`), 390 px, signed out, for each of: recipe page Save, Suggest, Branch this recipe; shared link Save, Suggest, Make it yours; profile Follow. Tap it, Continue with email, send, open the link in the same browser. You land on the page and the action happens once: Saved state, Following state, suggest mode open, or the branch composer. Reload: it does not happen again.
- A new account: the Terms dialog shows first if due; after Accept the action runs. Decline signs you out and nothing runs.
- Already saved or already following before the link: it stays saved or followed (never toggled off).
- Tree "Branch from" on another version, then the link: the composer opens for that version.
- Open the link in another browser (typed address): you land on the page signed in and nothing runs.
- Sign out with an unrun intent stored (Application > Local Storage `recipe-app-pending-action`): the key is gone.
- Suggest on your own recipe or a local-only one: the link signs you in and nothing opens.
- Reviewer noted: a skipped action (already saved, cannot suggest, your own profile, already following) gives no feedback.
- Reviewer noted: neither recipe page announces a favourite save (only the button's Saved state and `aria-pressed`), so a remembered Save is silent for screen readers too.
- Reviewer noted: a stored action lingers after a failed or not-found recipe load and can run on a later visit within the hour.
- Reviewer noted: suggest mode opened by the remembered action does not move focus.
- Reviewer noted: the recipe page renders briefly before the branch redirect.
- Reviewer noted: a failed first Terms read is read again before the claim.
- Reviewer noted: there is one storage slot, so if two links were asked for, the newest intent wins.


### RL-141 Loading screen

- Throttle the network to Slow 3G and hard-reload: a still, fully grown tree with "Turning the soil" and an empty bar shows (fading in), in light and dark, until React's first render. Then the existing PageFallback spinner shows while the route chunk loads (PageFallback is unchanged by this ticket). Check the swap from the tree to the spinner for flash.
- The animated cycle (trunk, four branches, leaves that come and go, canopy, eight emoji, captions in order, bar fills, fade and restart) and the still tree under reduced motion are first visible in the app through RL-142.
- Reviewer noted: Caprasimo may flash the system font on the cold-start caption.
- Reviewer noted: the full variant scrolls in short landscape.

### RL-142 Inline loading screen on long generations

- At 390px ask for a new recipe and wait: after about 4 s the dots become the growing tree above the composer and loop until the card arrives. Check it does not push the composer off screen at 320px.
- Watch one cycle in light and dark (trunk, branches, leaves, canopy, emoji, captions, bar, fade, restart), then again with Reduce motion on (still grown tree, captions still change).
- With VoiceOver or TalkBack: only "Generating recipe..." is spoken, once.
- Reviewer noted: the swap jumps from about 40px to about 270px. A long wait announces "Generating recipe..." once only. Check the bar track contrast in dark.

### RL-145 Structured suggestions model

- No visible change. Pure model, tests and a decision entry only; RL-147 to RL-150 add the screens.
- Reviewer noted: a bare number replacing "1 cup" drops the unit (per spec).
- Reviewer noted: rules still only allow approved/rejected until RL-146.

### RL-146 Suggestion rules for edits and outcomes

- No visible change. Rules in the repo only; RL-156 deploys them. Probe codes are in the ticket's Notes.
- After RL-156 deploys, the current Approve button fails until RL-147 and RL-148 replace it.
- Reviewer noted: `branchId` only proves the branch is the owner's own child of the recipe, not that the suggestion's edits were applied to it.
- Reviewer noted: `suggestion_applied` and `suggestion_branched` notifications are not tied to a real suggestion (the same is true of the existing suggestion types; rate limited).

### RL-147 Suggest mode sends structured edits

- On a recipe you do not own (two verified accounts, `npm run dev:emulated`), at 390 and 320px: change an ingredient amount, tap a method step and change its text, write a General note, Send. In the emulator UI the suggestion has `edits` and `message`; the owner's Activity row reads like "1 tsp salt → 2 tsp and 2 more".
- Type "lots" as an amount: the red help line appears under the card and Send is disabled until fixed or undone. Escape or the X closes a card and returns focus to its row.
- The old separate note box is gone; the General note row at the bottom shows the first line once written.
- More than 10 changes shows a message and disables Send (the rules cap).
- A step over 1000 characters cannot be suggested on: its card shows "This step is too long to suggest on" and Send stays disabled.
- Reviewer noted: system Back in suggest mode discards drafts (useBlocker was rejected, see docs/decisions.md).
- Reviewer noted: a Why on an unchanged step is dropped without a hint.
- Reviewer noted: `composeSuggestionMessage` writes a double period when the step text ends with '.'.

### RL-148 Apply, keep as branch or decline a suggestion

- Emulator only (`npm run emulators` plus `npm run dev:emulated`, two verified accounts); the live rules deny `applied` and `branched` until RL-156.
- As the suggester, change an ingredient amount. As the owner, tap Apply on the card (recipe page) or in the thread: the recipe shows the new amount on both devices, the suggestion closes, the suggester appears under Collaborators, and the suggester's Activity row reads "applied your suggestion to" with a sage check badge.
- Suggest again, then edit that ingredient by hand as the owner before applying: Apply shows "That recipe changed since the suggestion. Open it and edit by hand." and nothing changes.
- A free-text or General-note-only suggestion: Apply just closes it and notifies; the recipe is untouched.
- Keep as branch now has a button (RL-149 and RL-150).
- Old Approved suggestions still show Approved.
- Reviewer noted: an owner who has not accepted the current Terms gets the generic "Couldn't keep that as a branch" error on Keep as branch (the recipe create rule needs `acceptedTerms()`).
- Reviewer noted: `src/content/legal/privacy.ts` line 103 still says "approves or rejects your suggestion", and line 35 says "people whose suggestions you approved"; the author reviews the policies.
- Reviewer noted: an Apply that times out on the client can still commit late; the recipe then changes without a success message, and the Dexie row fills from the own-recipe sync (RL-078).
- Reviewer noted: the `branched` status write can race a Decline from a second device; the decline wins and the published branch is left orphaned (very unlikely).
- Reviewer noted: a suggestion already reviewed elsewhere now shows "This suggestion was already reviewed. Refresh to see it." on Apply or Keep as branch.

### RL-149 Suggestion cards show diff rows and the owner's Apply, Decline and Keep as branch

- Emulator only (two verified accounts); the live rules deny `applied` and `branched` until RL-156.
- At 390 and 320px as owner and suggester: a suggestion with two ingredient edits, a step and a note shows one diff row each (new amount bold, old amount struck) and the note below. The suggester sees only a Reply link.
- Owner: Apply closes it and shows an Applied tag. Another one: More options (the three dots), Keep as branch opens the new branch; the closed row reads Branched and opens that branch.
- An old free-text suggestion shows Mark applied and no More options button.
- Dark theme: the struck amount and the tags are readable.
- Screen reader: a diff row reads "Change light brown sugar from 150 g to 100 g".
- Replies is now a link, not a button.
- Reviewer noted: check the action row (Decline, Mark applied, More options) at a real 320px viewport; Mark applied now wraps inside the 44px height.

### RL-150 The suggestion thread pins diff rows and gives the owner Decline, Keep as branch and Apply

- Emulator only (two verified accounts); the live rules deny `applied` and `branched` until RL-156.
- Open a suggestion with edits from Replies: the pinned card shows each edit as a diff row with a leading "~", then the note, and scrolls with the thread.
- As owner at 320px: Decline, Keep as branch and Apply fit on one row without truncating "Keep as branch". Check "Working…" fits too.
- Apply stays on the thread and the header tag turns Applied, with no footer. Keep as branch opens the new branch.
- A free-text suggestion shows Decline and Mark applied only. The suggester and closed suggestions show no footer.
- Reviewer noted: the footer uses ad hoc buttons, not `ui/Button`.
- Reviewer noted: `useSuggestionThread` has no loaded flag, so "No replies yet" can flash, and the replies error has no Retry (both pre-existing).
- Reviewer noted: check 320px and the on-screen keyboard open in a real browser; the owner buttons hide while the reply box has focus.

### RL-151 Activity rows state a suggestion's change in one line

- Send a suggestion from a second account; the owner's row reads "Sami: 150 g light brown sugar → 100 g" then the time, no quotes, one truncated line at 320px.
- Applied and Kept as a branch rows show the message with no name; replies, saves and follows keep quotes. Old free-text suggestions use the new format.
- Reviewer noted: the Activity error state has no Retry and the empty state is an ad hoc `<p>` (pre-existing).
- Reviewer noted: `open()` awaits `markRead` without a catch, so a failure blocks navigation silently (pre-existing; fixed in RL-153).

### RL-152 Rules for branch notifications and notification preferences

- No visible change. Rules in the repo only; RL-156 deploys them. Probe codes are in the ticket's Notes.
- Nothing writes a `branch` notification (RL-153) or `notificationPrefs` (RL-155) yet.

### RL-153 Branching someone else's recipe tells its author

- Needs RL-156's rules on the emulator (`npm run emulators` plus `npm run dev:emulated`) with two verified accounts; live it is denied until the deploy.
- B branches A's recipe and saves. A's Activity shows "B branched your recipe <emoji> <title>", the prompt quoted under it, and a sage badge with a branch icon. Tapping it opens B's branch.
- B branching B's own recipe, and Keep as branch on a suggestion, notify nobody.
- Tapping an unread row opens its target even offline; the read mark is no longer awaited.
- Reviewer noted: a dropped notification (window full, offline, unverified sender, parent only local) leaves no telemetry.
- Reviewer noted: the row shows the parent's title while the tap opens the branch.

### RL-154 Activity filter chips and day headers

- On Activity at 390 and 320px: All, Branches, Suggestions, Follows chips filter the rows; an empty chip says "Nothing here yet."; leaving and returning resets to All.
- Headers read Today, Yesterday, a weekday name (2 to 6 days ago), then a date like "12 Oct". With a filter on, Mark all read still clears everything; VoiceOver announces the chip as pressed.
- Chips are plain toggle buttons with the Chip look, not the `Chip` component, because its selected colour is primary-600 and the spec wants text-primary.
- Reviewer noted: the fetch error state still has no Retry (pre-existing); check the chip row at a real 320px.

### RL-155 Settings "Notify me when"

- Needs RL-156's rules on the emulator (`npm run emulators` plus `npm run dev:emulated`), verified account, 390px. Live, a toggle flips then reverts with "Couldn't save that. Try again." until the deploy.
- Switch Someone follows me off, have a second account follow you: no row and no badge. Switch it on: the row and badge appear (hidden types are only filtered, never deleted).
- Keyboard Tab and Space on the switches, VoiceOver reads name and on or off; dark theme track contrast. Card is hidden signed out and for guests.
- Placed between Account and Appearance (the ticket did not say where). Mark all read also marks hidden rows read.
- Download my data now has `cloud.notificationPrefs`; the file version stays 1.
- Reviewer noted: three components each open a prefs listener (a shared context would dedupe); Mark all read also marks hidden rows read; last write wins across devices.
- Switches are disabled until the stored document (or a failed read) arrives; the off track has a ring for 3:1 contrast in the light theme. A fully hidden Activity says "Some notifications are turned off" with a Settings link.
- Reviewer noted: the Activity "Nothing here yet." fallback is still an ad hoc `<p>` and its error state has no Retry (pre-existing).
- A failed read of the stored choices keeps the switches disabled with "Couldn't load your choices. Reopen Settings to try again."; the three switches also disable while any save is in flight.

### RL-158 Rules for moving children up when a version is deleted

- No visible change. Rules in the repo only; RL-160 deploys them. Probe codes are in the ticket's Notes.
- Nothing writes the reparent update or a `moved` notification yet (RL-159).

### RL-159 Delete version moves its branches up

- Needs RL-158's rules on the emulator (`npm run emulators` plus `npm run dev:emulated`) with two verified accounts; live the batch is denied until RL-160 deploys.
- A makes R and branch V; B branches V as W. On V, More reads "Delete version"; the dialog reads "Delete this version?" and "Its branch stays, and moves up to R." with Keep it and Delete. Delete opens R. W now hangs off R in Tree, Timeline and Map on both accounts, and W's version pill says "from R".
- B's Activity shows "A deleted V, so W moved up a level" with a sage branch badge, under Branches too. V's title is not bold (sender-written text).
- Dialog copy with 0 children ("This can't be undone.") and with 3.
- A opens R: More shows "Delete" greyed with "Other cooks have branches here, so the original stays."; tapping it does nothing. VoiceOver should read the line with the row. A root with only A's versions still deletes the whole family.
- The row does not name the new parent (no field for it in the rules); the ticket wanted "now branches from <new parent>".
- Delete V2 (W moves to V1), then delete V1: both succeed, and B gets two moved rows.
- After Delete the parent's title has focus (VoiceOver reads it) and no dialog lingers. Keep it, Esc and the OK on a refusal put focus back on More.
- The greyed original row: the reason line is full contrast, only the icon and "Delete" are dimmed. The Delete row is disabled for a moment while the family loads.
- Too many: "Too many branches to move" with a single OK (needs 9 other cooks' branches on one version, emulator only).
- Branch a locally saved copy of a shared recipe (Save copy on a shared link) while verified: it publishes.
- Reviewer noted: Share on a branch whose parent was never published falls back to a self-contained link with no note (pre-existing in kind).
- Reviewer noted: on the device, the re-read and reparent and then `deleteRecipeTree` run in two transactions, so there is a narrow window between them.
- Reviewer noted: a stored depth 0 under a non-root parent becomes -1 in the cloud when moved (the rule demands one less), while Dexie clamps it to 0.
- Reviewer noted: `replace: true` means Back from the parent skips the deleted page (intended, but check it feels right).
- Reviewer noted: the dialog copy is captured from the lineage at open time; if it is still loading the count can be low (the row is disabled while loading, so this needs a slow cloud read to see). The notice id changed to `moved_{child}_{deleted}` in the repo rules (RL-160 deploys it).

### RL-162 New original tag after Create New Recipe Anyway

- On the emulator, ask for a recipe that matches an existing one so the similar panel shows; tap Create New Recipe Anyway, refine once, save. The recipe page shows a small terracotta "New original" pill under the description, above the metadata pills.
- In the emulator UI the new document has `relatedFamilyId` equal to the first listed match's `rootId` (its original's id, also when the match was a branch). Reload, and open it on a second device or account: the tag is still there.
- A recipe saved with no match, and a branch made after Create anyway on a variation, show no tag and have no `relatedFamilyId`.
- Check the pill sits well on narrow screens and in the wide pane, and that VoiceOver reads "New original, similar to an existing recipe family".
- The rules bound on `relatedFamilyId` is repo only until RL-160 deploys; live publishes work either way.

### RL-163 Related family card

- On the emulator, after RL-162's walk: open the new original. A pale green "Related family" card sits below the metadata pills and above the ingredients, showing the matched family's emoji, title, author and "N versions". Tap it: it opens that recipe.
- Open the matched original: the card lists the new original (up to 3, newest first). Tap a row to open it. Both links keep the list you came from (check the wide pane).
- A recipe with neither shows no card. Go offline and reload a recipe: no card, no error.
- Check the card at 390 and 320px, and in dark mode.
- Cousins are read as the first 20 matches sorted newest first, so no new index is needed.
- The card fades in when its read lands, so it can push the ingredients down a little on arrival; check that it does not feel jarring, and that it does not animate with reduced motion on.
- If the version count read fails, the row shows without "N versions" instead of the card vanishing.

### RL-164 Move a new original into its related family

- On the emulator, after RL-162's walk as account A (with one own branch on the new original): open the new original. Under the Related family card a grey card with a merge icon reads "Is this really a version of <title>? **Move it into that family**. You stay the author."
- Tap the bold part: "Move into <title>?" with "It becomes a branch of <title>, with its 1 branch. You stay the author.", Keep it / Move. Keep it closes it with nothing changed.
- Move: within a few seconds the page shows the recipe as a variation of the matched family (family label, version pill, lineage strip), the Related family card and Move line are gone, and the title has focus.
- Check Tree, Timeline and Map of the target family on both accounts: the moved original sits under the matched original with its branch below it. Explore no longer lists it as an original.
- Account B (the matched family's author) gets a "branched your recipe" row in Activity pointing at the moved recipe.
- Have account B branch A's new original first: A then sees "This can't be moved because another cook has a version in it." with no button. Account B never sees the Move line.
- Go offline (or stop the emulator) and tap Move: after up to 10 s an inline error ("Couldn't confirm the move yet. It may still finish.") shows under the card and nothing changes on the device. Reopening the dialog clears it; Keep it and Esc do nothing while Move is in flight.
- After a successful move, focus is on the recipe title (VoiceOver reads it), not the page body.
- A related link whose original has since moved into another family shows that family's original instead.
- Check the card at 320px and in dark mode, and that VoiceOver reads the bold part as a button.
- Emulator does not enforce the 500-write limit (a 501-update transaction passed); the client refuses above 500 versions regardless.
- "One branch by another cook stayed behind." needs another account to branch during the move; hard to reproduce by hand.

### RL-165 Settings when signed out
- Signed out on a phone, open You: a Settings cog sits top right above "You're browsing". Tap it.
- Settings shows an Account card with a person icon, "Sign in" and "Save, branch and follow cooks", and no Sign out, no Notify me when card. Appearance, Your data and Legal work as before. Switch to Dark.
- Tap Sign in: the sign-in sheet opens over Settings. Finish the email link: you land back on Settings with the Account card showing your name and email.
- Reviewer noted: the guest helper copy says "recipes" in Settings but "bookmarks" on the profile; the signed-out You tab has no h1 (pre-existing).

### RL-166 Most branched ranking

- No visible change yet (the Explore section ships in RL-167). Nothing to check in the browser; the unit tests cover the ranking and the hook.

### RL-129 Two-line titles and the compact title bar
- At 390 and 320px, open an original and a branch with a 90-character title: the title stops at two lines with an ellipsis, and the family label sits on its own line below.
- Scroll until the title leaves the top: a bar with Back and the whole title (wrapping) appears pinned to the top, with no page jump. Its Back goes back. Scroll up: it goes away.
- At 1024px in the pane: the bar pins to the top of the pane, full pane width, and does not cover the list.
- With Reduce motion on, the bar appears with no fade. VoiceOver reads the title once.
- Reviewer noted: the full title is not visible on touch while the clamped h1 is on screen (the bar shows only after it leaves); a long title makes the bar about 80px tall at 320px. The bar can cover a heading that a scroll-to or focus jump lands at the very top (no `scroll-pt` added); check the in-page jumps.

### RL-131 User Pills on carousel, similar matches and composer
- At 320px, a recipe with branches by named cooks: each carousel card shows "Title · [pill]" with the pill wrapping for a long name. A branch made on this device (no account) shows only the title.
- Prompt something that matches someone else's published recipe: the similar panel reads "Shared library, by [pill]". Your own match still reads "Your recipe, not on this device".
- Reviewer noted: check 320px in all three places (long names: carousel wraps, chat wraps, composer truncates with an ellipsis); the pill now has a border so it shows in dark mode, so glance at the other pill sites (Explore, Saved, Search) too.
- Branch someone else's recipe: the composer card reads "Branching **Title** [pill]" on one line at 44px, title truncating first. Your own local recipe shows no pill.

### RL-137 Compact Save in the composer while the newest card is collapsed
- Generate a recipe, then collapse the newest card ("Hide full recipe"): a "Save" pill with a bookmark sits left of the input. Tap it and you land on the saved recipe. Expand the card again and the pill goes; while a reply is generating it is absent.
- At 320 and 390px (320px with the keyboard open): the input pill stays usable beside the Save pill. On a variation the pill's accessible name is "Save Variation".
- Reviewer noted: below 640px the pill is icon-only (44px circle) so the input keeps its width; from 640px it reads "Save". The pill stays active beside a disabled composer, matching the card's Save.

### RL-138 Timeline lane legend
- Open a family with 4+ lines in Timeline at 390px: each lane's name shows at the left edge for 2 s, then collapses to a coloured dot that stays. Scroll sideways: the dots stay at the left edge. Switch to Tree and back: the names show again.
- Turn on reduced motion: same, but the names disappear without animation. The dots and names never block taps on stops.
- Reviewer noted: the collapsed dots sit over stops scrolled under the left edge (visual only, taps pass through). Lines that share a lane show side-by-side dots and one joined name.

### RL-139 Spinner stops spinning under reduced motion
- With Reduce motion on (macOS or iOS), open a lazy page on a slow connection: the ring shows still, without turning. With Reduce motion off it still spins.

### RL-140 Avatar swatches follow the theme, chrome colour reads the token
- Edit avatar, Emoji mode: pick each of the six swatches, Save, and check the avatar in Light and Dark (the swatch now shifts with the theme). An avatar saved before this change still shows its colour, and its swatch shows pressed in the editor.
- Android Chrome: the browser bar colour follows Light and Dark in Settings.
- Reviewer noted: legacy hex avatars stay light in dark mode until re-saved. `photoBgColor` is not constrained by rules (harmless; consider a length cap at the next rules change).

### RL-143 Shared banner and lineage card
- Signed out at 390 and 320px: open `/shared/<branch id>`. The banner says Get the app (taps to home). The card reads "<author> asked for "prompt" on <parent author>'s Banana bread. See all N versions"; tap the link, then Back returns to the shared page.
- Open `/shared/<original with branches>`: the card reads "N versions grow from this recipe. See all N versions". An original alone shows no card. A `/shared#r=` link keeps its old sentence and no link.

### RL-144 Family panel from 1024px
- At 1280x800 and 1024x768 open a recipe from Explore, press Family (footer) and the tree icon (header): a 420px panel slides over the right with "<root> family", Tree / Timeline / Map and Branch from this one pinned at the bottom. Switch all three views; Map's big-family banner switches to Timeline inside the panel.
- Tap a node, or a stop's Open: the panel closes and that version opens with the list still on the left. Branch from this one goes to the vary page (signed out: the sign-in sheet). Escape and a backdrop click close it, and focus returns to the button.
- At 1023px Family and the tree icon still go to the tree page; More > See the family goes there at every width. Reopen the panel: it starts on Tree.

### RL-167 Most branched on Explore
- On Explore at 390px and 1280px, light and dark: below the tile row a "Most branched," heading with a "last 90 days" pill shows up to three families with rank, emoji, author, time and a "+N" tag. Counts should look plausible against the tree pages.
- Open the pill by touch and by keyboard (arrows, Escape, tap outside): Last 30 days and Last 90 days only. There is no All time row (RL-166 has no all-time read), so the ticket's All time option is not built; say if you want a server-side counter ticket.
- When the 100-recipe read does not reach back far enough, a "Counts only the newest 100 recipes" line shows under the heading.
- It is absent under a tag chip, under Following and in local-only mode.

### RL-168 Pantry helpers
- No visible change: pure helpers for the Pantry sheet (RL-169). Nothing to check in the app.

### RL-169 Pantry chip and sheet on Search
- On a phone, light and dark: Search, Pantry. Add three items by typing (Enter or comma), pick 30 min, and watch the Show button count change as items are added. Show: the chip reads "Pantry · 3", the "Using ... · under 30 min" line sits above results that all use every item. Open one, come Back: the filter is still there.
- Pantry again, then "Or write a new one with these": the chat composer holds "Something with ... in under 30 minutes", unsent.
- Keyboard: focus starts on the first item or Add, Tab follows the layout, Escape closes and focus returns to the Pantry chip. Typing in the search box clears the filter. Pills are 44px tall (the design says 34px for the chip; kept at the 44px target floor).

### RL-170 Pantry card on Explore
- On Explore at 390px, below the tile row and Most branched, light and dark: a sage "What have you got?" card. Tap it: Search opens with the Pantry sheet over it and focus inside; close it and you stay on Search with focus on the Pantry chip.
- At 1280px the card leaves the two-pane view and opens Search full width; Back restores the pane. In cloud mode the card appears together with the rows, not before.
- The card is absent under a tag chip and under Following, and shows in local-only mode.

### RL-171 Profile stat tiles
- At 390px, own profile and another cook's profile: four tiles read Started, Grew, Followers, Saves (Saves shows "–" until recipes load). The own profile has "Following N" in terracotta text under the tiles; tap it to open the list and tap again to close it. Followers still opens its list. The views line no longer repeats saves.
- Reviewer noted: on a public profile a failed `useUserRecipes` shows 0s in the tiles (pre-existing). The own profile's Following list shows "Not following anyone yet" if its read fails, because `useFollowingList` exposes no error (pre-existing).
- Check the four tiles at 320px with 4-digit values: nothing should overflow or wrap.

### RL-172 Collaborator uid list
- No visible change. On the emulator (or after RL-156 deploys, live): Apply a suggestion from another cook and check the recipe document now has `collaboratorUids: [their uid]` beside `collaborators`; Keep as branch gives the new branch the same. Edit and save the recipe afterwards: both fields stay.
- Download my data on an account with a credited recipe: `collaboratorUids` shows `other-user-N`, never a raw uid.

- Reviewer noted (round 2, low): a recipe with 50 credited cooks can never take another Apply (rules cap; generic error). Create does not drop the owner from collaboratorUids (harmless). The erase script's arrayRemove on collaborators needs an exact object match; its re-check fails loudly if not.

### RL-173 Profile Collabs tab
- With two verified accounts on the emulator or live: as B, publish a recipe; as A, suggest an edit on it; as B, Apply it. Then A's own profile, Collabs tab, shows B's recipe with B's pill under the title, and the tab reads "Collabs 1". B's profile page seen by C shows nothing under Collabs for B ("No collabs yet", "their suggestion"), and A's profile seen by C shows the same recipe.
- Tabs read "Started N / Grew N / Collabs" (the Collabs count appears once it has loaded; "50+" with a "Showing the first 50." line when capped). Collabs is read only the first time you open it, and a return within 5 minutes reuses it. Keyboard: Tab lands on the selected tab, Left/Right/Home/End move and select. Check the three tabs fit at 320px.
- Switch the network off (or block Firestore) and open a profile's Collabs: an error with Try again, never "No collabs yet". The error uses the compact empty-state style (icon now sized), not the full-page 19a blob, to fit under the tabs.
- Recipes credited before RL-172 will not appear until a later Apply on them (no backfill).

- Reviewer noted (round 2, low): SegmentedControl with a value matching no option has no tab stop (no caller does this today); RecipeTileGrid's bare 'Nothing here yet.' fallback on Started/Grew; role=alert inside the polite live region may announce twice.

### RL-174 Forest layout (pure lib)
- No UI yet (the page is RL-175). Nothing for the human to look at beyond the unit tests.

### RL-175 Forest view
- Open your own profile and tap the trees icon beside the cog, then another cook's profile and tap the trees icon at the right of the Back row. Check both at 390px and 1280px, light and dark. Headline "Planted N recipes. M branches have grown from them." with N in terracotta and M in sage; legend "Yours" or "<Name>'s" and "Other cooks'".
- Each tile's drawing matches that recipe's tree page, your versions in terracotta; tapping a tile opens its tree (your original if you planted it, else your first version). Planted tiles are tinted, grew-in tiles say "Grew N on <owner>'s".
- Cost: per family shown (max 12) one read of at most 40 docs plus one count; other cook adds one list read (max 100), plus the profile read. Over 12 families shows "and N more". Block the network: error with Try again, never "Nothing planted yet"; one failing family shows "Some branches couldn't load" with Retry. Follow works from the header (sign-up prompt when signed out). Check the dots and lines are readable in light mode, and a tile reads "Grew N versions on X's recipe" in a screen reader.
- Reviewer noted (RL-175, low): the list read is an arbitrary 100 for cooks with more than 100 recipes; the 5 minute cache can show a stale count right after publishing; the auth-loading skeleton has no header or back button.

### RL-179 On-send similar sheet
- With a banana bread in the library, start a new chat and send "banana bread" (390px, light and dark): the 7b sheet "Someone's already baked this" opens with a Same or Similar tag per row. "Branch Banana bread" opens the variation chat with your text in the composer; "Mine's different, write a new one" generates. Tapping a row opens that recipe.
- Press Escape or tap the backdrop: nothing generates, focus returns to the composer, and a "Show similar recipes" button in the chat reopens the sheet. On a variation the copy reads "Someone's already made this change" and "Mine's different, make mine".
- Decision: the composer is cleared on send as before, so the typed text is held in the chat (the "Similar recipes found for ..." line), not in the box.
- Reviewer noted (RL-179, low): browser Back while the sheet is open leaves the page (nothing is lost; router blocking was rejected in decisions.md).

### RL-180 6b chips learn from the family
- On a family with a "less sugar" branch, Branch from the original (390px, light and dark): Less sugar sits under "Already a branch, open it instead" with an arrow and opens that branch; the other chips sit under "Nobody's tried these yet" and append text. A family with no branches shows one plain row as before.
- Arrive from a dedup match (7a Branch button or 7b sheet): the Branching card shows Change, which goes back to the chat. Opening Branch from the recipe page shows no Change.
- Throttle the network: the chips stay in the default order with no split and do not jump later.

- Reviewer noted (low): the per-parent family cache is session-long, so a branch you create and then return to /vary within the session still shows as untried until reload (clear the cache entry on branch save if this bites); the split layout is taller than the one-row placeholder, so content below shifts once; useBranchFamily has no direct test.

### RL-181 Saved branch opens What changed
- Branch a recipe, Grow, Save Variation (390px): What changed opens against the parent with the "Recipe saved" toast. Back lands on the new branch's recipe page (no toast), not the chat. Cook this one opens the recipe. Saving a brand new recipe still opens the recipe page.

- Reviewer noted (med): the no-flash claim rests on React Router batching two pushes in one tick; in the browser, confirm the recipe page never paints between Save Variation and What changed.
- Reviewer noted (low): Forward or reload on /changes re-shows the toast (same as the recipe page); the toast's live region may not announce on every screen reader (same pattern as the recipe page); after "Cook this one", Back returns to the diff, not the chat.

### RL-182 estimateGrams helper
- Pure helper in src/lib/units.ts with unit tests. Nothing to check in the browser.

### RL-183 Weigh spoons and liquids
- Settings > Appearance (signed in or out): turn on "Weigh spoons and liquids". Open a recipe with tbsp and ml: amounts read "≈ g" (390px, light and dark). Hover or long-press shows the original; scaling servings updates them and keeps them terracotta; counts ("2 eggs") are unchanged. Switch off: stored amounts return. The shared page and chat card follow the setting; Suggest mode always shows stored amounts.

- Reviewer noted (low): the original volume is only in the row's title (hover/long-press) and screen-reader text; most touch browsers never show a title, so on a phone there may be no visible way to see "1 tbsp". A tap-to-reveal would be a follow-up. The title shows the scaled, converted volume, not the stored amount.

### RL-185 Import from a link (service only)
- No UI yet (RL-186). Nothing to see in the browser beyond the unit and service tests.
- In RL-186's QA, the live call against a real recipe page (for example a Serious Eats recipe) must confirm that AI Logic accepts `responseSchema` together with the URL context tool. If it fails, the console shows "Link import failed for <host>" with the error; a 400 about tools and response schema means drop `generationConfig` from `importRecipeFromUrl` (backlog/DECISIONS.md, RL-185).
- On that call, check an ingredient with a vague amount comes back with no amount and flagged, and the title and steps match the page.
- By design a null amount without `uncertain` is accepted ("salt to taste"), so RL-186's review screen should treat every null amount as editable, not only flagged ones.
- Drafts past the `firestore.rules` caps (title 200 characters, 100 ingredients, 100 steps) fail with the import message rather than saving and being refused later.

- Reviewer noted (low): the private-host check is a suffix list, so a public name resolving to a private IP passes (moot: Google fetches the page). Page text can still fill title, notes and tags (React escapes it); keep imports behind RL-186's review screen. For RL-186: ImportedRecipeSchema (export-file import) drops importedFrom/importedVia, and any importedFrom read from Firestore must get the same http(s) and 2048 bound before it is used as an href.

### RL-186 Add from a link
- Create tab (`/new`): an "Add from a link" row with a link icon sits under "Describe it my own way" and opens `/import` (390px and desktop, light and dark).
- Signed out or unverified: `/import` shows the sign-up screen with Close, not the link field.
- Paste a real recipe link (for example a Serious Eats recipe) into the empty field: it reads without tapping Read it, shows "Reading the page…", then the preview card (emoji, title, "N ingredients · N steps · N min", host tag). Check the title, counts and time match the page. This is also RL-185's live check that AI Logic accepts the response schema with URL context.
- Try a page with a fraction or vague amount the model may misread: the "One amount was unclear" (or "N amounts") line shows, and after saving that ingredient has no amount and can be fixed in the editor.
- Save as a new original: opens the recipe with the saved toast; its prompt line says "Imported from <host>".
- A link to a dish already in the library (same title words): a sage card "There's already a <Title> family with N versions" with the author pill, and Add to <Title> family above Save as a new original. Add to family opens the new recipe as a branch of that family's original (check the tree).
- A bad link ("localhost", "not a link") and an unreadable page (paywalled or a home page): the error shows under the field and the link stays.
- Airplane mode, then save: "Couldn't save the recipe. Check your connection and try again." and nothing appears in your recipes.
- Add to family on someone else's recipe: the original's author gets a branch notification (check their Activity); on your own family nobody is notified.
- Keyboard and screen reader (VoiceOver): after a read, focus lands on the preview title and "Read <title>, N ingredients" is announced; while saving the button says "Saving…"; a failed save puts focus back on that button.
- Rules: `firestore.rules` now bounds `importedFrom` in `hasBoundedContent` (absent, null, or an http(s) string of at most 2048). It rides with the next rules deploy and is harmless before it (the client only writes valid URLs). Not emulator-checked; after deploy, an import save should still succeed.

- Reviewer noted (low): closing discards a preview that cost a generation, with no confirm; a long family title truncates in the Add to button; reading has no cancel; if a publish times out but lands and the user then switches between Add to family and Save as new original, two recipes can result. The firestore.rules importedFrom bound is not emulator-probed; probe it with the next rules deploy (RL-160 or later).

### RL-188 Continue with Google
- Do not release with Google on until RL-191 is done: the button is behind `VITE_ENABLE_GOOGLE_SIGNIN`, off by default, and RL-191 turns it on after enabling the provider in the console. With the flag off, check the sign-in sheet (Save bookmark while signed out) and the sign-up sheet (Follow) look exactly as before: no Terms box on the first step, "Continue with email" enabled.
- On the emulator (`npm run emulators`, then `VITE_USE_EMULATORS=true VITE_ENABLE_GOOGLE_SIGNIN=true npm run dev`), at 390px, light and dark: the first step shows the Terms box, then "Continue with Google" with the four-colour G, then "Continue with email"; both are disabled with "Tick the box above to continue." until ticked.
- As a guest with a bookmark, open the Save sheet's sign-up and continue with Google (a new fake account): "You're signed in, and your bookmarks came with you" shows, the bookmark is still there, and there is no Terms dialog.
- Sign out, then sign in with Google again with the same fake account: signed in, no sheet, no Terms dialog.
- As a new guest with a bookmark, sign in with Google using an address that already has an email-link account: "That email already has an account" shows, you are in that account, and the bookmark came across.
- Close the Google popup without choosing: nothing happens, no error. Block popups in the browser: the page redirects to Google and finishes on return.
- Not checked by the agent: any browser walk, an installed iOS home-screen app (should go straight to the redirect), and an unverified Google address. Follow-up: decisions.md (RL-187 answer 6) says an unverified Google address gets the existing "confirm your email" sheet, but no such sheet exists in the client (unverified users only meet the sign-up gates), so it was not built; it needs its own ticket.
- With an address that already has an email-link account, Google may answer "That email already has an account. Sign in with your email link instead." rather than carrying over, depending on the code Firebase returns; note which happens.

- Reviewer noted (low): on a guest-to-existing-account carry-over, runMigration can run twice at once (auth listener plus upgrade), as on the email path already; check the guest's bookmarks and local recipes arrive once. Before RL-191 ships: add VITE_ENABLE_GOOGLE_SIGNIN to the preview workflow and the release .env.

### RL-189 Settings sign-in methods
- Live after RL-191 (Google on). In Settings at 390px, light and dark: an email-link account shows "<email> · Email link" under the name and a "Sign-in methods" row reading 1; an account that signed in with Google shows "<email> · Google" and 1; a guest upgraded through Google on an email account shows both linked and 2. The row is not tappable. A guest and a signed-out visitor see neither the email line nor the row.

- Reviewer noted (low): any non-Google account reads "Email link" (a legacy password account would too). Also restores the RL-188 VITE_ENABLE_GOOGLE_SIGNIN entry in .env.example, which the RL-188 commit missed.

### RL-190 Google and import wording in the policies
- Author: sign off the Google and import wording in /privacy and /terms before release. New in Privacy: "Signing in with Google" and "Importing a recipe from a link" sections, plus small edits to "Your account" and "Security"; new in Terms: two paragraphs under "Your content and who sees it" and "or with your Google account" under sign-in. `TERMS_VERSION` is not bumped (nobody re-accepts); say if you want it bumped, which needs a rules deploy.

- Not covered: docs/legal/data-inventory.md and claims-to-verify.md do not yet mention Google sign-in or link import, and the Cookie Policy was not checked for Google's sign-in popup storage. Fold into your pre-release policy read.

### RL-194 Cook records in the rules
- Nothing to see in the app yet: rules only, in the repo, deployed by RL-209. Logging a cook needs the current Terms, like publishing, suggesting and replying, so a future Terms bump blocks cooks until the user re-accepts. Crediting a branch (`branchId`) only accepts the cook's own existing recipe. A cook can delete their cook even if their email verification lapses.

- Reviewer noted (low): displayName is not tied to the profile (RL-196 takes it from the profile); cooks outlive a deleted recipe by design. At RL-209 deploy: confirm no live recipe lacks a string rootId, or it cannot be cooked.

### RL-195 Pure cook helpers
- Nothing to check in the browser: pure helpers in src/lib/cooks.ts, covered by unit tests. The UI tickets use them.

### RL-196 Cook service and hooks
- Nothing to see in the app yet: service functions and hooks only, no UI calls them. Two new composite indexes on `cooks` (recipeId and uid, each with createdAt desc) are in the repo and must ship with the RL-209 deploy, or the recent-notes list and the cook log fail.

- Deploy note: the two cooks composite indexes (recipeId+createdAt desc, uid+createdAt desc) must go out with RL-209, or recent notes and the cook log fail. The hook spots a timeout by its "timed out" message text. Emulator walk not done; do it with RL-197's UI.

### RL-197 I made this sheet
- Nothing reachable yet: RL-198 adds the entry point. Then check on a phone: nothing is picked at first and Save is disabled; Needs a tweak plus a note shows the Grow row (one line, ellipsised); Escape with a note asks before discarding. Emulator walk of a real save (and the cooks indexes) is still owed, as noted under RL-196.

- Reviewer noted (low): after Grow the page navigates away, so the "Saved to your cook log" toast is not seen; the counter's live region may announce on each keystroke past 450 (check with VoiceOver); vote buttons at 320px not checked in a browser.

### RL-198 Cooked in the recipe footer
- **Do not release before RL-209 deploys the cooks rules and indexes: until then Cooked fails live** (the save is refused and the sheet shows its error).
- At 320px and 390px, light and dark, on a recipe and on `/shared/<id>`: the footer shows Suggest (or Edit), Cooked, Branch this recipe on one line with no wrap; under 360px the Cooked icon is hidden and its text stays; on the recipe page Branch loses its icon under 400px and reads "Branch" under 360px (measured in headless Chromium at 320, 360 and 390, light and dark, no clipping or wrap). An unpublished local recipe shows no Cooked. Cooked opens the "You made it" sheet.
- On another recipe, tick every method step: the sheet appears once, about half a second after the last tick; untick and tick again, it does not return. Signed out, ticking does nothing; tapping Cooked opens "Sign in to log a cook". With Firebase off (local-only) there is no Cooked button, and none on a hash share link.
- Reviewer noted: the saved toast lives in a persistent `role="status"` region on both pages, so tests that look for one status now match by text.

- Reviewer noted (low): the 320px footer was measured with a hand-copied harness (scratchpad), so later footer edits need a re-measure; the visible Branch label is "Branch" under 360px and "Branch this recipe" above. Pane-mode footer (wrapping by design) not measured.

### RL-199 Made-by row and Notes sheet
- **Needs RL-209 deployed (cooks rules and indexes) to work live; otherwise use the emulators.** Log two cooks on one recipe from two accounts (one with a note each, one Needs a tweak). Open the recipe signed out and at `/shared/<id>`: the row sits under the pills with two avatars, "Made 2 times · 1 would make again" and Notes. It is absent on a recipe with no cooks and in the chat card.
- Tap Notes: "Notes from cooks" lists both newest first with name, day, Again or Tweak tag and italic note. Signed in as one of them, only your note has Delete; it asks "Delete this cook?", and after Delete the count drops and the note goes. Check 320px and dark theme, and that the row reads as one sentence in VoiceOver.
- Log a cook yourself from the footer: the row updates without a reload.


### RL-200 Cook log page
- **Needs RL-209 deployed (cooks rules and indexes), or the emulators.** Log three cooks: one with a note, one Needs a tweak, one grown into a branch. On You, the "Cook log" row sits under the stat tiles. Open it at 390px, light and dark: summary line reads "3 cooks · N recipes · 1 branch grew from a note"; each card has emoji on a rotating tint, title, day, the note in quotes, and a Branched, Again or Tweak tag top right. Tapping a card opens the recipe; tapping Branched opens the branch.
- Delete a cooked recipe: its card reads "A deleted recipe". Signed out or as a guest the page shows Sign in. Empty log shows "Nothing cooked yet".
- Known gap: the profile row has no count (no cheap source there). Long titles are clamped to two lines under the tag; check they do not collide with it at 320px.

### RL-201 Branch grown from a cook note is credited
- **Needs RL-209 deployed (cooks rules and indexes), or the emulators.** On any published recipe, open I made this, choose Needs a tweak, write a note, tap Grow, generate, then Save Variation. Open the Cook log: that cook shows a Branched tag, and tapping it opens the new branch. The summary line counts 1 branch grew from a note.
- A failed save (go offline, Save Variation) credits nothing; retry online and the cook is credited once. A plain branch with no Grow leaves the cook log unchanged.

- Reviewer noted (low): a credit that fails offline is not retried (fire-and-forget by design), so that cook never shows Branched; Back into /vary after saving can re-attempt the credit, which the rules refuse and telemetry logs as cook-branch.

### RL-202 Cooked stat tile
- **Needs RL-209 deployed (cooks rules), or the emulators.** On You the tiles read Started, Grew, Cooked, Followers. Log a cook, return to You: Cooked is up by one. Another cook's profile shows the same tiles. The "N views · N saves" line sits under the tiles (hidden at zero). Check 320px: four tiles still fit.

### RL-203 Cook mode
- **Real phone only (wake lock cannot be checked in a desktop browser).** Open a recipe and tick one ingredient: a green "Start cooking?" bar rises above the footer and leaves after about 8 seconds; ticking again in the same visit does not bring it back. Tap Start cooking, then leave the phone untouched for two minutes: the screen stays on. Switch to another app and back: still on. Swipe left and right through the steps, and use Back and Next step. Open Ingredients: amounts match the servings chosen on the recipe page. On the last step Done opens the I made this sheet (published recipe, verified account); saving lands on the recipe. With reduce motion on, the bar appears without sliding. At 320px the bar's Start cooking button sits under the text and the bar clears the footer when scrolled to the bottom.
- **Author question:** Cook mode is only offered by the 8-second bar after ticking an ingredient; once it is dismissed there is no way in for that visit. Add a permanent entry (e.g. in the recipe's overflow or next to Method)?
