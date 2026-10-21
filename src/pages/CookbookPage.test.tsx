// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders, fakeUser } from '../test/renderWithProviders';
import { COOKBOOK_PAGE_SIZE } from '../lib/cookbook';
import type { AppUser } from '../types/recipe';

const getPublicCookbook = vi.fn();
const getPublishedRecipe = vi.fn();
const isFollowingCookbook = vi.fn();
const setCookbookFollow = vi.fn();

vi.mock('../services/firestore', () => ({
  getPublicCookbook: (...a: unknown[]) => getPublicCookbook(...a),
  getPublishedRecipe: (...a: unknown[]) => getPublishedRecipe(...a),
  isFollowingCookbook: (...a: unknown[]) => isFollowingCookbook(...a),
  markCookbookSeen: async () => {},
  setCookbookFollow: (...a: unknown[]) => setCookbookFollow(...a),
}));
vi.mock('../services/telemetry', () => ({ reportError: vi.fn() }));
vi.mock('../hooks/useProfile', () => ({ usePublicProfile: () => ({ profile: { displayName: 'Hana' }, isLoading: false, error: false }) }));

import { CookbookPage } from './CookbookPage';

const ready = (over: Record<string, unknown> = {}) => ({
  status: 'ready',
  cookbook: { id: 'c1', ownerUid: 'hana', name: 'Weeknights', description: 'Fast and good.', recipeIds: ['r1', 'r2'], visibility: 'public', followerCount: 3, ...over },
});

function open(user: AppUser | null = fakeUser) {
  return renderWithProviders(
    <Routes>
      <Route path="/c/:id" element={<CookbookPage />} />
    </Routes>,
    { user, route: '/c/c1' }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom has no dialog behaviour.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  getPublicCookbook.mockResolvedValue(ready());
  getPublishedRecipe.mockImplementation(async (id: string) =>
    id === 'r1' ? { id, title: 'Soup', emoji: '🍲', parentId: null } : { id, title: 'Soup 2', emoji: '🥣', parentId: 'r1', prompt: 'Less sugar' }
  );
  isFollowingCookbook.mockResolvedValue(false);
  setCookbookFollow.mockResolvedValue(undefined);
});

describe('CookbookPage', () => {
  it('renders a public cookbook signed out, with the recipes and no lookup of a follow', async () => {
    open(null);
    expect(await screen.findByRole('heading', { name: 'Weeknights' })).toBeTruthy();
    expect(screen.getByText('Fast and good.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Hana' }).getAttribute('href')).toBe('/profile/hana');
    expect(await screen.findByText('Original')).toBeTruthy();
    expect(screen.getByText('Less sugar branch')).toBeTruthy();
    expect(screen.getByText('3 followers')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to Recipe Lab' }).getAttribute('href')).toBe('/');
    expect(isFollowingCookbook).not.toHaveBeenCalled();
  });

  it('shows one not-available state for private and missing', async () => {
    getPublicCookbook.mockResolvedValue({ status: 'unavailable' });
    open();
    expect(await screen.findByText("This cookbook isn't available")).toBeTruthy();
    expect(screen.queryByRole('button', { name: /follow/i })).toBeNull();
  });

  it('offers a retry when the read fails', async () => {
    getPublicCookbook.mockRejectedValueOnce(new Error('offline'));
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Weeknights' })).toBeTruthy();
  });

  it('signed out, Follow opens the sign-in sheet and writes nothing', async () => {
    open(null);
    fireEvent.click(await screen.findByRole('button', { name: /Follow this cookbook/ }));
    expect(await screen.findByText('Sign in to follow this cookbook')).toBeTruthy();
    expect(setCookbookFollow).not.toHaveBeenCalled();
  });

  it('follows and unfollows verified, moving the count', async () => {
    open();
    await screen.findByRole('button', { name: /Follow this cookbook/ });
    await waitFor(() => expect((screen.getByRole('button', { name: /Follow this cookbook/ }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: /Follow this cookbook/ }));
    expect(await screen.findByRole('button', { name: /Following/ })).toBeTruthy();
    expect(setCookbookFollow).toHaveBeenCalledWith('test-user', 'c1', true, 3);
    expect(screen.getByText('4 followers')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Following/ }));
    expect(await screen.findByText('3 followers')).toBeTruthy();
    expect(setCookbookFollow).toHaveBeenLastCalledWith('test-user', 'c1', false, 4);
  });

  it('keeps Follow disabled until the lookup answers, and offers a retry when it fails', async () => {
    isFollowingCookbook.mockRejectedValueOnce(new Error('offline'));
    open();
    const btn = (await screen.findByRole('button', { name: /Follow this cookbook/ })) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect((screen.getByRole('button', { name: /Follow this cookbook/ }) as HTMLButtonElement).disabled).toBe(false));
  });

  it('announces a still-loading tile as loading, not as gone', async () => {
    getPublishedRecipe.mockReturnValue(new Promise(() => {}));
    open();
    expect((await screen.findAllByText('Loading recipe')).length).toBe(2);
    expect(screen.queryByText(/no longer available/)).toBeNull();
  });

  it('starts as Following when the follow exists', async () => {
    isFollowingCookbook.mockResolvedValue(true);
    open();
    expect(await screen.findByRole('button', { name: /Following/ })).toBeTruthy();
  });

  it('shows a failure like profile Follow and keeps the state', async () => {
    setCookbookFollow.mockRejectedValue(new Error('denied'));
    open();
    await screen.findByRole('button', { name: /Follow this cookbook/ });
    await waitFor(() => expect((screen.getByRole('button', { name: /Follow this cookbook/ }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: /Follow this cookbook/ }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('3 followers')).toBeTruthy();
  });

  it('reads recipes a page at a time', async () => {
    const recipeIds = Array.from({ length: COOKBOOK_PAGE_SIZE + 5 }, (_, i) => `r${i}`);
    getPublicCookbook.mockResolvedValue(ready({ recipeIds }));
    open();
    await screen.findByRole('heading', { name: 'Weeknights' });
    await waitFor(() => expect(getPublishedRecipe).toHaveBeenCalledTimes(COOKBOOK_PAGE_SIZE));
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    await waitFor(() => expect(getPublishedRecipe).toHaveBeenCalledTimes(COOKBOOK_PAGE_SIZE + 5));
  });
});
