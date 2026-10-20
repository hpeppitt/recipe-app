import { cn } from '../../lib/utils';

interface SpinnerProps {
  className?: string;
  size?: 'sm' | 'md' | 'icon';
  /** Accessible name; defaults to "Loading". */
  label?: string;
}

export function Spinner({ className, size = 'md', label = 'Loading' }: SpinnerProps) {
  return (
    <div
      className={cn(
        'motion-safe:animate-spin rounded-full border-2 border-current border-t-transparent',
        size === 'sm' && 'w-4 h-4',
        size === 'md' && 'w-6 h-6',
        size === 'icon' && 'size-5',
        className
      )}
      role="status"
      aria-label={label}
    />
  );
}
