import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ChevronLeft } from '../ui/icons';

interface TopBarProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  right?: ReactNode;
}

export function TopBar({ title, showBack = false, onBack, right }: TopBarProps) {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 bg-surface/80 backdrop-blur-md border-b border-border">
      <div className="flex items-center h-14 px-4 max-w-lg mx-auto">
        {showBack && (
          <button
            onClick={onBack ?? (() => navigate(-1))}
            className="mr-1 -ml-3 w-11 h-11 flex items-center justify-center flex-shrink-0 rounded-full hover:bg-surface-tertiary transition-colors"
            aria-label="Go back"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        <h1 className="flex-1 font-heading text-h4 truncate">{title}</h1>
        {right && <div className="flex items-center gap-1">{right}</div>}
      </div>
    </header>
  );
}
