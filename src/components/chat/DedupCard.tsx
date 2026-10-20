import { Link } from 'react-router-dom';
import { IconButton } from '../ui/IconButton';
import { UserPill } from '../ui/UserPill';
import { GitBranch, X } from '../ui/icons';
import { formatTime } from '../../lib/utils';
import type { TypingMatches } from '../../hooks/useRecipeChat';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The 7a sage card above the composer: similar recipes found during a typing pause (RL-178). */
export function DedupCard({
  typing: { matches, family },
  onBranch,
  onHide,
}: {
  typing: TypingMatches;
  onBranch: (id: string) => void;
  onHide: () => void;
}) {
  const top = matches[0];
  return (
    <section
      aria-label="Similar recipes"
      className="mx-auto mb-2 flex max-h-[40dvh] max-w-lg min-w-0 flex-col gap-2.5 overflow-y-auto rounded-[24px] bg-accent-2-100 px-4 py-3.5 text-accent-2-900"
    >
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 pt-2.5 text-sm break-words">
          <strong>{top.title}</strong> is already growing here
          {family &&
            family.versions > 0 &&
            ` · ${plural(family.versions, 'version')} by ${plural(family.cooks, 'cook')}`}
        </p>
        <div className="-mt-1 -mr-2">
          <IconButton variant="flat" label="Hide matches" icon={<X className="size-5" />} onClick={onHide} />
        </div>
      </div>
      {matches.map((r) => (
        <div key={r.id} className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-10 flex-shrink-0 items-center justify-center rounded-full bg-surface text-xl"
          >
            {r.emoji}
          </span>
          <div className="min-w-0 flex-1 space-y-0.5">
            <Link
              to={`/recipe/${r.id}`}
              className="block truncate text-sm font-bold text-text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-primary-500"
            >
              {r.title}
            </Link>
            <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-text-secondary">
              {r.author && <UserPill uid={r.author.uid} name={r.author.name} truncate />}
              <span>
                {[r.totalTime > 0 ? formatTime(r.totalTime) : '', r.difficulty].filter(Boolean).join(' · ')}
              </span>
            </div>
          </div>
          {/* A 36px pill inside a 44px target. */}
          <button
            type="button"
            onClick={() => onBranch(r.id)}
            aria-label={`Branch ${r.title}`}
            className="flex h-11 flex-shrink-0 items-center focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary-500"
          >
            <span className="flex h-9 items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 text-sm text-text-primary">
              <GitBranch className="size-4" />
              Branch
            </span>
          </button>
        </div>
      ))}
    </section>
  );
}
