import type { LegalDocument } from '../../lib/legal';
import { APP_NAME, SUPPORT_EMAIL } from '../../lib/constants';

// Draft for RL-046 sign-off. Store and key names come from docs/legal/data-inventory.md.
// Bracketed notes are for the author; see docs/legal/claims-to-verify.md.
export const COOKIES: LegalDocument = {
  title: 'Cookie Policy',
  lastUpdated: '2026-10-17',
  draftNotice:
    'Draft. Not legal advice. The operator should have this reviewed by a qualified lawyer before relying on it.',
  sections: [
    {
      heading: 'About this policy',
      paragraphs: [
        `This policy explains the cookies and other browser storage ${APP_NAME} uses. ${APP_NAME} itself sets no cookies. Two services it uses can set their own: Google reCAPTCHA, and PostHog if you allow analytics. Everything else is kept in your browser's local storage or IndexedDB.`,
        'The Privacy Policy explains what happens to your information more broadly.',
      ],
    },
    {
      heading: 'Strictly necessary and optional',
      paragraphs: [
        'Strictly necessary storage is needed for the app to work or to keep it secure. It is used without asking, and this policy discloses it.',
        'Optional storage is only used if you agree. The only optional item is product analytics (PostHog).',
      ],
    },
    {
      heading: 'Cookies',
      paragraphs: [
        'Google reCAPTCHA (strictly necessary). Used with Firebase App Check to check that requests to the AI come from the real app and not a script. Set by Google. [AUTHOR TO CONFIRM: cookie names, domains and lifetimes, from Google\'s documentation.]',
        'PostHog (optional, analytics). A cookie and a matching local storage entry, both named ph_ followed by the project key and _posthog, holding a random id for your browser, your account id once known, and the current visit. Used to count which features are used. Set only after you choose "Allow analytics". The cookie lasts 365 days.',
      ],
    },
    {
      heading: 'Local storage',
      paragraphs: [
        'Small text values kept in your browser. Strictly necessary unless noted. None of them is sent to us unless stated.',
        'Theme, units and Library tab: your display preferences.',
        'Tips: which one-time explainers you have dismissed and how many recipes you have opened.',
        'Device id: a random id created on first visit. It is not currently used for anything and is never sent anywhere.',
        'Account ids: the id of an anonymous account while you use one, used to move your bookmarks to your new account when you sign in with an email. Also a list of every account id that has signed in on this browser, which is not currently used for anything, is never sent anywhere, and is not removed when you sign out.',
        'Pending sign-in email: the address you entered while a sign-in link is on its way, so the link can finish signing you in. Removed when sign-in succeeds. It stays if the link is never used.',
        'Stranded recipes notice: shown once if recipes could not move to your new account, removed when you dismiss it.',
        'Your analytics choice: whether you allowed analytics and when.',
        'Old analytics clean-up: a note that leftover Google Analytics cookies were removed from this browser, so it is done only once.',
        'Pending terms acceptance: the terms version you accepted and when, kept until your account is verified.',
      ],
    },
    {
      heading: 'IndexedDB',
      paragraphs: [
        'A larger database in your browser. All of it is strictly necessary.',
        'Your recipes and bookmarks (RecipeAppDB): your library, including the AI conversation behind each recipe. Never sent to us except when a recipe is published.',
        'Sign-in session (firebaseLocalStorageDb): keeps you signed in. Set by Firebase Authentication.',
        'App Check token (firebase-app-check-database): proves to the AI service that requests come from the app. Set by Firebase App Check.',
        'Firebase usage record (firebase-heartbeat-database): the dates the Firebase software ran and its version, at most 30 entries. Set by Firebase.',
      ],
    },
    {
      heading: 'Offline storage',
      paragraphs: [
        'The app saves its own files (pages, scripts, icons) in your browser\'s cache so it can open offline. This holds none of your information.',
      ],
    },
    {
      heading: 'Your choices',
      paragraphs: [
        'When you first visit, a banner asks whether to allow optional analytics, with two equal buttons, "Allow analytics" and "No thanks". Nothing is tracked unless you allow it. You can change your choice at any time in Settings, in the Legal section. If you turn analytics off, it stops straight away.',
        'You can also clear cookies and site data in your browser settings. This signs you out and deletes the recipes and bookmarks stored on that device.',
        '"Delete Recipes on This Device" in Settings removes your local recipes and bookmarks, but not your settings or the other items above.',
      ],
    },
    {
      heading: 'Changes and contact',
      paragraphs: [
        'We will update this policy when the storage we use changes. The date at the top shows the current version.',
        `Questions: ${SUPPORT_EMAIL}.`,
      ],
    },
  ],
};
