import { useNavigate } from 'react-router-dom';
import { formatTime } from '../../lib/utils';
import { DIFFICULTY_LABELS } from '../../lib/constants';
import { pluralize } from '../../lib/utils';
import { Avatar } from '../ui/Avatar';
import type { RecipeWithChildren } from '../../types/recipe';

interface RecipeCardProps {
  recipe: RecipeWithChildren;
  isFavorite?: boolean;
}

export function RecipeCard({ recipe, isFavorite }: RecipeCardProps) {
  const navigate = useNavigate();
  const creatorName = recipe.createdBy?.displayName;

  return (
    <button
      onClick={() => navigate(`/recipe/${recipe.id}`)}
      className="w-full text-left bg-surface rounded-2xl border border-border p-4 hover:border-border-strong transition-colors active:scale-[0.99]"
    >
      <div className="flex gap-3">
        <span className="text-3xl flex-shrink-0 mt-0.5">{recipe.emoji}</span>
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
            {recipe.childCount > 0 && (
              <>
                <span>·</span>
                <span className="text-primary-600 font-medium">
                  {recipe.childCount} {pluralize(recipe.childCount, 'variation')}
                </span>
              </>
            )}
            {creatorName && recipe.createdBy && (
              <>
                <span>·</span>
                <span
                  role="link"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/profile/${recipe.createdBy.uid}`);
                  }}
                  className="inline-flex items-center gap-1 truncate hover:text-primary-600 transition-colors cursor-pointer"
                >
                  <Avatar uid={recipe.createdBy.uid} name={creatorName} size="sm" />
                  <span className="truncate">{creatorName}</span>
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
