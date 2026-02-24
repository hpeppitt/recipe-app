import { cn } from '../../lib/utils';

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
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    </button>
  );
}
