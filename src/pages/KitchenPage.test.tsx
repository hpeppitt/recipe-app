// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { renderWithProviders, fakeUser } from '../test/renderWithProviders';

type Line = { id: string; name: string; amount: number | null; unit: string | null; aisle: string; sources: never[]; done: boolean };
const line = (name: string): Line => ({ id: name, name, amount: null, unit: null, aisle: 'Other', sources: [], done: false });
type Member = { uid: string; name: string | null; avatar: null };
let hook: {
  kitchen: { shopping: Line[]; pantry: { id: string; name: string }[]; ownerUid?: string } | null;
  loading: boolean;
  error?: string | null;
  members?: Member[];
  isOwner?: boolean;
} = { kitchen: null, loading: false };
const createInvite = vi.fn();
const removeMember = vi.fn();
const leaveKitchen = vi.fn();
let savedLoading = false;
let saved: { id: string; title: string; emoji: string }[] = [];
let collections: { id: string; name: string; recipeIds: string[] }[] = [];
const countUserCooks = vi.fn();
let collectionsError: string | null = null;
const retryCollections = vi.fn();
vi.mock('../hooks/useCollections', () => ({
  COLLECTIONS_LOAD_FAILED_MESSAGE: 'load failed',
  useCollections: () => ({ collections, error: collectionsError, retry: retryCollections }),
}));
vi.mock('../db/database', () => ({ db: { recipes: { bulkGet: async () => [{ id: 'a', emoji: '🍜' }] } } }));
vi.mock('../hooks/useKitchen', () => ({ useKitchen: () => ({ members: [], isOwner: false, createInvite, removeMember, leaveKitchen, ...hook }) }));
vi.mock('../hooks/useSavedFavorites', () => ({ useSavedFavorites: () => ({ rows: saved, isLoading: savedLoading }) }));
vi.mock('../services/firestore', () => ({ countUserCooks: (...a: unknown[]) => countUserCooks(...a) }));
vi.mock('../services/firebase', () => ({ isFirebaseConfigured: true }));

import { KitchenPage } from './KitchenPage';

// Stands in for the recipe route and shows the list origin the link carried (RL-225).
function Origin() {
  return <p data-testid="origin">{(useLocation().state as { listOrigin?: string } | null)?.listOrigin}</p>;
}

beforeAll(() => {
  // jsdom has no showModal/close; mirror the open attribute.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute('open'); };
});

const me: Member = { uid: fakeUser.uid, name: 'Test Cook', avatar: null };
const ola: Member = { uid: 'ola', name: 'Ola', avatar: null };
const sami: Member = { uid: 'sami', name: 'Sami', avatar: null };

beforeEach(() => {
  hook = { kitchen: { shopping: [line('milk'), line('eggs')], pantry: [{ id: 'p', name: 'salt' }], ownerUid: fakeUser.uid }, loading: false };
  createInvite.mockReset().mockResolvedValue('https://app.test/join/abcdefghijABCDEFGHIJ');
  removeMember.mockReset().mockResolvedValue(undefined);
  leaveKitchen.mockReset().mockResolvedValue(undefined);
  saved = [];
  collections = [];
  collectionsError = null;
  savedLoading = false;
  countUserCooks.mockReset().mockResolvedValue(14);
});

describe('KitchenPage (RL-214)', () => {
  it('opens a Saved tile with Kitchen as its origin', () => {
    saved = [{ id: 'r1', title: 'Dal', emoji: '🍲' }];
    renderWithProviders(
      <Routes>
        <Route path="/kitchen" element={<KitchenPage />} />
        <Route path="/recipe/:id" element={<Origin />} />
      </Routes>,
      { route: '/kitchen' }
    );
    fireEvent.click(screen.getByRole('link', { name: 'Dal' }));
    expect(screen.getByTestId('origin')).toHaveTextContent('/kitchen');
  });

  it('shows the counts, with Shopping list and Cook log the linked tiles', async () => {
    renderWithProviders(<KitchenPage />);
    expect(screen.getByText('2 to buy')).toBeInTheDocument();
    expect(screen.getByText('1 thing')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Shopping list/ })).toHaveAttribute('href', '/kitchen/list');
    expect(screen.getByRole('link', { name: /Pantry/ })).toHaveAttribute('href', '/kitchen/pantry');
    expect(await screen.findByRole('link', { name: /Cook log.*14 cooks/ })).toHaveAttribute('href', '/kitchen/log');
    expect(countUserCooks).toHaveBeenCalledWith(fakeUser.uid);
  });

  it('shows a dash for the cook count while it is unavailable', async () => {
    countUserCooks.mockRejectedValue(new Error('x'));
    renderWithProviders(<KitchenPage />);
    await waitFor(() => expect(countUserCooks).toHaveBeenCalled());
    expect(screen.getByRole('link', { name: /Cook log.*–/ })).toBeInTheDocument();
  });

  it('shows the error state when the kitchen cannot load', () => {
    hook = { kitchen: null, loading: false, error: 'x' };
    renderWithProviders(<KitchenPage />);
    expect(screen.getByText("Couldn't load your kitchen")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows saved skeletons while loading, and no empty line', () => {
    savedLoading = true;
    renderWithProviders(<KitchenPage />);
    expect(screen.getByRole('status', { name: 'Loading saved recipes' })).toBeInTheDocument();
    expect(screen.queryByText(/Tap the bookmark/)).toBeNull();
  });

  it('words the card by state', () => {
    const a = renderWithProviders(<KitchenPage />, { user: { ...fakeUser, emailVerified: false } });
    expect(screen.getByText('Verify your email to keep a shopping list and pantry')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
    a.unmount();
    renderWithProviders(<KitchenPage />, { user: null, auth: { isConfigured: false } });
    expect(screen.getByText('Kitchen needs an online account')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
  });

  it('keeps This week as a disabled tile, not a link', () => {
    renderWithProviders(<KitchenPage />);
    const tile = screen.getByText('This week').closest('[aria-disabled="true"]');
    expect(tile).not.toBeNull();
    expect(tile?.closest('a')).toBeNull();
    expect(screen.getByText('Soon')).toBeInTheDocument();
  });

  it('shows skeleton tiles until the kitchen arrives', () => {
    hook = { kitchen: null, loading: true };
    renderWithProviders(<KitchenPage />);
    expect(screen.getByRole('status', { name: 'Loading kitchen' })).toBeInTheDocument();
    expect(screen.queryByText('Pantry')).toBeNull();
  });

  it('lists saved recipes with See all, or the empty line', () => {
    saved = [{ id: 'r1', title: 'Dal', emoji: '🍲' }];
    const { unmount } = renderWithProviders(<KitchenPage />);
    expect(screen.getByRole('link', { name: 'Dal' })).toHaveAttribute('href', '/recipe/r1');
    expect(screen.getByRole('link', { name: 'See all' })).toHaveAttribute('href', '/saved');
    unmount();
    saved = [];
    renderWithProviders(<KitchenPage />);
    expect(screen.getByText("Tap the bookmark on any recipe and it'll wait for you here.")).toBeInTheDocument();
  });

  it('asks signed-out users to sign in, and still shows the Saved row', () => {
    saved = [{ id: 'r1', title: 'Dal', emoji: '🍲' }];
    renderWithProviders(<KitchenPage />, { user: null });
    expect(screen.getByText('Sign in to keep a shopping list and pantry')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByText('Pantry')).toBeNull();
    expect(screen.getByRole('link', { name: 'Dal' })).toBeInTheDocument();
    expect(countUserCooks).not.toHaveBeenCalled();
  });

  it('shows a retry when the collections listener fails and none are shown', () => {
    collectionsError = 'load failed';
    renderWithProviders(<KitchenPage />);
    expect(screen.getByRole('heading', { name: 'Collections' })).toBeInTheDocument();
    expect(screen.getByText("Couldn't load collections")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retryCollections).toHaveBeenCalled();
  });

  it('lists collections under Saved with a link each, and hides the section when there are none', async () => {
    renderWithProviders(<KitchenPage />);
    expect(screen.queryByText('Collections')).toBeNull();
    cleanup();
    collections = [{ id: 'c1', name: 'Weeknights', recipeIds: ['a', 'b'] }];
    renderWithProviders(<KitchenPage />);
    expect(screen.getByRole('heading', { name: 'Collections' })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Weeknights/ });
    expect(link).toHaveAttribute('href', '/kitchen/c/c1');
    expect(link).toHaveTextContent('2 recipes');
    expect(await screen.findByText('🍜', { exact: false })).toBeInTheDocument();
  });
});

describe('KitchenPage household (RL-239)', () => {
  it('says Just you, with an Invite for the owner', () => {
    hook = { ...hook, members: [me], isOwner: true };
    renderWithProviders(<KitchenPage />);
    expect(screen.getByText('Just you')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Invite' })).toBeInTheDocument();
  });

  it('names the others under the title and labels the avatar stack the same way', () => {
    hook = { ...hook, members: [me, ola, sami], isOwner: true };
    renderWithProviders(<KitchenPage />);
    expect(screen.getByText('Shared with Ola and Sami')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Shared with Ola and Sami' })).toBeInTheDocument();
  });

  it('shows no household pieces while signed out', () => {
    renderWithProviders(<KitchenPage />, { user: null });
    expect(screen.queryByText('Just you')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Invite' })).toBeNull();
  });

  it('Invite makes a link and shares it, copying where there is no Web Share', async () => {
    hook = { ...hook, members: [me], isOwner: true };
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderWithProviders(<KitchenPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));
    expect(await screen.findByText('Anyone with this link can join for 7 days.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Share link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://app.test/join/abcdefghijABCDEFGHIJ'));
    expect(await screen.findByText('Link copied')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));
    await screen.findByText('Anyone with this link can join for 7 days.');
    expect(screen.queryByText('Link copied')).toBeNull();
  });

  it('copies when Web Share fails, but not when it is cancelled', async () => {
    hook = { ...hook, members: [me], isOwner: true };
    const writeText = vi.fn().mockResolvedValue(undefined);
    const share = vi.fn().mockRejectedValueOnce(new DOMException('cancel', 'AbortError')).mockRejectedValueOnce(new Error('NotAllowed'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    try {
      renderWithProviders(<KitchenPage />);
      fireEvent.click(screen.getByRole('button', { name: 'Invite' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Share link' }));
      await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
      expect(writeText).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Share link' }));
      await waitFor(() => expect(writeText).toHaveBeenCalled());
      expect(await screen.findByText('Link copied')).toBeInTheDocument();
    } finally {
      delete (navigator as { share?: unknown }).share;
    }
  });

  it('a failed invite offers Try again', async () => {
    hook = { ...hook, members: [me], isOwner: true };
    createInvite.mockRejectedValueOnce(new Error('Only the kitchen owner can do that.'));
    renderWithProviders(<KitchenPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Only the kitchen owner can do that.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Anyone with this link can join for 7 days.')).toBeInTheDocument();
  });

  it('the owner removes a member after confirming', async () => {
    hook = { ...hook, members: [me, ola], isOwner: true };
    renderWithProviders(<KitchenPage />);
    fireEvent.click(screen.getByRole('button', { name: 'People. Shared with Ola' }));
    expect(screen.queryByRole('button', { name: 'Leave this kitchen' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Ola' }));
    const dialog = screen.getByRole('dialog', { name: 'Remove Ola?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(removeMember).toHaveBeenCalledWith('ola'));
    expect(await screen.findByText('Removed Ola')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'People' })).toHaveFocus();
  });

  it('a member leaves after confirming, and sees no Invite or Remove', async () => {
    hook = { ...hook, kitchen: { ...hook.kitchen!, ownerUid: 'ola' }, members: [ola, me], isOwner: false };
    renderWithProviders(<KitchenPage />);
    expect(screen.queryByRole('button', { name: 'Invite' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'People. Shared with Ola' }));
    expect(screen.queryByRole('button', { name: 'Remove Ola' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Leave this kitchen' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Leave this kitchen?' })).getByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(leaveKitchen).toHaveBeenCalled());
    expect(await screen.findByText('You left the kitchen')).toBeInTheDocument();
  });

  it("shows the hook's copy when leaving fails", async () => {
    leaveKitchen.mockRejectedValue(new Error("Couldn't update your household. Check your connection and try again."));
    hook = { ...hook, kitchen: { ...hook.kitchen!, ownerUid: 'ola' }, members: [ola, me], isOwner: false };
    renderWithProviders(<KitchenPage />);
    fireEvent.click(screen.getByRole('button', { name: 'People. Shared with Ola' }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave this kitchen' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Leave this kitchen?' })).getByRole('button', { name: 'Leave' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't update your household");
    fireEvent(screen.getByRole('dialog', { name: 'People' }), new Event('cancel', { cancelable: true }));
    fireEvent.click(screen.getByRole('button', { name: 'People. Shared with Ola' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it("toasts You're in Hana's kitchen after a join", () => {
    renderWithProviders(<KitchenPage />, { route: { pathname: '/', state: { joined: 'Hana' } } });
    expect(screen.getByText("You're in Hana's kitchen")).toBeInTheDocument();
  });
});
