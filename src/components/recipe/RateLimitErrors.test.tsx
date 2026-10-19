// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { RateLimitedError } from '../../lib/errors';

vi.mock('../../services/firebase', () => ({ isFirebaseConfigured: false }));

import { SuggestChangeModal } from './SuggestChangeModal';

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

// The reply error slot moved with the thread to src/pages/SuggestionThreadPage.test.tsx (RL-106).
