// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MadeByRow, type RecipeCooks } from './MadeByRow';
import { makeCook } from '../../test/factories';

const mocks = vi.hoisted(() => ({ deleteCook: vi.fn(), deleteCookPhoto: vi.fn(), uid: 'me' }));
vi.mock('../../services/firestore', () => ({ deleteCook: mocks.deleteCook, deleteCookPhoto: mocks.deleteCookPhoto }));
vi.mock('../../services/telemetry', () => ({ reportError: vi.fn() }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.uid ? { uid: mocks.uid } : null }) }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
beforeEach(() => {
  mocks.deleteCook.mockReset().mockResolvedValue(undefined);
  mocks.deleteCookPhoto.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

const cooks = (over: Partial<RecipeCooks> & { total?: number; again?: number; recent?: ReturnType<typeof makeCook>[] } = {}): RecipeCooks => ({
  status: over.status ?? 'ready',
  refresh: over.refresh ?? vi.fn(),
  summary: { total: over.total ?? 0, again: over.again ?? 0, recent: over.recent ?? [] },
});

describe('MadeByRow', () => {
  it('is hidden while loading, at zero cooks and on error', () => {
    for (const status of ['loading', 'error'] as const) {
      const { container } = render(<MadeByRow cooks={cooks({ status, total: 3 })} />);
      expect(container.textContent).toBe('');
      cleanup();
    }
    const { container } = render(<MadeByRow cooks={cooks()} />);
    expect(container.textContent).toBe('');
  });

  it('reads singular and plural copy', () => {
    render(<MadeByRow cooks={cooks({ total: 1, again: 1, recent: [makeCook()] })} />);
    expect(screen.getByText('Made once')).toBeTruthy();
    cleanup();
    render(<MadeByRow cooks={cooks({ total: 31, again: 27, recent: [makeCook()] })} />);
    expect(screen.getByText('Made 31 times').tagName).toBe('STRONG');
    expect(screen.getByText(/27 would make again/)).toBeTruthy();
  });

  it('caps the avatar stack at three distinct cooks', () => {
    const recent = [1, 2, 3, 4].map((n) => makeCook({ uid: `u${n}`, displayName: `Cook ${n}`, createdAt: n }));
    const { container } = render(<MadeByRow cooks={cooks({ total: 4, recent })} />);
    expect(container.querySelectorAll('.ring-2').length).toBe(3);
  });

  it('shows Notes only when a note exists, and lists notes in the sheet', async () => {
    const { rerender } = render(<MadeByRow cooks={cooks({ total: 1, recent: [makeCook()] })} />);
    expect(screen.queryByRole('button', { name: 'Notes' })).toBeNull();
    rerender(<MadeByRow cooks={cooks({ total: 2, recent: [makeCook({ note: 'Less salt', vote: 'tweak', displayName: 'Bea' }), makeCook({ note: 'Lovely' })] })} />);
    const btn = screen.getByRole('button', { name: 'Notes' });
    expect(btn.getAttribute('aria-haspopup')).toBe('dialog');
    await userEvent.click(btn);
    expect(screen.getByText('Notes from cooks')).toBeTruthy();
    expect(screen.getByText('Less salt')).toBeTruthy();
    expect(screen.getByText('Lovely')).toBeTruthy();
    expect(screen.getByText('Tweak')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('lets the viewer delete only their own cook, after confirming, then refreshes', async () => {
    const refresh = vi.fn();
    const mine = makeCook({ id: 'c-mine', uid: 'me', note: 'Mine' });
    render(<MadeByRow cooks={cooks({ total: 2, refresh, recent: [mine, makeCook({ note: 'Theirs' })] })} />);
    await userEvent.click(screen.getByRole('button', { name: 'Notes' }));
    const del = screen.getAllByRole('button', { name: 'Delete' });
    expect(del.length).toBe(1);
    await userEvent.click(del[0]);
    expect(mocks.deleteCook).not.toHaveBeenCalled();
    expect(screen.getByText('Delete this cook?')).toBeTruthy();
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(mocks.deleteCook).toHaveBeenCalledWith('c-mine');
  });

  it('offers the cook Remove photo on their own shown photo only, then asks for the next one', async () => {
    const onPhotoChanged = vi.fn();
    const mine = makeCook({ id: 'c-mine', uid: 'me', note: 'Mine' });
    const other = makeCook({ id: 'c-other', note: 'Theirs' });
    render(<MadeByRow cooks={cooks({ total: 2, recent: [mine, other] })} photoCookId="c-mine" onPhotoChanged={onPhotoChanged} />);
    await userEvent.click(screen.getByRole('button', { name: 'Notes' }));
    const remove = screen.getAllByRole('button', { name: 'Remove photo' });
    expect(remove.length).toBe(1);
    await userEvent.click(remove[0]);
    await userEvent.click(screen.getAllByRole('button', { name: 'Remove photo' }).at(-1)!);
    await waitFor(() => expect(onPhotoChanged).toHaveBeenCalled());
    expect(mocks.deleteCookPhoto).toHaveBeenCalledWith('c-mine');
  });

  it('lists the viewer\'s own photo cook without a note as Photo only, with Remove photo', async () => {
    render(<MadeByRow cooks={cooks({ total: 1, recent: [makeCook({ id: 'c-mine', uid: 'me', note: null })] })} photoCookId="c-mine" />);
    await userEvent.click(screen.getByRole('button', { name: 'Notes' }));
    expect(screen.getByText('Photo only')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove photo' })).toBeTruthy();
  });
});
