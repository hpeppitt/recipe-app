import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';

interface IconButtonProps {
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  variant: 'floating' | 'flat';
  href?: string;
  pressed?: boolean;
}

export function IconButton({ label, icon, onClick, variant, href, pressed }: IconButtonProps) {
  const className = cn(
    'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-text-primary transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500',
    variant === 'floating' ? 'bg-surface shadow-md' : 'bg-transparent hover:bg-surface-tertiary'
  );
  if (href) {
    return (
      <Link to={href} aria-label={label} onClick={onClick} className={className}>
        {icon}
      </Link>
    );
  }
  return (
    <button type="button" aria-label={label} aria-pressed={pressed} onClick={onClick} className={className}>
      {icon}
    </button>
  );
}
