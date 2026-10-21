// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders, fakeUser } from '../test/renderWithProviders';
import { render as rtlRender } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext, type AuthContextType } from '../contexts/AuthContext';

let user: typeof fakeUser | null = null;
const anon = { ...fakeUser, uid: 'u1', isAnonymous: true, emailVerified: false };
const member = { ...fakeUser, uid: 'u1' };
const signOut = vi.fn();
const render = (route = '/') => renderWithProviders(<SettingsPage />, { user, route, auth: { signOut } });
let consent = { configured: false, granted: false };
const setConsent = vi.fn();
vi.mock('../hooks/useConsent', () => ({ useConsent: () => ({ ...consent, setConsent }) }));
vi.mock('../services/firebase', () => ({ isFirebaseConfigured: true }));
const updateAvatar = vi.fn(async () => {});
vi.mock('../hooks/useProfile', () => ({ useOwnProfile: () => ({ profile: null, updateAvatar }) }));
const fetchCloud = vi.fn();
let prefsLoads = true;
let prefsFails = false;
const setPrefsDoc = vi.fn(async (..._a: unknown[]) => {});
vi.mock('../services/firestore', () => ({
  fetchCloudDataForExport: (...a: unknown[]) => fetchCloud(...a),
  subscribeNotificationPrefs: (_u: string, cb: (p: null) => void, err: () => void) => ((prefsFails ? err() : prefsLoads && cb(null)), () => {}),
  setNotificationPrefs: (...a: unknown[]) => setPrefsDoc(...a),
}));
const exportRecipes = vi.fn(async (): Promise<unknown[]> => []);
vi.mock('../db/recipes', () => ({
  exportAllRecipes: () => exportRecipes(),
  importRecipes: vi.fn(),
  clearAllRecipes: vi.fn(),
}));
vi.mock('../db/favorites', () => ({ exportAllFavorites: async () => [{ uid: 'u1', recipeId: 'r', createdAt: 1 }] }));

import { SettingsPage } from './SettingsPage';

// The always-mounted notification error region is also a status.
const exportStatus = () => screen.getAllByRole('status').find((e) => !e.hasAttribute('data-notify-status'))!;

const ok = { data: null };
const allOk = { profile: ok, recipes: { data: [] }, favorites: { data: [] }, follows: { data: [] }, suggestions: { data: [] }, notifications: { data: [] }, termsAcceptance: ok, notificationPrefs: ok, tasteProfile: ok, writeWindows: { data: [] }, cooks: { data: [] }, cookPhotos: { data: [] }, kitchen: ok, kitchenMemberships: { data: [] }, collections: { data: [] }, cookbookFollows: { data: [] } };

let blobs: Blob[];
// Real timer captured before any spy, so the stall check can wait in real time.
const realSetTimeout = globalThis.setTimeout;
// The page's 1000ms revoke timers, held back so none can fire into a later test's fresh revokeObjectURL mock.
let revokeTimers: Array<() => void>;
let timeoutSpy: ReturnType<typeof vi.spyOn>;
let downloadName: string | undefined;
beforeEach(() => {
  fetchCloud.mockReset();
  signOut.mockClear();
  setConsent.mockClear();
  consent = { configured: false, granted: false };
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute('open'); };
  exportRecipes.mockClear();
  blobs = [];
  downloadName = undefined;
  revokeTimers = [];
  // RTL's waitFor also uses 1000, so match on the callback source and pass everything else through.
  timeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: TimerHandler, ms?: number, ...args: unknown[]) => {
    if (ms === 1000 && typeof fn === 'function' && String(fn).includes('revokeObjectURL')) {
      revokeTimers.push(fn as () => void);
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }
    return realSetTimeout(fn, ms, ...args);
  }) as typeof setTimeout);
  window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  URL.createObjectURL = (b: Blob) => (blobs.push(b), 'blob:x');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloadName = this.download;
  });
});

afterEach(() => {
  timeoutSpy.mockRestore();
});

describe('Settings: theme', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
    document.documentElement.classList.remove('dark');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('offers Light, Dark and System in Appearance, System when nothing is stored', () => {
    render();
    const group = screen.getByRole('radiogroup', { name: 'Theme' });
    expect(within(group).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Light', 'Dark', 'System']);
    expect(within(group).getByRole('radio', { name: 'System' })).toHaveAttribute('aria-checked', 'true');
  });

  it('applies and stores the chosen theme', async () => {
    render();
    const group = screen.getByRole('radiogroup', { name: 'Theme' });
    await userEvent.click(within(group).getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(store.get('recipe-app-theme')).toBe('dark');
    await userEvent.click(within(group).getByRole('radio', { name: 'Light' }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(within(group).getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('Settings: Download my data', () => {
  it('is labelled local-only for an anonymous user and reads no cloud data', async () => {
    user = anon;
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Download my data (this device only)' }));
    await waitFor(() => expect(exportStatus().textContent).toMatch(/downloaded/));
    expect(fetchCloud).not.toHaveBeenCalled();
    const file = JSON.parse(await blobs[0].text());
    expect(file.cloud).toBeNull();
    expect(file.local.bookmarks).toHaveLength(1);
    expect(downloadName).toMatch(/^recipe-lab-data-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it('is labelled local-only when signed out', () => {
    user = null;
    render();
    expect(screen.getByRole('button', { name: 'Download my data (this device only)' })).toBeTruthy();
  });

  it('downloads local and cloud data for a signed-in user', async () => {
    user = member;
    fetchCloud.mockResolvedValue(allOk);
    render();
    const btn = screen.getByRole('button', { name: 'Download my data' });
    expect(btn.className).toContain('min-h-11');
    fireEvent.click(btn);
    await waitFor(() => expect(exportStatus().textContent).toMatch(/downloaded/));
    expect(fetchCloud).toHaveBeenCalledWith('u1', true);
    const file = JSON.parse(await blobs[0].text());
    expect(file.uid).toBe('u1');
    expect(file.cloud).not.toBeNull();
  });

  it('is disabled and says Preparing while running', async () => {
    user = member;
    fetchCloud.mockReturnValue(new Promise(() => {}));
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Download my data' }));
    const busy = await screen.findByRole('button', { name: 'Preparing...' });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
  });

  it('raises an alert when every cloud read failed, and still downloads the local part', async () => {
    user = member;
    const e = { error: 'permission-denied' };
    fetchCloud.mockResolvedValue({ profile: e, recipes: e, favorites: e, follows: e, suggestions: e, notifications: e, termsAcceptance: e, notificationPrefs: e, tasteProfile: e, writeWindows: e, cooks: e, cookPhotos: e, kitchen: e, kitchenMemberships: e, collections: e, cookbookFollows: e });
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Download my data' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/could not be loaded/));
    expect(JSON.parse(await blobs[0].text()).errors).toHaveLength(16);
  });

  it('notes a partial failure without an alert', async () => {
    user = member;
    fetchCloud.mockResolvedValue({ ...allOk, suggestions: { error: 'permission-denied' } });
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Download my data' }));
    await waitFor(() => expect(exportStatus().textContent).toMatch(/some of your online data \(suggestions\) could not be included/));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('starts one export for a double tap', async () => {
    user = member;
    fetchCloud.mockResolvedValue(allOk);
    render();
    const btn = screen.getByRole('button', { name: 'Download my data' });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(exportStatus().textContent).toMatch(/downloaded/));
    expect(fetchCloud).toHaveBeenCalledTimes(1);
    expect(blobs).toHaveLength(1);
  });

  it('tells an unverified user to verify, in plain words', async () => {
    user = { ...member, emailVerified: false };
    fetchCloud.mockResolvedValue({ ...allOk, suggestions: { error: 'Verify your email to include all your online data' } });
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Download my data' }));
    await waitFor(() => expect(exportStatus().textContent).toMatch(/Verify your email to include all your online data\./));
    expect(exportStatus().textContent).not.toMatch(/Try again later/);
    expect(fetchCloud).toHaveBeenCalledWith('u1', false);
  });

  it('shows an alert and can retry when preparing throws', async () => {
    user = member;
    exportRecipes.mockRejectedValueOnce(new Error('idb'));
    fetchCloud.mockResolvedValue(allOk);
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Download my data' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Couldn't prepare/));
    expect(blobs).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Download my data' }));
    await waitFor(() => expect(exportStatus().textContent).toMatch(/downloaded/));
  });

  it('revokes the object URL after a delay, not at once', async () => {
    user = member;
    fetchCloud.mockResolvedValue(allOk);
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Download my data' }));
    await waitFor(() => expect(exportStatus().textContent).toMatch(/downloaded/));
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    expect(revokeTimers).toHaveLength(1);
    revokeTimers[0]();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
  });

  it('explains how it differs from Export my recipes', () => {
    user = member;
    render();
    expect(screen.getByText(/To move recipes between devices, use Export my recipes/)).toBeTruthy();
  });
});

describe('Settings: Delete recipes on this device copy', () => {
  const reloadText = /stay there and load again the next time you open the app/;
  it.each([
    ['verified', member, true],
    ['anonymous', anon, false],
    ['unverified', { ...member, emailVerified: false }, false],
    ['signed out', null, false],
  ])('%s user: account-reload copy is %s', (_n, u, verified) => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
    user = u;
    render();
    expect(reloadText.test(screen.getByText(/^Recipes (saved to your account|you've shared)/).textContent ?? '')).toBe(verified);
    fireEvent.click(screen.getByRole('button', { name: 'Delete recipes on this device' }));
    const dialog = screen.getByRole('dialog');
    expect(reloadText.test(dialog.textContent ?? '')).toBe(verified);
    expect(/cannot be undone/.test(dialog.textContent ?? '')).toBe(!verified);
  });
});

describe('Settings: layout (RL-093)', () => {
  it('has no Weigh row', () => {
    user = member;
    render();
    expect(screen.queryByText(/^weigh(?! spoons)/i)).toBeNull();
  });

  it('links Your taste for a verified account only (RL-232)', () => {
    user = member;
    render();
    expect(screen.getByRole('link', { name: 'Your taste' })).toHaveAttribute('href', '/settings/taste');
    cleanup();
    user = { ...member, emailVerified: false };
    render();
    expect(screen.queryByRole('link', { name: 'Your taste' })).toBeNull();
  });

  it('orders the groups Account, Notify me when, Appearance, Your data, Legal and ends with Sign out', () => {
    user = member;
    render();
    const labels = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(labels).toEqual(['Account', 'Notify me when', 'Appearance', 'Your data', 'Legal']);
    const buttons = screen.getAllByRole('button').map((b) => b.textContent);
    expect(buttons[buttons.length - 1]).toBe('Sign out');
  });

  it.each([
    ['verified', member, 'Test Cook, cook@example.com, edit avatar', 'dialog'],
    ['anonymous', anon, 'Test Cook, Guest · this device only', null],
  ])('Account row for a %s account is named "%s" and haspopup %s', (_n, u, name, popup) => {
    user = u;
    render();
    expect(screen.getByRole('button', { name }).getAttribute('aria-haspopup')).toBe(popup);
  });

  it.each([
    ['email only', ['email'], 'cook@example.com · Email link', '1'],
    ['Google only', ['google'], 'cook@example.com · Google', '1'],
    ['both', ['email', 'google'], 'cook@example.com · Google', '2'],
  ] as const)('shows the sign-in line and method count for %s', (_n, providers, line, count) => {
    user = { ...member, providers: [...providers] };
    render();
    expect(screen.getByText(line.split(' · ')[0]).parentElement?.textContent).toBe(line);
    expect(screen.getByText('Sign-in methods').textContent).toBe(`Sign-in methods, ${count} ${count === '1' ? 'method' : 'methods'}`);
  });

  it('shows no email line or Sign-in methods row for an anonymous account', () => {
    user = anon;
    render();
    expect(screen.queryByText(/cook@example.com/)).toBeNull();
    expect(screen.queryByText('Sign-in methods')).toBeNull();
  });

  it('Account row opens the avatar sheet for a verified account, and closes it on save', async () => {
    user = member;
    render();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Test Cook, cook@example.com, edit avatar' }));
    const sheet = await screen.findByRole('dialog', { name: 'Edit avatar' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Initials' }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateAvatar).toHaveBeenCalledWith(expect.objectContaining({ photoType: 'generated' })));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit avatar' })).toBeNull());
  });

  it('Account row navigates to /profile, without a sheet, for an anonymous account', async () => {
    user = anon;
    renderWithProviders(
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/profile" element={<p>profile page</p>} />
      </Routes>,
      { user, route: '/settings' }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Test Cook, Guest · this device only' }));
    expect(await screen.findByText('profile page')).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Edit avatar' })).toBeNull();
  });

  it('shows the add-an-email help line for an anonymous account only', () => {
    user = anon;
    const { unmount } = render();
    expect(screen.getByText('Add an email to keep your recipes.')).toBeTruthy();
    unmount();
    user = member;
    render();
    expect(screen.queryByText('Add an email to keep your recipes.')).toBeNull();
  });

  it('keeps a row\'s status text in the same wrapper as the row, so rules fall between rows only', async () => {
    user = member;
    exportRecipes.mockResolvedValue([]);
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Export my recipes' }));
    await waitFor(() => expect(exportStatus()).toBeTruthy());
    const status = exportStatus();
    const wrapper = screen.getByRole('button', { name: 'Export my recipes' }).parentElement;
    expect(status.parentElement).toBe(wrapper);
    expect(wrapper?.className).toContain('last:border-b-0');
  });

  it('signed out: a Sign in row opens the auth dialog and there is no Sign out (RL-165)', async () => {
    user = null;
    render();
    expect(screen.getByText('Save, branch and follow cooks')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^Sign in/ }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('focus moves to the heading when sign-in replaces the Sign in row (RL-165)', () => {
    const ctx = (u: typeof fakeUser | null) => ({ user: u, isConfigured: true, signOut } as unknown as AuthContextType);
    const tree = (u: typeof fakeUser | null) => (
      <MemoryRouter><AuthContext.Provider value={ctx(u)}><SettingsPage /></AuthContext.Provider></MemoryRouter>
    );
    const { rerender } = rtlRender(tree(null));
    rerender(tree(member));
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Settings' }));
  });

  it('Back goes to the profile when there is no history', async () => {
    user = member;
    renderWithProviders(
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/profile" element={<p>profile page</p>} />
      </Routes>,
      { user, route: '/settings' }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('profile page')).toBeTruthy();
  });

  it('every row is at least 44px tall (min-h-11)', () => {
    user = member;
    render();
    for (const name of ['Export my recipes', 'Import recipes', 'Delete recipes on this device', 'Sign out']) {
      expect(screen.getByRole('button', { name }).className).toContain('min-h-11');
    }
    expect(screen.getByRole('link', { name: 'Terms of Service' }).className).toContain('min-h-11');
  });
});

describe('Settings: Sign out (moved from the profile, RL-093)', () => {
  it('signs a verified account out at once', () => {
    user = member;
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('asks first for an anonymous account, and cancel does not sign out', () => {
    user = anon;
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOut).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toMatch(/Sign out of this anonymous account\?/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(signOut).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sign Out' }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});

describe('Settings: weigh spoons and liquids (RL-183)', () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is an off switch by default, toggles on, and stores 1', async () => {
    render();
    const sw = screen.getByRole('switch', { name: /Weigh spoons and liquids/ });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    await userEvent.click(sw);
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(store.get('recipe-lab-weigh-volumes')).toBe('1');
    await userEvent.click(sw);
    expect(store.has('recipe-lab-weigh-volumes')).toBe(false);
  });
});

describe('Settings: analytics switch', () => {
  it('is hidden when PostHog is not configured', () => {
    render();
    expect(screen.queryByRole('switch', { name: /analytics/ })).toBeNull();
  });

  it('is a switch named for the setting, sized 44x26, and Space toggles it', async () => {
    consent = { configured: true, granted: false };
    render();
    const sw = screen.getByRole('switch', { name: 'Privacy: allow analytics' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    const track = sw.querySelector('span[aria-hidden]') as HTMLElement;
    expect(track.className).toContain('w-11');
    expect(track.className).toContain('h-[26px]');
    expect(track.className).toContain('bg-neutral-400');
    expect(sw.className).toContain('min-h-11');
    sw.focus();
    await userEvent.keyboard(' ');
    expect(setConsent).toHaveBeenCalledWith(true);
  });

  it('shows on with the accent track, and toggling off sends false', async () => {
    consent = { configured: true, granted: true };
    render();
    const sw = screen.getByRole('switch', { name: 'Privacy: allow analytics' });
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect((sw.querySelector('span[aria-hidden]') as HTMLElement).className).toContain('bg-accent-2-600');
    fireEvent.click(sw);
    expect(setConsent).toHaveBeenCalledWith(false);
  });
});

describe('Settings: Notify me when', () => {
  it('shows no card signed out or unverified', () => {
    user = null;
    const { unmount } = render();
    expect(screen.queryByText('Notify me when')).toBeNull();
    unmount();
    user = anon;
    render();
    expect(screen.queryByRole('switch', { name: 'Someone follows me' })).toBeNull();
  });

  it('shows three switches, all on, and writes the whole document on toggle', async () => {
    user = member;
    setPrefsDoc.mockClear();
    render();
    expect(screen.getAllByRole('switch').filter((x) => x.getAttribute('aria-checked') === 'true')).toHaveLength(3);
    await userEvent.click(screen.getByRole('switch', { name: 'Someone follows me' }));
    expect(setPrefsDoc).toHaveBeenCalledWith('u1', { branch: true, suggestion: true, follow: false });
    expect(screen.getByRole('switch', { name: 'Someone follows me' })).toHaveAttribute('aria-checked', 'false');
  });

  it('reverts and says so when the write fails', async () => {
    user = member;
    setPrefsDoc.mockRejectedValueOnce(new Error('denied'));
    render();
    await userEvent.click(screen.getByRole('switch', { name: 'I get a suggestion' }));
    expect(await screen.findByText(/Couldn't save that\. Try again\. \(I get a suggestion\)/)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'I get a suggestion' })).toHaveAttribute('aria-checked', 'true');
  });

  it('disables the switches and marks them busy until the stored document arrives', () => {
    user = member;
    prefsLoads = false;
    try {
      render();
      const sw = screen.getByRole('switch', { name: 'Someone follows me' });
      expect(sw).toBeDisabled();
      expect(sw).toHaveAttribute('aria-busy', 'true');
    } finally {
      prefsLoads = true;
    }
  });

  it('keeps the switches disabled and says so when the stored choices could not be read', () => {
    user = member;
    prefsFails = true;
    try {
      render();
      expect(screen.getByRole('switch', { name: 'Someone follows me' })).toBeDisabled();
      expect(screen.getByText("Couldn't load your choices. Reopen Settings to try again.")).toBeInTheDocument();
    } finally {
      prefsFails = false;
    }
  });
});
