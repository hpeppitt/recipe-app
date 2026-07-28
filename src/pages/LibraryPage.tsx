import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRecipeLibrary } from '../hooks/useRecipeLibrary';
import { useFavoriteIds } from '../hooks/useFavorites';
import { useFollowingList } from '../hooks/useFollow';
import { useFollowingRecipes } from '../hooks/useUserRecipes';
import { useAuth } from '../contexts/AuthContext';
import { useOwnProfile } from '../hooks/useProfile';
import { RecipeCard } from '../components/recipe/RecipeCard';
import { NotificationBell } from '../components/notifications/NotificationBell';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { FAB } from '../components/ui/FAB';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { APP_NAME } from '../lib/constants';

type Filter = 'all' | 'mine' | 'favorites' | 'following' | string; // string = specific uid

export function LibraryPage() {
  const [search, setSearch] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<Filter>('all');
  const { user, isConfigured } = useAuth();
  const { profile } = useOwnProfile();
  const { favoriteIds, canFavorite } = useFavoriteIds();
  const { followingIds, followingProfiles } = useFollowingList();

  // Signing out while Favorites is active removes its chip, which would otherwise
  // strand the user on an empty list with no way back to All.
  const filter: Filter =
    selectedFilter === 'favorites' && !canFavorite ? 'all' : selectedFilter;
  const setFilter = setSelectedFilter;

  const { recipes: followingRecipes, isLoading: followingLoading } = useFollowingRecipes(
    filter === 'following' ? followingIds : []
  );
  const { recipes, isLoading, cloudError, retryCloud } = useRecipeLibrary(
    search,
    filter === 'favorites' ? favoriteIds : undefined
  );
  const navigate = useNavigate();

  const showFollowing = filter === 'following';

  // A recipe is the user's own if they created it, or if it predates auth and
  // carries the 'local' placeholder uid — the same rule canManageRecipe uses.
  const isOwnRecipe = (uid: string | undefined) =>
    uid === 'local' || (!!user && uid === user.uid);
  const ownRecipes = (recipes ?? []).filter((r) => isOwnRecipe(r.createdBy?.uid));

  // The feed merges everyone's published recipes, so "no recipes" almost never
  // happens and a newcomer's first screen is a wall of strangers' cooking with
  // nothing saying what they are looking at. Frame it until they have one of
  // their own.
  // Gated to the All feed. On Following or Favorites the copy ("below are
  // recipes shared by everyone") describes a different list than the one on
  // screen — a contradiction introduced when UX-9 added this card.
  const isFirstRun =
    filter === 'all' && !isLoading && ownRecipes.length === 0 && !search;

  const displayRecipes = showFollowing
    ? undefined
    : filter === 'mine'
      ? ownRecipes
      : recipes;
  const displayLoading = showFollowing ? followingLoading : isLoading;

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
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search recipes..."
            // Placeholder text is not an accessible name: it disappears on input
            // and some screen readers never announce it.
            aria-label="Search recipes"
            className="w-full px-3 py-2.5 min-h-11 rounded-xl border border-border bg-surface-secondary text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-none">
            {/* Favourites are keyed by uid, so with no signed-in user the filter
                is permanently empty — don't offer it at all (FUN-16). */}
            {/* "Mine" only appears once there is something in it: offering an
                always-empty filter to a new user is worse than not offering it. */}
            {((ownRecipes.length > 0
              ? canFavorite
                ? (['all', 'mine', 'favorites'] as const)
                : (['all', 'mine'] as const)
              : canFavorite
                ? (['all', 'favorites'] as const)
                : (['all'] as const)) as readonly Filter[]).map((f) => (
              // Uses Chip rather than a look-alike, which is also what gives
              // Chip's `active` prop a real consumer instead of being dead code.
              <Chip
                key={f}
                label={f === 'all' ? 'All' : f === 'mine' ? 'Mine' : 'Favorites'}
                active={filter === f}
                pressed={filter === f}
                onClick={() => setFilter(f)}
              />
            ))}
            {followingProfiles.length > 0 && (
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
        {/* First-run framing. The feed is everyone's published recipes, so
            without this a newcomer sees an unexplained list of strangers'
            cooking and no statement of what the app does. Disappears for good
            once they have a recipe of their own. */}
        {isFirstRun && !cloudError && (
          <div className="border border-border bg-surface-secondary rounded-2xl p-4 space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-text-primary">
                Welcome to {APP_NAME}
              </p>
              <p className="text-xs text-text-secondary">
                Describe a dish and it writes you a recipe. Any recipe — yours or
                someone else's — can branch into variations, so a recipe grows a
                tree of versions instead of being overwritten.
              </p>
              <p className="text-xs text-text-secondary">
                Below are recipes shared by everyone using {APP_NAME}. Browse them,
                or start your own.
              </p>
            </div>
            <Button size="sm" onClick={() => navigate('/create')}>
              Create your first recipe
            </Button>
          </div>
        )}

        {/* Names the list once the intro is gone, so "All" is never mistaken
            for "mine". Only meaningful when the shared library is reachable. */}
        {!isFirstRun && !showFollowing && filter === 'all' && !search && !cloudError && (
          <p className="text-xs text-text-tertiary">
            Recipes shared by everyone using {APP_NAME}
          </p>
        )}

        {/* Shown above the list, not instead of it: local recipes did load, and
            the previous behaviour claimed "No recipes yet" when the shared
            library was merely unreachable. */}
        {cloudError && (
          <div
            role="status"
            className="border border-warning-200 bg-warning-50 dark:border-warning-800 dark:bg-warning-950 rounded-2xl p-3 flex items-center gap-3"
          >
            <div className="flex-1">
              <p className="text-sm font-medium text-warning-800 dark:text-warning-200">
                Showing only recipes on this device
              </p>
              <p className="text-xs text-warning-700 dark:text-warning-300 mt-0.5">
                The shared library couldn't be reached.
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={retryCloud}>
              Retry
            </Button>
          </div>
        )}
        {displayLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))
        ) : showFollowing ? (
          followingRecipes.length > 0 ? (
            // Was a hand-rolled card missing time, difficulty, the variation
            // count and the favourite marker, and it reimplemented the nested-link
            // pattern UI-9 already fixed — a <button> wrapping the creator, so the
            // creator was not separately reachable. RecipeCard covers all of it.
            followingRecipes.map((r) => (
              <RecipeCard
                key={r.id}
                recipe={r}
                isFavorite={favoriteIds.has(r.id)}
              />
            ))
          ) : (
            <EmptyState
              icon="👥"
              title="No recipes from followed users"
              description="Follow other users to see their recipes here"
            />
          )
        ) : displayRecipes && displayRecipes.length > 0 ? (
          displayRecipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              isFavorite={favoriteIds.has(recipe.id)}
            />
          ))
        ) : filter === 'mine' ? (
          <EmptyState
            icon="🍳"
            title="You haven't created a recipe yet"
            description="Tap the + button to make your first one"
          />
        ) : filter === 'favorites' ? (
          <EmptyState
            icon="❤️"
            title="No favorites yet"
            description="Tap the heart on a recipe to add it to your favorites"
          />
        ) : search ? (
          <EmptyState
            icon="🔍"
            title="No results"
            description={`No recipes matching "${search}"`}
          />
        ) : cloudError ? (
          // The banner above already explains why the list is empty. Claiming
          // "No recipes yet" here would contradict it and blame the user for a
          // network problem — the exact UI-12 symptom.
          null
        ) : (
          <EmptyState
            icon="👨‍🍳"
            title="No recipes yet"
            description="Tap the + button to create your first recipe"
          />
        )}
      </div>

      <FAB onClick={() => navigate('/create')} />
    </div>
  );
}
