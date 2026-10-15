// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SavedToast } from './SavedToast';
import { RateLimitedError, rateLimitMessage } from '../../lib/errors';

describe('SavedToast (RL-049 publish limit slot)', () => {
  afterEach(cleanup);

  it('says why a save stayed local when the daily publish limit was hit', () => {
    render(<SavedToast outcome="local" note={rateLimitMessage(new RateLimitedError('recipe'))} />);
    const toast = screen.getByRole('status');
    expect(toast.textContent).toContain('Saved on this device');
    expect(toast.textContent).toContain("You've published a lot today. Try again tomorrow.");
    expect(toast.textContent).not.toContain('Sharing this recipe will retry');
  });

  it('keeps the generic local-only explanation for any other failure', () => {
    render(<SavedToast outcome="local" note={null} />);
    expect(screen.getByRole('status').textContent).toContain(
      "It couldn't be shared to the library just now, so others can't see it yet. Sharing this recipe will retry."
    );
  });

  it('shows no note on a cloud save', () => {
    render(<SavedToast outcome="cloud" note="ignored" />);
    expect(screen.getByRole('status').textContent).toBe('Recipe saved');
  });
});
