import { useState } from 'react';
import { madeByLine, recentCooks } from '../../lib/cooks';
import type { useRecipeCooks } from '../../hooks/useCooks';
import { Avatar } from '../ui/Avatar';
import { CookNotesSheet } from './CookNotesSheet';

/** The page's one `useRecipeCooks` result, shared so the row costs no second read. */
export type RecipeCooks = Pick<ReturnType<typeof useRecipeCooks>, 'status' | 'summary' | 'refresh'>;

/** Under the metadata pills (RL-199): who made this, how many times, and a way into their notes. Public. */
export function MadeByRow({ cooks }: { cooks: RecipeCooks }) {
  const [open, setOpen] = useState(false);
  const { status, summary, refresh } = cooks;
  const line = status === 'ready' ? madeByLine(summary.total, summary.again) : null;
  if (!line) return null; // an open sheet unmounts with the row, so it reopens closed
  const [made, rest] = line.split(' · ');
  const hasNotes = summary.recent.some((c) => c.note);
  const showSheet = open && hasNotes;
  return (
    <>
      <div className="mt-2 flex items-center gap-2.5 rounded-3xl bg-neutral-100 px-3.5 py-3">
        <div className="flex shrink-0" aria-hidden="true">
          {recentCooks(summary.recent).map((c, i) => (
            <span key={c.uid} className={i ? '-ml-2 rounded-full ring-2 ring-neutral-100' : 'rounded-full ring-2 ring-neutral-100'}>
              <Avatar uid={c.uid} name={c.displayName} />
            </span>
          ))}
        </div>
        <p className="min-w-0 flex-1 text-[13px] text-text-primary">
          <strong>{made}</strong>
          {rest && ` · ${rest}`}
        </p>
        {hasNotes && (
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
            className="-my-2 min-h-11 shrink-0 px-2 text-[13px] font-semibold text-accent-700"
          >
            Notes
          </button>
        )}
      </div>
      <CookNotesSheet open={showSheet} cooks={summary.recent} onClose={() => setOpen(false)} onDeleted={refresh} />
    </>
  );
}
