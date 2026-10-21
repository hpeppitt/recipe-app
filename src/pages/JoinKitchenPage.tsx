import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useKitchen } from '../hooks/useKitchen';
import { getKitchenInvite, getProfile } from '../services/firestore';
import { ALREADY_IN_KITCHEN_MESSAGE, INVITE_EXPIRED_MESSAGE, OWNER_HAS_MEMBERS_MESSAGE, isInviteCode } from '../lib/kitchen';
import { SignUpDialog } from '../components/auth/SignUpDialog';
import { Button } from '../components/ui/Button';
import { EmojiBlob } from '../components/ui/EmojiBlob';
import { Sheet } from '../components/ui/Sheet';
import { Spinner } from '../components/ui/Spinner';
import { CookingPot, Hourglass } from '../components/ui/icons';

/** What the invite read found: the inviter's name (from their profile, never the invite) and whether it is the viewer's own link. */
type Load = 'loading' | 'expired' | 'failed' | { name: string | null; own: boolean };

/**
 * `/join/:code` (29a, RL-239): a sheet over a plain ground. Only a verified user may read an
 * invite, so a signed-out visitor sees a generic sheet and signs in; the email link returns to
 * this page, where they confirm with Join. A malformed code is expired without any read.
 */
export function JoinKitchenPage() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const { user, isConfigured, isLoading } = useAuth();
  const { joinKitchen } = useKitchen();
  const valid = isInviteCode(code);
  const uid = isConfigured && user && !user.isAnonymous && user.emailVerified ? user.uid : null;
  const [load, setLoad] = useState<Load>('loading');
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [signUp, setSignUp] = useState(false);
  // A join refused as expired keeps the loaded name, so the copy can say whom to ask.
  const [gone, setGone] = useState(false);
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!valid || !uid) return;
    let cancelled = false;
    getKitchenInvite(code)
      .then(async (invite): Promise<Load> => {
        if (!invite || invite.expiresAt <= Date.now()) return 'expired';
        const profile = await getProfile(invite.ownerUid).catch(() => null);
        return { name: profile?.displayName?.trim() || null, own: invite.ownerUid === uid };
      })
      .then(
        (v) => !cancelled && setLoad(v),
        () => !cancelled && setLoad('failed')
      );
    return () => {
      cancelled = true;
    };
  }, [code, valid, uid, attempt]);

  const unverified = !!user && !user.isAnonymous && !user.emailVerified;
  const view = !valid || gone ? 'expired' : isLoading ? 'loading' : !isConfigured ? 'offline' : !uid ? (unverified ? 'unverified' : 'signed-out') : typeof load === 'string' ? load : load.own ? 'own' : 'ready';
  // Signing in (either way) brings this sheet back with the invite.
  const signingIn = signUp && !uid;
  const name = typeof load === 'object' ? load.name : null;

  // Each state replaces the sheet's content, so move focus to (and announce) the new heading.
  useEffect(() => headingRef.current?.focus(), [view]);
  // A failed Join re-enables the button; say why where focus is.
  useEffect(() => {
    if (error) alertRef.current?.focus();
  }, [error]);
  // Joining cannot work until they leave or empty their own kitchen, which is done from Kitchen.
  const stuck = error === ALREADY_IN_KITCHEN_MESSAGE || error === OWNER_HAS_MEMBERS_MESSAGE;

  const join = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await joinKitchen(code);
      navigate('/kitchen', { replace: true, state: { joined: name ?? '' } });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message === INVITE_EXPIRED_MESSAGE) setGone(true);
      else setError(message);
      setBusy(false);
    }
  };

  const notNow = (
    <Button variant="ghost" fullWidth onClick={() => navigate('/')} disabled={busy}>
      Not now
    </Button>
  );
  const heading = (text: string) => (
    <h2 ref={headingRef} id={titleId} tabIndex={-1} className="font-heading text-[24px] leading-tight text-text-primary focus:outline-none">
      {text}
    </h2>
  );
  const blob = (expired = false) => (
    <EmojiBlob size={84} tint={expired ? 'bg-neutral-200' : 'bg-accent-200'} className="self-center">
      {expired ? <Hourglass className="size-9 text-neutral-700" /> : <CookingPot className="size-9 text-accent-800" />}
    </EmojiBlob>
  );

  let content;
  if (view === 'expired') {
    content = (
      <>
        {blob(true)}
        {heading('This invite has expired')}
        <p className="text-sm text-text-secondary">Ask {name ?? 'whoever sent it'} for a new link.</p>
        <Button variant="secondary" fullWidth onClick={() => navigate('/')}>Close</Button>
      </>
    );
  } else if (view === 'loading') {
    content = (
      <>
        {heading('Opening the invite')}
        <Spinner label="Loading the invite" className="self-center" />
        {notNow}
      </>
    );
  } else if (view === 'offline') {
    content = (
      <>
        {blob()}
        {heading('Join a kitchen')}
        <p className="text-sm text-text-secondary">Kitchens need an online account, and this copy of the app has none.</p>
        {notNow}
      </>
    );
  } else if (view === 'signed-out') {
    content = (
      <>
        {blob()}
        {heading('Join a kitchen')}
        <p className="text-sm text-text-secondary">Sign in to share a shopping list and pantry with the person who sent you this link.</p>
        <Button fullWidth size="lg" onClick={() => setSignUp(true)}>Sign in to join</Button>
        {notNow}
      </>
    );
  } else if (view === 'unverified') {
    content = (
      <>
        {blob()}
        {heading('Verify your email to join')}
        <p className="text-sm text-text-secondary">Open the link we emailed you, or send a new one. It brings you back here to join.</p>
        <Button fullWidth size="lg" onClick={() => setSignUp(true)}>Verify your email</Button>
        {notNow}
      </>
    );
  } else if (view === 'failed') {
    content = (
      <>
        {heading("Couldn't open this invite")}
        <p className="text-sm text-text-secondary">Check your connection and try again.</p>
        <Button
          fullWidth
          onClick={() => {
            setLoad('loading');
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </Button>
        {notNow}
      </>
    );
  } else if (view === 'own') {
    content = (
      <>
        {blob()}
        {heading('This is your own invite')}
        <p className="text-sm text-text-secondary">Send it to someone you cook with.</p>
        <Button fullWidth onClick={() => navigate('/kitchen')}>Go to Kitchen</Button>
      </>
    );
  } else {
    content = (
      <>
        {blob()}
        {heading(name ? `Join ${name}'s kitchen` : 'Join this kitchen')}
        <p className="text-sm text-text-secondary">Share a shopping list and pantry with {name ?? 'the person who invited you'}.</p>
        {error && (
          <p ref={alertRef} tabIndex={-1} role="alert" className="text-[13px] text-danger-600 focus:outline-none">
            {error}
          </p>
        )}
        {stuck ? (
          <Button fullWidth size="lg" onClick={() => navigate('/kitchen')}>Go to Kitchen</Button>
        ) : (
          <Button fullWidth size="lg" onClick={join} disabled={busy} aria-busy={busy || undefined}>
            {busy ? <Spinner size="sm" label="Joining" /> : 'Join'}
          </Button>
        )}
        {notNow}
      </>
    );
  }

  return (
    <div className="min-h-dvh bg-surface">
      <Sheet open={!signingIn} onClose={() => !busy && navigate('/')} labelledBy={titleId}>
        <div className="flex min-w-0 flex-col gap-3 pb-[env(safe-area-inset-bottom)]">{content}</div>
      </Sheet>
      <SignUpDialog
        open={signingIn}
        action={{ kind: 'join-kitchen', name: null }}
        body="Sign in with a verified email to share a shopping list and pantry."
        onClose={() => setSignUp(false)}
      />
    </div>
  );
}
