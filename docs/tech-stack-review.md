# Tech stack review

**Status: proposal, awaiting the author's decision (ticket RL-001).** Written 2026-10-13.
Nothing in this file is a decision; the decisions it leads to go in `decisions.md`.

**How it was researched, and what that means.** Three research agents ran on 2026-10-13
with web search. None of them, and not the author of this file, could load an official
pricing or quota page from inside the agent sandbox: DNS for `ai.google.dev`,
`firebase.google.com`, `supabase.com`, `convex.dev` and `cloudflare.com` was blocked. So
every Google, Supabase, Convex and Cloudflare number below is from search snippets of
official pages or from third-party guides dated 2026, and is marked **unverified**. The
Anthropic prices and structured-output facts were read from the official documentation
and are marked **verified**. The "verify before deciding" table at the end lists the
handful of numbers the recommendation actually depends on; they take ten minutes in the
Firebase console and AI Studio.

## The question

Share the app with 10 to 50 friends who create accounts and add to recipes, with AI
generation built in, at a cost that stays at hobby scale and cannot surprise you. The
stack was assembled ad hoc around Firebase and Gemini. Is that still the right stack, and
if not, what is?

## What the app actually needs

Taken from `capabilities.md`, `data-model.md` and `architecture.md`, not from the
original choices:

- Static hosting for a React SPA, with cache headers you control.
- Auth with passwordless email links and anonymous accounts that upgrade in place.
- A document store with realtime subscriptions (notifications, suggestion threads) and
  server-enforced per-document authorisation, since the client is untrusted.
- A place to hold an LLM API key and enforce a per-user generation quota.
- An LLM that returns strict JSON for a fixed recipe schema.
- Zero cost at idle, a known ceiling at 50 users, and ideally a hard stop rather than a
  bill when something runs away.

## Finding 1: Firebase itself costs nothing at this scale

Spark plan quotas against this app's likely load at 50 users (quotas unverified; usage
figures are from the app's own read patterns in `capabilities.md`):

| Resource | Spark no-cost quota (reported) | 50 users, generous day | Headroom |
|---|---|---|---|
| Firestore reads | 50,000 / day | 50 × 200 = 10,000 | 5× |
| Firestore writes | 20,000 / day | 50 × 20 = 1,000 | 20× |
| Firestore storage | 1 GiB | a few MB of recipes, 128 px avatars | large |
| Hosting transfer | 360 MB / day | 50 × 1 MB bundle = 50 MB | 7× |
| Auth | 50k MAU (one source says 3k DAU) | 50 | large |
| Email-link sign-ins | 20,000 / day | tens | large |
| App Check (reCAPTCHA) | 10,000 assessments / month | about 3,600 | 2.8× |

Hitting a Spark quota switches the product off for the rest of the day or month; it never
bills. That is exactly the "hard stop" property the question asks for, and it comes for
free. The security rules are deployed, emulator-verified, and documented; the dual-store
code has 250-odd tests. Migrating the data layer would throw that away for no user-visible
gain. On Blaze the same no-cost quotas remain and overage bills at about $0.03 per 100k
reads (unverified), which at this usage rounds to zero.

**Conclusion:** keep Firebase Hosting, Auth and Firestore. Do not migrate the data layer.

## Finding 2: the AI path is the whole cost and the whole risk

Four things, each unverified but each reported by more than one source:

1. **The Gemini free tier has been cut hard in 2026.** Pro models left the free tier
   around April. Flash-class models are reported at roughly 20 requests per day per
   project; Flash-Lite at 500 to 1,000 per day. The app calls `gemini-3.6-flash` through
   Firebase AI Logic on Spark, which uses that free tier. If the Flash figure is right,
   the whole friend group shares 20 generations a day, and the first person to make a
   variation of a variation uses three of them. **This alone decides whether the app can
   be shared as it stands.** Read the real number off AI Studio's rate-limit page for
   project `recipe-lab-3832b` before anything else.
2. **Moving to Blaze ends the free tier on this path.** Already recorded in
   `decisions.md`; still true per the research. So "just upgrade" converts a free
   resource to a billed one with no cap but budget alerts.
3. **Gemini Flash models are retired within months.** 3.5 Flash deprecated for 3.6; 3.7
   Flash deprecated on 2026-10-08 and auto-routed to 3.8; 2.0 Flash got about three and a
   half months' notice. The model name is hard-coded in two places in this repo and has
   already broken generation once (the 2.0 shutdown). It must become configuration.
4. **App Check enforcement on Firebase AI Logic is reported mandatory from 2026-11-02.**
   The app already enforces App Check on that path, so this is probably a non-event, but
   confirm it in the console, because the failure mode is "generation stops for everyone".

And one structural gap regardless of the numbers: there is **no per-user quota anywhere.**
App Check limits which apps may call; AI Logic's per-user limit is 100 requests per
minute, which is a flood limit, not a budget. One friend's bored afternoon is the
project's whole daily allowance.

## Finding 3: what generation costs on each model

Per generation: about 2,000 input tokens (1,500-token system prompt with the schema, the
message, often a parent recipe) and 1,000 output tokens. Three volumes: 600 a month (30
friends × 20), 3,000 (busy), 18,000 (every user generating 20 a day, the research
agent's pessimistic case). No caching assumed; the 1,500-token prompt would cache on most
providers and shave a further 20 to 40 percent off input cost.

| Model | $/M in | $/M out | 600/mo | 3,000/mo | 18,000/mo | Strict JSON | Status |
|---|---|---|---|---|---|---|---|
| Claude Haiku 5.5 | 0.10 | 0.50 | $0.42 | $2.10 | $12.60 | yes, GA | **verified** |
| Claude Sonnet 5.5 | 2.00 | 10.00 | $8.40 | $42 | $252 | yes, GA | **verified** |
| Gemini 2.5 Flash-Lite (legacy, restricted) | 0.10 | 0.40 | $0.36 | $1.80 | $10.80 | yes | unverified |
| Gemini 3.1 Flash-Lite | 0.25 | 1.50 | $1.20 | $6.00 | $36 | yes | unverified |
| Gemini 3.5 Flash-Lite | 0.30 | 2.50 | $1.86 | $9.30 | $56 | yes | unverified |
| Gemini 3.6 / 3.8 Flash (intro price to 2026-12-31) | 0.75 | 3.75 | $3.15 | $15.75 | $94 | yes | unverified |
| Gemini 3.6 / 3.8 Flash (from 2027-01-01) | 1.50 | 7.50 | $6.30 | $31.50 | $189 | yes | unverified |
| OpenAI GPT-5 nano | 0.05 | 0.40 | $0.30 | $1.50 | $9.00 | yes | unverified |

Two things to read off that table. First, at the realistic volumes the cost is dollars a
month on any small model, so the choice is about quality, stability and the quota
mechanism, not price. Second, the model the app uses today (3.6 Flash) is one of the
pricier options and doubles in price in January; Haiku 5.5 is the cheapest option with a
first-party price list that could actually be read, and its structured-output support
(`output_config.format` with a JSON schema; the schema must set
`additionalProperties: false` on every object and use no min/max constraints) matches
what the recipe schema needs. Thinking tokens bill as output on Gemini 3.x; the proxy
should disable or cap thinking for this task either way.

## Finding 4: alternatives to Firebase, ranked, in case the answer changes

| Platform | Free tier (reported) | Idle behaviour | Surprise-bill path | Fit for this app | Migration cost |
|---|---|---|---|---|---|
| Supabase | 2 projects, 500 MB Postgres, 50k MAU, 500k edge invocations | pauses after 7 idle days, manual restore | none on Free; Pro $25 with a spend cap | Postgres + RLS suits threads, follows, notifications well; magic link and anonymous auth present; built-in mailer is ~2 emails/hour so you bring SMTP | **High**: rules → RLS, every data call rewritten, Dexie sync redesigned |
| Convex | 1M function calls, ~0.5 GB | none found | none on Free; paid tiers bill overage | reactive queries are the best collaboration model; secrets and a rate-limiter component built in; anonymous→email upgrade is awkward; local-first demoted | **High**: authorisation becomes code in every function |
| Cloudflare Workers + D1 | 100k requests/day, D1 5M reads/day | none | none on Free (calls fail) | cheapest and most predictable; no first-party auth, no rules engine, realtime is DIY | **Highest** |
| PocketBase on a VPS | $2 to $5/month flat | n/a | none on a flat VPS | rules closest to Firestore's; SSE realtime; you run backups and upgrades | Medium, plus ops |
| InstantDB | never paused, 1 GB | none | none reported | most local-first in spirit; auth and secret-holding unconfirmed | Medium, unverified |
| Appwrite Cloud | 75k MAU | **paused after 7 days, deleted after 90** | unknown | ruled out by the pause-and-delete policy | n/a |

Every one of these is a rewrite of the data layer and the rules, which is the most
verified code in the repo. The research agent's own conclusion, which this file agrees
with: leaving Firebase is justified only if a hard cap on spend is a strict requirement
and Firebase cannot provide one. Finding 1 shows it provides one on Spark. If the circle
ever grows to hundreds, Supabase is the first candidate.

## Recommendation

**Keep Firebase for hosting, auth and Firestore. Keep React, Vite, TypeScript, Tailwind,
Dexie. Change exactly one thing: put generation behind a thin proxy that holds the key,
enforces a per-user quota, and treats the model as configuration.** That is one file's
transport (`services/gemini.ts` is already documented as the seam for this) plus a small
server-side component. Three ways to build the server-side piece:

### Option A: Blaze plus the Cloud Function that already exists

`functions/src/index.ts` is written, committed and never deployed: a callable with a
per-uid 30/hour transactional rate limit, input caps, server-held prompts. Deploying it
means enabling Blaze.

- For: already written; one vendor; App Check still gates it; the rate limit lives in
  Firestore where the rules already protect it.
- Against: Blaze has budget *alerts*, not a hard cap; the Gemini free tier ends on this
  project; Node cold starts of a second or two on generation; and the Gemini model churn
  stays your problem. The rate limit is hourly, not a monthly budget, so it needs
  extending.
- Cost: Firebase stays at $0 (the free quotas carry over to Blaze); Gemini at $1 to $16 a
  month on Flash-Lite or Flash at realistic volumes. Cap exposure by setting a request
  quota on the Gemini API key in Google Cloud, which is the actual hard-stop mechanism.

### Option B: a Cloudflare Worker, Firebase stays on Spark

A Worker on the free tier (100k requests/day, hard stop, no card) that verifies the
Firebase ID token, checks a per-user daily and monthly counter in Workers KV, calls the
model with the server-held key, validates the JSON against the recipe schema, and returns
it. Model: Claude Haiku 5.5 first, with a provider seam so Gemini Flash-Lite is a config
change.

- For: a hard stop on compute (Workers) and on model spend (an Anthropic workspace spend
  limit, or a Gemini key quota), so there is no path to a surprise bill; Firebase stays
  on the no-cost plan; per-user monthly budgets are trivial in KV; near-zero cold start;
  the model is swappable without touching Firebase.
- Against: a second platform to own (a Cloudflare account, `wrangler`, one more secret
  store); App Check cannot gate the Worker, so the ID token plus the quota replaces it
  (which is a stronger per-user control, but a different one); `functions/` becomes dead
  code and should be deleted.
- Cost: $0 for the Worker; $0.42 to $2.10 a month on Haiku at realistic volumes
  (verified prices); Firebase $0.

### Option C: change nothing yet

Valid only if the console shows a free-tier quota that comfortably covers the friend
group, and you accept that one user can consume the whole project's daily allowance. Even
then, make the model name configurable (ticket-sized) and set a calendar reminder for
Gemini's next deprecation notice.

### The pick

**Option B**, because the question asked for cost efficiency *with no surprises*, and B
is the only option where both the compute and the model spend have a hard stop while the
rest of the stack stays at $0. It is also the option under which the AI provider is a
config value rather than a platform commitment, which matters given how fast the Flash
models are being retired. A is the right answer if a second platform is a non-starter
for you; it is a few hours' less work and one vendor, at the price of alerts instead of
caps. C is a holding position, not a destination.

Either way, the client-side change is the same ticket (RL-014), which is why it is
groomed as option-independent and blocked only on this decision.

## What this does not change

- The UI design pass lands on the same React codebase regardless.
- Accounts for friends: the verified-email magic-link flow already works, and the
  stranded-identity notice remains the honest answer to the one orphaning path
  (`decisions.md`, 2026-07-31 decision 2).
- The roadmap's standing decisions (text-first, private-ish circle, no Blaze unless
  abuse appears). Option A reopens the Blaze decision; option B does not. The trigger
  recorded for reopening it was abuse or the stranded-identity notice firing; this
  review adds a third: the free tier no longer covering the audience.

## Verify before deciding

| Fact the recommendation depends on | Where to read it | Found |
|---|---|---|
| Free-tier requests per day for `gemini-3.6-flash` and the current Flash-Lite on this project | AI Studio → rate limits, project `recipe-lab-3832b` | |
| Whether App Check becomes mandatory for AI Logic on 2026-11-02, and that it is enforced on this project | Firebase console → AI Logic, and App Check → APIs | |
| Current Gemini Flash-Lite and Flash prices | ai.google.dev/gemini-api/docs/pricing | |
| Firestore and Hosting usage over the last 30 days | Firebase console → Usage | |
| Cloudflare Workers free-tier limits (if B) | developers.cloudflare.com/workers/platform/limits | |
| Anthropic workspace spend limit exists and applies (if B) | console.anthropic.com → Limits | |

## Sources

Official pages, as reported through search summaries (none could be loaded directly):
firebase.google.com/pricing, firebase.google.com/docs/ai-logic/pricing and
/docs/ai-logic/quotas, ai.google.dev/gemini-api/docs/pricing, /rate-limits, /billing and
/deprecations, cloud.google.com/firestore/pricing, docs.cloud.google.com/recaptcha/docs/
billing-information, supabase.com/pricing, convex.dev/pricing,
developers.cloudflare.com/workers/platform/limits, pocketbase.io/docs. Verified directly:
platform.claude.com/docs/en/about-claude/pricing and
platform.claude.com/docs/en/build-with-claude/structured-outputs. Third-party guides
consulted for the free-tier and Gemini lineup figures: yingtu.ai, tinkerllm.com,
cabina.ai, llmprice.com, spendlint.dev; all dated 2026 and in disagreement with each
other on the daily limits, which is why those are flagged for console verification.
