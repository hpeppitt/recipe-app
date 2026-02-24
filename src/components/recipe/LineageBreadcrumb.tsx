import { Link } from 'react-router-dom';
import type { Recipe } from '../../types/recipe';

interface LineageBreadcrumbProps {
  ancestors: Recipe[];
  current: Recipe;
}

export function LineageBreadcrumb({ ancestors, current }: LineageBreadcrumbProps) {
  if (ancestors.length === 0) return null;

  return (
    <nav className="flex items-center gap-1 text-xs text-text-tertiary overflow-x-auto pb-1">
      {ancestors.map((ancestor) => (
        <span key={ancestor.id} className="flex items-center gap-1 flex-shrink-0">
          <Link
            to={`/recipe/${ancestor.id}`}
            className="text-primary-600 hover:text-primary-700 truncate max-w-[120px]"
          >
            {ancestor.title}
          </Link>
          <span className="text-text-tertiary">›</span>
        </span>
      ))}
      <span className="font-medium text-text-secondary truncate">{current.title}</span>
    </nav>
  );
}
