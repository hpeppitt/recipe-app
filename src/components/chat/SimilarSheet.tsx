import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { UserPill } from '../ui/UserPill';
import { GitBranch } from '../ui/icons';
import { formatTime } from '../../lib/utils';
import { matchKind } from '../../lib/search';
import type { SimilarRecipe } from '../../hooks/useRecipeChat';

/** The 7b sheet shown when the on-send dedup finds matches (RL-179). */
export function SimilarSheet({
  open,
  matches,
  query,
  isVarying,
  onClose,
  onBranch,
  onWriteAnyway,
}: {
  open: boolean;
  matches: SimilarRecipe[];
  query: string;
  isVarying: boolean;
  onClose: () => void;
  onBranch: (id: string) => void;
  onWriteAnyway: () => void;
}) {
  const branched = useRef(false);
  const kinds = matches.map((m) => matchKind(query, m));
  const top = matches[Math.max(0, kinds.indexOf('same'))];
  return (
    <Sheet open={open} onClose={onClose} labelledBy="similar-title" describedBy="similar-desc">
      <h2 id="similar-title" className="font-heading text-2xl text-text-primary">
        {isVarying ? "Someone's already made this change" : "Someone's already baked this"}
      </h2>
      <p id="similar-desc" className="text-sm text-neutral-800">
        Branch theirs to make it your way, or write your own.
      </p>
      <div className="flex flex-col gap-2">
        {matches.map((r, i) => (
          <Link
            key={r.id}
            to={`/recipe/${r.id}`}
            className="flex items-center gap-3 rounded-[24px] bg-surface-secondary px-3.5 py-3 focus-visible:outline-2 focus-visible:outline-primary-500"
          >
            <span aria-hidden="true" className="flex size-11 flex-shrink-0 items-center justify-center rounded-full bg-surface text-2xl">
              {r.emoji}
            </span>
            <span className="min-w-0 flex-1 space-y-0.5">
              <span className="block truncate text-[15px] font-bold text-text-primary">{r.title}</span>
              <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-text-secondary">
                {r.author && <UserPill uid={r.author.uid} name={r.author.name} truncate />}
                <span>{[r.totalTime > 0 ? formatTime(r.totalTime) : '', r.difficulty].filter(Boolean).join(' · ')}</span>
              </span>
            </span>
            <span
              className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                kinds[i] === 'same' ? 'bg-accent-2-200 text-accent-2-900' : 'border border-border bg-neutral-100 text-text-secondary'
              }`}
            >
              {kinds[i] === 'same' ? 'Same' : 'Similar'}
            </span>
          </Link>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <Button fullWidth className="min-h-[52px]" onClick={() => {
            if (branched.current) return;
            branched.current = true;
            onBranch(top.id);
          }}>
          <GitBranch className="mr-2 size-4" />
          <span className="truncate">Branch {top.title}</span>
        </Button>
        <Button fullWidth variant="ghost" onClick={onWriteAnyway}>
          {isVarying ? "Mine's different, make mine" : "Mine's different, write a new one"}
        </Button>
      </div>
    </Sheet>
  );
}
