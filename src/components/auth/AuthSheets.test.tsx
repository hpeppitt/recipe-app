// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { screen, fireEvent, act, render, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';
import { getTermsAcceptance, getPendingAction, setPendingAction } from '../../services/storage';
import { AuthContext, type AuthContextType } from '../../contexts/AuthContext';
import type { AppUser } from '../../types/recipe';

vi.mock('../../services/firebase', () => ({ isFirebaseConfigured: false }));

import { AuthModal } from './AuthModal';
import { SignUpDialog } from './SignUpDialog';
import { EmailLinkingForm } from './EmailLinkingForm';
import type { AuthAction } from './AuthSheetParts';

const BOX = 'I accept the Terms of Service and have read the Privacy Policy';
const anon: AppUser = { uid: 'a', displayName: 'X', email: null, isAnonymous: true, emailVerified: false };

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

const buttonNames = (root: HTMLElement) => within(root).getAllByRole('button').map((b) => b.textContent);

const headlines: [AuthAction, string][] = [
  [{ kind: 'continue' }, 'Sign in to continue'],
  [{ kind: 'save' }, 'Sign in to save this recipe'],
  [{ kind: 'follow', name: 'Chef' }, 'Sign in to follow Chef'],
  [{ kind: 'follow', name: '  ' }, 'Sign in to follow this cook'],
  [{ kind: 'follow', name: null }, 'Sign in to follow this cook'],
  [{ kind: 'share' }, 'Sign in to share this recipe'],
  [{ kind: 'suggest' }, 'Sign in to suggest a change'],
  [{ kind: 'edit-profile' }, 'Sign in to edit your profile'],
];

function sendFromEmailStep(dialog: HTMLElement, button: string) {
  fireEvent.click(within(dialog).getByRole('button', { name: 'Continue with email' }));
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: ' a@example.com' } });
  fireEvent.click(screen.getByRole('checkbox', { name: BOX }));
  return act(async () => fireEvent.click(screen.getByRole('button', { name: button })));
}

describe('AuthModal', () => {
  const mount = (auth: Partial<AuthContextType> = {}, action: AuthAction = { kind: 'save' }) => {
    const onAuthenticated = vi.fn();
    const onDismiss = vi.fn();
    renderWithProviders(<AuthModal open action={action} onAuthenticated={onAuthenticated} onDismiss={onDismiss} />, {
      user: null,
      auth,
    });
    return { onAuthenticated, onDismiss };
  };

  it.each(headlines)('names the action %o in the headline that labels the sheet', (action, name) => {
    mount({}, action);
    expect(screen.getByRole('dialog', { name })).toHaveAttribute('open');
    expect(screen.getByRole('heading', { name })).toBeInTheDocument();
  });

  it('offers email first and the guest link with its trade-off, and nothing else', () => {
    mount();
    const dialog = screen.getByRole('dialog', { name: 'Sign in to save this recipe' });
    expect(buttonNames(dialog)).toEqual(['Continue with email', 'Continue without an account']);
    expect(within(dialog).getByText('Bookmarks stay on this device only. You can add an email later.')).toBeInTheDocument();
    expect(dialog.querySelector('input[type="password"]')).toBeNull();
  });

  it('the guest link signs in anonymously and reports success', async () => {
    const signInAnonymously = vi.fn(async () => {});
    const { onAuthenticated } = mount({ signInAnonymously });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Continue without an account' })));
    expect(signInAnonymously).toHaveBeenCalledTimes(1);
    expect(onAuthenticated).toHaveBeenCalled();
  });

  it('the email step is named, focuses the field, has no password field, and Back returns to choose', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Continue with email' }));
    const dialog = screen.getByRole('dialog', { name: 'Continue with email' });
    expect(screen.getByLabelText('Email')).toHaveFocus();
    expect(dialog.querySelector('input[type="password"]')).toBeNull();
    expect(within(dialog).getByText("We'll email you a link. No password to remember.")).toBeInTheDocument();
    expect(
      within(dialog).getByText('New here? The link also confirms your email, which you need before you can create, branch or suggest.')
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('dialog', { name: 'Sign in to save this recipe' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with email' })).toHaveFocus();
  });

  it('a sent link shows Check your inbox, says the link returns to this page, and can go back to the email step', async () => {
    const sendEmailLink = vi.fn(async () => {});
    const { onDismiss } = mount({ sendEmailLink });
    await sendFromEmailStep(screen.getByRole('dialog'), 'Send me a link');
    expect(sendEmailLink).toHaveBeenCalledWith('a@example.com');
    const dialog = screen.getByRole('dialog', { name: 'Check your inbox' });
    expect(screen.getByRole('heading', { name: 'Check your inbox' })).toHaveFocus();
    expect(within(dialog).getByText(/^We sent a sign-in link to/).textContent).toBe(
      'We sent a sign-in link to a@example.com. The link brings you back to this page.'
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Use a different email' }));
    expect(screen.getByRole('dialog', { name: 'Continue with email' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveFocus();
  });

  it('a failed send keeps its error copy and clears the stored Terms acceptance', async () => {
    const sendEmailLink = vi.fn(async () => {
      throw new Error('network');
    });
    mount({ sendEmailLink });
    await sendFromEmailStep(screen.getByRole('dialog'), 'Send me a link');
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to send sign-in link. Please try again.');
    expect(getTermsAcceptance()).toBeNull();
  });

  it('closes on Escape and on a backdrop tap', () => {
    const { onDismiss } = mount();
    const dialog = screen.getByRole('dialog');
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(dialog);
    fireEvent.click(dialog);
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it('stores the Terms acceptance before the link is sent', async () => {
    let storedAtSend: ReturnType<typeof getTermsAcceptance> = null;
    const sendEmailLink = vi.fn(async () => {
      storedAtSend = getTermsAcceptance();
    });
    mount({ sendEmailLink });
    await sendFromEmailStep(screen.getByRole('dialog'), 'Send me a link');
    expect(sendEmailLink).toHaveBeenCalledTimes(1);
    expect(storedAtSend).toMatchObject({ email: 'a@example.com' });
  });

  it('dismisses itself when a user appears', () => {
    const onAuthenticated = vi.fn();
    const value = (user: AppUser | null) =>
      ({ user, isLoading: false, isConfigured: true, sendEmailLink: vi.fn(), signInAnonymously: vi.fn() }) as unknown as AuthContextType;
    const ui = (user: AppUser | null) => (
      <MemoryRouter>
        <AuthContext.Provider value={value(user)}>
          <AuthModal open action={{ kind: 'save' }} onAuthenticated={onAuthenticated} onDismiss={() => {}} />
        </AuthContext.Provider>
      </MemoryRouter>
    );
    const { rerender } = render(ui(null));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('open');
    expect(onAuthenticated).not.toHaveBeenCalled();
    rerender(ui(anon));
    expect(onAuthenticated).toHaveBeenCalled();
    expect(dialog).not.toHaveAttribute('open');
  });
});

describe('pending action (RL-135)', () => {
  it('AuthModal stores the intent before the send, and the guest option clears it', async () => {
    let seen: unknown = 'not called';
    const sendEmailLink = vi.fn(async () => {
      seen = getPendingAction();
    });
    renderWithProviders(
      <AuthModal open action={{ kind: 'save' }} onAuthenticated={() => {}} onDismiss={() => {}} pending={{ kind: 'save', recipeId: 'r1' }} />,
      { user: null, auth: { sendEmailLink } }
    );
    await sendFromEmailStep(screen.getByRole('dialog'), 'Send me a link');
    expect(seen).toMatchObject({ kind: 'save', recipeId: 'r1' });
    expect(getPendingAction()).toMatchObject({ kind: 'save', recipeId: 'r1' });
  });

  it('the guest option clears a stored intent', async () => {
    setPendingAction({ kind: 'save', recipeId: 'r1' });
    renderWithProviders(
      <AuthModal open action={{ kind: 'save' }} onAuthenticated={() => {}} onDismiss={() => {}} pending={{ kind: 'save', recipeId: 'r1' }} />,
      { user: null, auth: { signInAnonymously: vi.fn(async () => {}) } }
    );
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Continue without an account' })));
    expect(getPendingAction()).toBeNull();
  });

  it('a failed guest sign-in keeps the stored intent', async () => {
    setPendingAction({ kind: 'save', recipeId: 'r1' });
    renderWithProviders(<AuthModal open action={{ kind: 'save' }} onAuthenticated={() => {}} onDismiss={() => {}} />, {
      user: null,
      auth: {
        signInAnonymously: vi.fn(async () => {
          throw new Error('network');
        }),
      },
    });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Continue without an account' })));
    expect(getPendingAction()).toMatchObject({ kind: 'save', recipeId: 'r1' });
  });

  it('a link sent without an intent replaces an older one', async () => {
    setPendingAction({ kind: 'save', recipeId: 'r1' });
    renderWithProviders(<AuthModal open action={{ kind: 'continue' }} onAuthenticated={() => {}} onDismiss={() => {}} />, {
      user: null,
      auth: { sendEmailLink: vi.fn(async () => {}) },
    });
    await sendFromEmailStep(screen.getByRole('dialog'), 'Send me a link');
    expect(getPendingAction()).toBeNull();
  });

  it('SignUpDialog stores a follow, and a failed send leaves none', async () => {
    const mount = (sendEmailLink: () => Promise<void>) =>
      renderWithProviders(
        <SignUpDialog open action={{ kind: 'follow', name: 'Chef' }} body="b" onClose={() => {}} pending={{ kind: 'follow', uid: 'u1' }} />,
        { user: null, auth: { sendEmailLink } }
      );
    const { unmount } = mount(async () => {});
    await sendFromEmailStep(screen.getByRole('dialog'), 'Send me a link');
    expect(getPendingAction()).toMatchObject({ kind: 'follow', uid: 'u1' });
    unmount();
    mount(async () => {
      throw new Error('network');
    });
    await sendFromEmailStep(screen.getByRole('dialog'), 'Send me a link');
    expect(getPendingAction()).toBeNull();
  });
});

describe('SignUpDialog', () => {
  const mount = (user: AppUser | null, auth: Partial<AuthContextType> = {}) => {
    const onClose = vi.fn();
    renderWithProviders(
      <SignUpDialog open action={{ kind: 'follow', name: 'Chef' }} body="Following needs an email." onClose={onClose} />,
      { user, auth }
    );
    return { onClose };
  };

  it('names the action, has no guest link, and Not now closes', () => {
    const { onClose } = mount(null);
    const dialog = screen.getByRole('dialog', { name: 'Sign in to follow Chef' });
    expect(within(dialog).getByText('Following needs an email.')).toBeInTheDocument();
    expect(buttonNames(dialog)).toEqual(['Continue with email', 'Not now']);
    expect(within(dialog).queryByRole('button', { name: 'Continue without an account' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Not now' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('links the email for an anonymous account and shows the sent step', async () => {
    const linkEmail = vi.fn(async () => {});
    const sendEmailLink = vi.fn(async () => {});
    mount(anon, { linkEmail, sendEmailLink });
    await sendFromEmailStep(screen.getByRole('dialog'), 'Send me a link');
    expect(linkEmail).toHaveBeenCalledWith('a@example.com');
    expect(sendEmailLink).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Check your inbox' })).toBeInTheDocument();
    expect(screen.getByText('a@example.com')).toBeInTheDocument();
  });

  it('sends a sign-in link for a signed-out visitor', async () => {
    const linkEmail = vi.fn(async () => {});
    const sendEmailLink = vi.fn(async () => {});
    mount(null, { linkEmail, sendEmailLink });
    await sendFromEmailStep(screen.getByRole('dialog'), 'Send me a link');
    expect(sendEmailLink).toHaveBeenCalledWith('a@example.com');
    expect(linkEmail).not.toHaveBeenCalled();
  });

  it('a failed send stays on the email step with its error and no stored acceptance', async () => {
    const sendEmailLink = vi.fn(async () => {
      throw new Error('network');
    });
    mount(null, { sendEmailLink });
    await sendFromEmailStep(screen.getByRole('dialog'), 'Send me a link');
    expect(screen.getByRole('dialog', { name: 'Continue with email' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to send link. Please try again.');
    expect(getTermsAcceptance()).toBeNull();
  });
});

describe('SignUpDialog email step', () => {
  const mount = (auth: Partial<AuthContextType> = {}) =>
    renderWithProviders(
      <SignUpDialog open action={{ kind: 'share' }} body="Share needs an email." onClose={() => {}} />,
      { user: null, auth }
    );

  it('focuses the Email field on the email step and after Use a different email', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Continue with email' }));
    expect(screen.getByLabelText('Email')).toHaveFocus();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@example.com' } });
    fireEvent.click(screen.getByRole('checkbox', { name: BOX }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send me a link' })));
    fireEvent.click(screen.getByRole('button', { name: 'Use a different email' }));
    expect(screen.getByRole('dialog', { name: 'Continue with email' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveFocus();
  });

  it('shows the footnote and sage note in the sheet', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Continue with email' }));
    const dialog = screen.getByRole('dialog', { name: 'Continue with email' });
    expect(within(dialog).getByText("We'll email you a link. No password to remember.")).toBeInTheDocument();
    expect(within(dialog).getByText(/^New here\? The link also confirms your email/)).toBeInTheDocument();
  });

  it('stores the Terms acceptance before the link is sent', async () => {
    let storedAtSend: ReturnType<typeof getTermsAcceptance> = null;
    const sendEmailLink = vi.fn(async () => {
      storedAtSend = getTermsAcceptance();
    });
    mount({ sendEmailLink });
    await sendFromEmailStep(screen.getByRole('dialog'), 'Send me a link');
    expect(sendEmailLink).toHaveBeenCalledTimes(1);
    expect(storedAtSend).toMatchObject({ email: 'a@example.com' });
  });

  it('holds Back while a send is in flight, then keeps the failure on the email step', async () => {
    let fail: (e: Error) => void = () => {};
    const sendEmailLink = vi.fn(() => new Promise<void>((_, reject) => (fail = reject)));
    mount({ sendEmailLink });
    await sendFromEmailStep(screen.getByRole('dialog'), 'Send me a link');
    const back = screen.getByRole('button', { name: 'Back' });
    expect(back).toBeDisabled();
    fireEvent.click(back);
    expect(screen.getByRole('dialog', { name: 'Continue with email' })).toBeInTheDocument();
    await act(async () => fail(new Error('network')));
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to send link. Please try again.');
    expect(getTermsAcceptance()).toBeNull();
    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();
  });
});

describe('the chat-card invite gate (EmailLinkingForm inline)', () => {
  it('keeps its own description and neither shows the sheet notes nor grabs focus', () => {
    renderWithProviders(
      <EmailLinkingForm
        tone="invite"
        icon="✉️"
        title="No password needed"
        description="We'll email you a link. Tap it and you're in, on this device or any other."
        submitLabel="Sign up"
      />,
      { user: null }
    );
    expect(screen.getByText("We'll email you a link. Tap it and you're in, on this device or any other.")).toBeInTheDocument();
    expect(screen.queryByText("We'll email you a link. No password to remember.")).toBeNull();
    expect(screen.queryByText(/^New here\?/)).toBeNull();
    expect(screen.getByLabelText('Email')).not.toHaveFocus();
  });
});
