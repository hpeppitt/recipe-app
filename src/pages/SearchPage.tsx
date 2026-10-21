import { useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useLocalLibrary, useCloudLibrary } from '../hooks/useRecipeLibrary';
import { useFamilyLeaders, type FamilyLeader } from '../hooks/useCookSections';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { Skeleton } from '../components/ui/Skeleton';
import { UserPill } from '../components/ui/UserPill';
import { PantrySheet } from '../components/recipe/PantrySheet';
import { ChevronLeft, GitBranch, Search, SlidersHorizontal, Sparkles } from '../components/ui/icons';
import { formatTime, pluralize } from '../lib/utils';
import {
  PANTRY_TIMES,
  SEARCH_FILTERS,
  filterPantry,
  pantryItems,
  searchLibrary,
  type PantryTimeId,
  type SearchFilter,
  type SearchResult,
} from '../lib/library';
import { buildPantryPrompt } from '../lib/createPrompt';

const isFilter = (f: string | null): f is SearchFilter => SEARCH_FILTERS.some((s) => s.id === f);
const PANTRY_UNDER: Record<PantryTimeId, string> = { '15': ' · under 15 min', '30': ' · under 30 min', '60': ' · under 1 hr', any: '' };

/**
 * `/search` (Organic 1a, RL-124): titles and ingredient names across the device's
 * recipes and the shared pages loaded so far. No index; the page says what it searched.
 */
export function SearchPage() {
  const navigate = useNavigate();
  const { key, state } = useLocation();
  const { isConfigured } = useAuth();
  const [params, setParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const focusAfterClose = useRef<'chip' | 'results'>('chip');
  const pantry = pantryItems((params.get('p') ?? '').split(','));
  const pt = params.get('pt');
  const pantryTime: PantryTimeId = PANTRY_TIMES.find((t) => t.id === pt)?.id ?? 'any';
  const pantryOn = pantry.length > 0;
  const sheetOpen = params.get('sheet') === 'pantry';
  // The pantry filter replaces the query box while it is active.
  const query = pantryOn ? '' : (params.get('q') ?? '');
  const f = params.get('f');
  const filter: SearchFilter = isFilter(f) ? f : 'all';
  const trimmed = query.trim();

  // The dialog's own focus return does not exist for a deep link, so the chip is focused here.
  useEffect(() => {
    if (sheetOpen) return;
    const t = setTimeout(() => {
      if (focusAfterClose.current === 'results') resultsRef.current?.focus();
      else if (document.activeElement === document.body) chipRef.current?.focus();
      focusAfterClose.current = 'chip';
    }, 0);
    return () => clearTimeout(t);
  }, [sheetOpen]);
  useEffect(() => {
    if (!sheetOpen) inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- first render only
  }, []);

  // replace, so Back from a result returns here with the query and chip, not to each keystroke.
  const edit = (change: (next: URLSearchParams) => void) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        change(next);
        return next;
      },
      { replace: true }
    );
  const setP = (next: URLSearchParams, name: string, value: string) => (value ? next.set(name, value) : next.delete(name));
  // A query or a chip replaces the pantry filter.
  const setParam = (name: 'q' | 'f', value: string) =>
    edit((next) => {
      setP(next, name, value);
      next.delete('p');
      next.delete('pt');
    });
  // Opening pushes, so Back closes the sheet; closing pops that entry, or edits a deep-linked one in place.
  const openSheet = () =>
    setParams((prev) => new URLSearchParams([...prev, ['sheet', 'pantry']]), { state: { pantrySheet: true } });
  const closeSheet = () => (state?.pantrySheet ? navigate(-1) : edit((next) => next.delete('sheet')));

  // A new tab or direct visit has no in-app history, so back would leave the app.
  const onBack = () => (key !== 'default' ? navigate(-1) : navigate('/'));
  const showPantry = (items: string[], time: PantryTimeId) => {
    edit((next) => {
      next.delete('q');
      next.delete('f');
      next.delete('sheet');
      setP(next, 'p', items.join(','));
      setP(next, 'pt', items.length && time !== 'any' ? time : '');
    });
    focusAfterClose.current = 'results';
  };
  const writeIt = () => navigate('/create', { state: { suggestion: trimmed } });

  const local = useLocalLibrary();
  const cloud = useCloudLibrary(isConfigured);
  // Device rows first, so a device copy wins over its cloud twin.
  const sources = [...(local ?? []), ...(cloud.recipes ?? [])];
  // An empty query lists originals only, so the pantry pool adds the branches back.
  const pantryPool = () =>
    [...searchLibrary(sources, { query: '', filter: 'all' }), ...searchLibrary(sources, { query: '', filter: 'branches' })];
  const results = pantryOn
    ? filterPantry(pantryPool(), pantry, pantryTime).sort((a, b) => b.createdAt - a.createdAt)
    : searchLibrary(sources, { query, filter });
  const leaders = useFamilyLeaders(results);
  const cloudFailed = isConfigured && cloud.cloudError;
  const loading = local === undefined || (cloud.isLoading && results.length === 0);
  const cloudCount = cloud.recipes?.length ?? 0;

  return (
    <div>
      <header className="flex items-center gap-1.5 px-4 pt-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
        >
          <ChevronLeft className="size-[22px]" />
        </button>
        <div className="flex h-[52px] min-w-0 flex-1 items-center gap-2 rounded-full bg-neutral-100 pl-4 pr-1.5 shadow-sm">
          <Search className="size-[18px] shrink-0 text-text-tertiary" />
          <input
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setParam('q', e.target.value)}
            placeholder="Search, or describe a dish…"
            aria-label="Search recipes, or describe a dish"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-text-primary placeholder:text-text-tertiary focus:outline-none"
          />
          {isConfigured && (
            // A 44px hit area around the 40px drawn pill.
            <button
              type="button"
              onClick={writeIt}
              disabled={!trimmed}
              aria-label="Write it"
              className="group flex h-11 shrink-0 items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:opacity-45"
            >
              <span className="flex h-10 items-center gap-1.5 rounded-full bg-primary-600 px-3.5 font-heading text-[13px] text-on-accent group-hover:bg-primary-700">
                <Sparkles className="size-4" />
                {/* Below 360px the icon alone leaves the input room to type. */}
                <span className="hidden min-[360px]:inline">Write it</span>
              </span>
            </button>
          )}
        </div>
      </header>

      <div role="group" aria-label="Filter results" className="flex gap-2 overflow-x-auto px-5 pt-3.5 pb-1 scrollbar-none">
        <button
          type="button"
          ref={chipRef}
          onClick={openSheet}
          aria-haspopup="dialog"
          aria-label={pantryOn ? `Pantry, ${pantry.length} ${pluralize(pantry.length, 'ingredient')}` : undefined}
          className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-500 ${
            pantryOn ? 'bg-primary-600 text-on-accent' : 'bg-neutral-100 text-neutral-800 border border-border hover:bg-neutral-200'
          }`}
        >
          <SlidersHorizontal className="size-4" />
          {pantryOn ? `Pantry · ${pantry.length}` : 'Pantry'}
        </button>
        {SEARCH_FILTERS.map((s) => (
          <Chip
            key={s.id}
            label={s.label}
            active={!pantryOn && filter === s.id}
            pressed={!pantryOn && filter === s.id}
            onClick={() => setParam('f', s.id === 'all' ? '' : s.id)}
          />
        ))}
      </div>

      {/* One live region, always mounted, so scope and result changes are announced. */}
      <div role="status" aria-live="polite" className="px-5 pt-2 text-[13px] text-text-tertiary">
        {cloudFailed ? (
          <p className="flex items-center gap-2">
            Shared recipes couldn't load.
            <button
              type="button"
              onClick={cloud.retryCloud}
              className="min-h-11 rounded-full px-1 font-semibold text-primary-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
            >
              Try again
            </button>
          </p>
        ) : (
          !cloud.isLoading && (
            <p>
              {isConfigured
                ? `Searching recipes on this device and the ${cloudCount} newest shared ${pluralize(cloudCount, 'recipe')}.`
                : 'Searching recipes on this device.'}
            </p>
          )
        )}
        {!loading && (
          <span className="sr-only">
            {results.length > 0
              ? `${results.length} ${pluralize(results.length, 'result')}`
              : pantryOn
                ? 'Nothing uses all of those'
                : trimmed
                ? `Nothing called "${trimmed}" here`
                : ''}
          </span>
        )}
      </div>

      <div ref={resultsRef} tabIndex={-1} className="flex flex-col gap-3 px-5 py-3 focus:outline-none">
        {pantryOn && <p className="text-[13px] text-neutral-700">Using {pantry.join(', ')}{PANTRY_UNDER[pantryTime]}</p>}
        {loading ? (
          <div className="flex flex-col gap-3" role="status" aria-label="Loading recipes">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[88px] rounded-[30px]" />
            ))}
          </div>
        ) : results.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {results.map((r) => (
              <SearchRow key={r.id} recipe={r} showAuthor={isConfigured} leader={leaders.get(r.id)} />
            ))}
          </ul>
        ) : pantryOn ? (
          <p className="text-sm text-text-tertiary">Nothing here uses all of those. Try fewer ingredients or more time.</p>
        ) : trimmed ? (
          <div className="flex flex-col gap-2.5 rounded-[30px] bg-accent-100 p-[22px]">
            <p className="break-words font-heading text-xl text-text-primary">
              Nothing called "{trimmed}" {isConfigured ? 'yet' : 'here.'}
            </p>
            {isConfigured && (
              <>
                <p className="text-sm text-accent-900">Write it now and it becomes the first of its family.</p>
                <Button onClick={writeIt} className="min-h-[46px] gap-1.5 self-start px-5 break-words">
                  <Sparkles className="size-4 shrink-0" />
                  Write "{trimmed}"
                </Button>
              </>
            )}
          </div>
        ) : (
          <p className="text-sm text-text-tertiary">Type a dish or an ingredient.</p>
        )}

        {/* The empty card stays above it: Load more is how the search reaches further. */}
        {!loading && !cloudFailed && cloud.hasMore && (
          <div className="flex flex-col gap-2">
            {cloud.loadMoreError && (
              <p role="alert" className="text-center text-xs text-danger-600">
                Could not load more recipes. Try again.
              </p>
            )}
            <Button variant="secondary" fullWidth onClick={cloud.loadMore} disabled={cloud.loadingMore}>
              {cloud.loadingMore ? 'Loading…' : 'Search more shared recipes'}
            </Button>
          </div>
        )}
      </div>

      <PantrySheet
        open={sheetOpen}
        onClose={closeSheet}
        items={pantry}
        time={pantryTime}
        count={(items, time) => filterPantry(pantryPool(), items, time).length}
        partial={cloud.isLoading}
        onShow={showPantry}
        onWrite={isConfigured ? (items, time) => {
                edit((next) => next.delete('sheet'));
                navigate('/create', { state: { suggestion: buildPantryPrompt(items, time) } });
              } : undefined}
      />
    </div>
  );
}

function SearchRow({ recipe, showAuthor, leader }: { recipe: SearchResult; showAuthor: boolean; leader?: FamilyLeader }) {
  const title = recipe.title.trim() || 'Untitled recipe';
  const author = recipe.createdBy.displayName?.trim() || 'Anonymous';
  const difficulty = recipe.difficulty.charAt(0).toUpperCase() + recipe.difficulty.slice(1);
  return (
    // One stretched link for the row, and the author link lifted above it, so
    // neither link is nested in the other (as ExploreRow does).
    <li className="relative flex gap-3.5 rounded-[30px] bg-surface-secondary p-4">
      <Link
        to={`/recipe/${leader?.id ?? recipe.id}`}
        aria-label={leader ? `Open ${title}, most cooked version ${leader.title}` : title}
        className="absolute inset-0 rounded-[30px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
      />
      <span aria-hidden="true" className="flex size-14 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[28px] leading-none">
        {recipe.emoji}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="break-words font-heading text-lg leading-[1.15] text-text-primary">{title}</h3>
        {recipe.familyLabel && (
          <p className="break-words text-[13px] font-bold text-accent-2-700">{recipe.familyLabel}</p>
        )}
        {leader && <p aria-hidden="true" className="break-words text-xs text-accent-2-700">Opens the most cooked: {leader.title}</p>}
        {recipe.line && (
          <p className="line-clamp-2 break-words text-[13px] leading-[1.4] text-text-secondary">{recipe.line}</p>
        )}
        <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-text-tertiary">
          {recipe.childCount > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-2-100 px-2.5 py-[3px] text-[11px] font-semibold text-accent-2-800">
              <GitBranch className="size-3" />
              {recipe.childCount}
              <span className="sr-only"> {pluralize(recipe.childCount, 'branch', 'branches')}</span>
            </span>
          )}
          <span className="shrink-0">
            {formatTime(recipe.totalTime)} · {difficulty}
          </span>
          {showAuthor && recipe.createdBy.uid && (
            <Link
              to={`/profile/${recipe.createdBy.uid}`}
              aria-label={`View ${author}'s profile`}
              // py-3 -my-3: a 44px tall target that keeps the row's height.
              className="relative z-10 -my-3 ml-auto flex min-w-0 rounded-full py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
            >
              <span className="min-w-0 overflow-hidden rounded-full">
                <UserPill uid={recipe.createdBy.uid} name={author} />
              </span>
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}
