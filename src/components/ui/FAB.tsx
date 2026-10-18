import { cn } from '../../lib/utils';
import { Plus } from './icons';

interface FABProps {
  onClick: () => void;
  className?: string;
  label?: string;
}

export function FAB({ onClick, className, label = 'Create recipe' }: FABProps) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={cn(
        'fixed bottom-20 right-4 z-30',
        'w-14 h-14 rounded-2xl shadow-lg',
        'bg-primary-600 text-white',
        'flex items-center justify-center',
        'hover:bg-primary-700 active:scale-95 transition-all',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500',
        className
      )}
    >
      <Plus className="w-7 h-7" />
    </button>
  );
}
