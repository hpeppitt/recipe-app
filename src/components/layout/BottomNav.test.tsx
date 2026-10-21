// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { db } from '../../db/database';
import { renderWithProviders, fakeUser } from '../../test/renderWithProviders';
import type { AppNotification } from '../../types/social';
import { BottomNav } from './BottomNav';

// The real useNotifications runs, so its signed-out and local-only gating is under test too.
const feed = vi.hoisted(() => ({ items: [] as AppNotification[] }));
vi.mock('../../services/firestore', () => ({
  subscribeNotifications: (_uid: string, cb: (n: AppNotification[]) => void) => {
    cb(feed.items);
    return () => {};
  },
  subscribeNotificationPrefs: (_u: string, cb: (p: null) => void) => (cb(null), () => {}),
  markNotificationRead: async () => {},
  markAllNotificationsRead: async () => {},
}));

function unread(n: number): AppNotification[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `n${i}`,
    recipientUid: 'test-user',
    type: 'favorite',
    recipeId: 'r1',
    recipeTitle: 'Soup',
    recipeEmoji: '🍲',
    fromUid: 'ann',
    fromDisplayName: 'Ann',
    message: null,
    read: false,
    createdAt: Date.now(),
  }));
}

beforeEach(async () => {
  feed.items = [];
  // A fresh in-memory store per test; this jsdom setup has no working localStorage of its own.
  const m = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  });
  await db.favorites.clear();
});

const TIP = 'Saved lives in Kitchen now';

describe('BottomNav', () => {
  it('renders the five slots in order with their names and hrefs', () => {
    renderWithProviders(<BottomNav />);
    const links = screen.getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/', '/kitchen', '/new', '/activity', '/profile']);
    for (const name of ['Explore', 'Kitchen', 'Create', 'Activity', 'You']) {
      expect(screen.getByRole('link', { name })).toBeTruthy();
    }
    expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull();
  });

  it('has one nav with the wordmark as plain text, not a link', () => {
    renderWithProviders(<BottomNav />);
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
    expect(screen.getByText('Recipe Lab').closest('a')).toBeNull();
    expect(screen.getAllByRole('link')).toHaveLength(5);
  });

  it.each([
    ['/', 'Explore'],
    ['/search', 'Explore'],
    ['/search?q=walnut', 'Explore'],
    ['/kitchen', 'Kitchen'],
    ['/kitchen/', 'Kitchen'],
    ['/kitchen/log', 'Kitchen'],
    ['/saved', 'Kitchen'],
    ['/saved/', 'Kitchen'],
    ['/new', 'Create'],
    ['/activity', 'Activity'],
    ['/profile', 'You'],
  ])('marks only the %s tab as the current page', (route, name) => {
    renderWithProviders(<BottomNav />, { route });
    const current = screen.getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page');
    expect(current).toEqual([screen.getByRole('link', { name })]);
  });

  // Exact matching, as NavLink with `end` did before RL-124; no shell route nests under a tab.
  it('marks no tab on a path nested under one', () => {
    renderWithProviders(<BottomNav />, { route: '/profile/ann' });
    expect(screen.getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page')).toEqual([]);
  });

  it('gives only Create the 44px accent circle, current or not', () => {
    for (const route of ['/', '/new']) {
      const { unmount } = renderWithProviders(<BottomNav />, { route });
      for (const a of screen.getAllByRole('link')) {
        const circle = a.firstElementChild!.className;
        if (a.getAttribute('href') === '/new') {
          expect(circle).toContain('bg-accent');
          expect(circle).toContain('w-11 h-11');
        } else {
          expect(circle).not.toContain('bg-accent');
          expect(circle).toContain('w-[30px] h-[30px]');
        }
      }
      unmount();
    }
  });

  it('turns the Create label accent when current', () => {
    renderWithProviders(<BottomNav />, { route: '/new' });
    expect(screen.getByRole('link', { name: 'Create' }).className).toContain('text-accent-700');
  });

  it('does not mark Explore on another path', () => {
    renderWithProviders(<BottomNav />, { route: '/saved' });
    expect(screen.getByRole('link', { name: 'Explore' }).getAttribute('aria-current')).toBeNull();
  });

  it('shows 3 unread in the badge and the name', () => {
    feed.items = unread(3);
    renderWithProviders(<BottomNav />);
    expect(screen.getByRole('link', { name: 'Activity, 3 unread' })).toBeTruthy();
    expect(screen.getByTestId('activity-badge').textContent).toBe('3');
  });

  it('caps the badge at 99+ but names the real count', () => {
    feed.items = unread(120);
    renderWithProviders(<BottomNav />);
    expect(screen.getByRole('link', { name: 'Activity, 120 unread' })).toBeTruthy();
    expect(screen.getByTestId('activity-badge').textContent).toBe('99+');
  });

  it('shows no badge at 0 unread', () => {
    feed.items = unread(2).map((n) => ({ ...n, read: true }));
    renderWithProviders(<BottomNav />);
    expect(screen.getByRole('link', { name: 'Activity' })).toBeTruthy();
    expect(screen.queryByTestId('activity-badge')).toBeNull();
  });

  it('shows no badge for an anonymous user, even with unread in the feed', () => {
    feed.items = unread(3);
    renderWithProviders(<BottomNav />, { user: { ...fakeUser, isAnonymous: true, email: null, emailVerified: false } });
    expect(screen.getByRole('link', { name: 'Activity' })).toBeTruthy();
    expect(screen.queryByTestId('activity-badge')).toBeNull();
  });

  it('shows no badge for an unverified email, even with unread in the feed', () => {
    feed.items = unread(3);
    renderWithProviders(<BottomNav />, { user: { ...fakeUser, emailVerified: false } });
    expect(screen.getByRole('link', { name: 'Activity' })).toBeTruthy();
    expect(screen.queryByTestId('activity-badge')).toBeNull();
  });

  it('shows no badge when signed out, even with unread in the feed', () => {
    feed.items = unread(3);
    renderWithProviders(<BottomNav />, { user: null });
    expect(screen.getByRole('link', { name: 'Activity' })).toBeTruthy();
    expect(screen.queryByTestId('activity-badge')).toBeNull();
  });

  it('shows no badge local-only, even with unread in the feed', () => {
    feed.items = unread(3);
    renderWithProviders(<BottomNav />, { auth: { isConfigured: false } });
    expect(screen.getByRole('link', { name: 'Activity' })).toBeTruthy();
    expect(screen.queryByTestId('activity-badge')).toBeNull();
  });

  describe('Saved lives in Kitchen tip (RL-215)', () => {
    it('shows once for a returning user, closes, and never shows again', async () => {
      await db.favorites.put({ uid: 'test-user', recipeId: 'r1', createdAt: 1 });
      const first = renderWithProviders(<BottomNav />);
      expect(await screen.findByText(TIP)).toBeTruthy();
      expect(localStorage.getItem('recipe-lab-kitchen-tip')).toBe('1');
      fireEvent.click(screen.getByRole('button', { name: 'Close tip' }));
      expect(screen.queryByText(TIP)).toBeNull();
      first.unmount();

      renderWithProviders(<BottomNav />);
      await new Promise((r) => setTimeout(r, 20));
      expect(screen.queryByText(TIP)).toBeNull();
    });

    it('never shows for a new user, even after a later bookmark', async () => {
      const first = renderWithProviders(<BottomNav />);
      expect(screen.queryByText(TIP)).toBeNull();
      await waitFor(() => expect(localStorage.getItem('recipe-lab-kitchen-tip')).toBe('1'));
      expect(screen.queryByText(TIP)).toBeNull();
      first.unmount();

      await db.favorites.put({ uid: 'test-user', recipeId: 'r1', createdAt: 1 });
      renderWithProviders(<BottomNav />);
      await new Promise((r) => setTimeout(r, 20));
      expect(screen.queryByText(TIP)).toBeNull();
    });

    it('does not show on Kitchen, where the user already is', async () => {
      await db.favorites.put({ uid: 'test-user', recipeId: 'r1', createdAt: 1 });
      renderWithProviders(<BottomNav />, { route: '/kitchen' });
      await waitFor(() => expect(localStorage.getItem('recipe-lab-kitchen-tip')).toBe('1'));
      await new Promise((r) => setTimeout(r, 20));
      expect(screen.queryByText(TIP)).toBeNull();
    });

    it('is a status bubble for a returning user', async () => {
      await db.favorites.put({ uid: 'test-user', recipeId: 'r1', createdAt: 1 });
      renderWithProviders(<BottomNav />);
      expect((await screen.findByRole('status')).textContent).toContain(TIP);
    });

    it('is not on screen before the bookmark check answers', () => {
      renderWithProviders(<BottomNav />);
      expect(screen.queryByText(TIP)).toBeNull();
    });
  });
});
