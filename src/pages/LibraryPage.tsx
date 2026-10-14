import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocalLibrary, useCloudLibrary } from '../hooks/useRecipeLibrary';
import { useFavoriteIds } from '../hooks/useFavorites';
import { useFollowingList } from '../hooks/useFollow';
import { useFollowingRecipes } from '../hooks/useUserRecipes';
import { useAuth } from '../contexts/AuthContext';
import { useOwnProfile } from '../hooks/useProfile';
import { RecipeCard, type RecipeCardRecipe } from '../components/recipe/RecipeCard';
import { NotificationBell } from '../components/notifications/NotificationBell';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { FAB } from '../components/ui/FAB';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { APP_NAME } from '../lib/constants';
import { pluralize } from '../lib/utils';
import type { ScorableRecipe } from '../lib/search';
import { buildFeed, filterFeed, type LibraryTab } from '../lib/library';
import { getLibraryTab, setLibraryTab } from '../services/storage';

type Filter = 'all' | 'favorites' | 'following';

const TAB_OPTIONS = [
  { value: 'mine', label: 'My Recipes' },
  { value: 'explore', label: 'Explore' },
] as const;

export function LibraryPage() {
  const [search, setSearch] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<Filter>('all');
  const [selectedTab, setSelectedTab] = useState<LibraryTab>(getLibraryTab);
  const { user, isConfigured } = useAuth();
  const { profile } = useOwnProfile();
  const { favoriteIds, canFavorite } = useFavoriteIds();
  const { followingIds, followingProfiles } = useFollowingList();
  const navigate = useNavigate();

  // Local-only mode has no shared library, so there is no Explore tab at all
  // rather than one that is permanently empty (the same rule as FUN-16).
  const tab: LibraryTab = isConfigured ? selectedTab : 'mine';
  const changeTab = (next: LibraryTab) => {
    setSelectedTab(next);
    setLibraryTab(next);
  };

  // Only verified accounts can follow (decision 1a), so anyone else never sees it.
  const canFilterFollowing =
    tab === 'explore' && !!user?.emailVerified && followingProfiles.length > 0;
  // A filter that stops applying (signed out, or switched to My Recipes while
  // Following was active) falls back to All instead of stranding the user on
  // an empty list with no chip to get back.
  const filter: Filter =
    (selectedFilter === 'favorites' && !canFavorite) ||
    (selectedFilter === 'following' && !canFilterFollowing)
      ? 'all'
      : selectedFilter;
  const setFilter = setSelectedFilter;
  const showFollowing = filter === 'following';

  const localRecords = useLocalLibrary();
  const cloud = useCloudLibrary(tab === 'explore');
  const { recipes: followingRecipes, isLoading: followingLoading } = useFollowingRecipes(
    showFollowing ? followingIds : []
  );

  // Each tab lists one store, but variation counts still span both.
  const countFrom = [...(localRecords ?? []), ...(cloud.recipes ?? [])];
  // Explore lists the cloud copy of everything published, the user's own
  // included, so a published recipe of theirs appears once in each tab.
  const exploreFeed = cloud.recipes ? buildFeed(cloud.recipes, countFrom) : undefined;
  const source: readonly (RecipeCardRecipe & ScorableRecipe)[] | undefined =
    tab === 'mine'
      ? localRecords && buildFeed(localRecords, countFrom)
      : showFollowing
        ? followingRecipes
        : exploreFeed;
  const isLoading =
    tab === 'mine' ? localRecords === undefined : showFollowing ? followingLoading : cloud.isLoading;
  const displayRecipes =
    source &&
    filterFeed(source, {
      search,
      favoriteIds: filter === 'favorites' ? favoriteIds : undefined,
      followingIds: showFollowing ? new Set(followingIds) : undefined,
    });

  // Explore filters only the pages fetched so far, so Load more stays available
  // under a search or the favourites filter and the page says what it searched.
  const pagedExplore = tab === 'explore' && !showFollowing && !cloud.cloudError;
  const showLoadMore = pagedExplore && !isLoading && cloud.hasMore;
  const filtering = !!search.trim() || filter === 'favorites';
  const loadedCount = exploreFeed?.length ?? 0;

  return (
    <div className="max-w-lg mx-auto">
      <header className="sticky top-0 z-30 bg-surface/80 backdrop-blur-md border-b border-border">
        <div className="flex items-center h-14 px-4">
          <h1 className="flex-1 text-lg font-semibold">{APP_NAME}</h1>
          {isConfigured && user && <NotificationBell />}
          <button
            onClick={() => navigate('/profile')}
            className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-surface-tertiary transition-colors ml-1"
            aria-label="Profile"
          >
            {user ? (
              <Avatar
                uid={user.uid}
                name={user.displayName}
                size="sm"
                photoType={profile?.photoType}
                photoEmoji={profile?.photoEmoji}
                photoBgColor={profile?.photoBgColor}
                photoURL={profile?.photoURL}
              />
            ) : (
              <svg className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
              </svg>
            )}
          </button>
          <button
            onClick={() => navigate('/settings')}
            className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-surface-tertiary transition-colors"
            aria-label="Settings"
          >
            <svg className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          </button>
        </div>
        <div className="px-4 pb-3 space-y-2">
          {isConfigured && (
            <SegmentedControl label="Library" options={TAB_OPTIONS} value={tab} onChange={changeTab} />
          )}
          <div className="relative">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search recipes and ingredients..."
              // Placeholder text is not an accessible name: it disappears on input
              // and some screen readers never announce it.
              aria-label="Search recipes and ingredients"
              className="w-full px-3 py-2.5 pr-11 min-h-11 rounded-xl border border-border bg-surface-secondary text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            {/* type="search" gives a native clear affordance in some browsers and
                none at all in others, so it cannot be relied on. */}
            {search && (
              <button
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-0 top-0 h-full w-11 flex items-center justify-center text-text-tertiary hover:text-text-primary"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-none">
            {/* Favourites are keyed by uid, so with no signed-in user the filter
                is permanently empty; don't offer it at all (FUN-16). */}
            {((canFavorite ? ['all', 'favorites'] : ['all']) as Filter[]).map((f) => (
              // Uses Chip rather than a look-alike, which is also what gives
              // Chip's `active` prop a real consumer instead of being dead code.
              <Chip
                key={f}
                label={f === 'all' ? 'All' : 'Favorites'}
                active={filter === f}
                pressed={filter === f}
                onClick={() => setFilter(f)}
              />
            ))}
            {canFilterFollowing && (
              <>
                <Chip
                  label="Following"
                  active={filter === 'following'}
                  pressed={filter === 'following'}
                  onClick={() => setFilter('following')}
                />
                {followingProfiles.map((fp) => (
                  <button
                    key={fp.uid}
                    onClick={() => navigate(`/profile/${fp.uid}`)}
                    className="min-h-11 flex items-center gap-1 px-2 py-1 rounded-full bg-surface-secondary text-text-secondary hover:bg-surface-tertiary transition-colors whitespace-nowrap"
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
                    <span className="text-xs">{fp.displayName ?? 'User'}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      </header>

      <div className="p-4 space-y-3">
        {/* A count confirms the search did something, and how much. Without it a
            filtered list is indistinguishable from a short library. */}
        {search && !isLoading && displayRecipes && (
          <p role="status" className="text-xs text-text-tertiary">
            {displayRecipes.length} {pluralize(displayRecipes.length, 'result')} for "{search}"
          </p>
        )}

        {/* Explore cannot search what it has not fetched, so say how far the
            search reaches rather than imply it covers the whole library. */}
        {showLoadMore && filtering && (
          <p role="status" className="text-xs text-text-tertiary">
            Searching the {loadedCount} {pluralize(loadedCount, 'recipe')} loaded so far. Load more to search further.
          </p>
        )}

        {/* Names the list, so Explore is never mistaken for "mine". */}
        {pagedExplore && filter === 'all' && !search && !isLoading && loadedCount > 0 && (
          <p className="text-xs text-text-tertiary">
            Recipes shared by everyone using {APP_NAME}
          </p>
        )}

        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))
        ) : tab === 'explore' && !showFollowing && cloud.cloudError ? (
          // Unreachable is not the same as empty: claiming "Nothing published
          // yet" here would blame the library for a network problem (UI-12).
          <EmptyState
            icon="📡"
            title="Could not load"
            description={
              navigator.onLine === false
                ? "You're offline. Explore needs a connection; My Recipes still works on this device."
                : 'Could not load the shared library. Check your connection and try again.'
            }
            action={<Button onClick={cloud.retryCloud}>Try again</Button>}
          />
        ) : displayRecipes && displayRecipes.length > 0 ? (
          displayRecipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              isFavorite={favoriteIds.has(recipe.id)}
            />
          ))
        ) : search ? (
          // Previously a dead end: the only escape was selecting the field and
          // deleting the text.
          <EmptyState
            icon="🔍"
            title="No results"
            description={`Nothing matches "${search}" in titles, ingredients or tags.`}
            action={
              <Button variant="secondary" onClick={() => setSearch('')}>
                Clear search
              </Button>
            }
          />
        ) : showFollowing ? (
          <EmptyState
            icon="👥"
            title="No recipes from followed users"
            description="Open a recipe you like and follow its creator to see more here."
            action={
              <Button variant="secondary" onClick={() => setFilter('all')}>
                Browse recipes
              </Button>
            }
          />
        ) : filter === 'favorites' ? (
          <EmptyState
            icon="❤️"
            title={showLoadMore ? 'No favorites loaded yet' : 'No favorites yet'}
            description={
              showLoadMore
                ? `No favorites in the ${loadedCount} ${pluralize(loadedCount, 'recipe')} loaded so far. Load more to look further.`
                : 'Tap the heart on any recipe to keep it here.'
            }
            action={
              <Button variant="secondary" onClick={() => setFilter('all')}>
                Show all
              </Button>
            }
          />
        ) : tab === 'explore' ? (
          <EmptyState
            icon="🌍"
            title="Nothing published yet"
            description={`When someone using ${APP_NAME} publishes a recipe, it shows up here.`}
            action={<Button onClick={() => navigate('/create')}>Create a recipe</Button>}
          />
        ) : (
          // Also the first-run screen, so it says what the app does (UX-9).
          <EmptyState
            icon="🍳"
            title="You haven't created a recipe yet"
            description="Describe a dish and it writes you a recipe. Any recipe can branch into variations, so it grows a tree of versions instead of being overwritten."
            action={<Button onClick={() => navigate('/create')}>Create a recipe</Button>}
          />
        )}

        {/* Explicit button rather than infinite scroll: this is a list people
            search and come back to, and infinite scroll makes the end of it
            unreachable and the position unrememberable. */}
        {showLoadMore && cloud.loadMoreError && (
          <p role="alert" className="text-xs text-danger-600 text-center">
            Could not load more recipes. Try again.
          </p>
        )}
        {showLoadMore && (
          <Button
            variant="secondary"
            fullWidth
            onClick={cloud.loadMore}
            disabled={cloud.loadingMore}
          >
            {cloud.loadingMore ? 'Loading…' : 'Load more recipes'}
          </Button>
        )}
      </div>

      <FAB onClick={() => navigate('/create')} />
    </div>
  );
}
