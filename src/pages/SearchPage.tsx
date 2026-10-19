import { useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useLocalLibrary, useCloudLibrary } from '../hooks/useRecipeLibrary';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { Skeleton } from '../components/ui/Skeleton';
import { UserPill } from '../components/ui/UserPill';
import { ChevronLeft, GitBranch, Search, Sparkles } from '../components/ui/icons';
import { formatTime, pluralize } from '../lib/utils';
import { SEARCH_FILTERS, searchLibrary, type SearchFilter, type SearchResult } from '../lib/library';

const isFilter = (f: string | null): f is SearchFilter => SEARCH_FILTERS.some((s) => s.id === f);

/**
 * `/search` (Organic 1a, RL-124): titles and ingredient names across the device's
 * recipes and the shared pages loaded so far. No index; the page says what it searched.
 */
export function SearchPage() {
  const navigate = useNavigate();
  const { key } = useLocation();
  const { isConfigured } = useAuth();
  const [params, setParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const query = params.get('q') ?? '';
  const f = params.get('f');
  const filter: SearchFilter = isFilter(f) ? f : 'all';
  const trimmed = query.trim();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // replace, so Back from a result returns here with the query and chip, not to each keystroke.
  const setParam = (name: 'q' | 'f', value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(name, value);
        else next.delete(name);
        return next;
      },
      { replace: true }
    );

  // A new tab or direct visit has no in-app history, so back would leave the app.
  const onBack = () => (key !== 'default' ? navigate(-1) : navigate('/'));
  const writeIt = () => navigate('/create', { state: { suggestion: trimmed } });

  const local = useLocalLibrary();
  const cloud = useCloudLibrary(isConfigured);
  // Device rows first, so a device copy wins over its cloud twin.
  const results = searchLibrary([...(local ?? []), ...(cloud.recipes ?? [])], { query, filter });
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
        {SEARCH_FILTERS.map((s) => (
          <Chip
            key={s.id}
            label={s.label}
            active={filter === s.id}
            pressed={filter === s.id}
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
              : trimmed
                ? `Nothing called "${trimmed}" here`
                : ''}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3 px-5 py-3">
        {loading ? (
          <div className="flex flex-col gap-3" role="status" aria-label="Loading recipes">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[88px] rounded-[30px]" />
            ))}
          </div>
        ) : results.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {results.map((r) => (
              <SearchRow key={r.id} recipe={r} showAuthor={isConfigured} />
            ))}
          </ul>
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
    </div>
  );
}

function SearchRow({ recipe, showAuthor }: { recipe: SearchResult; showAuthor: boolean }) {
  const title = recipe.title.trim() || 'Untitled recipe';
  const author = recipe.createdBy.displayName?.trim() || 'Anonymous';
  const difficulty = recipe.difficulty.charAt(0).toUpperCase() + recipe.difficulty.slice(1);
  return (
    // One stretched link for the row, and the author link lifted above it, so
    // neither link is nested in the other (as ExploreRow does).
    <li className="relative flex gap-3.5 rounded-[30px] bg-surface-secondary p-4">
      <Link
        to={`/recipe/${recipe.id}`}
        aria-label={title}
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
