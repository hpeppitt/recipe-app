import { useId } from 'react';
import { Link } from 'react-router-dom';
import { UserPill } from '../ui/UserPill';
import { GitBranch } from '../ui/icons';
import { formatTime, pluralize } from '../../lib/utils';

export type TileRecipe = {
  id: string;
  emoji: string;
  title: string;
  totalTime: number;
  childCount?: number;
  /** New branches in the last 7 days (RL-126); shows the "+N this week" badge instead of the branch tag. */
  weekCount?: number;
  createdBy?: { uid: string; displayName: string | null };
};

const TINTS = ['bg-accent-200', 'bg-accent-2-200', 'bg-surface-secondary'] as const;
export const MAX_TILES = 8;

/** Organic 1b's sideways row of 200px tinted tiles. The caller decides when it shows. */
export function RecipeTileRow({ title, recipes }: { title: string; recipes: readonly TileRecipe[] }) {
  const headingId = useId();
  return (
    // The ul's pb-5 -mb-3.5 holds the author link's 12px extension and focus ring inside the
    // scroller (overflow-x makes overflow-y clip too) while the layout gap stays 6px.
    <section aria-labelledby={headingId} className="pt-5 pl-5">
      <h2 id={headingId} className="mb-2.5 pr-5 font-heading text-lg text-text-primary">
        {title}
      </h2>
      <ul className="flex snap-x snap-mandatory gap-3 overflow-x-auto pr-5 pb-5 -mb-3.5 scrollbar-none">
        {recipes.slice(0, MAX_TILES).map((r, i) => (
          <Tile key={r.id} recipe={r} tint={TINTS[i % TINTS.length]} />
        ))}
      </ul>
    </section>
  );
}

function Tile({ recipe, tint }: { recipe: TileRecipe; tint: string }) {
  const title = recipe.title.trim() || 'Untitled recipe';
  const author = recipe.createdBy?.displayName?.trim() || 'Anonymous';
  const week = recipe.weekCount ?? 0;
  const weekId = useId();
  const count = week > 0 ? 0 : (recipe.childCount ?? 0);
  return (
    // The stretched-link pattern of the Explore rows: the tile link and the author link are siblings.
    <li className="relative flex w-[200px] shrink-0 snap-start flex-col gap-2">
      <Link
        to={`/recipe/${recipe.id}`}
        // "Open" keeps it distinct from the list row's link to the same recipe.
        aria-label={`Open ${title}`}
        aria-describedby={week > 0 ? weekId : undefined}
        // z-[5]: above the tile div (relative, later in the DOM), below the author link (z-10).
        className="absolute inset-0 z-[5] rounded-[30px] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-500"
      />
      <div className={`relative flex size-[200px] items-center justify-center rounded-[30px] ${tint}`}>
        <span aria-hidden="true" className="text-[76px] leading-none">
          {recipe.emoji}
        </span>
        {week > 0 && (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-accent-2-700 px-2.5 py-[3px] text-[11px] font-semibold text-accent-2-100">
            <GitBranch className="size-3" />
            <span aria-hidden="true">+{week} this week</span>
            <span id={weekId} className="sr-only">
              {week} new {pluralize(week, 'branch', 'branches')} this week
            </span>
          </span>
        )}
        {count > 0 && (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-accent-2-700 px-2.5 py-[3px] text-[11px] font-semibold text-accent-2-100">
            <GitBranch className="size-3" />
            {count} {pluralize(count, 'branch', 'branches')}
          </span>
        )}
      </div>
      {/* pb-1 + the gap keep the author link's 12px extension off the title text. The wrapper, not the
          clamped h3, carries the padding so a third line cannot show through it. */}
      <div className="pb-1">
        <h3 className="line-clamp-2 break-words px-1 font-heading text-[17px] leading-[1.15] text-text-primary">{title}</h3>
      </div>
      <div className="flex min-w-0 items-center gap-2 px-1 text-xs text-text-tertiary">
        {recipe.createdBy?.uid && (
          <Link
            to={`/profile/${recipe.createdBy.uid}`}
            aria-label={`View ${author}'s profile, from ${title}`}
            // py-3 -my-3 gives a 44px target; the inner span clips, not the link.
            className="relative z-10 -my-3 flex min-w-0 rounded-full py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
          >
            <span className="min-w-0 overflow-hidden rounded-full">
              <UserPill uid={recipe.createdBy.uid} name={author} />
            </span>
          </Link>
        )}
        <span className="shrink-0">{formatTime(recipe.totalTime)}</span>
      </div>
    </li>
  );
}
