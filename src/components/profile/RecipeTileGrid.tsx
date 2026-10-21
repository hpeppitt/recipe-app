import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { X } from '../ui/icons';
import { UserPill } from '../ui/UserPill';

export interface RecipeTile {
  id: string;
  emoji: string;
  title: string;
  meta: string;
  /** Shown as a pill under the title instead of `meta` (the Collabs tab). */
  owner?: { uid: string; name: string | null };
  /** A recipe that no longer exists: shown, not linked. */
  gone?: boolean;
  /** Accessible name of the edit-mode remove control, when the title alone is not enough. */
  removeLabel?: string;
  /** A tile that failed to load: a Retry button under it. */
  retry?: () => void;
}

/** Tints rotate by index (Organic 4c). Photos are cut (decision 3), so a tile is always emoji on a tint. */
export const TILE_TINTS = ['bg-accent-200', 'bg-accent-2-200', 'bg-surface-secondary'] as const;

/** Two-column grid of recipe tiles, shared by the own and public profiles. */
export function RecipeTileGrid({
  tiles,
  onRemove,
  removeDisabled,
}: {
  tiles: readonly RecipeTile[];
  /** Edit mode (collections): a 44px "Remove <title>" control on each tile. */
  onRemove?: (id: string) => void;
  removeDisabled?: boolean;
}) {
  if (tiles.length === 0) {
    return <p className="px-1 text-sm text-text-tertiary">Nothing here yet.</p>;
  }
  return (
    <ul className="grid grid-cols-2 gap-2.5">
      {tiles.map((t, i) => (
        <li key={t.id} className="relative min-w-0">
          {onRemove && (
            <button
              type="button"
              aria-label={t.removeLabel ?? `Remove ${t.title}`}
              data-remove-id={t.id}
              disabled={removeDisabled}
              onClick={() => onRemove(t.id)}
              className="absolute right-1 top-1 z-10 flex size-11 items-center justify-center rounded-full bg-surface text-text-primary shadow-md disabled:opacity-45"
            >
              <X className="size-5" />
            </button>
          )}
          <Wrap tile={t}>
            <div
              aria-hidden="true"
              className={`flex aspect-square items-center justify-center rounded-[28px] text-[52px] leading-none ${TILE_TINTS[i % TILE_TINTS.length]}`}
            >
              {t.emoji}
            </div>
            <p className="break-words px-1 text-sm font-bold leading-[1.2] text-text-primary line-clamp-2">
              {t.title}
              {t.gone && !t.retry && <span className="sr-only">, no longer available</span>}
            </p>
            {t.owner ? (
              <p className="-mt-1 min-w-0 px-1">
                <span className="sr-only">by </span>
                <UserPill uid={t.owner.uid} name={t.owner.name} truncate />
              </p>
            ) : (
              <p className="-mt-1.5 px-1 text-xs text-text-tertiary line-clamp-2 break-words">{t.meta}</p>
            )}
          </Wrap>
          {t.retry && (
            <button type="button" onClick={t.retry} className="min-h-11 px-1 text-sm font-semibold text-accent-700">
              Retry
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function Wrap({ tile, children }: { tile: RecipeTile; children: ReactNode }) {
  const cls = 'flex min-h-11 flex-col gap-2';
  return tile.gone ? <div className={cls}>{children}</div> : <Link to={`/recipe/${tile.id}`} className={cls}>{children}</Link>;
}
