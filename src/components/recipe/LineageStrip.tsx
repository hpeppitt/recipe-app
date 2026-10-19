import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Recipe } from '../../types/recipe';
import { collapseLineage } from '../../lib/tree';
import { ChevronRight, Diff } from '../ui/icons';

interface LineageStripProps {
  recipe: Recipe;
  /** Root first, parent last. Empty while the lineage loads. */
  ancestors: Recipe[];
}

const MAX_CRUMB = 18;
// Truncate the string, not the CSS: a CSS clip would also clip the hit-area extension.
const crumbText = (s: string) => (s.length > MAX_CRUMB ? `${s.slice(0, MAX_CRUMB)}…` : s);

// 44px tall targets without changing the visual line height: a 21px crumb line extends 11.5px each
// way (the row gap is 24px so wrapped rows do not overlap); the 34px pill extends 5px.
const HIT_CRUMB = "relative before:absolute before:inset-x-0 before:-inset-y-[11.5px] before:content-['']";
const HIT_PILL = "relative before:absolute before:inset-x-0 before:-inset-y-[5px] before:content-['']";

function Sep() {
  return <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />;
}

/** The 17a sage strip on a branch: collapsible breadcrumb, the prompt as a sentence, See what changed. */
export function LineageStrip({ recipe, ancestors }: LineageStripProps) {
  // Tied to the recipe, so navigating to another branch collapses it again.
  const [expandedFor, setExpandedFor] = useState<string | null>(null);
  const expanded = expandedFor === recipe.id;
  const firstMiddle = useRef<HTMLAnchorElement>(null);
  // The "+N" button unmounts on press; hand focus to the first revealed crumb.
  useEffect(() => {
    if (expanded) firstMiddle.current?.focus();
  }, [expanded]);
  if (recipe.depth === 0) return null;

  const entries = collapseLineage(ancestors, expanded);
  const parent = ancestors[ancestors.length - 1];
  const author = recipe.createdBy.displayName?.trim() || 'Someone';
  const parentAuthor = parent?.createdBy.displayName?.trim() || 'Someone';
  const parentTitle = parent?.title.trim() || 'Untitled recipe';
  const prompt = recipe.prompt?.trim();
  const authorName = <b className="break-words">{author}</b>;

  return (
    <div className="mx-[22px] mt-[14px] flex flex-col gap-2 rounded-[22px] bg-accent-2-100 px-4 py-3 text-[14px] text-accent-2-900">
      {ancestors.length > 0 && (
        <nav aria-label="Recipe lineage" className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-6 font-semibold">
          {entries.map((entry) => (
            <span key={entry.kind === 'item' ? entry.item.id : 'more'} className="flex min-w-0 items-center gap-1">
              {entry.kind === 'more' ? (
                <button
                  type="button"
                  onClick={() => setExpandedFor(recipe.id)}
                  aria-label={`Show ${entry.count} more`}
                  className={`${HIT_CRUMB} rounded-full bg-accent-2-200 px-2`}
                >
                  +{entry.count}
                </button>
              ) : (
                <Link
                  to={`/recipe/${entry.item.id}`}
                  title={entry.item.title.trim() || undefined}
                  aria-label={entry.item.title.trim() || 'Untitled recipe'}
                  ref={expanded && entry.item === ancestors[1] ? firstMiddle : undefined}
                  className={HIT_CRUMB}
                >
                  {entry.item === ancestors[0] ? `${entry.item.emoji} ` : ''}
                  {crumbText(entry.item.title.trim() || 'Untitled recipe')}
                </Link>
              )}
              <Sep />
            </span>
          ))}
          <span aria-current="page" className="max-w-[200px] truncate font-normal">
            {recipe.title.trim() || 'Untitled recipe'}
          </span>
        </nav>
      )}
      <p className="break-words">
        {/* The parent part waits for the lineage, so a wrong author and title never show and swap. */}
        {prompt ? (
          <>
            <Link to={`/profile/${recipe.createdBy.uid}`} className="underline">{authorName}</Link> asked for{' '}
            <i>"{prompt}"</i>
            {parent && <> on {parentAuthor}'s <b>{parentTitle}</b></>}.
          </>
        ) : (
          <>Branched from {parent ? <b>{parentTitle}</b> : 'a recipe'}.</>
        )}
      </p>
      <Link
        to={`/recipe/${recipe.id}/changes`}
        className={`${HIT_PILL} inline-flex h-[34px] items-center gap-1.5 self-start rounded-full bg-surface px-[14px] text-[13px] font-semibold text-text-primary`}
      >
        <Diff className="h-4 w-4" />
        See what changed
      </Link>
    </div>
  );
}
