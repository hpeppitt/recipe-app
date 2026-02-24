import { useNavigate } from 'react-router-dom';
import { formatTime } from '../../lib/utils';
import { DIFFICULTY_LABELS } from '../../lib/constants';
import { pluralize } from '../../lib/utils';
import type { RecipeWithChildren } from '../../types/recipe';

interface RecipeCardProps {
  recipe: RecipeWithChildren;
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(`/recipe/${recipe.id}`)}
      className="w-full text-left bg-surface rounded-2xl border border-border p-4 hover:border-border-strong transition-colors active:scale-[0.99]"
    >
      <div className="flex gap-3">
        <span className="text-3xl flex-shrink-0 mt-0.5">{recipe.emoji}</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-text-primary truncate">{recipe.title}</h3>
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
          </div>
        </div>
      </div>
    </button>
  );
}
