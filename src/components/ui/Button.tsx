import { cn } from '../../lib/utils';
import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-medium rounded-xl transition-all active:scale-[0.98]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500',
        'disabled:opacity-50 disabled:pointer-events-none',
        size === 'sm' && 'text-sm px-3 py-1.5',
        size === 'md' && 'text-sm px-4 py-2.5',
        size === 'lg' && 'text-base px-6 py-3',
        variant === 'primary' && 'bg-primary-600 text-white hover:bg-primary-700',
        variant === 'secondary' && 'bg-surface-tertiary text-text-primary hover:bg-border',
        variant === 'danger' && 'bg-danger-600 text-white hover:bg-danger-500',
        variant === 'ghost' && 'text-text-secondary hover:bg-surface-tertiary',
        fullWidth && 'w-full',
        className
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
