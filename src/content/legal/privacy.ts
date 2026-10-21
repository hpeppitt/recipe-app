import type { LegalDocument } from '../../lib/legal';
import { APP_NAME, SUPPORT_EMAIL } from '../../lib/constants';

// Draft for RL-046 sign-off. Facts come from docs/legal/data-inventory.md. Bracketed
// notes are for the author and must be resolved before publishing; each is listed in
// docs/legal/claims-to-verify.md.
export const PRIVACY: LegalDocument = {
  title: 'Privacy Policy',
  lastUpdated: '2026-10-21',
  draftNotice:
    'Draft. Not legal advice. The operator should have this reviewed by a qualified lawyer before relying on it.',
  sections: [
    {
      heading: 'About this policy',
      paragraphs: [
        `This policy explains what ${APP_NAME} stores about you, why, where, who can see it, how long it is kept, and what you can do about it.`,
        `${APP_NAME} is run by Harry Peppitt, an individual in New South Wales, Australia, who decides how your information is used ("we", "us"). Under the GDPR and UK GDPR we are the controller.`,
        'We aim to meet the Australian Privacy Principles in the Privacy Act 1988 (Cth), the EU General Data Protection Regulation (GDPR) and the UK GDPR.',
      ],
    },
    {
      heading: 'The short version',
      paragraphs: [
        'Recipes you save with a verified account are published automatically and anyone can read them, along with your display name and the prompt you typed. Your profile is public too.',
        'Your email address is used only to sign you in. It is not shown to other users.',
        'What you type, and any photos you add to the recipe chat, to generate a recipe is sent to Google\'s Gemini AI. We do not keep chat photos. A photo you choose to add to a cook ("I made this") is different: it is stored and public, and it is never sent to Gemini.',
        'We do not sell your information and we show no advertising.',
        'Optional analytics only run if you allow them.',
        `To see, export, correct or delete your information, email ${SUPPORT_EMAIL}. Some of it you can also change in the app.`,
      ],
    },
    {
      heading: 'What is public',
      paragraphs: [
        'Published recipes can be read by anyone, including people without an account and anyone with the link. A published recipe includes its full content, the prompt you typed to start it, your display name, and the display names of people whose suggestions you approved. It also carries account ids that the app uses to link recipes to profiles.',
        'Your profile can be read by anyone: display name, avatar (an emoji, a generated picture, or a small photo you upload) and your recipe, follower and following counts.',
        'Cooks you log ("I made this") and any photo you add to one are public too. See the Cooks and Cook photos sections below.',
        'The full AI conversation behind a recipe is not published. It stays on your device.',
      ],
    },
    {
      heading: 'Your account',
      paragraphs: [
        'What: your email address, an account id, your display name, whether your email is verified, and sign-in records kept by Firebase. Anonymous accounts have an account id and a generated name (such as "CrispyWaffle"), and no email.',
        'Why: to sign you in, with an email link or with your Google account, and to tie your content to you.',
        'Where: Google Firebase Authentication. Google sends the sign-in email.',
        'Who sees it: you and us. Other users see your display name, never your email.',
        'How long: until your account is deleted. There is no automatic expiry, including for anonymous accounts.',
      ],
    },
    {
      heading: 'Signing in with Google',
      paragraphs: [
        'What: if you choose "Continue with Google", Google sends Firebase Authentication your name, your email address and the address of your Google profile photo. Firebase Authentication keeps these in your sign-in record. The app uses only your email address and display name. It does not show, copy or store your Google profile photo, and your profile photo choice stays as you set it in the app. We never receive your Google password.',
        'Why: to sign you in without a link sent by email. An account has one email address, so Google sign-in and the email link open the same account when the address matches.',
        'Where: Google Firebase Authentication, and Google\'s own sign-in pages, which Google\'s Privacy Policy covers.',
        'Who sees it: you and us. Other users see your display name, never your email.',
        'How long: until your account is deleted. Your Google account stays with Google and is not affected.',
      ],
    },
    {
      heading: 'Importing a recipe from a link',
      paragraphs: [
        'What: when you add a recipe from a link, the web address you enter is sent to Google\'s Gemini AI, which reads the page to find the recipe. The app does not send your email, name or account id with it. The full address is stored on the recipe as its source and is public once the recipe is published. Product analytics, if you allow them, record only the website name from the address, never the full address.',
        'Why: to turn a web page into a recipe you can edit and branch.',
        'Where: Google, through Firebase AI Logic and the Gemini Developer API, under the same terms as AI recipe generation above.',
        'Who sees it: Google processes the address and the page it points to. Anyone can see the source link on a published recipe.',
        'How long: the source link stays with the recipe until you delete the recipe. Do not import a link that contains a private token, a password or personal information.',
      ],
    },
    {
      heading: 'Recipes and bookmarks on your device',
      paragraphs: [
        'What: every recipe you create, open into your library or import, including the prompt and the full AI conversation, and your bookmarks.',
        'Why: so your library works offline and quickly.',
        'Where: your browser\'s storage (IndexedDB) on your device. We cannot see it.',
        'Who sees it: anyone using that browser on that device.',
        'How long: until you delete a recipe, use "Delete Recipes on This Device" in Settings (which removes recipes and bookmarks), or clear your browser data.',
      ],
    },
    {
      heading: 'Published recipes',
      paragraphs: [
        'What: the recipe content, the prompt you typed, your account id and display name, collaborators\' ids and display names, save and view counts, and dates. View counts are a simple tally with no record of who viewed.',
        'Why: sharing recipes is what the app is for.',
        'Where: Google Cloud Firestore, in Sydney, Australia.',
        'Who sees it: anyone.',
        'How long: until you delete the recipe from its page. "Delete Recipes on This Device" does not remove published recipes. Variations other people made from your recipe are theirs and stay.',
      ],
    },
    {
      heading: 'Cooks ("I made this")',
      paragraphs: [
        'What: each time you log a cook, we store your account id, your display name, the recipe, the id of the recipe\'s owner, your vote ("again" or "tweak"), an optional note of up to 500 characters, an optional link to a branch you made from it, and the time.',
        'Why: to show how many people made a recipe and what they thought, and to show you your own cooking log.',
        'Where: Google Cloud Firestore.',
        'Who sees it: anyone, including people without an account. Everything above is public on the recipe, so do not put personal information in a note.',
        `How long: until you delete the cook from your cook log in the app, or your account is deleted. The recipe owner cannot delete your cook. Cooks you log are included in "Download my data" in Settings. If a recipe is deleted, cooks logged on it are kept. If an account that owned a recipe is erased, other people's cooks of that recipe stay and the owner id on them is replaced, so it no longer points to the erased account. Deletion by email request: ${SUPPORT_EMAIL}.`,
      ],
    },
    {
      heading: 'Cook photos',
      paragraphs: [
        'What: one optional photo you add to a cook. It is made smaller on your device first (a JPEG, long side 800 pixels, about 150 KB at most), which also removes the location and camera details in the file. We store it with your account id, the recipe id and the time. Food only, please. Do not photograph people, addresses or documents with personal details.',
        'Why: so a recipe can show what it looks like when cooked.',
        'Where: Google Cloud Firestore, as part of our database. It is not sent to Gemini.',
        'Who sees it: anyone, including people without an account. The recipe shows the newest cook photo with "Photo by" and your display name.',
        `How long: until you delete the cook, which deletes its photo, until the recipe owner removes the photo from their recipe, or until your account is deleted. Cook photos are included in "Download my data" in Settings. If you ask us to erase your account, your cooks and their photos are deleted. Deletion by email request: ${SUPPORT_EMAIL}.`,
      ],
    },
    {
      heading: 'Your Kitchen: shopping list, pantry and collections',
      paragraphs: [
        'What: your shopping list lines (name, amount, unit, aisle, whether it is ticked, and the recipes each line came from, with their emoji, titles and amounts), your pantry items (name, fresh or cupboard, the account id of who added it and when), and your collections (a name, the ids of the recipes in it, when it was created, and a flag that it is private). We also store your account id as the owner and the time of the last change.',
        'Why: to keep your shopping list, pantry and collections on all your devices.',
        'Where: Google Cloud Firestore.',
        'Who sees it: only you. It is private to your account and no one else can read it, including people you follow.',
        `How long: until you remove an item or a list in the app, delete a collection from its page, or your account is deleted. Your Kitchen is included in "Download my data" in Settings. Deletion by email request: ${SUPPORT_EMAIL}.`,
      ],
    },
    {
      heading: 'Your profile',
      paragraphs: [
        'What: display name, avatar choice, an uploaded avatar photo if you add one (stored as a small 128 by 128 pixel image), counts, and the date it was created. It holds no email address.',
        'Why: so others can see who made a recipe and follow you.',
        'Where: Google Cloud Firestore.',
        'Who sees it: anyone.',
        `How long: until your account is deleted. You can change your name and avatar at any time. Deleting the profile is by email request to ${SUPPORT_EMAIL}.`,
      ],
    },
    {
      heading: 'Saves and follows',
      paragraphs: [
        'What: which recipes you saved and when; who you follow, with your display name, and when.',
        'Why: to keep your saves and to show you recipes from people you follow.',
        'Where: Google Cloud Firestore.',
        'Who sees it: your saves, only you. A follow, you and the person you follow. Save and follower counts are public.',
        'How long: until you unsave or unfollow.',
      ],
    },
    {
      heading: 'Suggestions and replies',
      paragraphs: [
        'What: the suggestion text, the recipe it is about, your account id and display name, its status, and the replies in its thread.',
        'Why: so you and the recipe owner can discuss a change.',
        'Where: Google Cloud Firestore.',
        'Who sees it: you and the recipe owner only.',
        `How long: they are kept until deleted on request. You cannot delete or edit them in the app once sent. On an erasure request, suggestions and replies you wrote on other people's recipes are anonymised (your name and id are removed and the text kept) so the other person's thread still makes sense. If the erased account owned the recipe, the recipe is deleted but suggestion threads on it are kept with the owner's side anonymised, so the person who suggested still has their suggestion and its replies in their data and can download them. Email ${SUPPORT_EMAIL}.`,
      ],
    },
    {
      heading: 'Notifications',
      paragraphs: [
        'What: when someone saves your recipe, follows you, suggests a change, replies, or approves or rejects your suggestion, a notification is stored with their account id and display name, the recipe title, and up to about 500 characters of their message.',
        'Why: to tell you what happened.',
        'Where: Google Cloud Firestore.',
        'Who sees it: the person it is addressed to.',
        `How long: there is currently no time limit, and there is no control in the app to delete them. They are deleted on request to ${SUPPORT_EMAIL}.`,
      ],
    },
    {
      heading: 'Rate limits',
      paragraphs: [
        'What: for each kind of limited action (suggesting, replying, notifying, publishing), a counter with your account id, when the current period started, how many you have done in it, and the last item it counted.',
        'Why: to stop anyone flooding other users or the app.',
        'Where: Google Cloud Firestore.',
        'Who sees it: you and us.',
        `How long: until your account is deleted. They are deleted on request to ${SUPPORT_EMAIL}.`,
      ],
    },
    {
      heading: 'AI recipe generation',
      paragraphs: [
        'What: everything you type into the recipe chat, any photos you add to it, the conversation so far, and for a variation the content of the recipe you are varying. Photos are made smaller on your device before they are sent, which also removes the location and camera details stored in the photo file, and they are sent again with each later message in the same chat. The app does not add your email, name or account id to what it sends.',
        'Why: to generate the recipe you asked for.',
        'Where: Google, through Firebase AI Logic and the Gemini Developer API.',
        'Who sees it: Google processes it to produce the answer. We use the free tier of the Gemini API. Under Google\'s terms for the free tier, Google may use what you type, the photos you add and the answers to improve its products and machine learning, and human reviewers may read it after it is disconnected from your Google account, API key and project. Do not put sensitive or personal information into the recipe chat, and do not photograph people, addresses, or documents with personal details such as letters, labels or ID cards. Google\'s terms for the free tier allow it only for people outside the European Economic Area, Switzerland and the United Kingdom, so we invite testers from other places only.',
        'How long: we keep the prompt that started a recipe with the recipe (see above), and the full conversation only on your device. We do not store the photos you add to the recipe chat. They stay in the app\'s memory until you leave the chat and are not saved with the recipe, on your device or in the cloud.',
      ],
    },
    {
      heading: 'Bot protection',
      paragraphs: [
        'What: Google reCAPTCHA v3 and Firebase App Check check that requests come from the real app and not a script. reCAPTCHA collects information from your browser and device to do this. Google describes this as hardware and software information, such as device and application data, which is sent to Google for analysis.',
        'Why: to protect AI generation from automated abuse.',
        'Where: Google.',
        'Who sees it: Google. Google\'s Privacy Policy and Terms of Service apply to reCAPTCHA.',
        'How long: set by Google. reCAPTCHA sets a cookie called _GRECAPTCHA on google.com. Google does not publish its lifetime; third-party cookie listings report about six months.',
      ],
    },
    {
      heading: 'Error reports',
      paragraphs: [
        'What: when the app hits an error it sends a short report: the error message and technical stack trace, the page path (never the full address), the time, your account id if you are signed in, and your browser\'s user agent (the text that names your browser and system). At most 10 reports per visit.',
        'Why: to find and fix bugs.',
        'Where: Google Cloud Firestore.',
        'Who sees it: only us. The app itself cannot read reports back.',
        `How long: 30 days, then they are deleted automatically. They are deleted sooner on request to ${SUPPORT_EMAIL}.`,
      ],
    },
    {
      heading: 'Product analytics',
      paragraphs: [
        'What: which features are used, such as creating, viewing, sharing, saving or deleting a recipe, with recipe ids; the pages you open and what you click; which AI model made a recipe and how long it took; errors the app runs into; and your browser, device type and approximate location, worked out from your IP address.',
        'Who you are: your account id, never your email or name. An anonymous account is known only by its random anonymous account id. What you type to the AI and the recipe text are never sent.',
        'Why: to understand which features are used and to find and fix problems.',
        'Where: PostHog US Cloud, in the United States.',
        'Who sees it: us and PostHog.',
        'How long: one year on PostHog\'s free plan, which is the default.',
        'Only if you allow it. Nothing is sent until you choose "Allow analytics". You can change your choice at any time in Settings.',
      ],
    },
    {
      heading: 'Terms acceptance',
      paragraphs: [
        'What: the version of the Terms of Service you accepted and when.',
        'Why: to show that you agreed to the terms.',
        'Where: Google Cloud Firestore.',
        'Who sees it: you and us. It is not public.',
        'How long: until your account is deleted. Only the latest acceptance is kept.',
      ],
    },
    {
      heading: 'Settings stored on your device',
      paragraphs: [
        'The app keeps a few small items in your browser\'s local storage: your theme, units and last Library tab; which tips you have dismissed; a random device id that is never sent anywhere; the account ids used in this browser; and, while a sign-in link is pending, the email address you entered. The Cookie Policy lists them.',
      ],
    },
    {
      heading: 'Hosting',
      paragraphs: [
        'The app is served by Google Firebase Hosting. Like any web server it receives your IP address and browser details with each request. Google may keep standard request logs for the hosting service, for up to 30 days by default. We do not use them for analytics.',
      ],
    },
    {
      heading: 'Lawful bases (GDPR and UK GDPR)',
      paragraphs: [
        'Contract: running your account, signing you in, storing and publishing your recipes, cooks, cook photos and profile, saves, follows, suggestions, replies, notifications and AI generation, because that is the service you asked for.',
        'Legitimate interests: error reports (to keep the app working), bot protection with reCAPTCHA and App Check (to stop abuse of AI generation), limits on how often you can suggest, reply, notify and publish, and a record that we handled a privacy request, so we can show we complied. You can object to these; see your rights below.',
        'Consent: product analytics. You can withdraw consent at any time in Settings.',
      ],
    },
    {
      heading: 'Who we share it with',
      paragraphs: [
        'Google, which provides Firebase Hosting, Authentication, Cloud Firestore, Firebase AI Logic with Gemini, App Check and reCAPTCHA.',
        'PostHog, for analytics, only if you allow it.',
        'Other users see what is described under "What is public".',
        'We do not sell your information, use it for advertising, or share it with anyone else unless the law requires it.',
      ],
    },
    {
      heading: 'International transfers',
      paragraphs: [
        'Your information may be stored or processed outside your country, including in the United States.',
        'Google (Firebase, Gemini, reCAPTCHA): Google says it participates in the EU-US, Swiss-US and UK Data Privacy Frameworks, and Firebase offers Standard Contractual Clauses. Your recipes and profile are stored in Sydney, Australia. Recipe generation, sign-in and bot protection run on Google\'s systems, which can be in other countries, including the United States.',
        'PostHog: data is stored in the United States. PostHog\'s data processing agreement relies on Standard Contractual Clauses for transfers from the EU, the UK and Switzerland.',
        'Us: we run the app from Australia, which has no EU or UK adequacy decision. Access is limited to the operator and relies on the security controls of the services above. No further legal transfer mechanism is claimed.',
      ],
    },
    {
      heading: 'Your rights',
      paragraphs: [
        `Under the Australian Privacy Principles, the GDPR and the UK GDPR you have the rights below. Where there is no control in the app, email ${SUPPORT_EMAIL} from the address on your account. We will check it is you and reply within one month.`,
        `Access: email ${SUPPORT_EMAIL} for a copy of everything we hold about you.`,
        `Export (portability): "Download my data" in Settings downloads the recipes and bookmarks on your device and, for a signed-in account with an email, your cloud data, including your cooks and cook photos, shopping list, pantry and collections. For anything it does not cover, email ${SUPPORT_EMAIL}.`,
        `Correction: change your display name and avatar on your profile and edit your own recipes. For anything else, email ${SUPPORT_EMAIL}.`,
        `Erasure: delete recipes from their page, delete your cooks (which deletes their photos), delete your collections, unsave, unfollow, or use "Delete Recipes on This Device". To delete your account and everything else, email ${SUPPORT_EMAIL}.`,
        `Objection and restriction: email ${SUPPORT_EMAIL} to object to error reports or bot checks, or to ask us to limit how we use your information.`,
        'Withdrawing consent: turn analytics off in Settings at any time. This does not affect what was sent before.',
        'Complaint: you can complain to the Office of the Australian Information Commissioner (OAIC) in Australia, the Information Commissioner\'s Office (ICO) in the UK, or the data protection authority in your EU country. We would like the chance to help first.',
      ],
    },
    {
      heading: 'Children',
      paragraphs: [
        `The app is not for anyone under 16. If you believe a child under 16 has an account, email ${SUPPORT_EMAIL} and we will delete it.`,
      ],
    },
    {
      heading: 'Security',
      paragraphs: [
        'Access rules on our database limit who can read and change each kind of record, as described in this policy. Sign-in uses email links or Google, so we hold no passwords to leak. No system is perfectly secure.',
      ],
    },
    {
      heading: 'Changes to this policy',
      paragraphs: [
        'We will update this policy when what we collect changes. The date at the top shows the current version. If a change is significant, we will update the Terms of Service too, and the app will ask you to accept them again before you keep contributing.',
      ],
    },
    {
      heading: 'Contact',
      paragraphs: [
        `Privacy questions and requests: ${SUPPORT_EMAIL}.`,
      ],
    },
  ],
};
