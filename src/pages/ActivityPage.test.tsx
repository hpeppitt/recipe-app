// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, within, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders } from '../test/renderWithProviders';
import { NOTIF_VERBS } from '../lib/notifications';
import type { AppNotification } from '../types/social';
import { ActivityPage } from './ActivityPage';

const hook = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../hooks/useNotifications', () => ({ useNotifications: () => hook.value }));

const markRead = vi.fn(async () => {});
const markAllRead = vi.fn(async () => {});

function notif(over: Partial<AppNotification>): AppNotification {
  return {
    id: 'n1',
    recipientUid: 'test-user',
    type: 'favorite',
    recipeId: 'r1',
    recipeTitle: 'Soup',
    recipeEmoji: '🍲',
    fromUid: 'ann',
    fromDisplayName: 'Ann',
    message: null,
    read: true,
    createdAt: Date.now(),
    ...over,
  };
}

function setHook(notifications: AppNotification[], over: Record<string, unknown> = {}) {
  hook.value = {
    notifications,
    unreadCount: notifications.filter((n) => !n.read).length,
    isLoading: false,
    error: false,
    markRead,
    markAllRead,
    ...over,
  };
}

beforeEach(() => {
  markRead.mockClear();
  markAllRead.mockReset();
  markAllRead.mockResolvedValue(undefined);
  setHook([]);
});

describe('ActivityPage', () => {
  it('splits into Today and Earlier and omits an empty group label', () => {
    const old = Date.now() - 3 * 86400_000;
    setHook([notif({ id: 'a' }), notif({ id: 'b', createdAt: old })]);
    const first = renderWithProviders(<ActivityPage />);
    const today = screen.getByRole('heading', { name: 'Today' }).parentElement!;
    const earlier = screen.getByRole('heading', { name: 'Earlier' }).parentElement!;
    expect(within(today).getAllByRole('button')).toHaveLength(1);
    expect(within(earlier).getAllByRole('button')).toHaveLength(1);

    first.unmount();
    setHook([notif({ id: 'a' })]);
    renderWithProviders(<ActivityPage />);
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Earlier' })).toBeNull();
  });

  it('renders the verb for every type with an exact accessible name', () => {
    const types = Object.keys(NOTIF_VERBS) as AppNotification['type'][];
    setHook(types.map((type) => notif({ id: type, type, recipeId: undefined, recipeTitle: undefined })));
    renderWithProviders(<ActivityPage />);
    for (const t of types) {
      expect(screen.getByRole('button', { name: `Ann ${NOTIF_VERBS[t]}` })).toBeInTheDocument();
    }
  });

  it('shows an unread dot and "unread" in the name only for unread rows', () => {
    setHook([
      notif({ id: 'u', read: false, message: 'less salt' }),
      notif({ id: 'r', read: true, recipeTitle: 'Stew' }),
    ]);
    renderWithProviders(<ActivityPage />);
    const unread = screen.getByRole('button', { name: 'Ann saved your recipe 🍲 Soup unread' });
    expect(unread).toHaveAccessibleDescription(/less salt/);
    expect(screen.getByRole('button', { name: 'Ann saved your recipe 🍲 Stew' })).toBeInTheDocument();
    expect(screen.getAllByText('unread')).toHaveLength(1);
  });

  it('marks read and opens the recipe', async () => {
    setHook([notif({ id: 'u', read: false })]);
    renderWithProviders(
      <Routes>
        <Route path="/" element={<ActivityPage />} />
        <Route path="/recipe/:id" element={<p>Recipe page</p>} />
      </Routes>
    );
    fireEvent.click(screen.getByRole('button', { name: /Ann saved/ }));
    expect(await screen.findByText('Recipe page')).toBeInTheDocument();
    expect(markRead).toHaveBeenCalledWith('u');
  });

  it('opens the sender profile for a follow', async () => {
    setHook([notif({ id: 'f', type: 'follow', recipeId: undefined, recipeTitle: undefined })]);
    renderWithProviders(
      <Routes>
        <Route path="/" element={<ActivityPage />} />
        <Route path="/profile/:uid" element={<p>Profile ann</p>} />
      </Routes>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ann started following you' }));
    expect(await screen.findByText('Profile ann')).toBeInTheDocument();
  });

  it('shows the signed-out empty state with a Sign in action', () => {
    renderWithProviders(<ActivityPage />, { user: null });
    expect(screen.getByRole('heading', { name: 'Nothing to see yet' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('has no Sign in action in local-only mode', () => {
    renderWithProviders(<ActivityPage />, { user: null, auth: { isConfigured: false } });
    expect(screen.getByRole('heading', { name: 'Nothing to see yet' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('shows loading, error and empty states', () => {
    setHook([], { isLoading: true });
    const a = renderWithProviders(<ActivityPage />);
    expect(screen.getByRole('status', { name: 'Loading notifications' }).children).toHaveLength(3);
    a.unmount();
    setHook([], { error: true });
    const b = renderWithProviders(<ActivityPage />);
    expect(screen.getByRole('heading', { name: "Couldn't load notifications" })).toBeInTheDocument();
    b.unmount();
    setHook([]);
    renderWithProviders(<ActivityPage />);
    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();
  });

  it('Mark all read calls markAllRead and shows a message when it rejects', async () => {
    setHook([notif({ read: false })]);
    renderWithProviders(<ActivityPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    await waitFor(() => expect(markAllRead).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    markAllRead.mockRejectedValue(new Error('denied'));
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't mark those as read. Try again.");
  });
});
