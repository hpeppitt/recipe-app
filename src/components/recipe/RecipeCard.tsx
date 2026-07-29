import { Link } from 'react-router-dom';
import { formatTime } from '../../lib/utils';
import { DIFFICULTY_LABELS } from '../../lib/constants';
import { pluralize } from '../../lib/utils';
import { Avatar } from '../ui/Avatar';
/**
 * Exactly the fields this card reads — not a full `Recipe`.
 *
 * It previously required `RecipeWithChildren`, which a cloud feed entry cannot
 * satisfy (no rootId, depth, prompt or chatHistory). That is why the Following
 * filter grew a second, poorer card instead of reusing this one. Narrowing the
 * prop makes it usable by any feed.
 */
export type RecipeCardRecipe = {
  id: string;
  emoji: string;
  title: string;
  description: string;
  totalTime: number;
  difficulty: 'easy' | 'medium' | 'hard';
  /** Absent when the source cannot supply it; the chip is then omitted. */
  childCount?: number;
  createdBy?: { uid: string; displayName: string | null };
};

interface RecipeCardProps {
  recipe: RecipeCardRecipe;
  isFavorite?: boolean;
}

export function RecipeCard({ recipe, isFavorite }: RecipeCardProps) {
  const creatorName = recipe.createdBy?.displayName;

  return (
    // The card was a <button> containing a span[role=link] for the creator.
    // Interactive descendants are invalid inside a button, and the span had no
    // tabIndex or key handler, so the creator was mouse-only. Now the card is a
    // plain container with two real links: one stretched over the whole card and
    // one for the creator, lifted above it. Both are keyboard reachable and the
    // click targets are unchanged.
    <div className="relative bg-surface rounded-2xl border border-border p-4 hover:border-border-strong transition-colors active:scale-[0.99]">
      <Link
        to={`/recipe/${recipe.id}`}
        aria-label={recipe.title}
        className="absolute inset-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
      />
      <div className="flex gap-3">
        <span className="text-3xl flex-shrink-0 mt-0.5" aria-hidden="true">
          {recipe.emoji}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="font-semibold text-text-primary truncate">{recipe.title}</h3>
            {isFavorite && (
              <svg className="w-3.5 h-3.5 text-red-500 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="m11.645 20.91-.007-.003-.022-.012a15.247 15.247 0 0 1-.383-.218 25.18 25.18 0 0 1-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0 1 12 5.052 5.5 5.5 0 0 1 16.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 0 1-4.244 3.17 15.247 15.247 0 0 1-.383.219l-.022.012-.007.004-.003.001a.752.752 0 0 1-.704 0l-.003-.001Z" />
              </svg>
            )}
          </div>
          <p className="text-sm text-text-secondary line-clamp-2 mt-0.5">{recipe.description}</p>
          <div className="flex items-center gap-2 mt-2 text-xs text-text-tertiary">
            <span>{formatTime(recipe.totalTime)}</span>
            <span>·</span>
            <span>{DIFFICULTY_LABELS[recipe.difficulty]}</span>
            {!!recipe.childCount && recipe.childCount > 0 && (
              <>
                <span>·</span>
                <span className="text-primary-600 dark:text-primary-400 font-medium">
                  {recipe.childCount} {pluralize(recipe.childCount, 'variation')}
                </span>
              </>
            )}
            {creatorName && recipe.createdBy && (
              <>
                <span>·</span>
                {/* relative + z-10 lifts this above the stretched card link so it
                    stays clickable and is not swallowed by the overlay. */}
                <Link
                  to={`/profile/${recipe.createdBy.uid}`}
                  aria-label={`View ${creatorName}'s profile`}
                  className="relative z-10 inline-flex items-center gap-1 py-1.5 truncate hover:text-primary-600 dark:hover:text-primary-400 transition-colors rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
                >
                  <Avatar uid={recipe.createdBy.uid} name={creatorName} size="sm" />
                  <span className="truncate">{creatorName}</span>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
