// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { screen, fireEvent, act, render, cleanup } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { TERMS_VERSION, LEGAL_DOCUMENTS } from '../../lib/legal';
import { getTermsAcceptance } from '../../services/storage';

vi.mock('../../services/firebase', () => ({ isFirebaseConfigured: false }));

import { AuthModal } from './AuthModal';
import { EmailLinkingForm } from './EmailLinkingForm';
import { EmailLinkStatus } from './EmailLinkStatus';
import { TermsUpdateDialog, TermsGate } from './TermsUpdateDialog';
import { TermsContext } from '../../contexts/AuthContext';
import { LegalPage } from '../../pages/LegalPage';
import { Routes, Route, Link } from 'react-router-dom';

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

function typeEmail() {
  // Mixed case and spaces: the stored entry holds the normalised address.
  fireEvent.change(screen.getByPlaceholderText('your@email.com'), { target: { value: ' A@Example.com' } });
}

const forms = [
  {
    name: 'AuthModal email step',
    send: 'sendEmailLink' as const,
    button: 'Send me a link',
    mount: (spy: () => Promise<void>) => {
      renderWithProviders(<AuthModal open action={{ kind: 'continue' }} onAuthenticated={() => {}} onDismiss={() => {}} />, {
        user: null,
        auth: { sendEmailLink: spy },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Continue with email' }));
    },
  },
  {
    name: 'EmailLinkingForm (warning, anonymous user)',
    send: 'linkEmail' as const,
    button: 'Add Email',
    mount: (spy: () => Promise<void>) =>
      renderWithProviders(<EmailLinkingForm />, {
        user: { uid: 'a', displayName: 'X', email: null, isAnonymous: true, emailVerified: false },
        auth: { linkEmail: spy },
      }),
  },
  {
    name: 'EmailLinkingForm (invite, signed out)',
    send: 'sendEmailLink' as const,
    button: 'Sign up',
    mount: (spy: () => Promise<void>) =>
      renderWithProviders(<EmailLinkingForm tone="invite" submitLabel="Sign up" />, {
        user: null,
        auth: { sendEmailLink: spy },
      }),
  },
  {
    name: 'EmailLinkingForm (invite, bare, onSent: the sign-up sheet)',
    send: 'sendEmailLink' as const,
    button: 'Send me a link',
    mount: (spy: () => Promise<void>) =>
      renderWithProviders(<EmailLinkingForm tone="invite" bare submitLabel="Send me a link" onSent={() => {}} />, {
        user: null,
        auth: { sendEmailLink: spy },
      }),
  },
  {
    name: 'cross-device needs-email prompt',
    send: 'submitLinkEmail' as const,
    button: 'Sign in',
    mount: (spy: () => Promise<void>) =>
      renderWithProviders(<EmailLinkStatus />, {
        user: null,
        auth: { linkState: { status: 'needs-email' }, submitLinkEmail: spy },
      }),
  },
];

describe.each(forms)('$name', ({ mount, button }) => {
  it('explains the disabled button with a hint tied to the button and the box', () => {
    mount(vi.fn(async () => {}));
    typeEmail();
    const hint = screen.getByText('Tick the box above to continue.');
    expect(screen.getByRole('button', { name: button })).toHaveAttribute('aria-describedby', hint.id);
    expect(screen.getByRole('checkbox', { name: BOX })).toHaveAttribute('aria-describedby', hint.id);
    fireEvent.click(screen.getByRole('checkbox', { name: BOX }));
    expect(screen.queryByText('Tick the box above to continue.')).toBeNull();
    expect(screen.getByRole('button', { name: button })).not.toHaveAttribute('aria-describedby');
  });

  it('Enter while unticked shows a tick-the-box error and sends nothing', () => {
    const spy = vi.fn(async () => {});
    mount(spy);
    typeEmail();
    fireEvent.keyDown(screen.getByPlaceholderText('your@email.com'), { key: 'Enter' });
    expect(screen.getByRole('alert')).toHaveTextContent(/Tick the box/);
    expect(screen.getByRole('checkbox', { name: BOX })).toHaveAttribute('aria-invalid', 'true');
    expect(spy).not.toHaveBeenCalled();
  });

  it('a second Enter while the first send is in flight sends nothing more', async () => {
    const spy = vi.fn(() => new Promise<void>(() => {}));
    mount(spy);
    typeEmail();
    fireEvent.click(screen.getByRole('checkbox', { name: BOX }));
    const field = screen.getByPlaceholderText('your@email.com');
    await act(async () => fireEvent.keyDown(field, { key: 'Enter' }));
    await act(async () => fireEvent.keyDown(field, { key: 'Enter' }));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('a failed send leaves no stored acceptance', async () => {
    const spy = vi.fn(async () => {
      throw new Error('network');
    });
    mount(spy);
    typeEmail();
    fireEvent.click(screen.getByRole('checkbox', { name: BOX }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: button })));
    expect(spy).toHaveBeenCalled();
    expect(getTermsAcceptance()).toBeNull();
  });

  it('has an unticked required box linking both policies in a new tab, and gates the button', () => {
    const spy = vi.fn(async () => {});
    mount(spy);
    typeEmail();
    const box = screen.getByRole('checkbox', { name: BOX });
    expect(box).not.toBeChecked();
    expect(box).toBeRequired();
    expect(box).toHaveAttribute('aria-required', 'true');
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
    expect(screen.queryByText(/Read our/)).toBeNull();

    expect(screen.getByRole('button', { name: button })).toBeDisabled();
    fireEvent.keyDown(screen.getByPlaceholderText('your@email.com'), { key: 'Enter' });
    expect(spy).not.toHaveBeenCalled();
    expect(getTermsAcceptance()).toBeNull();

    fireEvent.click(box);
    expect(screen.getByRole('button', { name: button })).toBeEnabled();
  });

  it('sending stores the acceptance for the current version', async () => {
    const spy = vi.fn(async () => {});
    mount(spy);
    typeEmail();
    fireEvent.click(screen.getByRole('checkbox', { name: BOX }));
    const before = Date.now();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: button })));

    expect(spy).toHaveBeenCalled();
    const stored = getTermsAcceptance();
    expect(stored?.version).toBe(TERMS_VERSION);
    expect(stored?.email).toBe('a@example.com');
    expect(stored?.acceptedAt).toBeGreaterThanOrEqual(before);
    expect(stored?.acceptedAt).toBeLessThanOrEqual(Date.now());
  });
});

describe('TermsUpdateDialog', () => {
  beforeEach(() => cleanup());

  const mount = (onAccept = vi.fn(async () => {}), onDecline = vi.fn(async () => {})) => {
    render(<TermsUpdateDialog open onAccept={onAccept} onDecline={onDecline} />);
    return { onAccept, onDecline };
  };

  it('is a named modal with the three policy links and an unticked box, focused on its title', () => {
    mount();
    const dialog = screen.getByRole('dialog', { name: 'Accept the Terms to continue' });
    expect(dialog).toHaveAttribute('open');
    expect(screen.getByRole('heading', { name: 'Accept the Terms to continue' })).toHaveFocus();
    expect(screen.getAllByRole('link', { name: 'Terms of Service' })[0]).toHaveAttribute('href', '/terms');
    expect(screen.getAllByRole('link', { name: 'Privacy Policy' })[0]).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('link', { name: 'Cookie Policy' })).toHaveAttribute('href', '/cookies');
    expect(dialog).toHaveTextContent('if you decline you will be signed out. Recipes saved to your account load again when you sign back in, and anything saved only on this device is kept');
    expect(screen.getByRole('checkbox', { name: BOX })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeDisabled();
  });

  it('Escape does not dismiss it', () => {
    mount();
    const dialog = screen.getByRole('dialog');
    const cancel = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    // A browser that closes anyway gets the dialog reopened.
    dialog.removeAttribute('open');
    fireEvent(dialog, new Event('close'));
    expect(dialog).toHaveAttribute('open');
  });

  it('Accept calls onAccept once ticked; a rejection shows the error and Retry', async () => {
    const onAccept = vi.fn().mockRejectedValueOnce(new Error('denied')).mockResolvedValueOnce(undefined);
    const { onDecline } = mount(onAccept);
    fireEvent.click(screen.getByRole('checkbox', { name: BOX }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Accept' })));
    expect(screen.getByRole('alert')).toHaveTextContent("couldn't save");

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry' })));
    expect(onAccept).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onDecline).not.toHaveBeenCalled();
  });

  it('Decline is available, ignores a double tap while signing out, and reports a failed sign-out', async () => {
    let fail: (e: Error) => void = () => {};
    const onDecline = vi.fn(() => new Promise<void>((_, reject) => (fail = reject)));
    mount(undefined, onDecline);
    const decline = screen.getByRole('button', { name: 'Decline and sign out' });
    expect(decline).toBeEnabled();
    fireEvent.click(decline);
    fireEvent.click(decline);
    expect(onDecline).toHaveBeenCalledTimes(1);
    expect(decline).toBeDisabled();

    await act(async () => fail(new Error('network')));
    expect(screen.getByRole('alert')).toHaveTextContent("couldn't sign you out");
    expect(screen.getByRole('button', { name: 'Decline and sign out' })).toBeEnabled();
  });
});

describe.each(['terms', 'privacy', 'cookies'] as const)('TermsGate on /%s', (page) => {
  beforeAll(() => {
    window.scrollTo = () => {};
    window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  });

  it('leaves the policy readable while acceptance is owed, and asks once the user leaves', () => {
    const terms = { pending: true, accept: vi.fn(async () => {}), decline: vi.fn(async () => {}) };
    renderWithProviders(
      <TermsContext.Provider value={terms}>
        <Routes>
          <Route path={`/${page}`} element={<><Link to="/">home</Link><LegalPage doc={page} /></>} />
          <Route path="/" element={<p>library</p>} />
        </Routes>
        <TermsGate />
      </TermsContext.Provider>,
      { route: `/${page}` }
    );
    const dialog = document.querySelector('dialog');
    expect(dialog).not.toHaveAttribute('open');
    expect(screen.getByRole('heading', { level: 1, name: LEGAL_DOCUMENTS[page].title })).toBeVisible();

    fireEvent.click(screen.getByRole('link', { name: 'home' }));
    expect(screen.getByText('library')).toBeTruthy();
    expect(document.querySelector('dialog')).toHaveAttribute('open');
  });
});
