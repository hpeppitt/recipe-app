# Launch decisions for the author (2026-10-17, written overnight)

Goal: launch, clean, test, wipe old data, new branding, ready for user testing.
Nothing below has been done. Each item needs you. The order is the release runbook in
`docs/operations.md` ("Release and deploy runbook").

## Blocked on you, in order

1. **New branding.** The design link (claude.ai/design/p/b9d99896...) returned 403 to me, so I could
   not read it. Decide: export the design (assets, colours, fonts, logo) into the repo or share it
   in a form I can read, then groom it into per-screen tickets with `/groom`. Until then the app
   keeps its current look and no branding work is possible.
   Also decide if branding ships before or after the first test release. Recommendation: after.
   The release is already large and the wipe and rules order is delicate.
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
