# Launch decisions for the author (2026-10-17, written overnight)

Goal: launch, clean, test, wipe old data, new branding, ready for user testing.
Nothing below has been done. Each item needs you. The order is the release runbook in
`docs/operations.md` ("Release and deploy runbook").

## Blocked on you, in order

1. **New branding.** WebFetch got 403, but the design opens in your logged-in Chrome. File is
   "App Prototype.html", 11 pages, design system "Organic". First page seen: warm cream background,
   terracotta orange accent (Create button, active tab, rank 1), olive green badges, soft green and
   peach card tints, chunky soft serif headings, emoji recipe art, rounded pill chips. Screens seen:
   Explore ("What's growing", branching fast this week, most branched), bottom nav Explore, Saved,
   Create, Activity, You. I have not walked the other 10 pages, and the chat prompt mentions a
   marketing website mockup, so some pages may not be app screens. Decide: should I walk all pages
   and run `/groom` on the result (it is a redesign of most screens, so expect many tickets, and
   the exact fonts and hex values need exporting from the design), and does branding ship in the
   first test release? Recommendation: no, ship the test release on the current look.
2. **Merge or hold the policy branch.** `docs/policy-lookups` (47d825d) is committed locally and not
   pushed. Say "push and PR" and I will.
3. **RL-046 sign-off.** Seven `[AUTHOR TO CONFIRM]` markers remain in `privacy.ts`:
   PostHog plan (free?), reCAPTCHA cookie names, lifetime and data, Hosting logs (check Cloud Logging),
   lawful basis for the request log (I recommend legitimate interests), Australia safeguard,
   Gemini plan re-check. The release deploys `termsVersion()` in the rules, so finish these first.
4. **Gemini free tier vs EEA, UK, Switzerland users.** Google's terms allow only the paid tier for
   them. Decide: restrict testers to other regions, move to Blaze (billing), or accept the risk.
   Recommendation: invite only non-EEA/UK/CH testers at first.
5. **RL-042 wipe.** Irreversible. Needs your explicit "wipe production now". Back up first if
   anything is worth keeping. Do not use the live app between the wipe and the rules deploy.
6. **Deploy order:** indexes (wait for READY), `/release` client, then rules straight after.
   Each is a live change. I will run them when you say go.
7. **QA walk** (`backlog/QA-CHECKLIST.md`). Browser checks only you can judge.
8. **After release, before inviting others:** RL-010 TTL (30 days, the policy promises it),
   RL-050 App Check, RL-057 account deletion, RL-012, RL-001 console reads.
9. **PostHog key.** The runbook says leave `VITE_POSTHOG_KEY` unset for the first release so no
   consent banner shows. Decide whether testers get analytics.

## Small ones

- Add a `messages.fromUid` collection-group index override (RL-060 reviewer note)? Default: no.
- Three untracked PostHog setup files in the working tree: commit or delete?
- `ROADMAP.md` still lists RL-053 and RL-054 as pending. It is yours to edit.
- RL-032 (remove the cloud uid migration) waits on RL-042.

## What I did not do and why

Deploys, the data wipe and pushes are outward-facing or irreversible, and you were asleep.
