import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';

interface TopBarProps {
  title: string;
  showBack?: boolean;
  right?: ReactNode;
}

export function TopBar({ title, showBack = false, right }: TopBarProps) {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 bg-surface/80 backdrop-blur-md border-b border-border">
      <div className="flex items-center h-14 px-4 max-w-lg mx-auto">
        {showBack && (
          <button
            onClick={() => navigate(-1)}
            className="mr-2 p-1.5 -ml-1.5 rounded-lg hover:bg-surface-tertiary transition-colors"
            aria-label="Go back"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
        )}
        <h1 className="flex-1 text-lg font-semibold truncate">{title}</h1>
        {right && <div className="flex items-center gap-1">{right}</div>}
      </div>
    </header>
  );
}
