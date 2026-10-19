import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLocalLibrary, useCloudLibrary } from '../hooks/useRecipeLibrary';
import { useFavoriteIds } from '../hooks/useFavorites';
import { useFollowingList } from '../hooks/useFollow';
import { useFollowingRecipes } from '../hooks/useUserRecipes';
import { useAuth } from '../contexts/AuthContext';
import { useOnline } from '../hooks/useOnline';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { UserPill } from '../components/ui/UserPill';
import { APP_NAME, EXPLORE_TAGS } from '../lib/constants';
import { dayPartLabel, formatTime, pluralize } from '../lib/utils';
import { buildFeed, filterFeed } from '../lib/library';
import type { ScorableRecipe } from '../lib/search';
import { CloudOff, GitBranch, Heart, Search, X } from '../components/ui/icons';

type Filter = 'all' | 'favorites' | 'following';

/** What a row reads: a feed entry or a Following result (which has no counts). */
type ExploreRecipe = ScorableRecipe & {
  id: string;
  emoji: string;
  totalTime: number;
  childCount?: number;
  createdBy?: { uid: string; displayName: string | null };
};

/** The landing page at `/` (Organic 1b): the shared feed, or the device's recipes in local-only mode. */
export function ExplorePage() {
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [selectedFilter, setSelectedFilter] = useState<Filter>('all');
  // Not persisted: a topic is a momentary lens (RL-009).
  const [tag, setTag] = useState<string | null>(null);
  const tagRowRef = useRef<HTMLDivElement>(null);
  const { user, isConfigured } = useAuth();
  const { favoriteIds, canFavorite } = useFavoriteIds();
  const { followingIds, followingProfiles } = useFollowingList();
  const navigate = useNavigate();
  const online = useOnline();

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  // Closing always clears, so a hidden query never filters the list.
  const closeSearch = () => {
    setSearch('');
    setSearchOpen(false);
    searchButtonRef.current?.focus();
  };

  // The Clear tag button unmounts, so hand focus back to the chip it cleared.
  const clearTag = () => {
    const prev = tag;
    setTag(null);
    Array.from(tagRowRef.current?.querySelectorAll('button') ?? [])
      .find((b) => b.textContent === prev)
      ?.focus();
  };

  // Only verified accounts can follow (decision 1a), so anyone else never sees it.
  const canFilterFollowing = isConfigured && !!user?.emailVerified && followingProfiles.length > 0;
  // A filter that stops applying (signed out mid-visit) falls back to All
  // instead of stranding the user on an empty list with no chip to get back.
  const filter: Filter =
    (selectedFilter === 'favorites' && !canFavorite) ||
    (selectedFilter === 'following' && !canFilterFollowing)
      ? 'all'
      : selectedFilter;
  const showFollowing = filter === 'following';

  const localRecords = useLocalLibrary();
  const cloud = useCloudLibrary(isConfigured, tag);
  const { recipes: followingRecipes, isLoading: followingLoading } = useFollowingRecipes(
    showFollowing ? followingIds : []
  );

  // Variation counts span both stores.
  const countFrom = [...(localRecords ?? []), ...(cloud.recipes ?? [])];
  const exploreFeed = cloud.recipes ? buildFeed(cloud.recipes, countFrom) : undefined;
  // Local-only mode has no shared library, so it lists the device's own roots.
  const source: readonly ExploreRecipe[] | undefined = !isConfigured
    ? localRecords && buildFeed(localRecords, localRecords)
    : showFollowing
      ? followingRecipes
      : exploreFeed;
  const isLoading = !isConfigured ? localRecords === undefined : showFollowing ? followingLoading : cloud.isLoading;
  const displayRecipes =
    source &&
    filterFeed(source, {
      search,
      favoriteIds: filter === 'favorites' ? favoriteIds : undefined,
      followingIds: showFollowing ? new Set(followingIds) : undefined,
    });

  // Explore filters only the pages fetched so far, so Load more stays available
  // under a search or the favourites filter and the page says what it searched.
  const pagedExplore = isConfigured && !showFollowing && !cloud.cloudError;
  const showLoadMore = pagedExplore && !isLoading && cloud.hasMore;
  const tagActive = pagedExplore && tag !== null;
  const filtering = !!search.trim() || filter === 'favorites';
  const loadedCount = exploreFeed?.length ?? 0;
  const showOfflineBanner = isConfigured && !online && !isLoading && (source?.length ?? 0) > 0;

  return (
    <div>
      <header className="flex items-end gap-2.5 px-5 pt-4">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-text-tertiary">{dayPartLabel(new Date())}</p>
          <h1 className="font-heading text-[30px] leading-[1.05] text-text-primary">What's growing</h1>
        </div>
        <button
          ref={searchButtonRef}
          type="button"
          aria-label="Search"
          aria-expanded={searchOpen}
          aria-controls={searchOpen ? 'explore-search' : undefined}
          onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-text-primary shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
        >
          <Search className="size-[19px]" />
        </button>
      </header>

      {searchOpen && (
        <div id="explore-search" className="px-5 pt-3.5">
          <div className="flex h-[52px] items-center gap-2 rounded-full bg-neutral-100 pl-4 pr-1.5 shadow-sm">
            <Search className="size-[18px] shrink-0 text-text-tertiary" />
            <input
              ref={searchInputRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  closeSearch();
                }
              }}
              placeholder="Search recipes and ingredients"
              // Placeholder text is not an accessible name: it disappears on input.
              aria-label="Search recipes and ingredients"
              className="min-w-0 flex-1 bg-transparent text-[15px] text-text-primary placeholder:text-text-tertiary focus:outline-none"
            />
            {/* type="search" has a native clear affordance only in some browsers. */}
            {search && (
              <button
                type="button"
                onClick={closeSearch}
                aria-label="Clear search"
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-text-tertiary hover:text-text-primary"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto px-5 pt-3.5 pb-1 scrollbar-none">
        {/* Favourites are keyed by uid, so with no signed-in user the filter
            is permanently empty; don't offer it at all (FUN-16). */}
        {((canFavorite && isConfigured ? ['all', 'favorites'] : ['all']) as Filter[]).map((f) => (
          <Chip
            key={f}
            label={f === 'all' ? 'All' : 'Favorites'}
            active={filter === f}
            pressed={filter === f}
            onClick={() => setSelectedFilter(f)}
          />
        ))}
        {canFilterFollowing && (
          <>
            <Chip
              label="Following"
              active={showFollowing}
              pressed={showFollowing}
              onClick={() => setSelectedFilter('following')}
            />
            {followingProfiles.map((fp) => (
              <button
                key={fp.uid}
                type="button"
                onClick={() => navigate(`/profile/${fp.uid}`)}
                className="flex min-h-11 max-w-[160px] shrink-0 items-center gap-1 rounded-full bg-surface-secondary px-2 py-1 text-text-secondary hover:bg-surface-tertiary"
              >
                <Avatar
                  uid={fp.uid}
                  name={fp.displayName}
                  size="sm"
                  photoType={fp.photoType}
                  photoEmoji={fp.photoEmoji}
                  photoBgColor={fp.photoBgColor}
                  photoURL={fp.photoURL}
                />
                <span className="truncate text-xs">{fp.displayName || 'User'}</span>
              </button>
            ))}
          </>
        )}
        {isConfigured && !showFollowing && (
          <div ref={tagRowRef} role="group" aria-label="Filter by tag" className="flex shrink-0 gap-2">
            {EXPLORE_TAGS.map((t) => (
              <Chip key={t} label={t} active={tag === t} pressed={tag === t} onClick={() => setTag(tag === t ? null : t)} />
            ))}
          </div>
        )}
      </div>

      {/* A count confirms the search did something, and how much. */}
      {search && !isLoading && displayRecipes && (
        <p role="status" className="break-words px-5 pt-3 text-xs text-text-tertiary">
          {displayRecipes.length} {pluralize(displayRecipes.length, 'result')} for "{search}"
        </p>
      )}

      {/* Explore cannot search what it has not fetched, so say how far it reaches. */}
      {showLoadMore && filtering && (
        <p role="status" className="px-5 pt-2 text-xs text-text-tertiary">
          Searching the {loadedCount} {pluralize(loadedCount, 'recipe')} loaded so far. Load more to search further.
        </p>
      )}

      {showOfflineBanner && (
        <div className="px-5 pt-3.5">
          <p role="status" className="flex items-center gap-2 rounded-[18px] bg-accent-100 px-3.5 py-2.5 text-[13px] text-accent-900">
            <CloudOff className="size-4 shrink-0" />
            You're offline. Showing what was loaded before.
          </p>
        </div>
      )}

      {isLoading ? (
        <>
          <h2 className="px-5 pt-[22px] pb-1.5 font-heading text-lg text-text-primary">Recipes</h2>
          <div className="flex flex-col gap-3 px-5 pt-1" role="status" aria-label="Loading recipes">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 rounded-[20px]" />
            ))}
          </div>
        </>
      ) : isConfigured && !showFollowing && cloud.cloudError ? (
        // Unreachable is not the same as empty (UI-12).
        <EmptyState
          tone="error"
          icon={<CloudOff />}
          title="Could not load"
          description={
            navigator.onLine === false
              ? "You're offline. Explore needs a connection; your own and saved recipes still work on this device."
              : 'Could not load the shared library. Check your connection and try again.'
          }
          action={<Button onClick={cloud.retryCloud}>Try again</Button>}
        />
      ) : displayRecipes && displayRecipes.length > 0 ? (
        <>
          <h2 className="px-5 pt-[22px] pb-1.5 font-heading text-lg text-text-primary">Recipes</h2>
          <ul className="px-5">
            {displayRecipes.map((recipe) => (
              <ExploreRow
                key={recipe.id}
                recipe={recipe}
                isFavorite={favoriteIds.has(recipe.id)}
                showAuthor={isConfigured}
              />
            ))}
          </ul>
        </>
      ) : search ? (
        <EmptyState
          icon={<Search />}
          title="No results"
          description={`Nothing matches "${search}" in titles, ingredients or tags${tagActive ? `, within recipes tagged ${tag}` : ''}.`}
          action={
            <div className="flex flex-col gap-2">
              <Button variant="secondary" onClick={closeSearch}>
                Clear search
              </Button>
              {tagActive && (
                <Button variant="secondary" onClick={clearTag}>
                  Clear tag
                </Button>
              )}
            </div>
          }
        />
      ) : showFollowing ? (
        <EmptyState
          icon="👥"
          title="No recipes from followed users"
          description="Open a recipe you like and follow its creator to see more here."
          action={
            <Button variant="secondary" onClick={() => setSelectedFilter('all')}>
              Browse recipes
            </Button>
          }
        />
      ) : filter === 'favorites' ? (
        <EmptyState
          icon={<Heart />}
          title={showLoadMore ? 'No favorites loaded yet' : tagActive ? `No favorites tagged ${tag}` : 'No favorites yet'}
          description={
            showLoadMore
              ? `No favorites in the ${loadedCount} ${pluralize(loadedCount, 'recipe')} loaded so far. Load more to look further.`
              : 'Tap the heart on any recipe to keep it here.'
          }
          action={
            <div className="flex flex-col gap-2">
              <Button variant="secondary" onClick={() => setSelectedFilter('all')}>
                Show all
              </Button>
              {tagActive && (
                <Button variant="secondary" onClick={clearTag}>
                  Clear tag
                </Button>
              )}
            </div>
          }
        />
      ) : tagActive ? (
        <EmptyState
          icon="🏷️"
          title={`No recipes tagged ${tag} yet`}
          description="Try another tag, or clear this one to see everything."
          action={
            <Button variant="secondary" onClick={clearTag}>
              Clear tag
            </Button>
          }
        />
      ) : isConfigured ? (
        <EmptyState
          icon="🌍"
          title="Nothing published yet"
          description={`When someone using ${APP_NAME} publishes a recipe, it shows up here.`}
          action={<Button onClick={() => navigate('/create')}>Create a recipe</Button>}
        />
      ) : (
        // Also the first-run screen of a local-only build, so it says what the app does (UX-9).
        <EmptyState
          icon="🍳"
          title="You haven't created a recipe yet"
          description="Describe a dish and it writes you a recipe. Any recipe can branch into variations, so it grows a tree of versions instead of being overwritten."
          action={<Button onClick={() => navigate('/create')}>Create a recipe</Button>}
        />
      )}

      {/* An explicit button rather than infinite scroll keeps the end reachable. */}
      {showLoadMore && (
        <div className="flex flex-col gap-2 px-5 pt-3">
          {cloud.loadMoreError && (
            <p role="alert" className="text-center text-xs text-danger-600">
              Could not load more recipes. Try again.
            </p>
          )}
          <Button variant="secondary" fullWidth onClick={cloud.loadMore} disabled={cloud.loadingMore}>
            {cloud.loadingMore ? 'Loading…' : 'Load more recipes'}
          </Button>
        </div>
      )}
    </div>
  );
}

function ExploreRow({ recipe, isFavorite, showAuthor }: { recipe: ExploreRecipe; isFavorite: boolean; showAuthor: boolean }) {
  const title = recipe.title.trim() || 'Untitled recipe';
  const author = recipe.createdBy?.displayName?.trim() || 'Anonymous';
  return (
    // One stretched link for the row, and the author link lifted above it, so
    // neither link is nested in the other and both are keyboard reachable.
    <li className="relative flex items-center gap-3 py-2">
      <Link
        to={`/recipe/${recipe.id}`}
        aria-label={title}
        className="absolute inset-0 rounded-[20px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
      />
      <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-secondary text-2xl leading-none">
        {recipe.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <h3 className="truncate text-[15px] font-bold text-text-primary">{title}</h3>
          {isFavorite && (
            <>
              <Heart className="size-3.5 shrink-0 text-red-500" filled />
              <span className="sr-only">Favorited</span>
            </>
          )}
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-text-tertiary">
          {showAuthor && recipe.createdBy?.uid && (
            <Link
              to={`/profile/${recipe.createdBy.uid}`}
              aria-label={`View ${author}'s profile`}
              // py-3 -my-3: a 44px tall target that keeps the row's height. No overflow
              // here, or a hit area outside the link box would be clipped; the inner span clips.
              className="relative z-10 -my-3 flex min-w-0 rounded-full py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
            >
              <span className="min-w-0 overflow-hidden rounded-full">
                <UserPill uid={recipe.createdBy.uid} name={author} />
              </span>
            </Link>
          )}
          <span className="shrink-0">{formatTime(recipe.totalTime)}</span>
        </div>
      </div>
      {!!recipe.childCount && recipe.childCount > 0 && (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-2-100 px-2.5 py-[3px] text-[11px] font-semibold text-accent-2-800">
          <GitBranch className="size-3" />
          {recipe.childCount}
          <span className="sr-only"> {pluralize(recipe.childCount, 'branch', 'branches')}</span>
        </span>
      )}
    </li>
  );
}
