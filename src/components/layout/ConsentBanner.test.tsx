// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { STORAGE_KEYS } from '../../lib/constants';
import { reloadConsent } from '../../services/analytics';

vi.mock('../../services/firebase', () => ({ isFirebaseConfigured: false }));

import { ConsentBanner } from './ConsentBanner';
import { SettingsPage } from '../../pages/SettingsPage';

const mem = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
});

beforeEach(() => {
  localStorage.clear();
  reloadConsent();
  vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test');
  vi.stubEnv('VITE_POSTHOG_HOST', 'https://eu.i.posthog.com');
  window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});

const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEYS.ANALYTICS_CONSENT) ?? 'null');

describe('ConsentBanner', () => {
  it('shows with a key and no choice, with the link to /cookies', () => {
    renderWithProviders(<ConsentBanner />);
    expect(screen.getByRole('region', { name: 'Analytics consent' })).toBeTruthy();
    expect(screen.getByText(/Nothing is tracked unless you allow it/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Cookie Policy' }).getAttribute('href')).toBe('/cookies');
  });

  it('stays in flow so it cannot cover fixed bottom UI (FAB, update prompt, toasts)', () => {
    renderWithProviders(<ConsentBanner />);
    const cls = screen.getByRole('region', { name: 'Analytics consent' }).className;
    expect(cls).not.toMatch(/fixed|sticky|absolute/);
    expect(screen.getByRole('link', { name: 'Cookie Policy' }).className).toContain('min-h-11');
  });

  it('renders nothing without a key', () => {
    vi.stubEnv('VITE_POSTHOG_KEY', '');
    renderWithProviders(<ConsentBanner />);
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('Allow stores granted and hides', () => {
    renderWithProviders(<ConsentBanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Allow analytics' }));
    expect(stored().analytics).toBe('granted');
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('No thanks stores denied and hides', () => {
    renderWithProviders(<ConsentBanner />);
    fireEvent.click(screen.getByRole('button', { name: 'No thanks' }));
    expect(stored().analytics).toBe('denied');
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('stays hidden for a stored valid choice', () => {
    localStorage.setItem(STORAGE_KEYS.ANALYTICS_CONSENT, JSON.stringify({ analytics: 'denied', at: 1, version: 1 }));
    renderWithProviders(<ConsentBanner />);
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('Settings toggle reflects and changes the choice, in sync with the banner', () => {
    renderWithProviders(
      <>
        <ConsentBanner />
        <SettingsPage />
      </>
    );
    const toggle = screen.getByRole('checkbox') as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    fireEvent.click(toggle);
    expect(stored().analytics).toBe('granted');
    expect(screen.queryByRole('region', { name: 'Analytics consent' })).toBeNull();
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(stored().analytics).toBe('denied');
  });

  it('Settings hides the toggle without a key', () => {
    vi.stubEnv('VITE_POSTHOG_KEY', '');
    renderWithProviders(<SettingsPage />);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});
