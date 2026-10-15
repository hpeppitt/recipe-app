import { useContext, useEffect, useId, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { LegalLink, TermsCheckbox } from './TermsCheckbox';
import { AuthContext, TermsContext } from '../../contexts/AuthContext';
import { isLegalPath } from '../../lib/legal';

/**
 * Blocking prompt for a verified account with no current Terms acceptance (RL-047):
 * an existing account from before acceptance existed, a link opened on another
 * device, or a bumped TERMS_VERSION. Escape does not dismiss it; the only ways out
 * are Accept or Decline, and Decline signs out. Decline stays enabled while Accept
 * is in flight, so a failing or hanging write is never a dead end.
 */
export function TermsUpdateDialog({
  open,
  onAccept,
  onDecline,
}: {
  open: boolean;
  /** Records the acceptance; a rejection shows the inline error with Retry. */
  onAccept: () => Promise<void>;
  /** Signs out; a rejection shows an inline error and Decline stays available. */
  onDecline: () => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const messageId = useId();
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [declineFailed, setDeclineFailed] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // showModal focuses the first link in the sentence; the title is the better start.
      headingRef.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const handleAccept = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await onAccept();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const handleDecline = async () => {
    setDeclining(true);
    setDeclineFailed(false);
    try {
      await onDecline();
    } catch {
      setDeclineFailed(true);
    } finally {
      setDeclining(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      // Escape fires cancel; refusing it keeps the choice explicit.
      onCancel={(e) => e.preventDefault()}
      // Some browsers close anyway on a repeated Escape; reopen while a choice is still owed.
      onClose={() => {
        if (open) dialogRef.current?.showModal();
      }}
      aria-labelledby={titleId}
      aria-describedby={messageId}
      className="backdrop:bg-black/50 bg-surface rounded-2xl p-6 max-w-sm w-[calc(100%-2rem)] shadow-xl"
    >
      <h2
        ref={headingRef}
        id={titleId}
        tabIndex={-1}
        className="text-lg font-semibold text-text-primary mb-2 focus:outline-none"
      >
        Accept the Terms to continue
      </h2>
      {/* "Kept" is true: sign-out clears no Dexie data (AuthContext handleSignOut). */}
      <p id={messageId} className="text-sm text-text-secondary">
        To keep using your account, please accept the current{' '}
        <LegalLink href="/terms">Terms of Service</LegalLink> after reading the{' '}
        <LegalLink href="/privacy">Privacy Policy</LegalLink> and{' '}
        <LegalLink href="/cookies">Cookie Policy</LegalLink>; if you decline you will be signed
        out, and recipes saved on this device are kept.
      </p>
      <div className="mt-3">
        <TermsCheckbox checked={accepted} onChange={setAccepted} disabled={busy} />
      </div>
      {failed && (
        <p role="alert" className="text-sm text-danger-700 dark:text-danger-300 mt-2">
          We couldn't save your acceptance. Check your connection and try again.
        </p>
      )}
      {declineFailed && (
        <p role="alert" className="text-sm text-danger-700 dark:text-danger-300 mt-2">
          We couldn't sign you out. Please try again.
        </p>
      )}
      <div className="flex flex-wrap gap-3 justify-end mt-4">
        <Button variant="secondary" onClick={handleDecline} disabled={declining}>
          {declining ? <Spinner size="sm" /> : 'Decline and sign out'}
        </Button>
        {/* min-w keeps the width steady across Accept, the spinner and Retry. */}
        <Button onClick={handleAccept} disabled={!accepted || busy} className="min-w-24">
          {busy ? <Spinner size="sm" /> : failed ? 'Retry' : 'Accept'}
        </Button>
      </div>
    </dialog>
  );
}

/**
 * Shows TermsUpdateDialog when AuthProvider says acceptance is owed, except on the three
 * policy pages: the dialog's links open them in a new tab of this app, and a modal over
 * them would hide the very text the user is asked to accept. Leaving those pages shows it.
 * Mounted inside the router so it can read the location (AuthProvider sits outside it).
 */
export function TermsGate() {
  const terms = useContext(TermsContext);
  const uid = useContext(AuthContext)?.user?.uid;
  const { pathname } = useLocation();
  if (!terms) return null;
  return (
    <TermsUpdateDialog
      // Fresh checkbox and error state for each account that is asked.
      key={uid ?? 'none'}
      open={terms.pending && !isLegalPath(pathname)}
      onAccept={terms.accept}
      onDecline={terms.decline}
    />
  );
}
