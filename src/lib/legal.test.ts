import { describe, it, expect } from 'vitest';
import {
  DRAFT_NOTICE,
  LEGAL_DOCUMENTS,
  TERMS_LAST_UPDATED,
  PRIVACY_LAST_UPDATED,
  COOKIES_LAST_UPDATED,
  TERMS_VERSION,
  type LegalDocument,
} from './legal';
import { SUPPORT_EMAIL } from './constants';

const docs: [string, LegalDocument, string][] = [
  ['terms', LEGAL_DOCUMENTS.terms, TERMS_LAST_UPDATED],
  ['privacy', LEGAL_DOCUMENTS.privacy, PRIVACY_LAST_UPDATED],
  ['cookies', LEGAL_DOCUMENTS.cookies, COOKIES_LAST_UPDATED],
];

function allText(doc: LegalDocument): string {
  return [
    doc.title,
    doc.lastUpdated,
    doc.draftNotice,
    ...doc.sections.flatMap((s) => [s.heading, ...s.paragraphs]),
  ].join('\n');
}

describe.each(docs)('%s', (_name, doc, exportedDate) => {
  it('has a valid ISO last-updated date matching the exported constant', () => {
    expect(doc.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Round-trip rejects impossible dates such as 2026-02-31.
    expect(new Date(`${doc.lastUpdated}T00:00:00Z`).toISOString().slice(0, 10)).toBe(doc.lastUpdated);
    expect(exportedDate).toBe(doc.lastUpdated);
  });

  it('starts with the exact draft notice', () => {
    expect(doc.draftNotice).toBe(
      'Draft. Not legal advice. The operator should have this reviewed by a qualified lawyer before relying on it.'
    );
    expect(doc.draftNotice).toBe(DRAFT_NOTICE);
  });

  it('has a title and non-empty sections', () => {
    expect(doc.title.trim()).not.toBe('');
    expect(doc.sections.length).toBeGreaterThan(0);
    for (const section of doc.sections) {
      expect(section.heading.trim()).not.toBe('');
      expect(section.paragraphs.length).toBeGreaterThan(0);
      for (const p of section.paragraphs) expect(p.trim()).not.toBe('');
    }
  });

  it('contains no em dash (organisation rule)', () => {
    expect(allText(doc)).not.toContain(String.fromCharCode(0x2014));
  });

  it('gives the support email as the contact route', () => {
    expect(allText(doc)).toContain(SUPPORT_EMAIL);
  });
});

describe('terms', () => {
  it('versions the terms by their last-updated date', () => {
    expect(TERMS_VERSION).toBe(LEGAL_DOCUMENTS.terms.lastUpdated);
  });

  it('leaves the governing state for the author', () => {
    expect(allText(LEGAL_DOCUMENTS.terms)).toContain('[STATE], Australia');
  });

  it('states the minimum age', () => {
    expect(allText(LEGAL_DOCUMENTS.terms)).toContain('at least 16');
  });
});
