import { useId, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { cookWhen } from '../../lib/cooks';
import { deleteCook } from '../../services/firestore';
import { reportError } from '../../services/telemetry';
import type { Cook } from '../../types/social';
import { Avatar } from '../ui/Avatar';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Sheet } from '../ui/Sheet';

interface CookNotesSheetProps {
  open: boolean;
  /** Newest first, as the summary returns them (at most 20). */
  cooks: Cook[];
  onClose: () => void;
  /** Called after the viewer's own cook is deleted, so the summary can be re-read. */
  onDeleted: () => void;
}

/** Notes from cooks (RL-199). The viewer's own notes carry Delete. */
export function CookNotesSheet({ open, cooks, onClose, onDeleted }: CookNotesSheetProps) {
  const titleId = useId();
  const { user } = useAuth();
  const [deleting, setDeleting] = useState<Cook | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [removed, setRemoved] = useState<string[]>([]);
  const notes = cooks.filter((c) => c.note && !removed.includes(c.id));
  // Frozen per open so a day label cannot change under a reader.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => Date.now(), [open]);
  const close = () => {
    setError(false);
    onClose();
  };

  const confirm = async () => {
    if (!deleting) return;
    setBusy(true);
    setError(false);
    try {
      await deleteCook(deleting.id);
      setRemoved((r) => [...r, deleting.id]);
      setDeleting(null);
      onDeleted();
    } catch (err) {
      reportError(err, 'delete-cook');
      setDeleting(null);
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Sheet open={open && notes.length > 0} onClose={close} labelledBy={titleId}>
        <div className="flex flex-col gap-4">
          <h2 id={titleId} className="font-heading text-2xl leading-tight text-text-primary">
            Notes from cooks
          </h2>
          {error && (
            <p role="alert" className="text-sm text-danger-600">
              Couldn&apos;t delete that. Check your connection and try again.
            </p>
          )}
          <ul className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
            {notes.slice(0, 20).map((c) => (
              <li key={c.id} className="flex gap-3">
                <Avatar uid={c.uid} name={c.displayName} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <span className="break-words text-sm font-bold text-text-primary">{c.displayName ?? 'A cook'}</span>
                    <span className="text-xs text-neutral-700">{cookWhen(c.createdAt, now)}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.vote === 'again' ? 'bg-accent-2-200 text-accent-2-900' : 'bg-accent-100 text-accent-900'}`}
                    >
                      {c.vote === 'again' ? 'Again' : 'Tweak'}
                    </span>
                  </div>
                  <p className="break-words text-sm italic text-text-primary">{c.note}</p>
                  {user && c.uid === user.uid && (
                    <button type="button" onClick={() => setDeleting(c)} className="-ml-2 min-h-11 px-2 text-[13px] font-semibold text-danger-600">
                      Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Sheet>
      <ConfirmDialog
        open={!!deleting}
        title="Delete this cook?"
        message="It leaves your cook log too."
        confirmLabel="Delete"
        confirmVariant="danger"
        busy={busy}
        onConfirm={confirm}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
