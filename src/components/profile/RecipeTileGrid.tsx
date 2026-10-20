import { Link } from 'react-router-dom';
import { UserPill } from '../ui/UserPill';

export interface RecipeTile {
  id: string;
  emoji: string;
  title: string;
  meta: string;
  /** Shown as a pill under the title instead of `meta` (the Collabs tab). */
  owner?: { uid: string; name: string | null };
}

/** Tints rotate by index (Organic 4c). Photos are cut (decision 3), so a tile is always emoji on a tint. */
export const TILE_TINTS = ['bg-accent-200', 'bg-accent-2-200', 'bg-surface-secondary'] as const;

/** Two-column grid of recipe tiles, shared by the own and public profiles. */
export function RecipeTileGrid({ tiles }: { tiles: readonly RecipeTile[] }) {
  if (tiles.length === 0) {
    return <p className="px-1 text-sm text-text-tertiary">Nothing here yet.</p>;
  }
  return (
    <ul className="grid grid-cols-2 gap-2.5">
      {tiles.map((t, i) => (
        <li key={t.id} className="min-w-0">
          <Link to={`/recipe/${t.id}`} className="flex min-h-11 flex-col gap-2">
            <div
              aria-hidden="true"
              className={`flex aspect-square items-center justify-center rounded-[28px] text-[52px] leading-none ${TILE_TINTS[i % TILE_TINTS.length]}`}
            >
              {t.emoji}
            </div>
            <p className="break-words px-1 text-sm font-bold leading-[1.2] text-text-primary line-clamp-2">{t.title}</p>
            {t.owner ? (
              <p className="-mt-1 min-w-0 px-1">
                <span className="sr-only">by </span>
                <UserPill uid={t.owner.uid} name={t.owner.name} truncate />
              </p>
            ) : (
              <p className="-mt-1.5 px-1 text-xs text-text-tertiary line-clamp-2 break-words">{t.meta}</p>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
