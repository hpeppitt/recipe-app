# Recipe Lab

A mobile-first recipe app built around one idea: **a recipe is not a single document, it is a
tree of versions.**

Ask for a recipe and an AI writes it. Ask for a variation and you get a child of that recipe,
not a replacement. Ask for a variation of the variation and the tree grows again. Nothing is
overwritten, the lineage stays navigable, and you can compare a branch against the version it
came from.

Text-first, permanently and on purpose. Recipes carry no photos. The identity of the product
is generation plus the tree, and food photography would mean image storage, upload UX, and a
moderation story for no gain to either. (Profile avatars are the one image in the app, capped
at 128px.)

## The idea in practice

You cook a banana bread recipe and it is slightly too sweet. On most recipe apps you either
overwrite your note or start again. Here you branch: "same but less sugar, and with walnuts"
becomes a child recipe with its own page, its own link, and a breadcrumb back to the original.
Six months later you can still see which version you actually liked, and why it exists.

Around that core, the app is a small social library:

- **Publish** a recipe and it joins a shared feed the whole circle can browse.
- **Favourite** anyone's recipe, and they get a notification.
- **Suggest a change** to someone else's recipe. If they approve it, you are added as a
  collaborator and the suggestion opens the variation composer prefilled. Either way there is
  a reply thread, because a rejected suggestion is exactly when you want to ask why.
- **Follow** people and filter the library down to them.

## What it does

| | |
|---|---|
| **Generate** | Describe a dish in a chat, refine it over several turns, save when it looks right. Output shape is enforced at the model layer and validated again before it is trusted. |
| **Branch** | Variations become child recipes with a navigable tree, lineage breadcrumbs, and sibling chips. |
| **Edit** | Owners can edit any recipe in place: fields, ingredients, steps, notes, tags. Edits keep the recipe's position in the tree, so fixing a typo does not fork it. |
| **Cook from** | Tick off ingredients and steps as you go, scale the amounts to the number of people you are feeding, and switch between original, metric, and imperial units. |
| **Share** | A link to a published recipe, or a self-contained link with the whole recipe compressed into the URL when there is no cloud copy. |
| **Own** | Every recipe records who created it. Owners delete and review suggestions; everyone else can favourite and suggest. |

Per-serving macro estimates come with generated recipes, labelled as estimates because they
come from a language model rather than a food database.

## How it is built

React 19, Vite 7, TypeScript, Tailwind CSS v4, React Router v7.

Two stores, written in parallel. **Dexie (IndexedDB)** holds your local library and is
authoritative for it, so browsing and reading do not wait on a network. **Firestore** holds
the published feed, favourites, suggestions, notifications, profiles, and follows. Security
rules are the real boundary and live in this repo, not the console.

Gemini is reached through **Firebase AI Logic**, a Google-hosted proxy that holds the API key
server-side. The browser never sees a key, App Check is enforced on that path, and there is
deliberately no Gemini environment variable, because Vite inlines those into the client bundle
at build time.

Firebase is optional. With no configuration the app degrades honestly to a local viewer and
importer: browse, import, export, and share by URL all work, but generation does not, because
generation *is* the proxy.

## Getting started

```bash
npm install
cp .env.example .env    # fill in your Firebase project values
npm run dev
```

Every variable is public by design; none of them is a secret. See
[docs/operations.md](docs/operations.md) for what each one does and why.

```bash
npm run build    # type-check plus production build
npm run lint     # 0 errors is the baseline
npm test         # Vitest
```

`npm run emulators` plus `npm run dev:emulated` points Auth and Firestore at the local
emulator suite, which is how you test anything whose writes cannot be undone.

## Documentation

`docs/` is the knowledgebase and the single source of truth. Start at
**[docs/README.md](docs/README.md)**.

| | |
|---|---|
| [docs/capabilities.md](docs/capabilities.md) | what it can do, what is cut, what gates each feature |
| [docs/architecture.md](docs/architecture.md) | how it fits together and where the seams are |
| [docs/data-model.md](docs/data-model.md) | Dexie schema, Firestore collections, what the rules permit |
| [docs/operations.md](docs/operations.md) | commands, env vars, emulators, deploy, verification gates |
| [docs/decisions.md](docs/decisions.md) | why it is like this, and what was tried and rejected |
| [CHANGELOG.md](CHANGELOG.md) | dated milestones, reconstructed from git |
| [ROADMAP.md](ROADMAP.md) | what is next and in what order |

Read `docs/decisions.md` before proposing anything architectural. It records what has already
been tried and reverted with evidence, which is the expensive knowledge here.

## Status

A polished private beta rather than a shipped product, and invite-only by design.

The engineering floor is unusually solid for this stage: ownership enforced server-side in
rules, graceful degradation without Firebase, an accessibility pass done, a cleared audit
backlog of 78 findings, and build, lint, and tests gated in CI on every pull request.

What is honestly missing:

- **Nothing reports a client-side error.** If the app breaks for someone, no one finds out.
- **The invite-only circle is not enforced anywhere.** Publishing requires only a signed-in
  user, and anonymous sign-in is one tap, so today the shared library is world-writable in
  practice. This is a hard gate before the first invite goes out.
- **One identity path can strand recipes.** Upgrading an anonymous account to an email address
  that already exists leaves recipes published under the old identity behind. The app now says
  so plainly instead of failing silently, but the real fix is server-side.

Those are Phase 1 of the [roadmap](ROADMAP.md), along with what comes after.
