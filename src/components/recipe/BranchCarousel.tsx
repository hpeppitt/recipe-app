import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { summariseChanges, diffRecipes } from '../../lib/recipeDiff';
import { collectSubtreeIds } from '../../lib/tree';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import type { Recipe } from '../../types/recipe';

interface BranchCarouselProps {
  /** The recipe being viewed. */
  recipe: Recipe;
  /** Every recipe in its family (from useRecipeTree), for parents, counts and the root. */
  recipes: Recipe[];
  /** While true and there are no cards yet, a placeholder holds the section's place. */
  isLoading?: boolean;
}

// Rotating card tints. Text on all three is text-primary or text-secondary
// (lowest measured contrast 7.45:1), never text-tertiary.
const TINTS = ['bg-primary-100', 'bg-accent-2-200', 'bg-surface-secondary'];

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600';

export function BranchCarousel({ recipe, recipes, isLoading = false }: BranchCarouselProps) {
  const navigate = useNavigate();
  const rowRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  // True for ~400ms after a dot press, so the observer does not override it mid-scroll.
  const locked = useRef(false);

  const cards = useMemo(
    () => recipes.filter((r) => r.parentId === recipe.id).sort((a, b) => a.createdAt - b.createdAt),
    [recipes, recipe.id]
  );
  const count = cards.length;

  // The active dot follows the card with the most area in view. Guarded for jsdom,
  // and it only sets state, so nothing scrolls on mount.
  useEffect(() => {
    const row = rowRef.current;
    if (!row || typeof IntersectionObserver === 'undefined') return;
    const ratios = new Map<Element, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        if (locked.current) return;
        for (const e of entries) ratios.set(e.target, e.intersectionRatio);
        let best = -1;
        let bestRatio = 0;
        Array.from(row.children).forEach((el, i) => {
          const r = ratios.get(el) ?? 0;
          if (r > bestRatio) {
            bestRatio = r;
            best = i;
          }
        });
        if (best >= 0) setActive(Math.min(best, count - 1));
      },
      { root: row, threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    Array.from(row.children).forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [count]);

  if (count === 0) return isLoading ? <Skeleton className="h-64 -mx-0" /> : null;

  const root = recipe.parentId ? recipes.find((r) => r.id === recipe.rootId) : undefined;
  const familyName = (root ?? recipe).title;
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const nodes = recipes.map((r) => ({ id: r.id, parentId: r.parentId }));

  const show = (i: number) => {
    const row = rowRef.current;
    const card = row?.children[i] as HTMLElement | undefined;
    setActive(Math.min(Math.max(i, 0), count - 1));
    locked.current = true;
    setTimeout(() => {
      locked.current = false;
    }, 400);
    // scrollTo on the row only, so the page never scrolls vertically. 16 is the row's scroll padding.
    row?.scrollTo?.({ left: (card?.offsetLeft ?? 0) - 16, behavior: 'smooth' });
  };

  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[13px] uppercase tracking-[0.08em] text-text-tertiary">
            {count === 1 ? '1 way someone took it' : `${count} ways people took it`}
          </h3>
          <p className="font-heading text-[25px] leading-tight text-text-primary break-words">{familyName}</p>
        </div>
        <Link
          to={`/recipe/${recipe.id}/tree`}
          aria-label="Version tree"
          className={`shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-full border border-border-strong text-text-primary hover:bg-surface-secondary ${focusRing}`}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="16" y="16" width="6" height="6" rx="1" />
            <rect x="2" y="16" width="6" height="6" rx="1" />
            <rect x="9" y="2" width="6" height="6" rx="1" />
            <path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3" />
            <path d="M12 12V8" />
          </svg>
        </Link>
      </div>

      <div
        ref={rowRef}
        role="region"
        aria-roledescription="carousel"
        aria-label={`Branches of ${familyName}`}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-px-4 -mx-4 px-4 pb-1"
      >
        {cards.map((card, i) => {
          const parent = byId.get(card.parentId ?? '');
          const tags = parent ? summariseChanges(diffRecipes(parent, card), 3) : [];
          const branches = collectSubtreeIds(nodes, card.id).length - 1;
          return (
            <div
              key={card.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${count}`}
              className={`snap-start shrink-0 w-[290px] min-w-0 rounded-card p-[17.6px] flex flex-col gap-3 ${TINTS[i % TINTS.length]}`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-[32px] leading-none" aria-hidden="true">
                  {card.emoji}
                </span>
                {branches > 0 && (
                  <span className="text-xs rounded-full px-2.5 py-1 bg-surface text-text-secondary">
                    {branches === 1 ? '1 branch' : `${branches} branches`}
                  </span>
                )}
              </div>
              <p className="font-heading text-[25px] leading-tight text-text-primary line-clamp-3 break-words">
                {card.prompt || card.title}
              </p>
              <p className="text-[13px] text-text-secondary break-words">
                {card.title} · {card.createdBy.displayName || 'Anonymous'}
              </p>
              {tags.length > 0 && (
                <ul role="list" aria-label="What changed" className="flex flex-wrap gap-2">
                  {tags.map((t) => (
                    <li
                      key={t}
                      className={`text-xs leading-4 rounded-full px-2.5 py-1 break-words max-w-full ${
                        t.startsWith('~') ? 'bg-accent-2-100 text-accent-2-800' : 'bg-primary-50 text-primary-700'
                      }`}
                    >
                      {t}
                    </li>
                  ))}
                </ul>
              )}
              <Button aria-label={`Open ${card.title}`} className="mt-auto outline-primary-600!" onClick={() => navigate(`/recipe/${card.id}`)}>
                Open
              </Button>
            </div>
          );
        })}
      </div>

      {/* Each dot is a 24x44 hit area around an 8px mark. The mark has a border
          because neutral-400 alone is 1.6:1 on the page. */}
      <div className="flex flex-wrap justify-center">
        {cards.map((card, i) => (
          <button
            key={card.id}
            type="button"
            aria-label={`Show branch ${i + 1} of ${count}`}
            aria-current={i === active ? 'true' : undefined}
            onClick={() => show(i)}
            className={`w-6 h-11 flex items-center justify-center rounded-full ${focusRing}`}
          >
            <span
              className={`block h-2 rounded-full border transition-all ${
                i === active ? 'w-5 bg-primary-600 border-primary-600' : 'w-2 bg-neutral-400 border-neutral-600'
              }`}
            />
          </button>
        ))}
      </div>

      {root && (
        <Link
          to={`/recipe/${root.id}`}
          className={`flex items-center gap-2 min-h-11 rounded-full px-3 text-sm text-text-primary hover:bg-surface-secondary ${focusRing}`}
        >
          <span aria-hidden="true">{root.emoji}</span>
          <span className="text-text-secondary">The original</span>
          <span className="truncate font-medium">{root.title}</span>
        </Link>
      )}
    </section>
  );
}
