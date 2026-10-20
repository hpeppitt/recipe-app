// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { screen, within, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders';
import { Routes, Route, Link } from 'react-router-dom';
import { LEGAL_DOCUMENTS } from '../lib/legal';

vi.mock('../services/firebase', () => ({ isFirebaseConfigured: false }));
vi.mock('../services/firestore', () => ({ subscribeNotificationPrefs: () => () => {} }));
vi.mock('../hooks/useProfile', () => ({ useOwnProfile: () => ({ profile: null, updateAvatar: vi.fn() }) }));

import { LegalPage } from './LegalPage';
import { SettingsPage } from './SettingsPage';
import { AuthModal } from '../components/auth/AuthModal';

beforeAll(() => {
  // jsdom has no <dialog> modal support.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  window.scrollTo = () => {};
  window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});

describe.each(Object.entries(LEGAL_DOCUMENTS))('LegalPage %s', (key, doc) => {
  const render = () =>
    renderWithProviders(<LegalPage doc={key as keyof typeof LEGAL_DOCUMENTS} />, {
      user: null,
      auth: { isConfigured: false },
    });

  it('renders title, draft notice, date and every section, signed out and local-only', () => {
    render();
    expect(screen.getByRole('heading', { level: 1, name: doc.title })).toBeTruthy();
    expect(screen.getByRole('note').textContent).toBe(doc.draftNotice);
    expect(document.querySelector('time')?.getAttribute('datetime')).toBe(doc.lastUpdated);
    const h2s = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(h2s).toEqual(doc.sections.map((s) => s.heading));
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(within(screen.getByRole('main')).getAllByRole('heading', { level: 2 }).length).toBe(doc.sections.length);
  });

  it('renders bracketed placeholders verbatim', () => {
    render();
    const placeholders = doc.sections.flatMap((s) => s.paragraphs).filter((p) => /\[[A-Z]/.test(p));
    for (const p of placeholders) {
      expect(screen.getAllByText(p).length).toBeGreaterThan(0);
    }
  });
});

describe('LegalPage back button', () => {
  const app = (
    <Routes>
      <Route path="/terms" element={<LegalPage doc="terms" />} />
      <Route path="/settings" element={<p>settings page</p>} />
    </Routes>
  );

  it('goes to /settings when there is no in-app history', () => {
    renderWithProviders(app, { route: '/terms' });
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(screen.getByText('settings page')).toBeTruthy();
  });

  it('goes back when there is history', () => {
    renderWithProviders(
      <Routes>
        <Route path="/terms" element={<LegalPage doc="terms" />} />
        <Route path="/" element={<Link to="/terms">open terms</Link>} />
        <Route path="/settings" element={<p>settings page</p>} />
      </Routes>
    );
    fireEvent.click(screen.getByRole('link', { name: 'open terms' }));
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(screen.getByRole('link', { name: 'open terms' })).toBeTruthy();
    expect(screen.queryByText('settings page')).toBeNull();
  });
});

describe('legal links', () => {
  it('Settings lists the three pages', () => {
    renderWithProviders(<SettingsPage />);
    expect(screen.getByRole('link', { name: 'Terms of Service' }).getAttribute('href')).toBe('/terms');
    expect(screen.getByRole('link', { name: 'Privacy Policy' }).getAttribute('href')).toBe('/privacy');
    expect(screen.getByRole('link', { name: 'Cookie Policy' }).getAttribute('href')).toBe('/cookies');
  });

  it('the sign-in email step links Terms and Privacy in a new tab', () => {
    renderWithProviders(<AuthModal open action={{ kind: 'continue' }} onAuthenticated={() => {}} onDismiss={() => {}} />, { user: null });
    fireEvent.click(screen.getByRole('button', { name: 'Continue with email' }));
    const terms = screen.getByRole('link', { name: 'Terms of Service' });
    expect(terms.getAttribute('href')).toBe('/terms');
    expect(terms.getAttribute('target')).toBe('_blank');
    expect(screen.getByRole('link', { name: 'Privacy Policy' }).getAttribute('rel')).toBe('noopener noreferrer');
  });
});
