import { cn } from '../../lib/utils';

interface SpinnerProps {
  className?: string;
  size?: 'sm' | 'md';
}

export function Spinner({ className, size = 'md' }: SpinnerProps) {
  return (
    <div
      className={cn(
        'animate-spin rounded-full border-2 border-current border-t-transparent',
        size === 'sm' && 'w-4 h-4',
        size === 'md' && 'w-6 h-6',
        className
      )}
      role="status"
      aria-label="Loading"
    />
  );
}
