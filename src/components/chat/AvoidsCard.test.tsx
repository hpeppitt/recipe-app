// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(cleanup);
import { AvoidsCard } from './AvoidsCard';

const setup = (onSave = vi.fn().mockResolvedValue(undefined), onSkip = vi.fn().mockResolvedValue(undefined)) => {
  render(<AvoidsCard onSave={onSave} onSkip={onSkip} />);
  return { onSave, onSkip, user: userEvent.setup() };
};

describe('AvoidsCard (RL-234)', () => {
  it('disables Save until something is picked, and chips toggle with aria-pressed', async () => {
    const { user } = setup();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    const peanuts = screen.getByRole('button', { name: 'Peanuts' });
    await user.click(peanuts);
    expect(peanuts).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    await user.click(peanuts);
    expect(peanuts).toHaveAttribute('aria-pressed', 'false');
  });

  it('saves the picked chips and a normalised custom term', async () => {
    const { onSave, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Pork' }));
    await user.click(screen.getByRole('button', { name: 'Something else' }));
    await user.type(screen.getByLabelText('Something else to avoid'), '  CORIANDER ');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(['Pork', 'Coriander']);
  });

  it('refuses a custom term that repeats a chip', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Pork' }));
    await user.click(screen.getByRole('button', { name: 'Something else' }));
    await user.type(screen.getByLabelText('Something else to avoid'), 'pork');
    expect(screen.getByRole('alert')).toHaveTextContent('already picked');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('Skip calls onSkip', async () => {
    const { onSkip, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onSkip).toHaveBeenCalled();
  });

  it('keeps the card with a message when saving fails', async () => {
    const { user } = setup(vi.fn().mockRejectedValue(new Error('x')));
    await user.click(screen.getByRole('button', { name: 'Dairy' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText("Couldn't save that. Try again.")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('Enter in the Something else field saves when valid', async () => {
    const { onSave, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Something else' }));
    await user.type(screen.getByPlaceholderText('e.g. coriander'), 'fennel{Enter}');
    expect(onSave).toHaveBeenCalledWith(['Fennel']);
  });

  it('shows Saving... while the save runs', async () => {
    const { user } = setup(vi.fn(() => new Promise<void>(() => {})));
    await user.click(screen.getByRole('button', { name: 'Dairy' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
  });
});
