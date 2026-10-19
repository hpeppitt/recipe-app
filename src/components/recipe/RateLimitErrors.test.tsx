// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders, fakeUser } from '../../test/renderWithProviders';
import { RateLimitedError } from '../../lib/errors';
import type { Suggestion } from '../../types/social';

vi.mock('../../services/firebase', () => ({ isFirebaseConfigured: false }));
const send = vi.fn();
vi.mock('../../hooks/useSuggestions', () => ({
  useSuggestionThread: () => ({ messages: [], error: null, send }),
}));

import { SuggestChangeModal } from './SuggestChangeModal';
import { SuggestionThread } from './SuggestionThread';

beforeAll(() => {
  // jsdom has no <dialog> modal support.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const offline = Object.assign(new Error('offline'), { code: 'unavailable' });

describe('SuggestChangeModal error slot (RL-048)', () => {
  async function submitWith(err: unknown) {
    renderWithProviders(
      <SuggestChangeModal open recipeTitle="Soup" onSubmit={() => Promise.reject(err)} onClose={() => {}} />
    );
    fireEvent.change(screen.getByPlaceholderText(/Add more garlic/), { target: { value: 'More salt' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send Suggestion' }));
    return screen.findByRole('alert');
  }

  it('shows the suggestion limit message', async () => {
    const alert = await submitWith(new RateLimitedError('suggestion'));
    expect(alert.textContent).toBe("You've sent a lot of suggestions recently. Try again in a while.");
    expect(alert.className).toContain('text-danger-700');
    expect(alert.className).toContain('dark:text-danger-300');
  });

  it('shows the generic message for an offline or timed-out send', async () => {
    const alert = await submitWith(offline);
    expect(alert.textContent).toBe("That didn't send. Check your connection and try again.");
  });
});

describe('SuggestionThread reply error slot (RL-048)', () => {
  const suggestion = {
    id: 's1',
    recipeId: 'r1',
    recipeOwnerId: 'owner',
    recipeTitle: 'Soup',
    suggestedBy: { uid: fakeUser.uid, displayName: 'Test Cook' },
    message: 'More salt',
    status: 'pending',
    createdAt: 1,
  } as Suggestion;

  async function replyWith(err: unknown) {
    send.mockRejectedValueOnce(err);
    renderWithProviders(<SuggestionThread suggestion={suggestion} />);
    fireEvent.change(screen.getByLabelText('Reply to this suggestion'), { target: { value: 'Why?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    return screen.findByRole('alert');
  }

  it('shows the reply limit message and keeps the draft', async () => {
    const alert = await replyWith(new RateLimitedError('reply'));
    expect(alert.textContent).toBe("You've sent a lot of replies recently. Try again in a while.");
    expect(alert.className).toContain('text-danger-700');
    expect(alert.className).toContain('dark:text-danger-300');
    expect((screen.getByLabelText('Reply to this suggestion') as HTMLInputElement).value).toBe('Why?');
  });

  it('shows the generic message for an offline or timed-out send', async () => {
    const alert = await replyWith(new Error('Sending the reply timed out'));
    expect(alert.textContent).toBe("Couldn't send that reply. Please try again.");
  });
});
