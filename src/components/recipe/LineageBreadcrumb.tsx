import { Link } from 'react-router-dom';
import type { Recipe } from '../../types/recipe';

interface LineageBreadcrumbProps {
  ancestors: Recipe[];
  current: Recipe;
}

export function LineageBreadcrumb({ ancestors, current }: LineageBreadcrumbProps) {
  if (ancestors.length === 0) return null;

  return (
    <nav
      aria-label="Recipe lineage"
      className="flex items-center gap-1 text-xs text-text-tertiary overflow-x-auto pb-1"
    >
      {ancestors.map((ancestor) => (
        <span key={ancestor.id} className="flex items-center gap-1 flex-shrink-0">
          <Link
            to={`/recipe/${ancestor.id}`}
            // Breadcrumb links were the height of their text alone. Padded to a
            // real target; the row is `overflow-x-auto`, so an overlaid hit area
            // would have been clipped rather than clickable.
            className="min-h-11 inline-flex items-center text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 truncate max-w-[120px]"
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
