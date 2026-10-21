import { Link } from 'react-router-dom';
import { formatTime, pluralize } from '../../lib/utils';
import { DIFFICULTY_LABELS } from '../../lib/constants';
import type { CreatedBy, Nutrition } from '../../types/recipe';
import { UserPill } from '../ui/UserPill';
import { dietLabel } from '../../lib/diet';
import { Clock, Droplet, Drumstick, Flame, Gauge, Leaf, Wheat } from '../ui/icons';

interface MetadataPillsProps {
  prepTime: number;
  cookTime: number;
  totalTime: number;
  /** Omit where the servings stepper shows the count instead. */
  servings?: number;
  difficulty: string;
  /** Omit where there is no author yet (the chat card). A local-only author has no profile, so no pill. */
  author?: CreatedBy | null;
  /** The author is the importer (RL-253): the pill reads "via <name>". */
  via?: boolean;
  /** The kcal pill shows only when this is present. */
  nutrition?: Nutrition | null;
  /** A known diet tag shows a diet pill; there is no diet field. */
  tags?: string[];
}

const PILL = 'inline-flex items-center gap-[5px] rounded-full px-3 py-[5px] text-[13px] leading-5';
const NEUTRAL = `${PILL} bg-neutral-100 text-neutral-800`;

export function MetadataPills({ prepTime, cookTime, totalTime, servings, difficulty, author, via, nutrition, tags }: MetadataPillsProps) {
  const times: { label: string }[] = [];
  if (prepTime > 0 && cookTime > 0) {
    times.push({ label: `Prep ${formatTime(prepTime)}` }, { label: `Cook ${formatTime(cookTime)}` });
  }
  const diet = tags ? dietLabel(tags) : null;
  const macros = nutrition && [
    { Icon: Wheat, g: nutrition.carbs, name: 'carbs' },
    { Icon: Droplet, g: nutrition.fat, name: 'fat' },
    { Icon: Drumstick, g: nutrition.protein, name: 'protein' },
  ].filter((m) => Number.isFinite(m.g)).map((m) => ({ ...m, g: Math.round(m.g) }));
  const showAuthor = author && author.uid && author.uid !== 'local';

  return (
    <div className="mt-[14px] flex flex-wrap gap-1.5">
      {showAuthor && (
        // The link's pseudo-element lifts the 24px pill to a 44px target; UserPill is a span, so no anchor nests in an anchor.
        <Link
          to={`/profile/${author.uid}`}
          aria-label={`Open ${via ? 'importer' : 'author'}, ${author.displayName || 'Anonymous'}`}
          className="relative inline-flex min-w-0 max-w-full items-center gap-1 text-[13px] text-neutral-700 before:absolute before:-inset-y-2.5 before:inset-x-0 before:content-['']"
        >
          {via && <span aria-hidden="true">via</span>}
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
      {diet && (
        <span className={NEUTRAL}>
          <Leaf className="h-3.5 w-3.5 flex-shrink-0" />
          {diet}
        </span>
      )}
      {nutrition && (
        <span className={`${PILL} bg-accent-100 font-semibold text-accent-800`}>
          <Flame className="h-3.5 w-3.5 flex-shrink-0" />
          {nutrition.calories} kcal
        </span>
      )}
      {macros?.map(({ Icon, g, name }) => (
        <span key={name} className={NEUTRAL}>
          <Icon className="h-3.5 w-3.5 flex-shrink-0" />
          {g} g {name}<span className="sr-only"> per serving</span>
        </span>
      ))}
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
