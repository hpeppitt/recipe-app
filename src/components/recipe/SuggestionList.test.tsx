// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';
import { SuggestionList } from './SuggestionList';
import type { Suggestion } from '../../types/social';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});

const sug = (over: Partial<Suggestion>): Suggestion => ({
  id: 's',
  recipeId: 'r',
  recipeOwnerId: 'owner',
  recipeTitle: 'T',
  suggestedBy: { uid: 'u1', displayName: 'Maya' },
  message: 'More garlic',
  status: 'pending',
  createdAt: Date.now(),
  ...over,
});

function show(suggestions: Suggestion[], over: Partial<Parameters<typeof SuggestionList>[0]> = {}) {
  const props = { suggestions, isOwner: true, reviewingId: null, reviewError: null, onReview: vi.fn(), ...over };
  const view = renderWithProviders(<SuggestionList {...props} />);
  return { ...props, view };
}

const one = sug({ id: 'a' });
const closed = [
  sug({ id: 'b', status: 'approved', message: 'Add lime' }),
  sug({ id: 'c', status: 'rejected', message: 'Use tofu', suggestedBy: { uid: 'u2', displayName: null } }),
];

describe('SuggestionList', () => {
  it('renders nothing when there are no suggestions', () => {
    const { view } = show([]);
    expect(view.container).toBeEmptyDOMElement();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('owner: heading, counts and an open card with Decline, Replies and Approve', () => {
    show([one, ...closed]);
    expect(screen.getByRole('heading', { name: 'Suggestions' })).toBeInTheDocument();
    expect(screen.getByText('1 open · 2 closed')).toBeInTheDocument();
    expect(screen.getByText('More garlic')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    for (const name of ['Decline', 'Replies', 'Approve']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'Maya' })).toHaveAttribute('href', '/profile/u1');
  });

  it('counts read correctly with zero open or zero closed', () => {
    const a = show([one]);
    expect(screen.getByText('1 open')).toBeInTheDocument();
    a.view.unmount();
    show(closed);
    expect(screen.getByText('2 closed')).toBeInTheDocument();
    expect(screen.queryByText(/open/)).not.toBeInTheDocument();
  });

  it('non-owner: "Your suggestion" heading, one Reply button, no Approve or Decline', () => {
    show([one], { isOwner: false });
    expect(screen.getByRole('heading', { name: 'Your suggestion' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reply' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Decline' })).not.toBeInTheDocument();
  });

  it('closed rows are buttons named by message and status, with the status tag', () => {
    show(closed);
    const approved = screen.getByRole('button', { name: 'Add lime, Approved' });
    expect(within(approved).getByText('Approved')).toBeInTheDocument();
    const declined = screen.getByRole('button', { name: 'Use tofu, Declined' });
    expect(within(declined).getByText('Declined')).toBeInTheDocument();
    // Missing suggester name falls back, and the pill is not a link inside a button.
    expect(within(declined).getByText('Someone')).toBeInTheDocument();
    expect(within(approved).queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Decline' })).not.toBeInTheDocument();
  });

  it('a blank message gets a fallback', () => {
    show([sug({ message: '' })]);
    expect(screen.getByText('(No message)')).toBeInTheDocument();
  });

  it('Replies, Reply and a closed row open the thread screen (RL-106)', () => {
    function Where() {
      return <p data-testid="path">{useLocation().pathname}</p>;
    }
    const cases: Array<[Suggestion[], boolean, string, string]> = [
      [[one], true, 'Replies', '/recipe/r/suggestion/a'],
      [[one], false, 'Reply', '/recipe/r/suggestion/a'],
      [[closed[0]], true, 'Add lime, Approved', '/recipe/r/suggestion/b'],
    ];
    for (const [items, isOwner, name, path] of cases) {
      const view = renderWithProviders(
        <Routes>
          <Route
            path="/"
            element={<SuggestionList suggestions={items} isOwner={isOwner} reviewingId={null} reviewError={null} onReview={vi.fn()} />}
          />
          <Route path="*" element={<Where />} />
        </Routes>
      );
      const button = screen.getByRole('button', { name });
      // Navigates now; nothing expands inline any more.
      expect(button).not.toHaveAttribute('aria-expanded');
      fireEvent.click(button);
      expect(screen.getByTestId('path')).toHaveTextContent(path);
      expect(screen.queryByText('No replies yet.')).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it('Approve calls onReview straight away', () => {
    const { onReview } = show([one]);
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onReview).toHaveBeenCalledWith('a', 'approve', 'More garlic');
  });

  it('Decline asks first, and only the confirm reviews', () => {
    const { onReview } = show([one]);
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    expect(onReview).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: 'Decline this suggestion?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onReview).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Decline this suggestion?' })).getByRole('button', { name: 'Decline' }));
    expect(onReview).toHaveBeenCalledOnce();
    expect(onReview).toHaveBeenCalledWith('a', 'reject', 'More garlic');
  });

  it('shows the review error and disables review while one is in flight', () => {
    show([one], { reviewError: "Couldn't approve that suggestion. Please try again.", reviewingId: 'a' });
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't approve that suggestion. Please try again.");
    expect(screen.getByRole('button', { name: 'Working…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeDisabled();
  });
});
