import { Link } from 'react-router-dom';
import { formatTime, pluralize } from '../../lib/utils';
import { DIFFICULTY_LABELS } from '../../lib/constants';
import type { CreatedBy, Nutrition } from '../../types/recipe';
import { UserPill } from '../ui/UserPill';
import { Clock, Flame, Gauge } from '../ui/icons';

interface MetadataPillsProps {
  prepTime: number;
  cookTime: number;
  totalTime: number;
  /** Omit where the servings stepper shows the count instead. */
  servings?: number;
  difficulty: string;
  /** Omit where there is no author yet (the chat card). A local-only author has no profile, so no pill. */
  author?: CreatedBy | null;
  /** The kcal pill shows only when this is present. */
  nutrition?: Nutrition | null;
}

const PILL = 'inline-flex items-center gap-[5px] rounded-full px-3 py-[5px] text-[13px] leading-5';
const NEUTRAL = `${PILL} bg-neutral-100 text-neutral-800`;

export function MetadataPills({ prepTime, cookTime, totalTime, servings, difficulty, author, nutrition }: MetadataPillsProps) {
  const times: { label: string }[] = [];
  if (prepTime > 0 && cookTime > 0) {
    times.push({ label: `Prep ${formatTime(prepTime)}` }, { label: `Cook ${formatTime(cookTime)}` });
  }
  const showAuthor = author && author.uid && author.uid !== 'local';

  return (
    <div className="mt-[14px] flex flex-wrap gap-1.5">
      {showAuthor && (
        // The link's pseudo-element lifts the 24px pill to a 44px target; UserPill is a span, so no anchor nests in an anchor.
        <Link
          to={`/profile/${author.uid}`}
          aria-label={`Open author, ${author.displayName || 'Anonymous'}`}
          className="relative inline-flex min-w-0 max-w-full items-center before:absolute before:-inset-y-2.5 before:inset-x-0 before:content-['']"
        >
          {/* The wrapper clips a very long name; the link itself has no overflow, so its hit area is not clipped. */}
          <span className="min-w-0 overflow-hidden rounded-full">
            <UserPill uid={author.uid} name={author.displayName} />
          </span>
        </Link>
      )}
      <span className={NEUTRAL}>
        <Clock className="h-3.5 w-3.5 flex-shrink-0" />
        {formatTime(totalTime)}
      </span>
      <span className={NEUTRAL}>
        <Gauge className="h-3.5 w-3.5 flex-shrink-0" />
        {DIFFICULTY_LABELS[difficulty] ?? difficulty}
      </span>
      {nutrition && (
        <span className={`${PILL} bg-accent-100 font-semibold text-accent-800`}>
          <Flame className="h-3.5 w-3.5 flex-shrink-0" />
          {nutrition.calories} kcal
        </span>
      )}
      {servings != null && <span className={NEUTRAL}>{servings} {pluralize(servings, 'serving')}</span>}
      {times.map((t) => (
        <span key={t.label} className={NEUTRAL}>
          <Clock className="h-3.5 w-3.5 flex-shrink-0" />
          {t.label}
        </span>
      ))}
    </div>
  );
}
