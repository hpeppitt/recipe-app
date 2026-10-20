import { useEffect, useId, useRef, useState, type ReactNode, type Ref } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { Spinner } from '../ui/Spinner';
import { Check, Hourglass, Smartphone, TriangleAlert } from '../ui/icons';
import { TermsCheckbox, TermsHint } from './TermsCheckbox';
import { EmailField } from './AuthSheetParts';
import { setTermsAcceptance, clearTermsAcceptance } from '../../services/storage';
import { TERMS_VERSION } from '../../lib/legal';

/**
 * Reports what happened when the user arrived on a magic link.
 *
 * Every state here used to be silence. A link that was expired, already used,
 * or opened on a different device from the one that requested it produced no
 * message at all: the user landed on a signed-out app having done everything
 * right. That is the whole reason this component exists.
 *
 * Rendered once at the app root, because the link returns to the page that asked for it
 * (RL-135), which can be any route, inside the shell or not. Each state is one sheet (15b) over that page,
 * so the page underneath stays put.
 */
export function EmailLinkStatus() {
  const { linkState, submitLinkEmail, dismissLinkState } = useAuth();
  const titleId = useId();
  const bodyId = useId();
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);

  // A successful upgrade needs no announcement beyond the account itself
  // changing, and a plain sign-in even less. Only `linked` is worth a word,
  // because "your bookmarks came with you" is the reassurance the user wants.
  // Derived from linkState, so dismissing (back to idle) closes it for good.
  const open = linkState.status !== 'idle' && !(linkState.status === 'done' && !linkState.linked);
  const stateKey = linkState.status === 'error' ? linkState.reason : linkState.status;

  // Runs after Sheet's own effect has opened the dialog. The control that had focus
  // (e.g. "Sign in") is gone when the state changes, so put focus on the new content.
  useEffect(() => {
    if (!open) return;
    (stateKey === 'needs-email' ? fieldRef.current : headlineRef.current)?.focus();
  }, [open, stateKey]);

  const headline = (text: string) => (
    <h2
      ref={headlineRef}
      id={titleId}
      tabIndex={-1}
      className="min-w-0 break-words font-heading text-2xl leading-[1.1] text-text-primary focus:outline-none"
    >
      {text}
    </h2>
  );

  let content: ReactNode = null;

  if (linkState.status === 'done' && linkState.linked) {
    content = (
      <>
        <Circle className="bg-accent-2-200 text-accent-2-800">
          <Check className="h-6 w-6" />
        </Circle>
        {headline("You're signed in, and your bookmarks came with you")}
        <Body id={bodyId}>
          This is the same account you were already using, now reachable by email on
          any device.
        </Body>
        <Button fullWidth size="lg" className="h-[52px]" onClick={dismissLinkState}>
          Got it
        </Button>
      </>
    );
  } else if (linkState.status === 'completing') {
    content = (
      <>
        <Circle className="bg-surface-secondary text-text-secondary">
          {/* aria-hidden on the circle: the text below is the one live announcement. */}
          <Spinner />
        </Circle>
        <div role="status" className="min-w-0">
          {headline('Signing you in…')}
        </div>
      </>
    );
  } else if (linkState.status === 'needs-email') {
    content = (
      <>
        <Circle className="bg-accent-2-200 text-accent-2-800">
          <Smartphone className="h-6 w-6" />
        </Circle>
        {headline('Finish signing in here')}
        <Body id={bodyId}>
          {/* Explains the cause, because otherwise being asked again looks like the
              app lost the address for no reason. */}
          You opened this link in a different browser from the one that asked for it,
          so we need the address again to check the link belongs to you.
        </Body>
        {/* Its own component, so the address, the tick and the error reset with each attempt. */}
        <NeedsEmailForm submitLinkEmail={submitLinkEmail} fieldRef={fieldRef} />
      </>
    );
  } else if (linkState.status === 'error') {
    // Expired, taken, or otherwise failed. The link is single-use in every case, so
    // there is nothing to retry here; the honest action is to request a new one.
    const { title, body } = {
      expired: {
        title: 'That sign-in link has expired',
        body: 'Links can only be used once, and they time out. Request a new one and it will work.',
      },
      'email-taken': {
        title: 'That email already has an account',
        // Guests can only bookmark (decision 1a), so bookmarks are what stay behind.
        body:
          'Signing in with it will take you to that account, so bookmarks you made here ' +
          'as a guest stay on this device under your guest name rather than moving across. ' +
          'Request a new link to continue.',
      },
      failed: {
        title: "That sign-in link didn't work",
        body: 'Something went wrong finishing your sign-in. Requesting a new link is the quickest fix.',
      },
    }[linkState.reason];
    const Icon = linkState.reason === 'expired' ? Hourglass : TriangleAlert;
    content = (
      <>
        <Circle className="bg-accent-200 text-accent-800">
          <Icon className="h-6 w-6" />
        </Circle>
        {headline(title)}
        <Body id={bodyId}>{body}</Body>
        <Button fullWidth variant="secondary" onClick={dismissLinkState}>
          OK
        </Button>
      </>
    );
  }

  return (
    <Sheet
      open={open}
      onClose={dismissLinkState}
      labelledBy={titleId}
      // The body is the actionable part ("Request a new link"), so it is read on open too.
      describedBy={open && linkState.status !== 'completing' ? bodyId : undefined}
      // Completion must finish; closing mid-flight would hide a sign-in that still lands.
      dismissible={linkState.status !== 'completing'}
    >
      {open && (
        <div className="flex min-w-0 flex-col gap-[14px] pb-[env(safe-area-inset-bottom)]">{content}</div>
      )}
    </Sheet>
  );
}

function NeedsEmailForm({
  submitLinkEmail,
  fieldRef,
}: {
  submitLinkEmail: (email: string) => Promise<void>;
  fieldRef: Ref<HTMLInputElement>;
}) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [termsError, setTermsError] = useState(false);
  const hintId = useId();

  const handle = async () => {
    if (!email.trim() || submitting) return;
    if (!accepted) {
      setTermsError(true);
      return;
    }
    setSubmitting(true);
    try {
      // This browser never saw the form that sent the link, so the box here is
      // the acceptance AuthContext records once the link completes (RL-047).
      // Trimmed here rather than trusting each callee to do it.
      const address = email.trim();
      setTermsAcceptance({ version: TERMS_VERSION, acceptedAt: Date.now(), email: address });
      await submitLinkEmail(address);
    } catch {
      clearTermsAcceptance();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <TermsCheckbox
        checked={accepted}
        onChange={(c) => {
          setAccepted(c);
          if (c) setTermsError(false);
        }}
        disabled={submitting}
        invalid={termsError && !accepted}
        describedBy={accepted ? undefined : hintId}
      />
      <EmailField value={email} onChange={setEmail} onEnter={handle} inputRef={fieldRef} />
      <Button
        fullWidth
        size="lg"
        className="h-[52px]"
        onClick={handle}
        disabled={submitting || !email.trim() || !accepted}
        aria-describedby={accepted ? undefined : hintId}
      >
        {submitting ? <Spinner size="sm" /> : 'Sign in'}
      </Button>
      {!accepted && <TermsHint id={hintId} />}
      {termsError && !accepted && (
        <p role="alert" className="text-sm text-danger-700">
          Tick the box to accept the Terms before we finish signing you in.
        </p>
      )}
    </>
  );
}

function Circle({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full ${className}`}
    >
      {children}
    </span>
  );
}

function Body({ id, children }: { id: string; children: ReactNode }) {
  return <p id={id} className="min-w-0 break-words text-sm text-text-secondary">{children}</p>;
}
