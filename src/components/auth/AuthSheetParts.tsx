import { useEffect, useId, useRef, useState, type ReactNode, type Ref } from 'react';
import { useAuth, isGoogleAccountExists } from '../../contexts/AuthContext';
import type { PendingIntent } from '../../lib/pendingAction';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { BookOpen, ChefHat, GitBranchPlus, GoogleG, Heart, MailOpen, MessageCircle, ShieldCheck, Link, UserPlus, UserRound, Users } from '../ui/icons';

/**
 * What the visitor was doing when the sheet opened (RL-108). It names the headline
 * and picks the icon. `continue` is for a plain "Sign in" button with no action.
 */
export type AuthAction =
  | { kind: 'continue' }
  | { kind: 'save' }
  | { kind: 'follow'; name?: string | null }
  | { kind: 'follow-cookbook' }
  | { kind: 'share' }
  | { kind: 'suggest' }
  | { kind: 'branch' }
  | { kind: 'cook' }
  | { kind: 'edit-profile' }
  | { kind: 'join-kitchen'; name?: string | null };

function actionCopy(action: AuthAction): { text: string; Icon: (p: { className?: string }) => ReactNode } {
  switch (action.kind) {
    case 'save':
      return { text: 'save this recipe', Icon: Heart };
    case 'follow':
      return { text: `follow ${action.name?.trim() || 'this cook'}`, Icon: UserPlus };
    case 'follow-cookbook':
      return { text: 'follow this cookbook', Icon: BookOpen };
    case 'share':
      return { text: 'share this recipe', Icon: Link };
    case 'suggest':
      return { text: 'suggest a change', Icon: MessageCircle };
    case 'branch':
      return { text: 'branch this recipe', Icon: GitBranchPlus };
    case 'cook':
      return { text: 'log a cook', Icon: ChefHat };
    case 'edit-profile':
      return { text: 'edit your profile', Icon: UserRound };
    case 'join-kitchen':
      return { text: action.name?.trim() ? `join ${action.name.trim()}'s kitchen` : 'join this kitchen', Icon: Users };
    default:
      return { text: 'continue', Icon: UserRound };
  }
}

/** The 5a header: action icon, "Sign in to <action>" and the caller's reason. */
export function ActionIntro({ action, titleId, body }: { action: AuthAction; titleId: string; body: ReactNode }) {
  const { text, Icon } = actionCopy(action);
  return (
    <>
      <span
        aria-hidden="true"
        className="mt-1.5 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent-2-200 text-accent-2-800"
      >
        <Icon className="h-[26px] w-[26px]" />
      </span>
      <h2 id={titleId} className="min-w-0 break-words font-heading text-[26px] leading-[1.1] text-text-primary">
        Sign in to {text}
      </h2>
      <p className="text-sm text-text-secondary">{body}</p>
    </>
  );
}

/**
 * "Continue with Google" (RL-188), for the first step of a sign-in sheet. Renders nothing while
 * the flag is off (the context omits `signInWithGoogle`). The host keeps it disabled until the
 * Terms box is ticked. A popup the user closed is not an error, so it shows nothing.
 */
export function GoogleSignIn({
  disabled,
  describedBy,
  pending,
  onSignedIn,
  onBusyChange,
}: {
  disabled: boolean;
  describedBy?: string;
  pending?: PendingIntent;
  onSignedIn: () => void;
  /** True while the popup is open, so the host can hold its other buttons. */
  onBusyChange: (busy: boolean) => void;
}) {
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();
  // The box toggling or the guest option starting flips `disabled`: an old error no longer applies.
  const [wasDisabled, setWasDisabled] = useState(disabled);
  if (disabled !== wasDisabled) {
    setWasDisabled(disabled);
    setError(null);
  }
  if (!signInWithGoogle) return null;

  const handle = async () => {
    if (busy || disabled) return;
    setBusy(true);
    onBusyChange(true);
    setError(null);
    try {
      if (await signInWithGoogle(pending)) onSignedIn();
    } catch (err) {
      setError(
        isGoogleAccountExists(err)
          ? 'That email already has an account. Sign in with your email link instead.'
          : "Couldn't sign in with Google. Try again or use your email."
      );
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  };

  return (
    <>
      <Button
        fullWidth
        size="lg"
        variant="secondary"
        className="h-[52px] gap-2"
        onClick={handle}
        disabled={busy || disabled}
        aria-busy={busy || undefined}
        aria-describedby={[describedBy, error ? errorId : undefined].filter(Boolean).join(' ') || undefined}
      >
        {busy ? (
          <Spinner size="sm" label="Signing in with Google" />
        ) : (
          <>
            <GoogleG className="h-5 w-5 shrink-0" />
            Continue with Google
          </>
        )}
      </Button>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-danger-700">
          {error}
        </p>
      )}
    </>
  );
}

/** The 5b heading, the step's accessible name. */
export function EmailStepHeading({ titleId }: { titleId: string }) {
  return (
    <h2 id={titleId} className="font-heading text-[26px] leading-[1.1] text-text-primary">
      Continue with email
    </h2>
  );
}

/** The 5b field: a labelled 52px pill. */
export function EmailField({
  value,
  onChange,
  onEnter,
  autoFocus = false,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  onEnter: () => void;
  autoFocus?: boolean;
  /** For a caller that must focus the field after its sheet opens (EmailLinkStatus). */
  inputRef?: Ref<HTMLInputElement>;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text-primary">
        Email
      </label>
      <input
        ref={inputRef}
        id={id}
        type="email"
        autoComplete="email"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="your@email.com"
        // The user has just chosen email, so the keyboard appearing is the point.
        autoFocus={autoFocus}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter();
        }}
        className="h-[52px] w-full min-w-0 rounded-full border border-border bg-surface-secondary px-[18px] text-base text-text-primary placeholder:text-text-tertiary focus:border-[1.5px] focus:border-accent focus:outline-none"
      />
    </div>
  );
}

/** The 5b footnote and sage note, under the send button. */
export function EmailStepNotes() {
  return (
    <>
      <p className="text-[13px] text-text-tertiary">We'll email you a link. No password to remember.</p>
      <div className="flex items-start gap-2.5 rounded-[22px] bg-accent-2-100 px-4 py-3.5 text-[13px] text-accent-2-900">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <p>New here? The link also confirms your email, which you need before you can create, branch or suggest.</p>
      </div>
    </>
  );
}

/**
 * The 5c step. The link returns to the page the sheet opened on (actionCodeSettings.url,
 * RL-135), so the copy promises this page.
 */
export function SentStep({
  titleId,
  email,
  onDifferentEmail,
  onClose,
}: {
  titleId: string;
  email: string;
  onDifferentEmail: () => void;
  onClose: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  // The button that sent the link has gone; put focus on the news, not on <body>.
  useEffect(() => headingRef.current?.focus(), []);
  return (
    <div className="relative -mx-[22px] flex flex-col gap-3 overflow-hidden px-[22px] pt-2">
      <div aria-hidden="true" className="absolute -right-20 -top-[70px] h-[280px] w-[280px] rounded-full bg-accent-200" />
      <div aria-hidden="true" className="absolute -left-6 top-28 h-[90px] w-[90px] rounded-full bg-accent-2-300" />
      <MailOpen className="relative h-9 w-9 text-accent" />
      <h2
        ref={headingRef}
        id={titleId}
        tabIndex={-1}
        className="relative font-heading text-[34px] leading-[1.05] text-text-primary focus:outline-none"
      >
        Check your inbox
      </h2>
      <p className="relative min-w-0 text-[15px] text-text-secondary">
        We sent a sign-in link to{' '}
        <span className="inline-block max-w-full break-all rounded-full bg-neutral-100 px-2.5 py-0.5 text-sm font-semibold text-neutral-800">
          {email}
        </span>
        . The link brings you back to this page.
      </p>
      <Button fullWidth variant="ghost" onClick={onDifferentEmail} className="relative">
        Use a different email
      </Button>
      <Button fullWidth variant="secondary" onClick={onClose} className="relative">
        Close
      </Button>
    </div>
  );
}
