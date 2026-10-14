// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders, fakeUser } from '../test/renderWithProviders';
import type { AppUser } from '../types/recipe';

const followUser = vi.fn();
const updateAvatar = vi.fn();
vi.mock('../services/firestore', () => ({
  isFollowing: vi.fn(async () => false),
  followUser: (...a: unknown[]) => followUser(...a),
  unfollowUser: vi.fn(),
  getFollowingIds: vi.fn(async () => []),
  getFollowingProfiles: vi.fn(async () => []),
  getFollowers: vi.fn(async () => []),
}));
vi.mock('../services/firebase', () => ({ isFirebaseConfigured: true }));
vi.mock('../services/analytics', () => ({ trackFollowToggled: vi.fn() }));
vi.mock('../services/telemetry', () => ({ reportError: vi.fn() }));
vi.mock('../hooks/useProfile', () => ({
  useOwnProfile: () => ({ profile: null, updateAvatar, updateName: vi.fn() }),
  usePublicProfile: () => ({
    profile: { uid: 'chef', displayName: 'Chef', photoType: 'generated', followerCount: 0 },
    isLoading: false,
    error: false,
    retry: () => {},
  }),
}));
vi.mock('../hooks/useUserRecipes', () => ({
  useOwnRecipes: () => ({ recipes: [], stats: { totalViews: 0, totalFavorites: 0 }, isLoading: false }),
  useUserRecipes: () => ({ recipes: [], stats: { totalViews: 0, totalFavorites: 0 }, isLoading: false }),
}));

import { ProfilePage } from './ProfilePage';

const anon: AppUser = { uid: 'anon-1', displayName: 'CrispyWaffle', email: null, isAnonymous: true, emailVerified: false };

function renderAt(route: string, user: AppUser | null) {
  return renderWithProviders(
    <Routes>
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/profile/:uid" element={<ProfilePage />} />
    </Routes>,
    { route, user }
  );
}

beforeAll(() => {
  // jsdom has no <dialog> modal support.
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
beforeEach(() => followUser.mockClear());

describe('ProfilePage sign-up gates', () => {
  it.each([
    ['anonymous', anon],
    ['signed-out', null],
  ])('Follow opens the sign-up call to action for a %s visitor', (_label, user) => {
    renderAt('/profile/chef', user);
    fireEvent.click(screen.getByRole('button', { name: 'Follow' }));
    expect(screen.getByRole('heading', { name: 'Sign up to follow Chef' })).toBeInTheDocument();
    expect(followUser).not.toHaveBeenCalled();
  });

  it('Follow writes for a verified account', () => {
    renderAt('/profile/chef', fakeUser);
    fireEvent.click(screen.getByRole('button', { name: 'Follow' }));
    expect(followUser).toHaveBeenCalledWith(fakeUser.uid, 'chef', fakeUser.displayName);
  });

  it('routes an anonymous account editing its avatar or name to sign-up', () => {
    renderAt('/profile', anon);
    fireEvent.click(screen.getByRole('button', { name: 'Change avatar' }));
    expect(screen.getByRole('heading', { name: 'Sign up to edit your profile' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Edit display name/ }));
    expect(screen.queryByPlaceholderText('Display name')).not.toBeInTheDocument();
    expect(updateAvatar).not.toHaveBeenCalled();
  });
});
