import { useEffect, useId, useRef, useState } from 'react';
import type { KitchenMember } from '../../services/firestore';
import { KITCHEN_INVITE_DAYS } from '../../lib/kitchen';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Sheet } from '../ui/Sheet';
import { Spinner } from '../ui/Spinner';
import { Share } from '../ui/icons';

const nameOf = (m: KitchenMember) => m.name?.trim() || 'A cook';

/** The household's avatars, overlapped (24a). Labelled with the household line, so it reads as one image. */
export function AvatarStack({ members, label, ring = 'ring-surface' }: { members: KitchenMember[]; label: string; ring?: string }) {
  return (
    <span role="img" aria-label={label} className="flex items-center">
      {members.map((m, i) => (
        <span key={m.uid} className={`rounded-full ring-2 ${ring} ${i ? '-ml-2' : ''}`}>
          <Avatar uid={m.uid} name={m.name} {...m.avatar} />
        </span>
      ))}
    </span>
  );
}

/**
 * Who shares the kitchen (RL-239). The owner can remove anyone else; a member can leave.
 * Each asks first. Errors are the hook's copy, shown in the sheet.
 */
export function PeopleSheet({
  open,
  onClose,
  members,
  uid,
  ownerUid,
  removeMember,
  leaveKitchen,
  onLeft,
}: {
  open: boolean;
  onClose: () => void;
  members: KitchenMember[];
  uid: string;
  ownerUid: string;
  removeMember: (uid: string) => Promise<void>;
  leaveKitchen: () => Promise<void>;
  onLeft: () => void;
}) {
  const titleId = useId();
  const [confirm, setConfirm] = useState<KitchenMember | 'leave' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [wasOpen, setWasOpen] = useState(open);
  // Bumped after a removal: the Remove button has gone, so focus the heading once the confirm has closed.
  const [removed, setRemoved] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const isOwner = ownerUid === uid;
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      setError('');
      setNote('');
    }
  }
  // Runs after ConfirmDialog's close effect (child effects first), so the native focus return cannot undo it.
  useEffect(() => {
    if (removed) headingRef.current?.focus();
  }, [removed]);

  const act = async () => {
    if (!confirm || busy) return;
    setBusy(true);
    setError('');
    try {
      if (confirm === 'leave') {
        await leaveKitchen();
        setConfirm(null);
        onLeft();
      } else {
        await removeMember(confirm.uid);
        setNote(`Removed ${nameOf(confirm)}`);
        setConfirm(null);
        setRemoved((n) => n + 1);
      }
    } catch (e) {
      setConfirm(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Sheet open={open} onClose={onClose} labelledBy={titleId}>
        <h2 ref={headingRef} id={titleId} tabIndex={-1} className="font-heading text-[24px] leading-tight text-text-primary focus:outline-none">People</h2>
        <ul className="flex flex-col gap-2">
          {members.map((m) => (
            <li key={m.uid} className="flex min-h-11 items-center gap-3">
              <Avatar uid={m.uid} name={m.name} {...m.avatar} />
              <span className="min-w-0 flex-1 truncate text-[15px] text-text-primary">
                {nameOf(m)}
                {m.uid === uid ? ' (you)' : ''}
                {m.uid === ownerUid && <span className="text-[13px] text-neutral-700"> · Owner</span>}
              </span>
              {isOwner && m.uid !== uid && (
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => setConfirm(m)} aria-label={`Remove ${nameOf(m)}`}>
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
        {error && <p role="alert" className="text-[13px] text-danger-600">{error}</p>}
        <p role="status" className="sr-only">{note}</p>
        {!isOwner && (
          <Button variant="danger" fullWidth disabled={busy} onClick={() => setConfirm('leave')}>
            Leave this kitchen
          </Button>
        )}
      </Sheet>
      <ConfirmDialog
        open={confirm !== null}
        title={confirm === 'leave' ? 'Leave this kitchen?' : `Remove ${confirm ? nameOf(confirm) : ''}?`}
        message={
          confirm === 'leave'
            ? "You'll go back to your own list and pantry. You can join again with a new link."
            : "They won't see this list and pantry any more. They can join again with a new link."
        }
        confirmLabel={confirm === 'leave' ? 'Leave' : 'Remove'}
        confirmVariant="danger"
        busy={busy}
        onConfirm={act}
        onCancel={() => !busy && setConfirm(null)}
      />
    </>
  );
}

/** The invite link (29a): Web Share where there is one, else copy. `url` null while it is being made. */
export function InviteSheet({
  open,
  onClose,
  onRetry,
  url,
  error,
}: {
  open: boolean;
  onClose: () => void;
  onRetry: () => void;
  url: string | null;
  error: string;
}) {
  const titleId = useId();
  const [note, setNote] = useState('');
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setNote('');
  }

  const share = async () => {
    if (!url) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Join my kitchen', url });
        return;
      } catch (e) {
        // Cancelling the share sheet is not a failure; anything else falls back to copying.
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setNote('Link copied');
    } catch {
      setNote("Couldn't copy the link");
    }
  };

  return (
    <Sheet open={open} onClose={onClose} labelledBy={titleId}>
      <h2 id={titleId} className="font-heading text-[24px] leading-tight text-text-primary">Invite to your kitchen</h2>
      <div aria-live="polite" className="flex flex-col gap-3">
      {error ? (
        <>
          <p role="alert" className="text-[13px] text-danger-600">{error}</p>
          <Button fullWidth onClick={onRetry}>Try again</Button>
        </>
      ) : url ? (
        <>
          <p className="break-all rounded-[22px] bg-surface-secondary px-4 py-3 text-[13px] text-text-primary">{url}</p>
          <p className="text-[13px] text-neutral-700">Anyone with this link can join for {KITCHEN_INVITE_DAYS} days.</p>
          <Button fullWidth className="gap-2" onClick={share}>
            <Share className="size-5" />
            Share link
          </Button>
        </>
      ) : (
        <Spinner label="Making a link" />
      )}
      </div>
      <p role="status" className="text-[13px] text-text-secondary">{note}</p>
      <Button variant="ghost" fullWidth onClick={onClose}>Close</Button>
    </Sheet>
  );
}
