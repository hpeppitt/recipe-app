// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { screen, fireEvent, act, render } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';
import { AuthContext, type AuthContextType, type EmailLinkState } from '../../contexts/AuthContext';
import { getTermsAcceptance } from '../../services/storage';

vi.mock('../../services/firebase', () => ({ isFirebaseConfigured: false }));

import { EmailLinkStatus } from './EmailLinkStatus';

const BOX = 'I accept the Terms of Service and have read the Privacy Policy';

beforeAll(() => {
  // jsdom has no <dialog> modal support.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});

beforeEach(() => {
  // Node's own localStorage global shadows jsdom's and is unusable without a file.
  const m = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  });
});

/**
 * A provider that behaves like AuthContext for this component: dismissLinkState
 * returns to idle, and `set` moves between states as completion would.
 */
function mount(initial: EmailLinkState, submitLinkEmail: AuthContextType['submitLinkEmail'] = async () => {}) {
  const dismiss = vi.fn();
  const ctl: { set: (s: EmailLinkState) => void } = { set: () => {} };
  function Harness() {
    const [linkState, setLinkState] = useState(initial);
    useEffect(() => {
      ctl.set = setLinkState;
    }, []);
    const value = {
      linkState,
      submitLinkEmail,
      dismissLinkState: () => {
        dismiss();
        setLinkState({ status: 'idle' });
      },
    } as unknown as AuthContextType;
    return (
      <AuthContext.Provider value={value}>
        <p>page underneath</p>
        <EmailLinkStatus />
      </AuthContext.Provider>
    );
  }
  render(
    <MemoryRouter>
      <Harness />
    </MemoryRouter>
  );
  return { dismiss, set: (s: EmailLinkState) => act(() => ctl.set(s)) };
}

const dialog = () => document.querySelector('dialog')!;
const escape = () => {
  const cancel = new Event('cancel', { cancelable: true });
  act(() => void dialog().dispatchEvent(cancel));
  return cancel;
};
const backdropTap = () => {
  fireEvent.pointerDown(dialog());
  fireEvent.click(dialog());
};

const dismissible: [string, EmailLinkState, string, string][] = [
  ['expired', { status: 'error', reason: 'expired' }, 'That sign-in link has expired', 'OK'],
  ['email-taken', { status: 'error', reason: 'email-taken' }, 'That email already has an account', 'OK'],
  ['failed', { status: 'error', reason: 'failed' }, "That sign-in link didn't work", 'OK'],
  ['linked', { status: 'done', linked: true }, "You're signed in, and your bookmarks came with you", 'Got it'],
];

describe('EmailLinkStatus', () => {
  it('renders nothing open while idle or after a plain sign-in', () => {
    const { set } = mount({ status: 'idle' });
    expect(dialog()).not.toHaveAttribute('open');
    expect(screen.queryByRole('dialog')).toBeNull();
    set({ status: 'done', linked: false });
    expect(dialog()).not.toHaveAttribute('open');
    expect(screen.getByText('page underneath')).toBeInTheDocument();
  });

  it('completing is a named spinner sheet with one live status, no actions, focused on its headline', () => {
    mount({ status: 'completing' });
    const sheet = screen.getByRole('dialog', { name: 'Signing you in…' });
    expect(sheet).toHaveAttribute('open');
    expect(screen.getByRole('heading', { name: 'Signing you in…' })).toHaveFocus();
    // The Spinner's own status is hidden, so only the text is announced.
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent(/^Signing you in…$/);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('completing cannot be dismissed by Escape or a backdrop tap', () => {
    const { dismiss } = mount({ status: 'completing' });
    const cancel = escape();
    expect(cancel.defaultPrevented).toBe(true);
    backdropTap();
    expect(dismiss).not.toHaveBeenCalled();
    expect(dialog()).toHaveAttribute('open');
  });

  it.each(dismissible)('%s shows its headline as the sheet name, focused, and its action', (_, state, name, action) => {
    mount(state);
    expect(screen.getByRole('dialog', { name })).toHaveAttribute('open');
    expect(screen.getByRole('heading', { name })).toHaveFocus();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([action]);
  });

  it.each(dismissible)('%s closes through its action, once, and stays closed', (_, state, name, action) => {
    const { dismiss } = mount(state);
    fireEvent.click(screen.getByRole('button', { name: action }));
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(dialog()).not.toHaveAttribute('open');
    expect(screen.queryByRole('heading', { name })).toBeNull();
  });

  it.each(dismissible)('%s closes on Escape, calling dismissLinkState once', (_, state) => {
    const { dismiss } = mount(state);
    escape();
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(dialog()).not.toHaveAttribute('open');
  });

  it.each(dismissible)('%s closes on a backdrop tap, calling dismissLinkState once', (_, state) => {
    const { dismiss } = mount(state);
    backdropTap();
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(dialog()).not.toHaveAttribute('open');
  });

  it('a tap inside the panel does not close it', () => {
    const { dismiss } = mount({ status: 'error', reason: 'failed' });
    const heading = screen.getByRole('heading', { name: "That sign-in link didn't work" });
    fireEvent.pointerDown(heading);
    fireEvent.click(heading);
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('keeps the failure bodies, with the corrected email-taken copy', () => {
    const { set } = mount({ status: 'error', reason: 'expired' });
    expect(dialog()).toHaveTextContent(
      'Links can only be used once, and they time out. Request a new one and it will work.'
    );
    set({ status: 'error', reason: 'email-taken' });
    expect(dialog()).toHaveTextContent(
      'Signing in with it will take you to that account, so bookmarks you made here as a guest stay on this device under your guest name rather than moving across. Request a new link to continue.'
    );
    set({ status: 'error', reason: 'failed' });
    expect(dialog()).toHaveTextContent(
      'Something went wrong finishing your sign-in. Requesting a new link is the quickest fix.'
    );
    set({ status: 'done', linked: true });
    expect(dialog()).toHaveTextContent(
      'This is the same account you were already using, now reachable by email on any device.'
    );
  });

  it('needs-email is a dismissible sheet focused on the Email field, with the explanation and Terms box', () => {
    const { dismiss } = mount({ status: 'needs-email' });
    expect(screen.getByRole('dialog', { name: 'Finish signing in here' })).toHaveAttribute('open');
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveFocus();
    expect(dialog()).toHaveTextContent(
      'You opened this link in a different browser from the one that asked for it, so we need the address again to check the link belongs to you.'
    );
    expect(screen.getByRole('checkbox', { name: BOX })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
    escape();
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(dialog()).not.toHaveAttribute('open');
  });

  it('needs-email: the Terms box blocks the submit, then Sign in submits the address', async () => {
    const submit = vi.fn(async () => {});
    mount({ status: 'needs-email' }, submit);
    fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: 'a@example.com' } });
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Email' }), { key: 'Enter' });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Tick the box to accept the Terms before we finish signing you in.'
    );
    expect(submit).not.toHaveBeenCalled();
    expect(getTermsAcceptance()).toBeNull();

    fireEvent.click(screen.getByRole('checkbox', { name: BOX }));
    expect(screen.queryByRole('alert')).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign in' })));
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith('a@example.com');
  });

  it('stays one sheet through needs-email, completing and a failure, moving focus to each headline', () => {
    const { set, dismiss } = mount({ status: 'needs-email' });
    set({ status: 'completing' });
    expect(screen.getByRole('dialog', { name: 'Signing you in…' })).toHaveAttribute('open');
    expect(screen.getByRole('heading', { name: 'Signing you in…' })).toHaveFocus();
    set({ status: 'error', reason: 'expired' });
    expect(screen.getByRole('dialog', { name: 'That sign-in link has expired' })).toHaveAttribute('open');
    expect(screen.getByRole('heading', { name: 'That sign-in link has expired' })).toHaveFocus();
    expect(document.querySelectorAll('dialog')).toHaveLength(1);
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('closes when completion ends in a plain sign-in', () => {
    const { set } = mount({ status: 'completing' });
    set({ status: 'done', linked: false });
    expect(dialog()).not.toHaveAttribute('open');
  });
});

describe('EmailLinkStatus after review', () => {
  it('a native close during completing reopens the sheet, and the outcome then shows', () => {
    const { set, dismiss } = mount({ status: 'completing' });
    // Chrome can close a modal on a second Escape without firing cancel.
    act(() => {
      dialog().removeAttribute('open');
      fireEvent(dialog(), new Event('close'));
    });
    expect(dialog()).toHaveAttribute('open');
    expect(dismiss).not.toHaveBeenCalled();
    set({ status: 'error', reason: 'expired' });
    expect(screen.getByRole('dialog', { name: 'That sign-in link has expired' })).toHaveAttribute('open');
  });

  const described: [string, EmailLinkState, string][] = [
    ['needs-email', { status: 'needs-email' }, 'You opened this link in a different browser from the one that asked for it, so we need the address again to check the link belongs to you.'],
    ['expired', { status: 'error', reason: 'expired' }, 'Links can only be used once, and they time out. Request a new one and it will work.'],
    ['email-taken', { status: 'error', reason: 'email-taken' }, 'Signing in with it will take you to that account, so bookmarks you made here as a guest stay on this device under your guest name rather than moving across. Request a new link to continue.'],
    ['failed', { status: 'error', reason: 'failed' }, 'Something went wrong finishing your sign-in. Requesting a new link is the quickest fix.'],
    ['linked', { status: 'done', linked: true }, 'This is the same account you were already using, now reachable by email on any device.'],
  ];

  it.each(described)('%s: the dialog is described by its body, with no live region', (_, state, description) => {
    mount(state);
    expect(screen.getByRole('dialog', { description })).toHaveAttribute('open');
    expect(screen.queryAllByRole('status')).toHaveLength(0);
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
  });

  it('completing has no description, one live status and no alert', () => {
    mount({ status: 'completing' });
    expect(dialog()).not.toHaveAttribute('aria-describedby');
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
  });

  it('a later needs-email starts empty, unticked and with no error', () => {
    const { set } = mount({ status: 'needs-email' });
    fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: 'a@example.com' } });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Email' }), { key: 'Enter' });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    escape();
    set({ status: 'needs-email' });
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue('');
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.click(screen.getByRole('checkbox', { name: BOX }));
    escape();
    set({ status: 'needs-email' });
    expect(screen.getByRole('checkbox', { name: BOX })).not.toBeChecked();
  });

  // The email input's own value sanitising strips the padding too (in jsdom and browsers),
  // so this guards the end-to-end contract; it cannot single out the trim in the handler.
  it('a padded address is submitted trimmed', async () => {
    const submit = vi.fn(async () => {});
    mount({ status: 'needs-email' }, submit);
    fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: '  a@example.com ' } });
    fireEvent.click(screen.getByRole('checkbox', { name: BOX }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign in' })));
    expect(submit).toHaveBeenCalledWith('a@example.com');
    expect(getTermsAcceptance()?.email).toBe('a@example.com');
  });
});

it('reads only linkState, submitLinkEmail and dismissLinkState', () => {
  // Every other field throws on read, so touching one fails the render.
  const value = new Proxy(
    { linkState: { status: 'needs-email' }, submitLinkEmail: async () => {}, dismissLinkState: () => {} },
    {
      get(target, key) {
        if (key in target) return target[key as keyof typeof target];
        throw new Error(`read ${String(key)}`);
      },
    }
  ) as unknown as AuthContextType;
  renderWithProviders(<AuthContext.Provider value={value}><EmailLinkStatus /></AuthContext.Provider>);
  expect(screen.getByRole('dialog', { name: 'Finish signing in here' })).toBeInTheDocument();
});
