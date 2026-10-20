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
  const props = { suggestions, isOwner: true, reviewingId: null, reviewError: null, onApply: vi.fn(), onKeepAsBranch: vi.fn(), onDecline: vi.fn(), ...over };
  const view = renderWithProviders(<SuggestionList {...props} />);
  return { ...props, view };
}

const one = sug({ id: 'a' });
const withEdits = sug({
  id: 'e',
  edits: [
    { kind: 'ingredient', index: 0, name: 'light brown sugar', from: '150 g', to: '100 g', why: 'Less sweet' },
    { kind: 'step', index: 1, from: 'Bake', to: 'Bake longer' },
  ],
});
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

  it('owner: heading, counts and an open card with Decline, Replies and Apply', () => {
    show([one, ...closed]);
    expect(screen.getByRole('heading', { name: 'Suggestions' })).toBeInTheDocument();
    expect(screen.getByText('1 open · 2 closed')).toBeInTheDocument();
    expect(screen.getByText('More garlic')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    for (const name of [/^Decline suggestion/, /^Mark applied suggestion/]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'Replies' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^approve$/i })).not.toBeInTheDocument();
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

  it('non-owner: "Your suggestion" heading, one Reply link, no actions', () => {
    show([one], { isOwner: false });
    expect(screen.getByRole('heading', { name: 'Your suggestion' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Reply' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /apply|applied|more options/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Decline suggestion from/ })).not.toBeInTheDocument();
  });

  it('closed rows are buttons named by message and status, with the status tag', () => {
    show(closed);
    const approved = screen.getByRole('button', { name: 'Maya: Add lime, Approved' });
    expect(within(approved).getByText('Approved')).toBeInTheDocument();
    const declined = screen.getByRole('button', { name: 'Someone: Use tofu, Declined' });
    expect(within(declined).getByText('Declined')).toBeInTheDocument();
    // Missing suggester name falls back, and the pill is not a link inside a button.
    expect(within(declined).getByText('Someone')).toBeInTheDocument();
    expect(within(approved).queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Decline suggestion from/ })).not.toBeInTheDocument();
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
      [[closed[0]], true, 'Maya: Add lime, Approved', '/recipe/r/suggestion/b'],
    ];
    for (const [items, isOwner, name, path] of cases) {
      const view = renderWithProviders(
        <Routes>
          <Route
            path="/"
            element={<SuggestionList suggestions={items} isOwner={isOwner} reviewingId={null} reviewError={null} onApply={vi.fn()} onKeepAsBranch={vi.fn()} onDecline={vi.fn()} />}
          />
          <Route path="*" element={<Where />} />
        </Routes>
      );
      const button = screen.getByRole(name.startsWith('Repl') ? 'link' : 'button', { name });
      // Navigates now; nothing expands inline any more.
      expect(button).not.toHaveAttribute('aria-expanded');
      fireEvent.click(button);
      expect(screen.getByTestId('path')).toHaveTextContent(path);
      expect(screen.queryByText('No replies yet.')).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it('Apply calls onApply straight away', () => {
    const { onApply } = show([withEdits]);
    fireEvent.click(screen.getByRole('button', { name: /^Apply suggestion from/ }));
    expect(onApply).toHaveBeenCalledWith('e');
  });

  it('Keep as branch is in More options, only with applicable edits', () => {
    const { onKeepAsBranch, view } = show([withEdits]);
    fireEvent.click(screen.getByRole('button', { name: /^More options for/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep as branch' }));
    expect(onKeepAsBranch).toHaveBeenCalledWith('e');
    view.unmount();
    show([sug({ id: 'g', edits: [{ kind: 'general', from: '', to: 'Nice' }] }), one]);
    expect(screen.queryByRole('button', { name: /^More options for/ })).not.toBeInTheDocument();
  });

  it('shows diff rows for ingredient and step edits, and the note', () => {
    show([withEdits]);
    expect(screen.getByText('Change light brown sugar from 150 g to 100 g')).toBeInTheDocument();
    expect(screen.getByText('Change step 2 to: Bake longer')).toBeInTheDocument();
    expect(screen.getByText('Less sweet')).toBeInTheDocument();
    expect(screen.getByText('150 g').tagName).toBe('S');
  });

  it('a free-text suggestion reads Mark applied', () => {
    show([one]);
    expect(screen.queryByRole('button', { name: /^Apply suggestion from/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Mark applied suggestion from/ })).toBeInTheDocument();
  });

  it('closed tags for every status; Branched opens the branch', () => {
    function Where() {
      return <p data-testid="path">{useLocation().pathname}</p>;
    }
    const rows = [
      sug({ id: 'x1', status: 'applied', message: 'm1' }),
      sug({ id: 'x2', status: 'branched', branchId: 'br', message: 'm2' }),
      sug({ id: 'x3', status: 'rejected', message: 'm3' }),
      sug({ id: 'x4', status: 'approved', message: 'm4' }),
    ];
    renderWithProviders(
      <Routes>
        <Route path="/" element={<SuggestionList suggestions={rows} isOwner reviewingId={null} reviewError={null} onApply={vi.fn()} onKeepAsBranch={vi.fn()} onDecline={vi.fn()} />} />
        <Route path="*" element={<Where />} />
      </Routes>
    );
    for (const [m, t] of [['m1', 'Applied'], ['m2', 'Branched'], ['m3', 'Declined'], ['m4', 'Approved']]) {
      expect(screen.getByRole('button', { name: `Maya: ${m}, ${t}${m === 'm2' ? ', opens branch' : ''}` })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Maya: m2, Branched, opens branch' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/recipe/br');
  });

  it('Decline asks first, and only the confirm reviews', () => {
    const { onDecline: onReview } = show([one]);
    fireEvent.click(screen.getByRole('button', { name: /^Decline suggestion from/ }));
    expect(onReview).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: 'Decline this suggestion?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onReview).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^Decline suggestion from/ }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Decline this suggestion?' })).getByRole('button', { name: 'Decline' }));
    expect(onReview).toHaveBeenCalledOnce();
    expect(onReview).toHaveBeenCalledWith('a');
  });

  it('shows the review error and disables review while one is in flight', () => {
    show([one], { reviewError: "Couldn't apply that suggestion. Please try again.", reviewingId: 'a' });
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't apply that suggestion. Please try again.");
    expect(screen.getByRole('button', { name: 'Working…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Decline suggestion from/ })).toBeDisabled();
  });
});
