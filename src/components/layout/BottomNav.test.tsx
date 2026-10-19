// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
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

beforeEach(() => {
  feed.items = [];
});

describe('BottomNav', () => {
  it('renders the five slots in order with their names and hrefs', () => {
    renderWithProviders(<BottomNav />);
    const links = screen.getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/', '/saved', '/create', '/activity', '/profile']);
    for (const name of ['Explore', 'Saved', 'Create', 'Activity', 'You']) {
      expect(screen.getByRole('link', { name })).toBeTruthy();
    }
    expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull();
  });

  it.each([
    ['/', 'Explore'],
    ['/saved', 'Saved'],
    ['/activity', 'Activity'],
    ['/profile', 'You'],
  ])('marks only the %s tab as the current page', (route, name) => {
    renderWithProviders(<BottomNav />, { route });
    const current = screen.getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page');
    expect(current).toEqual([screen.getByRole('link', { name })]);
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
});
