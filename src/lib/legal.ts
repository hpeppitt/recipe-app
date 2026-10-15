import { TERMS } from '../content/legal/terms';
import { PRIVACY } from '../content/legal/privacy';
import { COOKIES } from '../content/legal/cookies';

/**
 * Shape of the Terms, Privacy and Cookie policy content in `src/content/legal/`.
 * Plain strings only, so a page can render them without a markdown library.
 */
export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export interface LegalDocument {
  title: string;
  /** ISO date, YYYY-MM-DD. */
  lastUpdated: string;
  draftNotice: string;
  sections: LegalSection[];
}

/** Each draft opens with this line until the author decides otherwise (RL-046). */
export const DRAFT_NOTICE =
  'Draft. Not legal advice. The operator should have this reviewed by a qualified lawyer before relying on it.';

// The content files are the one source of truth for the dates; these only re-export them.
export const TERMS_LAST_UPDATED = TERMS.lastUpdated;
export const PRIVACY_LAST_UPDATED = PRIVACY.lastUpdated;
export const COOKIES_LAST_UPDATED = COOKIES.lastUpdated;

/** The version a user accepts at sign-up (RL-047). Bump by changing the terms' date. */
export const TERMS_VERSION = TERMS_LAST_UPDATED;

export const LEGAL_DOCUMENTS = { terms: TERMS, privacy: PRIVACY, cookies: COOKIES } as const;
