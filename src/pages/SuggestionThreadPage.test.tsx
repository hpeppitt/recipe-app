// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { screen, fireEvent, within, waitFor, act } from '@testing-library/react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { renderWithProviders, fakeUser } from '../test/renderWithProviders';
import { makeRecipe } from '../test/factories';
import { RateLimitedError } from '../lib/errors';
import type { AppUser, Recipe } from '../types/recipe';
import type { Suggestion, SuggestionMessage } from '../types/social';

// The real hooks run; only the Firestore calls underneath are faked, so these
// tests see which listeners open and which write is made.
const subscribe = vi.fn();
const unsubSuggestions = vi.fn();
const unsubMessages = vi.fn();
const subscribeMessages = vi.fn();
const addMessage = vi.fn();
const updateStatus = vi.fn();
vi.mock('../services/firestore', () => ({
  subscribeRecipeSuggestions: (...a: unknown[]) => subscribe(...a),
  subscribeSuggestionMessages: (...a: unknown[]) => subscribeMessages(...a),
  addSuggestionMessage: (...a: unknown[]) => addMessage(...a),
  updateSuggestionStatus: (...a: unknown[]) => updateStatus(...a),
  createSuggestion: vi.fn(),
}));
vi.mock('../db/recipes', () => ({ addLocalCollaborator: vi.fn(async () => {}) }));
vi.mock('../services/analytics', () => ({
  trackSuggestionSubmitted: vi.fn(),
  trackSuggestionReviewed: vi.fn(),
}));
let recipe: Recipe | undefined;
let cloudError = false;
const retryRecipe = vi.fn();
vi.mock('../hooks/useRecipe', () => ({
  useRecipe: () => ({ recipe, source: 'cloud', isLoading: false, cloudError, retry: retryRecipe }),
}));

import { SuggestionThreadPage } from './SuggestionThreadPage';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const OWNER = { uid: fakeUser.uid, displayName: 'Test Cook' };
const MAYA = { uid: 'maya', displayName: 'Maya' };

const sug = (over: Partial<Suggestion> = {}): Suggestion => ({
  id: 's1',
  recipeId: 'r1',
  recipeOwnerId: OWNER.uid,
  recipeTitle: 'Tomato Soup',
  suggestedBy: MAYA,
  message: 'More garlic',
  status: 'pending',
  createdAt: Date.now(),
  ...over,
});

const msg = (over: Partial<SuggestionMessage>): SuggestionMessage => ({
  id: 'm',
  fromUid: MAYA.uid,
  fromDisplayName: 'Maya',
  text: '',
  createdAt: Date.now(),
  ...over,
});

let suggestions: Suggestion[];
let messages: SuggestionMessage[];

beforeEach(() => {
  vi.clearAllMocks();
  recipe = makeRecipe({ id: 'r1', title: 'Tomato Soup', createdBy: OWNER });
  cloudError = false;
  suggestions = [sug()];
  messages = [
    msg({ id: 'm1', text: 'Why garlic?', fromUid: OWNER.uid, fromDisplayName: 'Test Cook' }),
    msg({ id: 'm2', text: 'It needs more bite', fromUid: MAYA.uid, fromDisplayName: 'Maya' }),
  ];
  subscribe.mockImplementation((_r: string, _u: string, _o: boolean, cb: (s: Suggestion[]) => void) => {
    cb(suggestions);
    return unsubSuggestions;
  });
  subscribeMessages.mockImplementation((_id: string, cb: (m: SuggestionMessage[]) => void) => {
    cb(messages);
    return unsubMessages;
  });
  addMessage.mockResolvedValue(undefined);
});

function VaryProbe() {
  const state = useLocation().state as { suggestion?: string } | null;
  return <p>Composer seeded with: {state?.suggestion}</p>;
}

function GoToS2() {
  const navigate = useNavigate();
  return <button onClick={() => navigate('/recipe/r1/suggestion/s2')}>Go to s2</button>;
}

function open(user: AppUser | null = fakeUser) {
  return renderWithProviders(
    <Routes>
      <Route
        path="/recipe/:id/suggestion/:suggestionId"
        element={
          <>
            <SuggestionThreadPage />
            <GoToS2 />
          </>
        }
      />
      <Route path="/recipe/:id/vary" element={<VaryProbe />} />
    </Routes>,
    { user, route: '/recipe/r1/suggestion/s1' }
  );
}

const input = () => screen.getByLabelText('Reply to Maya') as HTMLInputElement;

function reply(text: string) {
  fireEvent.change(input(), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
}

describe('SuggestionThreadPage', () => {
  it('pins the suggestion on top with the suggester, recipe, time and message', () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Suggestion' })).toBeInTheDocument();
    const card = screen.getByRole('region', { name: 'Suggestion' });
    expect(card).toHaveTextContent('Maya on Tomato Soup');
    expect(within(card).getByText('More garlic')).toBeInTheDocument();
    expect(within(card).getByText('just now')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  it('shows own replies right-aligned and the other person on the left, oldest first', () => {
    open();
    const items = within(screen.getByRole('list', { name: 'Replies' })).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('You: Why garlic?');
    expect(items[0].className).toContain('justify-end');
    expect(within(items[0]).getByText('Why garlic?').className).toContain('bg-accent-2-200');
    expect(items[1]).toHaveTextContent('Maya: It needs more bite');
    expect(items[1].className).toContain('justify-start');
    expect(within(items[1]).getByText('It needs more bite').className).toContain('bg-neutral-100');
  });

  it('falls back to "Someone" for a blank name and "(No message)" for a blank suggestion', () => {
    suggestions = [sug({ suggestedBy: { uid: 'maya', displayName: null }, message: '' })];
    messages = [msg({ id: 'm3', text: 'Hi', fromDisplayName: null })];
    open();
    expect(screen.getByRole('region', { name: 'Suggestion' })).toHaveTextContent('Someone on Tomato Soup');
    expect(screen.getByText('(No message)')).toBeInTheDocument();
    expect(screen.getByRole('listitem')).toHaveTextContent('Someone: Hi');
    expect(screen.getByLabelText('Reply to Someone')).toHaveAttribute('placeholder', 'Reply to Someone…');
  });

  it('sends a reply through the existing service call and clears the draft', async () => {
    open();
    expect(input()).toHaveAttribute('placeholder', 'Reply to Maya…');
    expect(screen.getByRole('button', { name: 'Send reply' })).toBeDisabled();
    reply('  Fair enough  ');
    await waitFor(() => expect(input().value).toBe(''));
    expect(addMessage).toHaveBeenCalledOnce();
    expect(addMessage).toHaveBeenCalledWith(suggestions[0], { uid: fakeUser.uid, displayName: fakeUser.displayName }, 'Fair enough');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('Enter sends too', async () => {
    open();
    fireEvent.change(input(), { target: { value: 'Ok' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    await waitFor(() => expect(addMessage).toHaveBeenCalledOnce());
  });

  it('shows the generic message for an offline or timed-out send and keeps the draft', async () => {
    addMessage.mockRejectedValueOnce(new Error('Sending the reply timed out'));
    open();
    reply('Why?');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe("Couldn't send that reply. Please try again.");
    expect(alert.className).toContain('text-danger-700');
    expect(input().value).toBe('Why?');
  });

  it('shows the reply limit message (RL-048) and keeps the draft', async () => {
    addMessage.mockRejectedValueOnce(new RateLimitedError('reply'));
    open();
    reply('Why?');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe("You've sent a lot of replies recently. Try again in a while.");
    expect(alert.className).toContain('text-danger-700');
    expect(alert.className).toContain('dark:text-danger-300');
    expect(input().value).toBe('Why?');
  });

  it('keeps the inline "Couldn\'t load replies." alert when the reply listener fails', () => {
    subscribeMessages.mockImplementation((_id: string, _cb: unknown, onError: () => void) => {
      onError();
      return () => {};
    });
    open();
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load replies.");
  });

  describe('owner actions', () => {
    it('shows Decline and Approve for the owner on a pending suggestion', () => {
      open();
      expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
      expect(subscribe).toHaveBeenCalledWith('r1', fakeUser.uid, true, expect.any(Function));
    });

    it.each([
      ['approved', 'Approved'],
      ['rejected', 'Declined'],
    ] as const)('hides them on a %s suggestion, which can still be replied to', (status, label) => {
      suggestions = [sug({ status })];
      open();
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Decline' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
      expect(input()).toBeInTheDocument();
    });

    it('hides them from the suggester, who replies to the owner', () => {
      const maya: AppUser = { ...fakeUser, uid: MAYA.uid, displayName: 'Maya' };
      open(maya);
      expect(subscribe).toHaveBeenCalledWith('r1', MAYA.uid, false, expect.any(Function));
      expect(screen.getByLabelText('Reply to Test Cook')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Decline' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    });

    it('Approve opens the variation composer seeded with the message', async () => {
      updateStatus.mockResolvedValue({ recipeId: 'r1', collaborator: { uid: MAYA.uid } });
      open();
      fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
      expect(await screen.findByText('Composer seeded with: More garlic')).toBeInTheDocument();
      expect(updateStatus).toHaveBeenCalledWith('s1', 'approved', { uid: fakeUser.uid, displayName: fakeUser.displayName });
    });

    it('a failed Approve shows the approve error and stays', async () => {
      updateStatus.mockRejectedValue(new Error('denied'));
      open();
      fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
      expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't approve that suggestion. Please try again.");
      expect(screen.queryByText(/Composer seeded/)).not.toBeInTheDocument();
    });

    it('Decline confirms first, then declines with the same notification path', async () => {
      updateStatus.mockResolvedValue(null);
      open();
      fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
      expect(updateStatus).not.toHaveBeenCalled();
      const dialog = screen.getByRole('dialog', { name: 'Decline this suggestion?' });
      expect(dialog).toHaveTextContent('"More garlic" will be marked declined and the suggester will be notified.');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Decline' }));
      await waitFor(() =>
        expect(updateStatus).toHaveBeenCalledWith('s1', 'rejected', { uid: fakeUser.uid, displayName: fakeUser.displayName })
      );
    });
  });

  describe('error state', () => {
    const expectErrorState = () => {
      expect(screen.getByRole('heading', { name: "Couldn't open this suggestion" })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(screen.queryByText('More garlic')).not.toBeInTheDocument();
    };

    it.each([
      ['signed out', null],
      ['anonymous', { ...fakeUser, isAnonymous: true, emailVerified: false }],
      ['unverified', { ...fakeUser, emailVerified: false }],
    ] as const)('%s: shows the error state and opens no listener', (_label, user) => {
      open(user);
      expectErrorState();
      expect(subscribe).not.toHaveBeenCalled();
      expect(subscribeMessages).not.toHaveBeenCalled();
    });

    it('a verified non-participant does not find it, and no reply listener opens', () => {
      const stranger: AppUser = { ...fakeUser, uid: 'stranger' };
      suggestions = [];
      open(stranger);
      expectErrorState();
      // Their own-suggestions query, which the rules allow; never the thread.
      expect(subscribe).toHaveBeenCalledWith('r1', 'stranger', false, expect.any(Function));
      expect(subscribeMessages).not.toHaveBeenCalled();
    });

    it('a missing recipe shows the error state', () => {
      recipe = undefined;
      open();
      expectErrorState();
    });
  });

  describe('loading and connection errors', () => {
    const never = () => subscribe.mockImplementation(() => unsubSuggestions);

    it('shows one loading status while the suggestions listener has not answered', () => {
      never();
      open();
      expect(screen.getByRole('status', { name: 'Loading suggestion' })).toBeInTheDocument();
      expect(screen.getAllByRole('status')).toHaveLength(1);
      expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    });

    it('after 8 seconds offers Retry, and Retry restarts the wait', () => {
      vi.useFakeTimers();
      try {
        never();
        open();
        act(() => vi.advanceTimersByTime(7999));
        expect(screen.getByRole('status', { name: 'Loading suggestion' })).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        act(() => vi.advanceTimersByTime(1));
        expect(screen.getByRole('heading', { name: "Couldn't load this suggestion" })).toBeInTheDocument();
        expect(
          screen.getByText('Check your connection and try again. If it keeps happening you may not have access to this suggestion.')
        ).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: 'Back' })).toHaveLength(1);
        expect(subscribe).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(screen.getByRole('status', { name: 'Loading suggestion' })).toBeInTheDocument();
        // The listener is re-mounted, not reused, and the old one is closed.
        expect(unsubSuggestions).toHaveBeenCalledOnce();
        expect(subscribe).toHaveBeenCalledTimes(2);
        // The timer restarts too: another full wait brings the error back.
        act(() => vi.advanceTimersByTime(7999));
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        act(() => vi.advanceTimersByTime(1));
        expect(screen.getByRole('heading', { name: "Couldn't load this suggestion" })).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it('a snapshot that arrives before the timeout shows the thread, and the timeout never fires', () => {
      vi.useFakeTimers();
      try {
        let deliver: (s: Suggestion[]) => void = () => {};
        subscribe.mockImplementation((_r: string, _u: string, _o: boolean, cb: (s: Suggestion[]) => void) => {
          deliver = cb;
          return () => {};
        });
        open();
        act(() => vi.advanceTimersByTime(5000));
        act(() => deliver(suggestions));
        act(() => vi.advanceTimersByTime(10000));
        expect(screen.getByRole('region', { name: 'Suggestion' })).toHaveTextContent('More garlic');
        expect(screen.queryByText("Couldn't load this suggestion")).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it('a snapshot that arrives after the timeout replaces the error with the thread', () => {
      vi.useFakeTimers();
      try {
        let deliver: (s: Suggestion[]) => void = () => {};
        subscribe.mockImplementation((_r: string, _u: string, _o: boolean, cb: (s: Suggestion[]) => void) => {
          deliver = cb;
          return unsubSuggestions;
        });
        open();
        act(() => vi.advanceTimersByTime(8000));
        expect(screen.getByRole('heading', { name: "Couldn't load this suggestion" })).toBeInTheDocument();
        act(() => deliver(suggestions));
        expect(screen.getByRole('region', { name: 'Suggestion' })).toHaveTextContent('More garlic');
        expect(screen.queryByText("Couldn't load this suggestion")).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it('a failed recipe lookup shows the connection copy and retries the lookup', () => {
      recipe = undefined;
      cloudError = true;
      open();
      expect(screen.getByRole('heading', { name: "Couldn't load this suggestion" })).toBeInTheDocument();
      expect(screen.queryByText("Couldn't open this suggestion")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(retryRecipe).toHaveBeenCalledOnce();
    });
  });

  it('signed out: the error state also offers Sign in, which opens the sign-in dialog', () => {
    open(null);
    expect(screen.getByRole('heading', { name: "Couldn't open this suggestion" })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('a signed-in non-participant is not offered Sign in', () => {
    suggestions = [];
    open({ ...fakeUser, uid: 'stranger' });
    expect(screen.getByRole('heading', { name: "Couldn't open this suggestion" })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('switching to another suggestion clears the draft, the send error and the Decline dialog', async () => {
    suggestions = [sug(), sug({ id: 's2', message: 'Less salt' })];
    addMessage.mockRejectedValueOnce(new Error('Sending the reply timed out'));
    open();
    reply('Why?');
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't send that reply. Please try again.");
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    expect(screen.getByRole('dialog', { name: 'Decline this suggestion?' })).toBeInTheDocument();
    expect(unsubSuggestions).not.toHaveBeenCalled();
    expect(unsubMessages).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Go to s2' }));
    expect(screen.getByRole('region', { name: 'Suggestion' })).toHaveTextContent('Less salt');
    // The old thread's listeners close; the new ones open.
    expect(unsubSuggestions).toHaveBeenCalledOnce();
    expect(unsubMessages).toHaveBeenCalledOnce();
    expect(subscribeMessages).toHaveBeenLastCalledWith('s2', expect.any(Function), expect.any(Function));
    expect(input().value).toBe('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes both listeners on unmount', () => {
    const view = open();
    expect(unsubSuggestions).not.toHaveBeenCalled();
    expect(unsubMessages).not.toHaveBeenCalled();
    view.unmount();
    expect(unsubSuggestions).toHaveBeenCalledOnce();
    expect(unsubMessages).toHaveBeenCalledOnce();
  });

  it('a second send while one is in flight is ignored', async () => {
    let finish: () => void = () => {};
    addMessage.mockImplementation(() => new Promise<void>((r) => { finish = r; }));
    open();
    fireEvent.change(input(), { target: { value: 'Once' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(addMessage).toHaveBeenCalledOnce();
    await act(async () => finish());
    expect(input().value).toBe('');
  });
});
