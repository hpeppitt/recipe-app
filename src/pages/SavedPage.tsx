import { useContext, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSavedFavorites } from '../hooks/useSavedFavorites';
import { formatTime, pluralize } from '../lib/utils';
import { listOriginState } from '../lib/paneMode';
import { RecipePaneContext } from '../contexts/RecipePaneContext';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { EmojiBlob } from '../components/ui/EmojiBlob';
import { Skeleton } from '../components/ui/Skeleton';
import { UserPill } from '../components/ui/UserPill';
import { Bookmark, ChevronRight } from '../components/ui/icons';

/** Other people's recipes kept on this device, plus the user's favourites (Organic 19a, RL-121). */
export function SavedPage() {
  const navigate = useNavigate();
  const { isLoading, rows: saved, deletedCount, failedCount, offlineCount, retrying, retry } = useSavedFavorites();
  const statusRef = useRef<HTMLDivElement>(null);
  // The recipe open beside this list on a wide screen (RL-116); its title is then the page's h1.
  const paneId = useContext(RecipePaneContext);
  const Heading = paneId ? 'h2' : 'h1';
  const noun = (n: number) => `${n} saved ${pluralize(n, 'recipe')}`;
  const note = offlineCount > 0
    ? `${noun(offlineCount)} need${offlineCount === 1 ? 's' : ''} a connection to show.`
    : failedCount > 0
      ? `${noun(failedCount)} couldn't load.`
      : deletedCount > 0
        ? `${noun(deletedCount)} ${deletedCount === 1 ? 'was' : 'were'} deleted by their authors.`
        : null;

  return (
    <div>
      <Heading className="px-5 pt-4 font-heading text-[30px] leading-tight text-text-primary">Saved</Heading>
      {isLoading ? (
        <div className="flex flex-col gap-3 px-5 pt-3.5" role="status" aria-label="Loading saved recipes">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[80px] rounded-[28px]" />
          ))}
        </div>
      ) : saved.length === 0 && !note && !retrying ? (
        <EmptyState
          icon={<Bookmark />}
          title="Nothing saved yet"
          description="Tap the bookmark on any recipe and it'll wait for you here."
          action={<Button onClick={() => navigate('/')}>Explore recipes</Button>}
        />
      ) : saved.length > 0 ? (
        <ul className="flex flex-col gap-3 px-5 pt-3.5">
          {saved.map((r) => (
            <li key={r.id}>
              <Link
                to={`/recipe/${r.id}`}
                state={listOriginState('/saved')}
                aria-current={r.id === paneId ? 'true' : undefined}
                aria-labelledby={`saved-title-${r.id}`}
                aria-describedby={`saved-meta-${r.id}`}
                className={`flex items-center gap-3.5 rounded-[28px] p-3.5 min-h-[44px] ${r.id === paneId ? 'bg-accent-100 shadow-[inset_0_0_0_2px_var(--color-accent)]' : 'bg-surface-secondary'}`}
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
      ) : null}
      <div ref={statusRef} role="status" tabIndex={-1} className="px-5 text-[13px] text-text-tertiary outline-none">
        {!isLoading && retrying && <p className="pt-3.5">Retrying...</p>}
        {!isLoading && !retrying && note && (
          <p className="flex flex-wrap items-center gap-x-2 pt-3.5">
            {note}
            {offlineCount === 0 && failedCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  statusRef.current?.focus();
                  retry();
                }}
                className="inline-flex min-h-[44px] items-center text-[13px] font-medium text-text-primary underline"
              >
                Try again
              </button>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
