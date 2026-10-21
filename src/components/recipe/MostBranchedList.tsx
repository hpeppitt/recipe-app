import { useContext, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMostBranched, type MostBranchedRange } from '../../hooks/useMostBranched';
import { useMostCooked } from '../../hooks/useCookSections';
import { listOriginState } from '../../lib/paneMode';
import { formatTime, pluralize } from '../../lib/utils';
import { RecipePaneContext } from '../../contexts/RecipePaneContext';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import { UserPill } from '../ui/UserPill';
import { Check, ChefHat, ChevronDown, GitBranch } from '../ui/icons';

// No "All time" row: the hook has no all-time read (RL-166), so allTimeAvailable is always false.
const BRANCHED_RANGES: { value: MostBranchedRange; label: string; menu: string }[] = [
  { value: '30', label: 'last 30 days', menu: 'Last 30 days' },
  { value: '90', label: 'last 90 days', menu: 'Last 90 days' },
];
const COOKED_RANGES: typeof BRANCHED_RANGES = [
  { value: '30', label: 'this month', menu: 'This month' },
  { value: '90', label: 'last 90 days', menu: 'Last 90 days' },
];
/** A ranked row: the family's original, with a branch count or (RL-243) a cook count and the leading branch. */
type Row = { id: string; emoji: string; title: string; totalTime: number; createdBy?: { uid: string; displayName: string | null }; count: number; cooked?: boolean; sub?: string };
const RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500';

/**
 * Organic 1b's "Most branched" (RL-167), which since RL-243 reads "Most cooked" while the range has
 * cooks. The caller decides when it may show; it hides itself until it has a ranking.
 */
export function MostBranchedList() {
  const [picked, setPicked] = useState<MostBranchedRange | null>(null);
  const c30 = useMostCooked('30');
  const c90 = useMostCooked('90');
  // Until the user picks, this month leads when it has cooks, else the 90 day range.
  const range = picked ?? (c30.status === 'ready' ? '30' : '90');
  const cookedResult = range === '30' ? c30 : c90;
  const [open, setOpen] = useState(false);
  // The last ranking seen, so changing range keeps the section (and its menu) mounted.
  const [last, setLast] = useState<{ tiles: Row[]; capped: boolean; cooked: boolean } | null>(null);
  // Set once the user picks a range, so the "Showing N families" announcement follows a change only.
  const [changed, setChanged] = useState(false);
  const paneId = useContext(RecipePaneContext);
  const branched = useMostBranched(range, cookedResult.status === 'none');
  // Cooks lead when the range has any; no cooks falls back to branches.
  const cooked = cookedResult.status === 'ready';
  const waiting = cookedResult.status === 'loading' || (!picked && c30.status === 'loading');
  const result = waiting
    ? ({ status: 'loading', tiles: [] as Row[], capped: false, retry: () => {} } as const)
    : cooked
      ? ({ status: 'ready', tiles: cookedResult.rows, capped: false, retry: () => {} } as const)
      : { ...branched, tiles: branched.tiles as Row[] };
  if (result.status === 'ready' && result.tiles !== last?.tiles) setLast({ tiles: result.tiles, capped: result.capped, cooked });
  const headingId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !pillRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  // A first-load failure or an empty ranking hides the section; once shown it stays so the menu keeps working.
  // While the first ranking loads, hold its height so the cards below do not jump.
  if (result.status === 'loading' && !last) return <div aria-hidden="true" className="min-h-[200px]" />;
  if (result.status !== 'ready' && !last) return null;
  const loading = result.status === 'loading';
  const tiles = result.status === 'ready' ? result.tiles : loading ? (last?.tiles ?? []) : [];
  const capped = loading ? !!last?.capped : result.capped;
  const showCooked = loading ? !!last?.cooked : cooked;
  const RANGES = showCooked ? COOKED_RANGES : BRANCHED_RANGES;
  const current = RANGES.find((r) => r.value === range)!;
  const announce = loading ? `Loading ${current.label}…` : changed && result.status === 'ready' ? `Showing ${tiles.length} ${pluralize(tiles.length, 'family', 'families')} for ${current.label}` : '';

  const close = () => {
    setOpen(false);
    pillRef.current?.focus();
  };
  const onMenuKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') return close();
    if (e.key === 'Tab') return setOpen(false);
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    const to = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    items[(to + items.length) % items.length]?.focus();
  };

  return (
    <section aria-labelledby={headingId} className="px-5 pt-[22px]">
      <div
        className="relative flex flex-wrap items-center gap-2"
        onBlur={(e) => {
          if (open && !e.currentTarget.contains(e.relatedTarget)) setOpen(false);
        }}
      >
        <h2 id={headingId} className="font-heading text-lg text-text-primary">
          {showCooked ? 'Most cooked' : 'Most branched'}
          <span aria-hidden="true">,</span>
        </h2>
        <button
          ref={pillRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && !open) {
              e.preventDefault();
              setOpen(true);
            }
          }}
          className={`flex min-h-11 items-center gap-1 rounded-full bg-accent-200 pr-2.5 pl-3 font-heading text-base text-accent-900 ${RING}`}
        >
          <span className="sr-only">Range: </span>
          {current.label}
          <ChevronDown className="size-4" />
        </button>
        {loading && <Spinner size="sm" label="" className="text-accent-700" />}
        {open && (
          <div
            ref={menuRef}
            role="menu"
            aria-label="Range"
            onKeyDown={onMenuKey}
            className="absolute top-full left-0 z-20 mt-1 min-w-[170px] rounded-[22px] border border-border bg-surface p-1.5 shadow-lg"
          >
            {RANGES.map((r) => (
              <button
                key={r.value}
                type="button"
                role="menuitemradio"
                aria-checked={r.value === range}
                tabIndex={r.value === range ? 0 : -1}
                onClick={() => {
                  setChanged(true);
                  setPicked(r.value);
                  close();
                }}
                className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-2xl px-3 text-sm text-text-primary ${RING} ${r.value === range ? 'bg-accent-100 font-bold' : ''}`}
              >
                {r.menu}
                {r.value === range && <Check className="size-4" />}
              </button>
            ))}
          </div>
        )}
      </div>
      {capped && (
        <p className="mt-1 text-xs text-text-tertiary">Counts only the newest 100 recipes, so older branches may be missing.</p>
      )}
      <p role="status" className="sr-only">
        {announce}
      </p>
      {result.status === 'error' ? (
        <div className="flex items-center gap-3 py-3">
          <p className="text-sm text-text-secondary">Couldn't load this range.</p>
          <Button variant="secondary" onClick={result.retry}>
            Retry
          </Button>
        </div>
      ) : tiles.length === 0 ? (
        <p className="py-3 text-sm text-text-secondary">No branches in this range.</p>
      ) : (
        // inert: the old range's rows must not be tappable under the new range's label.
        <ul aria-busy={loading} inert={loading} className={loading ? 'pointer-events-none opacity-50' : undefined}>
          {tiles.map((t, i) => (
            <Row key={t.id} tile={t} rank={i + 1} selected={t.id === paneId} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Row({ tile, rank, selected }: { tile: Row; rank: number; selected: boolean }) {
  const title = tile.title.trim() || 'Untitled recipe';
  const author = tile.createdBy?.displayName?.trim() || 'Anonymous';
  return (
    // The stretched-link pattern of the Explore rows: the row link and the author link are siblings.
    <li className={`relative flex items-center gap-3 py-2${selected ? ' -mx-2 rounded-[20px] bg-accent-100 px-2 shadow-[inset_0_0_0_2px_var(--color-accent)]' : ''}`}>
      <Link
        to={`/recipe/${tile.id}`}
        state={listOriginState('/')}
        aria-label={`${rank}. ${title}, ${tile.count} ${tile.cooked ? pluralize(tile.count, 'cook', 'cooks') : pluralize(tile.count, 'branch', 'branches')}`}
        aria-current={selected ? 'true' : undefined}
        className={`absolute inset-0 rounded-[20px] ${RING}`}
      />
      <span
        aria-hidden="true"
        className={`flex size-9 shrink-0 items-center justify-center rounded-full font-heading text-base ${rank === 1 ? 'bg-accent text-on-accent' : 'bg-surface-secondary text-text-primary'}`}
      >
        {rank}
      </span>
      <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-secondary text-2xl leading-none">
        {tile.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[15px] font-bold text-text-primary">{title}</h3>
        <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-neutral-700">
          {tile.createdBy?.uid && (
            <Link
              to={`/profile/${tile.createdBy.uid}`}
              aria-label={`View ${author}'s profile`}
              className={`relative z-10 -my-3 flex min-w-0 rounded-full py-3 ${RING}`}
            >
              <span className="min-w-0 overflow-hidden rounded-full">
                <UserPill uid={tile.createdBy.uid} name={author} />
              </span>
            </Link>
          )}
          <span className="shrink-0">{formatTime(tile.totalTime)}</span>
        </div>
        {tile.sub && (
          <p className="mt-0.5 flex min-w-0 gap-1 text-xs text-neutral-700">
            <span className="shrink-0">most cook the</span>
            <span className="truncate">&ldquo;{tile.sub}&rdquo;</span>
            <span className="shrink-0">branch</span>
          </p>
        )}
      </div>
      <span aria-hidden="true" className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-2-100 px-2.5 py-[3px] text-[11px] font-semibold text-accent-2-800">
        {tile.cooked ? <ChefHat className="size-3" /> : <GitBranch className="size-3" />}
        {tile.cooked ? tile.count : `+${tile.count}`}
      </span>
    </li>
  );
}
