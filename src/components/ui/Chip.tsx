import { cn } from '../../lib/utils';

interface ChipProps {
  label: string;
  onClick?: () => void;
  active?: boolean;
  className?: string;
}

export function Chip({ label, onClick, active, className }: ChipProps) {
  const Component = onClick ? 'button' : 'span';

  return (
    <Component
      onClick={onClick}
      className={cn(
        'inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
        active
          ? 'bg-primary-100 text-primary-700'
          : 'bg-surface-tertiary text-text-secondary hover:bg-border',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {label}
    </Component>
  );
}
