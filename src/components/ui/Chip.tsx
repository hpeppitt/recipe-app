import { cn } from '../../lib/utils';

interface ChipProps {
  label: string;
  onClick?: () => void;
  /**
   * Selected state. Was dead code while the library hand-rolled its own filter
   * pills, and its old tint (`bg-primary-100`) differed from theirs, so "selected
   * chip" meant two different things. Unified on the pills' filled treatment,
   * which is the stronger signal for an active filter.
   */
  active?: boolean;
  className?: string;
  /** Marks the chip as a pressed toggle when it represents a filter. */
  pressed?: boolean;
}

export function Chip({ label, onClick, active, className, pressed }: ChipProps) {
  const Component = onClick ? 'button' : 'span';

  return (
    <Component
      onClick={onClick}
      aria-pressed={pressed}
      className={cn(
        'inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap',
        active
          ? 'bg-primary-600 text-white'
          : 'bg-surface-tertiary text-text-secondary hover:bg-border',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {label}
    </Component>
  );
}
