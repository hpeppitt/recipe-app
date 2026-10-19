# Recipe Lab

A mobile-first recipe app built around one idea: **a recipe is not a single document, it is a
tree of versions.**

Ask for a recipe and an AI writes it. Ask for a variation and you get a child of that recipe,
not a replacement. Ask for a variation of the variation and the tree grows again. Nothing is
overwritten, the lineage stays navigable, and you can compare a branch against the version it
came from.

Text-first, permanently and on purpose. Recipes carry no photos. Photos can be sent to the AI
as generation input, and they are never stored. The identity of the product
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
  a reply thread, because a declined suggestion is exactly when you want to ask why.
- **Follow** people and filter the library down to them.

## What it does

| | |
|---|---|
| **Generate** | Describe a dish in a chat, refine it over several turns, save when it looks right. Output shape is enforced at the model layer and validated again before it is trusted. |
| **Branch** | Variations become child recipes with a navigable tree, lineage breadcrumbs, and sibling chips. |
| **Edit** | Owners can edit any recipe in place: fields, ingredients, steps, notes, tags. Edits keep the recipe's position in the tree, so fixing a typo does not fork it. |
| **Cook from** | Tick off ingredients and steps as you go, scale the amounts to the number of people you are feeding, and switch between original, metric, and imperial units. |
| **Share** | A link to a published recipe. With Firebase configured, an unverified or anonymous user with no cloud copy gets the sign-up dialog. A self-contained link (the whole recipe compressed into the URL) still comes from local-only mode, a publish timeout or failure, the daily publish limit, and a copy saved from someone else's link. |
| **Own** | Every recipe records who created it. Owners delete and review suggestions; everyone else can favourite and suggest. |
| **Take it with you** | "Download my data" in Settings writes your local library and your cloud data (with other people's identities redacted) to one JSON file. |

Per-serving macro estimates come with generated recipes, labelled as estimates because they
come from a language model rather than a food database.

## How it is built

React 19, Vite 7, TypeScript, Tailwind CSS v4, React Router v7.

Two stores, written in parallel. **Dexie (IndexedDB)** holds your local library and is
authoritative for it, so browsing and reading do not wait on a network. **Firestore** holds
the published feed, favourites, suggestions, notifications, profiles, follows, terms
acceptance, and per-user write counters. Security rules are the real boundary and live in
this repo, not the console.

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

Pre-release, and not yet live. Everything described here is merged to `main`, but the
production Firebase project still runs the old rules and the first release has not been cut.
The new rules, the new indexes and the matching client go out together, in a fixed order, from
the [release and deploy runbook](docs/operations.md#release-and-deploy-runbook-first-production-release).
Until then, production behaves as it did after the August 2026 deploys.

The engineering floor is solid for this stage: ownership enforced server-side in rules,
a verified email required for every cloud write, per-user write limits and terms acceptance in
rules, graceful degradation without Firebase, a client error beacon, an accessibility pass,
the 78-finding audit cleared and a second audit worked through as a backlog (43 of 58 tickets
done), and build, lint, and tests gated in CI on every pull request. None of the recent work
has been seen in a real browser by an agent; the human QA checklist covers that.

What is honestly missing:

- **Nothing is deployed.** The wipe of production data (RL-042), the indexes, the client, and
  the rules are separate steps the author runs. Rules deploy as one unit, so the Terms
  acceptance guards ride with the rate limits.
- **The Terms, Privacy and Cookie pages are drafts.** They need the author's sign-off
  (RL-046) before any release. Bracketed placeholders show as written.
- **There is no analytics in production today.** GA4 is removed. `posthog-js` is wired in
  behind the consent banner, but nothing is sent until `VITE_POSTHOG_KEY` and
  `VITE_POSTHOG_HOST` are set in the build and the user allows analytics (RL-053, RL-054).
- **Generation cannot be capped per user on the free plan.** It runs client-side through
  Firebase AI Logic. The accepted ceiling is App Check plus a console limit (RL-050);
  anything stronger needs the Blaze plan and a proxy (RL-001, RL-014).
- **The uid-stranding path is a leftover, not a live risk, once the wipe is done.** After
  RL-040 and the wipe, anonymous accounts hold nothing in the cloud. RL-032 then deletes the
  migration code and the stranded-identity notice.

What comes after is in the [roadmap](ROADMAP.md), which starts with a short "where we are and
what is next".
