import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLocalLibrary } from '../hooks/useRecipeLibrary';
import { splitLibrary } from '../lib/library';
import { formatTime } from '../lib/utils';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { EmojiBlob } from '../components/ui/EmojiBlob';
import { Skeleton } from '../components/ui/Skeleton';
import { UserPill } from '../components/ui/UserPill';
import { Bookmark, ChevronRight } from '../components/ui/icons';

/** Other people's recipes kept on this device (Organic 19a). Favourites are not listed, see RL-091. */
export function SavedPage() {
  const { user, isConfigured } = useAuth();
  const navigate = useNavigate();
  const rows = useLocalLibrary();
  const saved = rows ? splitLibrary(rows, rows, { uid: user?.uid, isConfigured }).saved : undefined;

  return (
    <div>
      <h1 className="px-5 pt-4 font-heading text-[30px] leading-tight text-text-primary">Saved</h1>
      {saved === undefined ? (
        <div className="flex flex-col gap-3 px-5 pt-3.5" role="status" aria-label="Loading saved recipes">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[80px] rounded-[28px]" />
          ))}
        </div>
      ) : saved.length === 0 ? (
        <EmptyState
          icon={<Bookmark />}
          title="Nothing saved yet"
          description="Recipes you keep from a shared link or an import wait for you here."
          action={<Button onClick={() => navigate('/')}>Explore recipes</Button>}
        />
      ) : (
        <ul className="flex flex-col gap-3 px-5 pt-3.5">
          {saved.map((r) => (
            <li key={r.id}>
              <Link
                to={`/recipe/${r.id}`}
                aria-labelledby={`saved-title-${r.id}`}
                aria-describedby={`saved-meta-${r.id}`}
                className="flex items-center gap-3.5 rounded-[28px] bg-surface-secondary p-3.5 min-h-[44px]"
              >
                <EmojiBlob emoji={r.emoji} size={52} tint="bg-neutral-100" className="!rounded-full" />
                <div className="min-w-0 flex-1">
                  <p id={`saved-title-${r.id}`} className="truncate font-heading text-[17px] text-text-primary">{r.title}</p>
                  <div id={`saved-meta-${r.id}`} className="mt-1 flex items-center gap-2 text-xs text-text-tertiary">
                    <span className="min-w-0 truncate">
                      <UserPill uid={r.createdBy.uid} name={r.createdBy.displayName} />
                    </span>
                    <span className="shrink-0">{formatTime(r.totalTime)}</span>
                  </div>
                </div>
                <ChevronRight className="size-5 shrink-0 text-text-tertiary" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
