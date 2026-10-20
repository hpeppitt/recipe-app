// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, act, within, waitFor } from '@testing-library/react';
import { Routes, Route, Link } from 'react-router-dom';
import { renderWithProviders, fakeUser } from '../test/renderWithProviders';
import type { AppUser, Recipe } from '../types/recipe';
import { makeRecipe } from '../test/factories';

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
  useOwnProfile: () => ({ profile: ownProfile, loaded: ownLoaded, updateAvatar, updateName: vi.fn() }),
  usePublicProfile: () => publicProfile,
}));
const chefProfile = { uid: 'chef', displayName: 'Chef', photoType: 'generated', followerCount: 3, followingCount: 5 };
const retryProfile = vi.fn();
let publicProfile: { profile: typeof chefProfile | null; isLoading: boolean; error: boolean; retry: () => void } = {
  profile: chefProfile,
  isLoading: false,
  error: false,
  retry: retryProfile,
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let chefRecipes: Record<string, any>[] = [];
let chefLoading = false;
let syncStatus = 'off';
let rows: Recipe[] | undefined = [];
let ownLoaded = true;
let ownProfile: { createdAt: number; followerCount: number; followingCount: number } | null = null;
vi.mock('../hooks/useOwnRecipesSync', () => ({ useOwnRecipesSyncStatus: () => syncStatus }));
let statsStatus = 'ready';
let totals = { totalViews: 0, totalFavorites: 0 };
vi.mock('../hooks/useRecipeLibrary', () => ({ useLocalLibrary: () => rows }));
vi.mock('../hooks/useUserRecipes', () => ({
  useOwnRecipes: () => ({ recipes: [], stats: totals, statsStatus, isLoading: false }),
  useUserRecipes: () => ({ recipes: chefRecipes, stats: { totalViews: 0, totalFavorites: chefRecipes.reduce((n, r) => n + (r.favoriteCount ?? 0), 0) }, isLoading: chefLoading }),
}));

const retryCollabs = vi.fn();
let collabs: { status: string; recipes: Record<string, unknown>[]; truncated: boolean; retry: () => void } = { status: 'ready', recipes: [], truncated: false, retry: retryCollabs };
const useCollabRecipes = vi.fn((_uid?: string, _enabled?: boolean) => collabs);
vi.mock('../hooks/useCollabRecipes', () => ({ useCollabRecipes: (u?: string, e?: boolean) => useCollabRecipes(u, e) }));

import { ProfilePage } from './ProfilePage';

const anon: AppUser = { uid: 'anon-1', displayName: 'CrispyWaffle', email: null, isAnonymous: true, emailVerified: false };

const verified: AppUser = { ...anon, uid: 'v-1', isAnonymous: false, emailVerified: true, email: 'v@example.com' };

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
beforeEach(() => {
  followUser.mockClear();
  syncStatus = 'off';
  publicProfile = { profile: chefProfile, isLoading: false, error: false, retry: retryProfile };
  chefRecipes = [];
  chefLoading = false;
  collabs = { status: 'ready', recipes: [], truncated: false, retry: retryCollabs };
  useCollabRecipes.mockClear();
  retryCollabs.mockClear();
  retryProfile.mockClear();
  rows = [];
  ownProfile = null;
  ownLoaded = true;
  statsStatus = 'ready';
  totals = { totalViews: 0, totalFavorites: 0 };
});

describe('ProfilePage sign-up gates', () => {
  it.each([
    ['anonymous', anon],
    ['signed-out', null],
  ])('Follow opens the sign-up call to action for a %s visitor', (_label, user) => {
    renderAt('/profile/chef', user);
    fireEvent.click(screen.getByRole('button', { name: 'Follow Chef' }));
    expect(screen.getByRole('heading', { name: 'Sign in to follow Chef' })).toBeInTheDocument();
    // The guest option exists only in AuthModal; an anonymous account cannot follow.
    expect(screen.queryByRole('button', { name: 'Continue without an account' })).toBeNull();
    expect(followUser).not.toHaveBeenCalled();
  });

  it('Follow writes for a verified account', () => {
    renderAt('/profile/chef', fakeUser);
    fireEvent.click(screen.getByRole('button', { name: 'Follow Chef' }));
    expect(followUser).toHaveBeenCalledWith(fakeUser.uid, 'chef', fakeUser.displayName);
  });

  it('shows the follow error under the Follow button when the write fails', async () => {
    followUser.mockRejectedValueOnce(new Error('offline'));
    renderAt('/profile/chef', fakeUser);
    fireEvent.click(screen.getByRole('button', { name: 'Follow Chef' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't update that. Check your connection and try again."
    );
    expect(screen.getByRole('button', { name: 'Follow Chef' })).toBeInTheDocument();
  });

  it('routes an anonymous account editing its avatar or name to sign-up', () => {
    renderAt('/profile', anon);
    fireEvent.click(screen.getByRole('button', { name: 'Change avatar' }));
    expect(screen.getByRole('heading', { name: 'Sign in to edit your profile' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Edit display name/ }));
    expect(screen.queryByPlaceholderText('Display name')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Edit avatar' })).toBeNull();
    expect(updateAvatar).not.toHaveBeenCalled();
  });
});

describe('OwnProfile avatar sheet', () => {
  it('opens the editor sheet for a verified account and saves through updateAvatar', async () => {
    updateAvatar.mockClear();
    renderAt('/profile', verified);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Change avatar' }));
    const sheet = await screen.findByRole('dialog', { name: 'Edit avatar' });
    expect(within(sheet).getByRole('button', { name: 'Use a photo' })).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Initials' }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateAvatar).toHaveBeenCalledWith(expect.objectContaining({ photoType: 'generated' })));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit avatar' })).toBeNull());
  });
});

describe('Forest view button (RL-175)', () => {
  it('links to the own forest', () => {
    renderAt('/profile', fakeUser);
    expect(screen.getByRole('link', { name: 'Forest view' })).toHaveAttribute('href', '/profile/forest');
  });
  it('shows on another cook\'s profile', () => {
    renderAt('/profile/chef', fakeUser);
    expect(screen.getByRole('link', { name: 'Forest view' })).toHaveAttribute('href', '/profile/chef/forest');
  });
});

describe('OwnProfile sign out (moved to Settings, RL-093)', () => {
  it.each([
    ['verified', fakeUser],
    ['anonymous', anon],
  ])('has no Sign Out button for a %s account', (_label, user) => {
    renderAt('/profile', user);
    expect(screen.getByRole('button', { name: 'Change avatar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument();
  });
});

describe('OwnProfile sync states (RL-079)', () => {
  const skeletons = (c: HTMLElement) => c.querySelectorAll('.skeleton-pulse').length;
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows skeletons instead of the empty state while waiting, and gives up after 6 seconds', () => {
    vi.useFakeTimers();
    syncStatus = 'waiting';
    const { container } = renderAt('/profile', fakeUser);
    expect(skeletons(container)).toBe(2);
    expect(screen.queryByText('Nothing here yet.')).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(6001);
    });
    expect(skeletons(container)).toBe(0);
    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();
  });

  it('shows recipes while waiting', () => {
    syncStatus = 'waiting';
    rows = [makeRecipe({ id: 'r1', title: 'Local Lasagne', createdBy: { uid: fakeUser.uid, displayName: null } })];
    const { container } = renderWithProviders(<ProfilePage />, { route: '/profile' });
    expect(screen.getByText('Local Lasagne')).toBeInTheDocument();
    expect(skeletons(container)).toBe(0);
  });

  it('shows the empty state when synced', () => {
    syncStatus = 'synced';
    renderAt('/profile', fakeUser);
    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();
  });

  it('shows the empty state when waiting offline', () => {
    syncStatus = 'waiting';
    vi.stubGlobal('navigator', { onLine: false });
    renderAt('/profile', fakeUser);
    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();
  });

  it('shows the empty state for status off', () => {
    renderAt('/profile', fakeUser);
    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();
  });
});

const mine = (o: Partial<Recipe>) => makeRecipe({ createdBy: { uid: fakeUser.uid, displayName: null }, ...o });

describe('OwnProfile Organic layout (RL-095)', () => {
  it('shows placeholders instead of 0 for Started and Grew while the library loads', () => {
    rows = undefined;
    renderAt('/profile', fakeUser);
    expect(within(screen.getAllByText('Started')[0].parentElement!).getByText('–')).toBeInTheDocument();
    expect(within(screen.getAllByText('Grew')[0].parentElement!).queryByText('0')).toBeNull();
  });

  it('splits Started and Grew with counts, a branch of someone else under Grew, and the right meta', () => {
    rows = [
      mine({ id: 'root', title: 'Root Soup', createdAt: 5 }),
      makeRecipe({ id: 'kid', rootId: 'root', parentId: 'root', title: 'Their Kid', createdBy: { uid: 'x', displayName: null }, createdAt: 6 }),
      makeRecipe({ id: 'theirs', title: 'Their Stew', createdBy: { uid: 'x', displayName: null } }),
      makeRecipe({ id: 'theirs-kid', rootId: 'theirs', parentId: 'theirs', title: 'My Take', prompt: 'less salt', createdBy: { uid: fakeUser.uid, displayName: null }, createdAt: 9 }),
    ];
    renderAt('/profile', fakeUser);
    const tile = (label: string) => screen.getAllByText(label)[0].parentElement!;
    expect(tile('Started')).toHaveTextContent(/^1Started$/);
    expect(tile('Grew')).toHaveTextContent(/^1Grew$/);
    const started = screen.getByRole('link', { name: /Root Soup/ });
    expect(started).toHaveTextContent('1 branch');
    expect(screen.queryByText('My Take')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: /^Grew/ }));
    expect(screen.getByRole('link', { name: /My Take/ })).toHaveTextContent('"less salt"');
    expect(screen.getByRole('link', { name: /My Take/ })).toHaveAttribute('href', '/recipe/theirs-kid');
    expect(screen.queryByText('Root Soup')).toBeNull();
    expect(screen.queryByText('Their Kid')).toBeNull();
  });

  it('shows No branches yet on a childless Started tile', () => {
    rows = [mine({ id: 'solo', title: 'Solo' })];
    renderAt('/profile', fakeUser);
    expect(screen.getByRole('link', { name: /Solo/ })).toHaveTextContent('No branches yet');
  });

  it('links the Settings icon to /settings and has no My Profile heading', () => {
    renderAt('/profile', fakeUser);
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
    expect(screen.queryByText('My Profile')).toBeNull();
  });

  it('shows the views line only when there are some, and saves in the tile', () => {
    const { unmount } = renderAt('/profile', fakeUser);
    expect(screen.queryByText(/views/)).toBeNull();
    unmount();
    totals = { totalViews: 3, totalFavorites: 1 };
    renderAt('/profile', fakeUser);
    expect(screen.getByText('3 views')).toBeInTheDocument();
    expect(within(screen.getByText('Saves').parentElement!).getByText('1')).toBeInTheDocument();
  });

  it.each(['loading', 'error'])('shows a dash for Saves while stats are %s', (status) => {
    statsStatus = status;
    totals = { totalViews: 0, totalFavorites: 0 };
    renderAt('/profile', fakeUser);
    expect(screen.getByRole('group', { name: 'Saves: loading' })).toBeInTheDocument();
  });

  it('shows dashes for Followers and no Following number until the profile has loaded', () => {
    ownLoaded = false;
    renderAt('/profile', fakeUser);
    expect(screen.getByRole('button', { name: 'Followers: loading' })).toHaveAttribute('aria-controls', 'followers-panel');
    expect(screen.getByRole('button', { name: 'Following' })).toBeInTheDocument();
  });

  it('toggles the followers list from its stat tile', async () => {
    renderAt('/profile', fakeUser);
    const btn = screen.getByRole('button', { name: /Followers/ });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText('No followers yet')).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.queryByText('No followers yet')).toBeNull();
  });

  it('toggles the following list from the link under the tiles', async () => {
    renderAt('/profile', fakeUser);
    const btn = screen.getByRole('button', { name: 'Following 0' });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText('Not following anyone yet')).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.queryByText('Not following anyone yet')).toBeNull();
  });

  it('falls back to Branched when a branch has no prompt', () => {
    rows = [mine({ id: 'b', parentId: 'p', rootId: 'p', title: 'Legacy Branch', prompt: '  ' })];
    renderAt('/profile', fakeUser);
    fireEvent.click(screen.getByRole('radio', { name: /^Grew/ }));
    const link = screen.getByRole('link', { name: /Legacy Branch/ });
    expect(link).toHaveTextContent('Branched');
    expect(link).not.toHaveTextContent('""');
  });

  it('shows Cooking since for a verified account with a profile date', () => {
    ownProfile = { createdAt: Date.UTC(2026, 2, 15), followerCount: 0, followingCount: 0 };
    renderAt('/profile', verified);
    expect(screen.getByText('Cooking since March 2026')).toBeInTheDocument();
    expect(screen.queryByText(/Guest/)).toBeNull();
  });

  it('edits the display name inline for a verified account', async () => {
    const updateDisplayName = vi.fn(async () => {});
    renderWithProviders(<ProfilePage />, { route: '/profile', user: verified, auth: { updateDisplayName } });
    fireEvent.click(screen.getByRole('button', { name: /Edit display name/ }));
    fireEvent.change(screen.getByPlaceholderText('Display name'), { target: { value: 'New Name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateDisplayName).toHaveBeenCalledWith('New Name'));
  });

  it('shows the guest line and card for an anonymous account only', () => {
    const { unmount } = renderAt('/profile', anon);
    expect(screen.getByText('Guest · this device only')).toBeInTheDocument();
    expect(screen.getByText('Your bookmarks only live on this device')).toBeInTheDocument();
    expect(screen.getByText('Add an email to keep them if you switch or lose this device.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
    unmount();
    renderAt('/profile', verified);
    expect(screen.queryByText('Your bookmarks only live on this device')).toBeNull();
    expect(screen.queryByText(/Guest/)).toBeNull();
  });

  it('shows the offline line only while offline and not yet synced', () => {
    vi.stubGlobal('navigator', { onLine: false });
    syncStatus = 'waiting';
    const { unmount } = renderAt('/profile', fakeUser);
    expect(screen.getByRole('status')).toHaveTextContent("You're offline. Showing the recipes saved on this device.");
    unmount();
    syncStatus = 'synced';
    renderAt('/profile', fakeUser);
    expect(screen.queryByText(/You're offline/)).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe('ProfilePage signed out, local-only and errors (RL-095)', () => {
  it('signed out shows the browsing state and opens sign in', () => {
    renderAt('/profile', null);
    expect(screen.getByRole('heading', { name: "You're browsing" })).toBeInTheDocument();
    expect(screen.getByText('Reading is free. Sign in to save recipes, branch them and follow cooks.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
  });

  it('local-only lists every device row under Your recipes with no identity or stats', () => {
    rows = [makeRecipe({ id: 'a', title: 'Local One' })];
    renderWithProviders(<ProfilePage />, { route: '/profile', user: null, auth: { isConfigured: false } });
    expect(screen.getByRole('heading', { name: 'Your recipes' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Local One/ })).toBeInTheDocument();
    expect(screen.queryByText('Saves')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change avatar' })).toBeNull();
  });
});

describe('PublicProfile Organic layout (RL-096)', () => {
  const theirs = (o: Record<string, unknown>) => ({ ...makeRecipe({ createdBy: { uid: 'chef', displayName: 'Chef' } }), ...o });

  it('splits Started and Grew by parentId, with branch counts and prompts as meta', () => {
    chefRecipes = [
      theirs({ id: 'root', title: 'Root Soup', rootId: 'root', createdAt: 3, favoriteCount: 4 }),
      theirs({ id: 'lone', title: 'Lone Toast', rootId: 'lone', createdAt: 2 }),
      theirs({ id: 'kid', title: 'Spicy Soup', parentId: 'root', rootId: 'root', prompt: 'make it spicy', createdAt: 1, favoriteCount: 2 }),
    ];
    renderAt('/profile/chef', null);
    const tile = (label: string) => screen.getAllByText(label)[0].parentElement!;
    expect(within(tile('Started')).getByText('2')).toBeInTheDocument();
    expect(within(tile('Grew')).getByText('1')).toBeInTheDocument();
    expect(within(tile('Followers')).getByText('3')).toBeInTheDocument();
    expect(within(tile('Saves')).getByText('6')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Root Soup/ })).toHaveTextContent('1 branch');
    expect(screen.getByRole('link', { name: /Lone Toast/ })).not.toHaveTextContent('No branches yet');
    expect(screen.queryByRole('link', { name: /Spicy Soup/ })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: /^Grew/ }));
    expect(screen.getByRole('link', { name: /Spicy Soup/ })).toHaveTextContent('"make it spicy"');
    expect(screen.queryByRole('link', { name: /Root Soup/ })).toBeNull();
  });

  it('falls back to Branched when a branch has no prompt', () => {
    chefRecipes = [theirs({ id: 'kid', title: 'Plain Kid', parentId: 'root', rootId: 'root' })];
    renderAt('/profile/chef', null);
    fireEvent.click(screen.getByRole('radio', { name: /^Grew/ }));
    expect(screen.getByRole('link', { name: /Plain Kid/ })).toHaveTextContent('Branched');
  });

  it('stat tiles are not interactive and the heading is the name', () => {
    renderAt('/profile/chef', fakeUser);
    expect(screen.getByRole('heading', { name: 'Chef' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Followers|Following/ })).toBeNull();
  });

  it('has no Follow button on a local-only build', () => {
    renderWithProviders(
      <Routes>
        <Route path="/profile/:uid" element={<ProfilePage />} />
      </Routes>,
      { route: '/profile/chef', user: null, auth: { isConfigured: false } }
    );
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Follow/ })).toBeNull();
  });

  const backRoutes = (
    <Routes>
      <Route path="/" element={<p>Home page</p>} />
      <Route path="/prev" element={<Link to="/profile/chef">Open Chef</Link>} />
      <Route path="/profile/:uid" element={<ProfilePage />} />
    </Routes>
  );

  it('Back returns to the previous page when there is history', () => {
    renderWithProviders(backRoutes, { route: '/prev', user: null });
    fireEvent.click(screen.getByRole('link', { name: 'Open Chef' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('link', { name: 'Open Chef' })).toBeInTheDocument();
    expect(screen.queryByText('Home page')).toBeNull();
  });

  it('Back goes home on a deep link with no history', () => {
    renderWithProviders(backRoutes, { route: '/profile/chef', user: null });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Home page')).toBeInTheDocument();
  });

  it('shows placeholders instead of 0 for Started and Grew while recipes load', () => {
    chefLoading = true;
    renderAt('/profile/chef', null);
    const tile = (label: string) => screen.getAllByText(label)[0].parentElement!;
    expect(within(tile('Started')).getByText('–')).toBeInTheDocument();
    expect(within(tile('Grew')).getByText('–')).toBeInTheDocument();
    expect(within(tile('Started')).queryByText('0')).toBeNull();
    expect(within(tile('Followers')).getByText('3')).toBeInTheDocument();
  });

  it('keeps a long unspaced name inside the Follow button via truncation', () => {
    const long = 'A'.repeat(60);
    publicProfile = { profile: { ...chefProfile, displayName: long }, isLoading: false, error: false, retry: retryProfile };
    renderAt('/profile/chef', fakeUser);
    const btn = screen.getByRole('button', { name: `Follow ${long}` });
    expect(within(btn).getByText(`Follow ${long}`)).toHaveClass('truncate', 'min-w-0');
  });

  it('shows the load error with Try again that retries', () => {
    publicProfile = { profile: null, isLoading: false, error: true, retry: retryProfile };
    renderAt('/profile/chef', null);
    expect(screen.getByRole('heading', { name: "Couldn't load this profile" })).toBeInTheDocument();
    expect(screen.getByText('The connection failed. The account is probably fine.')).toBeInTheDocument();
    expect(screen.queryByText('User not found')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retryProfile).toHaveBeenCalledTimes(1);
  });

  it('shows User not found when there is no profile and no error', () => {
    publicProfile = { profile: null, isLoading: false, error: false, retry: retryProfile };
    renderAt('/profile/chef', null);
    expect(screen.getByRole('heading', { name: 'User not found' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});

describe('Collabs tab (RL-173)', () => {
  const credited = { id: 'c1', title: 'Their Pie', emoji: '🥧', createdBy: { uid: 'owner', displayName: 'Olive' } };

  it('is a third tab with counts on both profiles', () => {
    collabs = { status: 'ready', recipes: [credited], truncated: false, retry: retryCollabs };
    const { unmount } = renderAt('/profile', fakeUser);
    expect(screen.getByRole('radio', { name: /^Started/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^Grew/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /^Collabs/ }));
    const link = screen.getByRole('link', { name: /Their Pie/ });
    expect(link).toHaveAttribute('href', '/recipe/c1');
    expect(within(link).getByText('Olive')).toBeInTheDocument();
    unmount();
    renderAt('/profile/chef', null);
    expect(screen.getByRole('radio', { name: /^Collabs/ })).toBeInTheDocument();
  });

  it('shows a skeleton and no count while loading, never the empty line', () => {
    collabs = { status: 'loading', recipes: [], truncated: false, retry: retryCollabs };
    renderAt('/profile/chef', null);
    fireEvent.click(screen.getByRole('radio', { name: /^Collabs/ }));
    expect(screen.queryByText('No collabs yet')).toBeNull();
  });

  it('says "their" on another profile and "your" on the own one when empty', () => {
    const { unmount } = renderAt('/profile/chef', null);
    fireEvent.click(screen.getByRole('radio', { name: /^Collabs/ }));
    expect(screen.getByText('No collabs yet')).toBeInTheDocument();
    expect(screen.getByText('Recipes where their suggestion was applied show up here.')).toBeInTheDocument();
    unmount();
    renderAt('/profile', fakeUser);
    fireEvent.click(screen.getByRole('radio', { name: /^Collabs/ }));
    expect(screen.getByText('Recipes where your suggestion was applied show up here.')).toBeInTheDocument();
  });

  it('shows an error with Try again, not the empty line', () => {
    collabs = { status: 'error', recipes: [], truncated: false, retry: retryCollabs };
    renderAt('/profile/chef', null);
    fireEvent.click(screen.getByRole('radio', { name: /^Collabs/ }));
    expect(screen.queryByText('No collabs yet')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(retryCollabs).toHaveBeenCalled();
  });

  it('is hidden in a local-only build', () => {
    renderWithProviders(
      <Routes>
        <Route path="/profile" element={<ProfilePage />} />
      </Routes>,
      { route: '/profile', user: null, auth: { isConfigured: false } }
    );
    expect(screen.queryByRole('radio', { name: /Collabs/ })).toBeNull();
  });

  it('reads only after the tab is first opened', () => {
    renderAt('/profile/chef', null);
    expect(useCollabRecipes).toHaveBeenLastCalledWith('chef', false);
    fireEvent.click(screen.getByRole('radio', { name: /^Collabs/ }));
    expect(useCollabRecipes).toHaveBeenLastCalledWith('chef', true);
  });

  it('keeps the count in a spoken name and shows 50+ with a note when truncated', () => {
    collabs = { status: 'ready', recipes: [credited], truncated: true, retry: retryCollabs };
    renderAt('/profile/chef', null);
    expect(screen.getByRole('radio', { name: 'Collabs 50+ recipes'.replace('50+', '1+') })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /^Collabs/ }));
    expect(screen.getByText('Showing the first 50.')).toBeInTheDocument();
  });

  it('is hidden on another cook profile in a local-only build', () => {
    renderWithProviders(
      <Routes>
        <Route path="/profile/:uid" element={<ProfilePage />} />
      </Routes>,
      { route: '/profile/chef', user: null, auth: { isConfigured: false } }
    );
    expect(screen.queryByRole('radio', { name: /Collabs/ })).toBeNull();
  });

  it('moves between tabs with the arrow keys', () => {
    renderAt('/profile/chef', null);
    const started = screen.getByRole('radio', { name: /^Started/ });
    expect(started).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: /^Grew/ })).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(started, { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: /^Grew/ })).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(screen.getByRole('radio', { name: /^Grew/ }), { key: 'End' });
    expect(screen.getByRole('radio', { name: /^Collabs/ })).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(screen.getByRole('radio', { name: /^Collabs/ }), { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: /^Started/ })).toHaveAttribute('aria-checked', 'true');
  });
});
