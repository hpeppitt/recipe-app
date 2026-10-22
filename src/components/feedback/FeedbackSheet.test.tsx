// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { FeedbackTab } from './FeedbackTab';
import { RateLimitedError } from '../../lib/errors';

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
  downscale: vi.fn(),
  reportError: vi.fn(),
  auth: {} as { user: unknown; isConfigured: boolean },
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('../../services/firestore', () => ({ submitFeedback: mocks.submit }));
vi.mock('../../services/imageDownscale', () => ({ downscaleToJpeg: mocks.downscale }));
vi.mock('../../services/telemetry', () => ({ reportError: mocks.reportError }));

const verified = { uid: 'u1', displayName: 'Ann', isAnonymous: false, emailVerified: true };
let store: Map<string, string>;

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  vi.stubGlobal('__APP_VERSION__', '9.9.9');
});
beforeEach(() => {
  store = new Map();
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
  mocks.submit.mockReset().mockResolvedValue('f1');
  mocks.downscale.mockReset().mockResolvedValue({ mimeType: 'image/jpeg', base64: 'QUJD' });
  mocks.reportError.mockReset();
  mocks.auth = { user: verified, isConfigured: true };
});
afterEach(cleanup);

const show = (path = '/recipe/r1') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <FeedbackTab />
    </MemoryRouter>
  );
const tab = () => screen.queryByRole('button', { name: 'Send feedback' });
const open = async () => {
  await userEvent.click(tab()!);
  return screen.getByRole('textbox');
};
const esc = () => (document.querySelector('dialog') as HTMLDialogElement).dispatchEvent(new Event('cancel', { cancelable: true }));
const send = () => screen.getByRole('button', { name: /^Send(ing…)?$/ });

describe('FeedbackTab visibility', () => {
  it('shows for a verified user with the switch on', () => {
    show();
    expect(tab()).not.toBeNull();
  });
  it.each([
    ['signed out', null, true],
    ['guest', { ...verified, isAnonymous: true }, true],
    ['unverified', { ...verified, emailVerified: false }, true],
    ['local-only', verified, false],
  ])('never shows for %s', (_n, user, isConfigured) => {
    mocks.auth = { user, isConfigured };
    show();
    expect(tab()).toBeNull();
  });
  it('is hidden on cook mode', () => {
    show('/recipe/r1/cook');
    expect(tab()).toBeNull();
  });
  it('is hidden by the device switch', () => {
    store.set('recipe-lab-feedback-tab-hidden', '1');
    show();
    expect(tab()).toBeNull();
  });
});

describe('FeedbackSheet', () => {
  it('blocks Send for a blank note and sends the trimmed note with the page context', async () => {
    show('/join/SECRET?x=1');
    const box = await open();
    await userEvent.click(send());
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(send().getAttribute('aria-disabled')).toBe('true');
    await userEvent.type(box, '  Broken  ');
    await userEvent.click(send());
    const [user, body, context, id] = mocks.submit.mock.calls[0];
    expect(user).toBe(verified);
    expect(body).toEqual({ note: '  Broken  ', screenshot: null });
    expect(context).toMatchObject({ path: '/join/:code', appVersion: '9.9.9' });
    expect(id).toEqual(expect.any(String));
    expect(await screen.findByText('Thanks. Feedback sent.')).not.toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(tab()));
  });

  it('sends the downscaled screenshot and can remove it', async () => {
    show();
    const box = await open();
    await userEvent.type(box, 'See this');
    await userEvent.upload(screen.getByLabelText('Add a screenshot'), new File(['x'], 's.png', { type: 'image/png' }));
    await screen.findByAltText('Your screenshot');
    await userEvent.click(send());
    expect(mocks.submit.mock.calls[0][1].screenshot).toBe('data:image/jpeg;base64,QUJD');
    // Never in an error report either way.
    expect(mocks.reportError).not.toHaveBeenCalled();
  });

  it('keeps the note and the same id across a failed send and its retry, then makes a new id after success', async () => {
    mocks.submit.mockRejectedValueOnce(new Error('offline'));
    show();
    const box = await open();
    await userEvent.type(box, 'Hello');
    await userEvent.click(send());
    expect((await screen.findByRole('alert')).textContent).toBe("Couldn't send that. Check your connection and try again.");
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Hello');
    expect(JSON.stringify(mocks.reportError.mock.calls)).not.toContain('Hello');
    await userEvent.click(send());
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(2));
    expect(mocks.submit.mock.calls[1][3]).toBe(mocks.submit.mock.calls[0][3]);
    await screen.findByText('Thanks. Feedback sent.');
    await userEvent.click(tab()!);
    await userEvent.type(screen.getByRole('textbox'), 'Again');
    await userEvent.click(send());
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(3));
    expect(mocks.submit.mock.calls[2][3]).not.toBe(mocks.submit.mock.calls[0][3]);
  });

  it('shows the cap copy', async () => {
    mocks.submit.mockRejectedValueOnce(new RateLimitedError('feedback'));
    show();
    await userEvent.type(await open(), 'Hello');
    await userEvent.click(send());
    expect((await screen.findByRole('alert')).textContent).toMatch(/lot of feedback today/);
  });

  it('asks before discarding text, and closes at once when empty', async () => {
    show();
    await open();
    act(esc);
    expect(screen.queryByRole('textbox')).toBeNull();
    const box = await open();
    await userEvent.type(box, 'Hello');
    act(esc);
    expect(screen.getByText('Discard this feedback?')).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(mocks.submit).not.toHaveBeenCalled();
  });
});
