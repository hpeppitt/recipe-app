import { useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { Recipe } from '../../types/recipe';
import { carriedListOrigin } from '../../lib/paneMode';
import { ChevronDown, ChevronUp, Diff } from '../ui/icons';

interface LineageStripProps {
  recipe: Recipe;
  /** Root first, parent last. Empty while the lineage loads. */
  ancestors: Recipe[];
}

// 44px tall hit area without changing the visual height: the 34px pill extends 5px each way.
const HIT_PILL = "relative before:absolute before:inset-x-0 before:-inset-y-[5px] before:content-['']";
// Groomer choice: the pill shows the first 5 generations then the current one, never more than 6 dots.
const MAX_DOTS = 6;
// Row links: a pseudo-element grows the target to 44px without changing the row layout.
const HIT_ROW = "relative before:absolute before:inset-x-0 before:-inset-y-3 before:content-['']";

const nameOf = (r: Recipe) => r.createdBy.displayName?.trim() || 'Someone';
const titleOf = (r: Recipe) => r.title.trim() || 'Untitled recipe';

/** The 17b version pill on a branch (generation dots, Path panel with Compare per ancestor) over the sage sentence card. */
export function LineageStrip({ recipe, ancestors }: LineageStripProps) {
  // Opened from a list: hops stay in the shell beside it (2026-10-20).
  const origin = carriedListOrigin(useLocation().state);
  // Tied to the recipe, so navigating to another branch closes the panel.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === recipe.id;
  const pathBtn = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  if (recipe.depth === 0) return null;

  const loaded = ancestors.length > 0;
  const parent = ancestors[ancestors.length - 1];
  // The stored depth can go stale after a reparent, so N comes from the loaded chain.
  const generation = loaded ? ancestors.length + 1 : recipe.depth + 1;
  const dots = Math.min(generation, MAX_DOTS);
  const author = nameOf(recipe);
  const parentAuthor = parent ? nameOf(parent) : 'Someone';
  const parentTitle = parent ? titleOf(parent) : 'Untitled recipe';
  const prompt = recipe.prompt?.trim();
  const authorName = <b className="break-words">{author}</b>;
  const rows = [...ancestors, recipe];

  return (
    <div
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          setOpenFor(null);
          pathBtn.current?.focus();
        }
      }}
    >
      <div className="mx-[22px] mt-[14px] flex h-[46px] items-center gap-[10px] rounded-full bg-surface-secondary px-[6px]">
        <span aria-hidden="true" className="flex gap-[3px] pl-2" data-testid="generation-dots">
          {Array.from({ length: dots }, (_, i) => (
            <span key={i} className={`h-2 w-2 rounded-full ${i === dots - 1 ? 'bg-accent' : 'bg-neutral-500'}`} />
          ))}
        </span>
        <span className="flex-1 truncate text-[13px]">
          <b>Generation {generation}</b>
          {loaded && ` · from ${parentTitle}`}
        </span>
        <button
          ref={pathBtn}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpenFor(open ? null : recipe.id)}
          className={`${HIT_PILL} inline-flex h-[34px] items-center gap-1 rounded-full bg-surface px-3 text-[13px] font-semibold`}
        >
          Path
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {open && (
        <ol id={panelId} className="mx-4 mt-2.5 rounded-[30px] bg-surface px-4 py-[14px] shadow-lg">
          {rows.map((r, i) => {
            // Row 0 is the root only when it has no parent; while loading or on a partial chain it is not.
            const first = i === 0 && r.parentId === null;
            const last = i === rows.length - 1;
            const rowPrompt = r.prompt?.trim();
            const sub = first
              ? `Original · ${nameOf(r)}`
              : `${rowPrompt ? `"${rowPrompt}" · ` : ''}${nameOf(r)}`;
            return (
              <li key={r.id} className="flex gap-3">
                <div aria-hidden="true" className="flex w-5 flex-col items-center">
                  <span
                    className={`h-4 w-4 flex-shrink-0 rounded-full ${
                      last
                        ? 'bg-accent'
                        : first
                          ? 'bg-surface shadow-[inset_0_0_0_3px_var(--color-text-primary)]'
                          : 'bg-surface shadow-[inset_0_0_0_3px_var(--color-accent)]'
                    }`}
                  />
                  {!last && <span className="min-h-[18px] w-[3px] flex-1 bg-accent" />}
                </div>
                <div className="min-w-0 flex-1 pb-[14px]">
                  {last ? (
                    <div className="break-words text-[15px] font-bold">{titleOf(r)}</div>
                  ) : (
                    <Link
                      to={`/recipe/${r.id}`}
                      state={origin}
                      onClick={() => setOpenFor(null)}
                      className={`${HIT_ROW} break-words text-[15px] font-bold`}
                    >
                      {first ? `${r.emoji} ` : ''}
                      {titleOf(r)}
                    </Link>
                  )}
                  <div className="break-words text-[12px] text-neutral-700">
                    {sub}
                    {last && ' · you are here'}
                  </div>
                </div>
                {!last && (
                  <Link
                    to={`/recipe/${recipe.id}/changes?vs=${r.id}`}
                    aria-label={`Compare with ${titleOf(r)}`}
                    className={`${HIT_ROW} self-start text-[13px] font-semibold text-accent-700`}
                  >
                    Compare
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <div className="mx-[22px] mt-[14px] flex flex-col gap-2 rounded-[22px] bg-accent-2-100 px-4 py-3 text-[14px] text-accent-2-900">
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
    </div>
  );
}
