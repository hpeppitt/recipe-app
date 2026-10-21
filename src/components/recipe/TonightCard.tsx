import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getKitchenOnce } from '../../services/firestore';
import { resolveKitchenId } from '../../hooks/useKitchen';
import { itemKey } from '../../lib/shopping';
import { formatTime } from '../../lib/utils';
import { ChefHat, X } from '../ui/icons';
import type { Ingredient } from '../../types/recipe';

interface Props {
  recipe: { id: string; emoji: string; title: string; totalTime: number; ingredients: Ingredient[] };
  /** A verified user's uid; the pantry part shows only with one (and a readable kitchen). */
  uid: string | null;
  onClose: () => void;
}

/** Explore's "Tonight" card (RL-244): the recipe opened in the last hour, with a Cook button. */
export function TonightCard({ recipe, uid, onClose }: Props) {
  // One read when the card shows, not a listener; a failure just leaves the pantry part out.
  const [pantry, setPantry] = useState<{ uid: string; keys: Set<string> } | null>(null);
  useEffect(() => {
    if (!uid) return;
    let live = true;
    resolveKitchenId(uid)
      .then(getKitchenOnce)
      .then(
        (k) => live && k && setPantry({ uid, keys: new Set(k.pantry.map((p) => itemKey(p.name))) }),
        () => {},
      );
    return () => {
      live = false;
    };
  }, [uid]);

  const title = recipe.title.trim() || 'Untitled recipe';
  const have = pantry && pantry.uid === uid ? recipe.ingredients.filter((i) => pantry.keys.has(itemKey(i.name))).length : null;
  return (
    <div className="px-5 pt-4">
      {/* The card link is stretched; Cook and Close sit above it as siblings, never nested. */}
      <div className="relative flex items-center gap-3 rounded-[28px] bg-accent-200 p-3.5">
        <Link
          to={`/recipe/${recipe.id}`}
          className="absolute inset-0 rounded-[28px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-800"
        >
          <span className="sr-only">{title}</span>
        </Link>
        <span aria-hidden="true" className="hidden size-14 shrink-0 min-[380px]:flex items-center justify-center rounded-full bg-surface text-[28px] leading-none">
          {recipe.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-accent-800">TONIGHT · you opened this</p>
          <p aria-hidden="true" className="line-clamp-2 font-heading text-lg leading-tight text-text-primary">{title}</p>
          <p className="min-h-4 text-xs text-accent-900">
            {formatTime(recipe.totalTime)}
            {have !== null && ` · ${have} of ${recipe.ingredients.length} things in your pantry`}
          </p>
        </div>
        <Link
          to={`/recipe/${recipe.id}/cook`}
          className="relative z-10 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-primary-600 px-3.5 font-heading text-[13px] text-on-accent hover:bg-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-800"
        >
          <ChefHat className="size-4" />
          Cook
        </Link>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full text-accent-900 after:absolute after:-inset-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-800"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
