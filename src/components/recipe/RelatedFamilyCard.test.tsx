// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { RelatedFamilyCard, RelatedFamilies } from './RelatedFamilyCard';
import type { RelatedFamily } from '../../services/firestore';

const mocks = vi.hoisted(() => ({ get: vi.fn(), report: vi.fn(), move: vi.fn(), mirror: vi.fn() }));
vi.mock('../../services/firestore', () => ({
  getRelatedFamilies: mocks.get,
  moveIntoFamily: mocks.move,
  FAMILY_MOVE_OTHERS_MESSAGE: "This can't be moved because another cook has a version in it.",
}));
vi.mock('../../db/recipes', () => ({ moveFamilyCloudFirst: mocks.mirror }));
vi.mock('../../services/telemetry', () => ({ reportError: mocks.report }));

const fam = (id: string, over: Partial<RelatedFamily> = {}): RelatedFamily => ({
  id,
  emoji: '🍲',
  title: `Stew ${id}`,
  createdBy: { uid: 'u1', displayName: 'Ana' },
  versions: 3,
  ...over,
});

beforeEach(() => vi.clearAllMocks());
HTMLDialogElement.prototype.showModal = function () { this.open = true; };
HTMLDialogElement.prototype.close = function () { this.open = false; };

describe('RelatedFamilyCard', () => {
  it('renders nothing without families', () => {
    const { container } = renderWithProviders(<RelatedFamilyCard families={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('links each row to its recipe with the author and version count', () => {
    renderWithProviders(<RelatedFamilyCard families={[fam('a'), fam('b', { versions: 1 })]} origin="/" />);
    expect(screen.getByRole('link', { name: 'Stew a, by Ana, 3 versions' })).toHaveAttribute('href', '/recipe/a');
    expect(screen.getByRole('link', { name: /Stew b/ })).toHaveTextContent('1 version');
    expect(screen.getByRole('link', { name: /Stew a/ })).toHaveTextContent('3 versions');
    expect(screen.getAllByText('Ana')).toHaveLength(2);
  });

  it('renders a row without a count when it is unknown', () => {
    renderWithProviders(<RelatedFamilyCard families={[fam('a', { versions: undefined })]} />);
    const link = screen.getByRole('link', { name: 'Stew a, by Ana' });
    expect(link).not.toHaveTextContent('version');
  });
});

describe('RelatedFamilies', () => {
  const recipe = { id: 'r1', depth: 0 };

  it('shows the families read for the recipe, once', async () => {
    mocks.get.mockResolvedValue([fam('a'), fam('b')]);
    renderWithProviders(<RelatedFamilies recipe={recipe} />);
    expect(await screen.findAllByRole('link')).toHaveLength(2);
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(mocks.get).toHaveBeenCalledWith(recipe);
  });

  it('shows the matched original on a recipe with relatedFamilyId', async () => {
    mocks.get.mockResolvedValue([fam('root')]);
    renderWithProviders(<RelatedFamilies recipe={{ ...recipe, relatedFamilyId: 'root' }} />);
    expect(await screen.findByRole('link', { name: /Stew root/ })).toHaveAttribute('href', '/recipe/root');
  });

  it('renders nothing when the read is empty', async () => {
    mocks.get.mockResolvedValue([]);
    const { container } = renderWithProviders(<RelatedFamilies recipe={recipe} />);
    await waitFor(() => expect(mocks.get).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('swallows an error, reports it once, and renders nothing', async () => {
    mocks.get.mockRejectedValue(new Error('denied'));
    const { container } = renderWithProviders(<RelatedFamilies recipe={recipe} />);
    await waitFor(() => expect(mocks.report).toHaveBeenCalledTimes(1));
    expect(mocks.report.mock.calls[0][1]).toBe('related-families');
    expect(container).toBeEmptyDOMElement();
  });
});

describe('RelatedFamilies move line (RL-164)', () => {
  const recipe = { id: 'n', depth: 0, relatedFamilyId: 'root' };
  const move = (over = {}) => ({
    mover: { uid: 'me', displayName: 'Me' },
    othersInFamily: false,
    branches: 2,
    onStart: vi.fn(),
    onDone: vi.fn(),
    ...over,
  });

  it('asks before moving, then reports the move to the page', async () => {
    mocks.get.mockResolvedValue([fam('root')]);
    mocks.mirror.mockResolvedValue({ changes: [], leftBehind: 1, mirrored: true });
    const props = move();
    renderWithProviders(<RelatedFamilies recipe={recipe} move={props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Move it into that family' }));
    expect(screen.getByText('It becomes a branch of Stew root, with its 2 branches. You stay the author.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(props.onDone).toHaveBeenCalledWith(true, 'One branch by another cook stayed behind.'));
    expect(props.onStart).toHaveBeenCalled();
    expect(mocks.move).toHaveBeenCalledWith('me', 'Me', 'n', 'root');
  });

  it('shows an inline error when the move fails', async () => {
    mocks.get.mockResolvedValue([fam('root')]);
    mocks.mirror.mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    const props = move();
    renderWithProviders(<RelatedFamilies recipe={recipe} move={props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Move it into that family' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("One version can't be moved; it may be too large.");
    expect(props.onDone).toHaveBeenCalledWith(false);
  });

  it('offers no button while another cook has a version in the family', async () => {
    mocks.get.mockResolvedValue([fam('root')]);
    renderWithProviders(<RelatedFamilies recipe={recipe} move={move({ othersInFamily: true })} />);
    expect(await screen.findByText("This can't be moved because another cook has a version in it.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Move/ })).toBeNull();
  });
});
