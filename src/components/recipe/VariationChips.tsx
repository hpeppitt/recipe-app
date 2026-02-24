import { useNavigate } from 'react-router-dom';
import type { Recipe } from '../../types/recipe';

interface VariationChipsProps {
  children: Recipe[];
}

export function VariationChips({ children }: VariationChipsProps) {
  const navigate = useNavigate();

  if (children.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-text-primary">
        Variations ({children.length})
      </h3>
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
        {children.map((child) => (
          <button
            key={child.id}
            onClick={() => navigate(`/recipe/${child.id}`)}
            className="flex-shrink-0 w-40 p-3 rounded-xl border border-border bg-surface hover:border-border-strong transition-colors text-left"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{child.emoji}</span>
              <span className="text-sm font-medium text-text-primary truncate">
                {child.title}
              </span>
            </div>
            <p className="text-xs text-text-tertiary line-clamp-2">
              "{child.prompt}"
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
