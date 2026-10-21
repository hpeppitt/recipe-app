// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { renderWithProviders, fakeUser } from '../test/renderWithProviders';
import { ALREADY_IN_KITCHEN_MESSAGE, INVITE_EXPIRED_MESSAGE, OWNER_HAS_MEMBERS_MESSAGE } from '../lib/kitchen';

const joinKitchen = vi.fn();
const getKitchenInvite = vi.fn();
const getProfile = vi.fn();
vi.mock('../hooks/useKitchen', () => ({ useKitchen: () => ({ joinKitchen }) }));
vi.mock('../services/firestore', () => ({
  getKitchenInvite: (...a: unknown[]) => getKitchenInvite(...a),
  getProfile: (...a: unknown[]) => getProfile(...a),
}));
vi.mock('../services/firebase', () => ({ isFirebaseConfigured: true }));

import { JoinKitchenPage } from './JoinKitchenPage';

const CODE = 'abcdefghijABCDEFGHIJ';

beforeAll(() => {
  // jsdom has no showModal/close; mirror the open attribute.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute('open'); };
});

beforeEach(() => {
  joinKitchen.mockReset().mockResolvedValue(undefined);
  getKitchenInvite.mockReset().mockResolvedValue({ code: CODE, kitchenId: 'hana', ownerUid: 'hana', expiresAt: Date.now() + 86_400_000 });
  getProfile.mockReset().mockResolvedValue({ uid: 'hana', displayName: 'Hana' });
});

function Landing() {
  const joined = (useLocation().state as { joined?: string } | null)?.joined;
  return <p data-testid="kitchen">{joined}</p>;
}

const renderAt = (code: string, opts: Parameters<typeof renderWithProviders>[1] = {}) =>
  renderWithProviders(
    <Routes>
      <Route path="/join/:code" element={<JoinKitchenPage />} />
      <Route path="/kitchen" element={<Landing />} />
      <Route path="/" element={<p>Explore</p>} />
    </Routes>,
    { route: `/join/${code}`, ...opts }
  );

describe('JoinKitchenPage (RL-239)', () => {
  it('names the inviter from their profile and joins, landing on Kitchen with the toast name', async () => {
    renderAt(CODE);
    expect(await screen.findByRole('heading', { name: "Join Hana's kitchen" })).toBeInTheDocument();
    expect(screen.getByText('Share a shopping list and pantry with Hana.')).toBeInTheDocument();
    expect(getProfile).toHaveBeenCalledWith('hana');
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    await waitFor(() => expect(screen.getByTestId('kitchen')).toHaveTextContent('Hana'));
    expect(joinKitchen).toHaveBeenCalledWith(CODE);
  });

  it('shows the expired state for a malformed code without reading anything', () => {
    renderAt('bad');
    expect(screen.getByRole('heading', { name: 'This invite has expired' })).toBeInTheDocument();
    expect(screen.getByText('Ask whoever sent it for a new link.')).toBeInTheDocument();
    expect(getKitchenInvite).not.toHaveBeenCalled();
  });

  it('shows the expired state for a missing or past invite', async () => {
    getKitchenInvite.mockResolvedValue({ code: CODE, kitchenId: 'hana', ownerUid: 'hana', expiresAt: Date.now() - 1 });
    renderAt(CODE);
    expect(await screen.findByRole('heading', { name: 'This invite has expired' })).toBeInTheDocument();
  });

  it('turns a join refused as expired into the expired state', async () => {
    joinKitchen.mockRejectedValue(new Error(INVITE_EXPIRED_MESSAGE));
    renderAt(CODE);
    fireEvent.click(await screen.findByRole('button', { name: 'Join' }));
    expect(await screen.findByRole('heading', { name: 'This invite has expired' })).toBeInTheDocument();
    expect(screen.getByText('Ask Hana for a new link.')).toBeInTheDocument();
  });

  it.each([ALREADY_IN_KITCHEN_MESSAGE, OWNER_HAS_MEMBERS_MESSAGE])('replaces Join with Go to Kitchen when refused: %s', async (message) => {
    joinKitchen.mockRejectedValue(new Error(message));
    renderAt(CODE);
    fireEvent.click(await screen.findByRole('button', { name: 'Join' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(message);
    expect(alert).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Join' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Go to Kitchen' }));
    expect(screen.getByTestId('kitchen')).toBeInTheDocument();
  });

  it('keeps Join after a failure it can retry', async () => {
    joinKitchen.mockRejectedValueOnce(new Error("Couldn't update your household. Check your connection and try again."));
    renderAt(CODE);
    fireEvent.click(await screen.findByRole('button', { name: 'Join' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Join' })).toBeEnabled();
  });

  it('offers a retry when the invite cannot be read', async () => {
    getKitchenInvite.mockRejectedValueOnce(new Error('offline'));
    renderAt(CODE);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: "Join Hana's kitchen" })).toBeInTheDocument();
  });

  it('asks a signed-out visitor to sign in, without reading the invite', async () => {
    renderAt(CODE, { user: null });
    expect(screen.getByRole('heading', { name: 'Join a kitchen' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to join' }));
    expect(await screen.findByRole('heading', { name: 'Sign in to join this kitchen' })).toBeInTheDocument();
    expect(getKitchenInvite).not.toHaveBeenCalled();
  });

  it('asks an unverified account to verify, without reading the invite', () => {
    renderAt(CODE, { user: { ...fakeUser, emailVerified: false } });
    expect(screen.getByRole('heading', { name: 'Verify your email to join' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verify your email' })).toBeInTheDocument();
    expect(getKitchenInvite).not.toHaveBeenCalled();
  });

  it('Not now goes home', async () => {
    renderAt(CODE);
    await screen.findByRole('heading', { name: "Join Hana's kitchen" });
    // The first is the join sheet's; the sign-in sheet (closed) has its own.
    fireEvent.click(screen.getAllByRole('button', { name: 'Not now' })[0]);
    expect(screen.getByText('Explore')).toBeInTheDocument();
  });

  it("says when it is the owner's own link", async () => {
    getKitchenInvite.mockResolvedValue({ code: CODE, kitchenId: fakeUser.uid, ownerUid: fakeUser.uid, expiresAt: Date.now() + 1000 });
    renderAt(CODE);
    expect(await screen.findByRole('heading', { name: 'This is your own invite' })).toBeInTheDocument();
  });
});
