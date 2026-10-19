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

  it('renders the error tone with a node icon', () => {
    const { container } = renderWithProviders(
      <EmptyState tone="error" icon={<svg data-testid="ico" />} title="Offline" />
    );
    expect(screen.getByTestId('ico')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Offline' })).toBeTruthy();
    expect(container.querySelector('.bg-accent-200')).toBeTruthy();
    expect(container.querySelector('.bg-accent-2-200')).toBeNull();
  });

  it('uses the sage circle by default and keeps compact as a paragraph', () => {
    const { container } = renderWithProviders(<EmptyState title="Empty" icon="🍳" />);
    expect(container.querySelector('.bg-accent-2-200')).toBeTruthy();
    renderWithProviders(<EmptyState compact title="Small" />);
    expect(screen.getByText('Small').tagName).toBe('P');
  });
});
