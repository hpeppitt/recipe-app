# Claims to verify before the policies go live

Every statement in the RL-044 drafts that could not be verified from the code, needs an
author decision, or depends on a ticket that has not shipped. RL-046 (author sign-off)
clears this list. Each item names the file and section heading where the text appears.

Files: Terms = `src/content/legal/terms.ts`, Privacy = `src/content/legal/privacy.ts`,
Cookies = `src/content/legal/cookies.ts`. Facts behind the drafts are in
[data-inventory.md](data-inventory.md).

## A. Author must supply or decide

1. **Operator identity.** Terms "About these terms" and Privacy "About this policy":
   `[AUTHOR TO CONFIRM: the operator's legal name, and whether an individual or a business]`.
   GDPR needs the controller's identity and contact details. Ticket: RL-046.
2. **Governing state.** Terms "Governing law": `[STATE]` appears twice. Ticket: RL-046.
3. **Support address.** All three documents use `SUPPORT_EMAIL` from
   `src/lib/constants.ts` (currently the author's personal address). Its own comment says to
   change it before inviting anyone whose mail should not reach it. Confirm it is the address
   to publish. Ticket: RL-046.
4. **EU or UK representative.** Privacy "About this policy": whether GDPR Article 27 or the
   UK equivalent requires a named representative. Ticket: RL-046.
5. **Privacy Act coverage.** Privacy "About this policy": whether the Privacy Act 1988 binds
   the operator (small business exemption) and whether to say so. Ticket: RL-046.
6. **Liability clause.** Terms "Limits on our liability": wording and scope for a lawyer.
   Ticket: RL-046.
7. **Anonymous account expiry.** Privacy "Your account": no code deletes anonymous Firebase
   users. Confirm no Firebase or Identity Platform cleanup setting is on, and decide whether to
   set one. Ticket: RL-046.
8. **Notifications retention.** Privacy "Notifications": no time limit and no in-app delete
   control. No ticket sets one. Decide whether to file one. Ticket: none yet.
9. **Request log basis.** Privacy "Lawful bases": "Legal obligation" for keeping a record of
   handled requests. Confirm the basis. Ticket: RL-055, RL-046.
10. **Announcing policy changes.** Privacy "Changes to this policy" promises an in-app notice
    of significant changes; there is no mechanism for privacy changes today (RL-047 covers
    terms only). Decide how. Ticket: RL-046.
11. **Notice before suspension.** Terms "Suspension and removal" commits to email notice
    where reasonable. This is a manual operator promise; confirm it. Ticket: RL-046.
12. **No sale, no advertising.** Privacy "The short version" and "Who we share it with". True
    of the code today; confirm it as a standing commitment. Ticket: RL-046.

## B. Could not be verified from the code (third-party facts)

13. **Gemini data use.** Privacy "AI recipe generation": whether Google may use prompts sent
    through Firebase AI Logic (Gemini Developer API backend, `GoogleAIBackend`, model
    `gemini-3.6-flash`) to improve its products, whether people may review them, and how long
    Google keeps them, under the tier actually in use (the project is on Spark per product
    decision 2). Ticket: RL-046.
14. **reCAPTCHA v3 collection.** Privacy "Bot protection": what reCAPTCHA v3 collects, and
    its retention. Ticket: RL-046.
15. **reCAPTCHA cookies.** Cookies "Cookies": names, domains and lifetimes. Ticket: RL-046.
16. **Firebase Hosting logs.** Privacy "Hosting": what is logged and for how long. Ticket: RL-046.
17. **Firestore location.** Privacy "Published recipes": the database region (not in the repo).
    Ticket: RL-046.
18. **Google transfer safeguard.** Privacy "International transfers": the mechanism relied on
    for Firebase, Gemini and reCAPTCHA (data processing terms, Standard Contractual Clauses,
    EU-US Data Privacy Framework) and regions. Ticket: RL-046.
19. **Operator transfer safeguard.** Privacy "International transfers": the operator in
    Australia accessing EU and UK data, with no adequacy decision. Ticket: RL-046.
20. **App Check token lifetime.** Inventory only: set by Google, not verified. Not stated in
    the policies. Ticket: none.
21. **Firebase Auth session contents.** Inventory and Cookies "IndexedDB": described as the
    signed-in user and its tokens, from the SDK's documented behaviour, not inspected in a
    browser. Ticket: RL-046 (a devtools look is enough).

## C. Depend on unshipped tickets

Each is marked `[DEPENDS ON RL-0xx]` in the text. Status as of 2026-10-15.

22. **Terms acceptance at sign-up.** Terms "Who can use it" and "Changes to these terms";
    Privacy "Terms acceptance"; Cookies "Local storage" (pending acceptance key). RL-047 (ready).
23. **Email requests fulfilled by runbook.** Terms "Leaving"; Privacy "Suggestions and replies"
    (anonymisation on erasure) and "Your rights" (one-month reply, identity check). RL-055
    (ready).
24. **Self-service account deletion not promised.** Terms "Leaving", Privacy "Your rights".
    Add the control's name only after RL-057 (needs-human) ships.
25. **Self-service download not promised.** Privacy "Your rights". Only after RL-056 (ready).
26. **Consent banner and Settings control.** Privacy "The short version", "Lawful bases",
    "Your rights" (withdrawing consent); Cookies "Local storage" (choice key) and "Your
    choices" (banner copy and Settings Legal section). RL-052 (ready). The Settings Legal section is built (RL-045, draft); still open for the author's check.
27. **PostHog analytics.** Privacy "The short version", "Product analytics", "Who we share it
    with"; Cookies "Cookies". RL-054 (ready).
28. **PostHog host, region and retention.** Privacy "Product analytics" and "International
    transfers". RL-053 (needs-human).
29. **PostHog cookie or storage names and lifetimes.** Cookies "Cookies". RL-054.
30. **Google Analytics removed.** Privacy "Who we share it with"; Cookies "About this policy".
    Today GA4 runs without consent when `VITE_FIREBASE_MEASUREMENT_ID` is set and identifies
    every signed-in user, anonymous included, by uid. The policies do not mention it and are
    untrue until RL-058 (ready) ships. Confirm whether production builds set the variable.
31. **clientErrors retention.** Privacy "Error reports": no limit today. RL-010 (needs-human).
32. **Limits on suggestions and replies.** Privacy "Lawful bases". RL-048 (ready).
33. **Pages exist.** All three documents assume they are reachable at `/terms`, `/privacy` and
    `/cookies`, and the Settings "Legal" section. Built as drafts in RL-045; still open for the author's check.
