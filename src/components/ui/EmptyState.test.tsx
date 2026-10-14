// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders the action and fires its handler', async () => {
    const onClick = vi.fn();
    renderWithProviders(
      <EmptyState title="Nothing here" action={<button onClick={onClick}>Create one</button>} />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Create one' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
