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

  it('a branch row names the parent, quotes the prompt, has a sage branch badge and opens the branch (RL-153)', async () => {
    setHook([
      notif({ id: 'br', type: 'branch', recipeId: 'branch-1', recipeTitle: 'Banana bread', recipeEmoji: '🍌', fromDisplayName: 'Lin', message: 'vegan, no eggs' }),
    ]);
    renderWithProviders(
      <Routes>
        <Route path="/" element={<ActivityPage />} />
        <Route path="/recipe/:id" element={<p>Branch page</p>} />
      </Routes>
    );
    const row = screen.getByRole('button', { name: 'Lin branched your recipe 🍌 Banana bread' });
    expect(row).toHaveAccessibleDescription(/^"vegan, no eggs"/);
    const badge = row.querySelector('.bg-accent-2-600')!;
    expect(badge.querySelector('line[x1="6"][y1="3"][y2="15"]')).not.toBeNull(); // GitBranch's trunk
    fireEvent.click(row);
    expect(await screen.findByText('Branch page')).toBeInTheDocument();
  });

  it('still opens the recipe when marking read fails', async () => {
    markRead.mockRejectedValueOnce(new Error('offline'));
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

  it('words the detail line per type: name and change, bare outcome, quoted otherwise', () => {
    setHook([
      notif({ id: 's', type: 'suggestion', fromDisplayName: 'Sami Jones', message: '150 g light brown sugar \u2192 100 g' }),
      notif({ id: 'a', type: 'suggestion_applied', message: 'Applied: 2 edits' }),
      notif({ id: 'b', type: 'suggestion_branched', message: 'Kept as a branch' }),
      notif({ id: 'r', type: 'suggestion_reply', message: 'thanks' }),
      notif({ id: 'e', type: 'suggestion', fromDisplayName: '  ', message: ' 2 g salt \u2192 1 g ' }),
      notif({ id: 'w', type: 'suggestion', message: '   ' }),
    ]);
    renderWithProviders(<ActivityPage />);
    const detail = (id: string) => document.getElementById(`n-${id}-detail`)!;
    expect(detail('s')).toHaveTextContent(/^Sami: 150 g light brown sugar \u2192 100 g/);
    expect(detail('a')).toHaveTextContent(/^Applied: 2 edits/);
    expect(detail('b')).toHaveTextContent(/^Kept as a branch/);
    expect(detail('r')).toHaveTextContent(/^"thanks"/);
    expect(detail('e')).toHaveTextContent(/^Someone: 2 g salt \u2192 1 g/);
    expect(detail('w')).not.toHaveTextContent(':');
    expect(screen.getAllByRole('button')[0]).toHaveAccessibleDescription(/Sami: 150 g|Applied|Kept|thanks/);
  });
});
