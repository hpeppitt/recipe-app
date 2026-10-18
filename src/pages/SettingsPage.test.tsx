// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders, fakeUser } from '../test/renderWithProviders';

let user: typeof fakeUser | null = null;
const anon = { ...fakeUser, uid: 'u1', isAnonymous: true, emailVerified: false };
const member = { ...fakeUser, uid: 'u1' };
const render = () => renderWithProviders(<SettingsPage />, { user });
vi.mock('../services/firebase', () => ({ isFirebaseConfigured: true }));
const fetchCloud = vi.fn();
vi.mock('../services/firestore', () => ({ fetchCloudDataForExport: (...a: unknown[]) => fetchCloud(...a) }));
const exportRecipes = vi.fn(async (): Promise<unknown[]> => []);
vi.mock('../db/recipes', () => ({
  exportAllRecipes: () => exportRecipes(),
  importRecipes: vi.fn(),
  clearAllRecipes: vi.fn(),
}));
vi.mock('../db/favorites', () => ({ exportAllFavorites: async () => [{ uid: 'u1', recipeId: 'r', createdAt: 1 }] }));

import { SettingsPage } from './SettingsPage';

const ok = { data: null };
const allOk = { profile: ok, recipes: { data: [] }, favorites: { data: [] }, follows: { data: [] }, suggestions: { data: [] }, notifications: { data: [] }, termsAcceptance: ok, writeWindows: { data: [] } };

let blobs: Blob[];
let downloadName: string | undefined;
beforeEach(() => {
  fetchCloud.mockReset();
  exportRecipes.mockClear();
  blobs = [];
  downloadName = undefined;
  window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  URL.createObjectURL = (b: Blob) => (blobs.push(b), 'blob:x');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloadName = this.download;
  });
});

describe('Settings: theme', () => {
  it('has no Theme control (light only since RL-065)', () => {
    render();
    expect(screen.queryByText('Theme')).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Dark' })).toBeNull();
  });
});

describe('Settings: Download my data', () => {
  it('is labelled local-only for an anonymous user and reads no cloud data', async () => {
    user = anon;
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Download my data (this device only)' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/downloaded/));
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
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/downloaded/));
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
    fetchCloud.mockResolvedValue({ profile: e, recipes: e, favorites: e, follows: e, suggestions: e, notifications: e, termsAcceptance: e, writeWindows: e });
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Download my data' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/could not be loaded/));
    expect(JSON.parse(await blobs[0].text()).errors).toHaveLength(8);
  });

  it('notes a partial failure without an alert', async () => {
    user = member;
    fetchCloud.mockResolvedValue({ ...allOk, suggestions: { error: 'permission-denied' } });
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Download my data' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/some of your online data \(suggestions\) could not be included/));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('starts one export for a double tap', async () => {
    user = member;
    fetchCloud.mockResolvedValue(allOk);
    render();
    const btn = screen.getByRole('button', { name: 'Download my data' });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/downloaded/));
    expect(fetchCloud).toHaveBeenCalledTimes(1);
    expect(blobs).toHaveLength(1);
  });

  it('tells an unverified user to verify, in plain words', async () => {
    user = { ...member, emailVerified: false };
    fetchCloud.mockResolvedValue({ ...allOk, suggestions: { error: 'Verify your email to include suggestions' } });
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Download my data' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Verify your email to include suggestions\./));
    expect(screen.getByRole('status').textContent).not.toMatch(/Try again later/);
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
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/downloaded/));
  });

  it('revokes the object URL after a delay, not at once', async () => {
    user = member;
    fetchCloud.mockResolvedValue(allOk);
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Download my data' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/downloaded/));
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x'), { timeout: 2000 });
  });

  it('explains how it differs from Export All Recipes', () => {
    user = member;
    render();
    expect(screen.getByText(/To move recipes between devices, use Export All Recipes/)).toBeTruthy();
  });
});

describe('Settings: Delete Recipes on This Device copy', () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Delete Recipes on This Device' }));
    const dialog = screen.getByRole('dialog');
    expect(reloadText.test(dialog.textContent ?? '')).toBe(verified);
    expect(/cannot be undone/.test(dialog.textContent ?? '')).toBe(!verified);
  });
});
