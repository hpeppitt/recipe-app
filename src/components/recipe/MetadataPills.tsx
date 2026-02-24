import { formatTime } from '../../lib/utils';
import { DIFFICULTY_LABELS } from '../../lib/constants';

interface MetadataPillsProps {
  prepTime: number;
  cookTime: number;
  totalTime: number;
  servings: number;
  difficulty: string;
}

export function MetadataPills({ prepTime, cookTime, totalTime, servings, difficulty }: MetadataPillsProps) {
  const pills = [
    { label: formatTime(totalTime), icon: '⏱️' },
    { label: DIFFICULTY_LABELS[difficulty] ?? difficulty, icon: '📊' },
    { label: `${servings} servings`, icon: '🍽️' },
  ];

  if (prepTime > 0 && cookTime > 0) {
    pills.push(
      { label: `Prep ${formatTime(prepTime)}`, icon: '🔪' },
      { label: `Cook ${formatTime(cookTime)}`, icon: '🔥' }
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {pills.map((pill) => (
        <span
          key={pill.label}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-tertiary text-xs text-text-secondary"
        >
          <span>{pill.icon}</span>
          {pill.label}
        </span>
      ))}
    </div>
  );
}
