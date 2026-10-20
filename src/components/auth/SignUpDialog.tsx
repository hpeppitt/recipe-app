import { useId, useState } from 'react';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { Mail } from '../ui/icons';
import { EmailLinkingForm } from './EmailLinkingForm';
import { ActionIntro, EmailStepHeading, SentStep, type AuthAction } from './AuthSheetParts';
import type { PendingIntent } from '../../lib/pendingAction';

/**
 * The sign-up gate for actions that need a verified email (share an unpublished
 * recipe, suggest, follow, profile editing). Anonymous and signed-out users cannot
 * write to the cloud (decision 1a), so these open this instead of writing. No guest
 * option: an anonymous account cannot do any of these. EmailLinkingForm picks
 * linkEmail or sendEmailLink by account type.
 */
export function SignUpDialog({
  open,
  action,
  body,
  onClose,
  pending,
}: {
  open: boolean;
  /** Names the headline and icon: "Sign in to <action>". */
  action: AuthAction;
  body: string;
  onClose: () => void;
  /** What the link is for, kept on this device so the app can pick it up after sign-in (RL-135). */
  pending?: PendingIntent;
}) {
  const [step, setStep] = useState<'choose' | 'email' | 'sent'>('choose');
  const [sentTo, setSentTo] = useState('');
  // Back would unmount the form mid-send and lose its error and its Terms clear.
  const [sending, setSending] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const titleId = useId();

  // Each opening starts fresh; the email step remounts the form, clearing it.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setStep('choose');
  }

  return (
    <Sheet open={open} onClose={onClose} labelledBy={titleId}>
      <div className="flex min-w-0 flex-col gap-3 pb-[env(safe-area-inset-bottom)]">
        {step === 'choose' && (
          <>
            <ActionIntro action={action} titleId={titleId} body={body} />
            <Button fullWidth size="lg" className="h-[52px] gap-2" autoFocus onClick={() => setStep('email')}>
              <Mail className="h-5 w-5 shrink-0" />
              Continue with email
            </Button>
            <Button fullWidth variant="ghost" onClick={onClose}>
              Not now
            </Button>
          </>
        )}

        {step === 'email' && (
          <>
            <EmailStepHeading titleId={titleId} />
            <EmailLinkingForm
              tone="invite"
              bare
              submitLabel="Send me a link"
              onBusyChange={setSending}
              pending={pending}
              onSent={(email) => {
                setSentTo(email);
                setStep('sent');
              }}
            />
            <Button fullWidth variant="ghost" disabled={sending} onClick={() => setStep('choose')}>
              Back
            </Button>
          </>
        )}

        {step === 'sent' && (
          <SentStep titleId={titleId} email={sentTo} onDifferentEmail={() => setStep('email')} onClose={onClose} />
        )}
      </div>
    </Sheet>
  );
}
