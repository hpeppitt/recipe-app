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
import { APP_NAME } from '../lib/constants';

type Filter = 'all' | 'favorites' | 'following' | string; // string = specific uid

export function LibraryPage() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const { user, isConfigured } = useAuth();
  const { profile } = useOwnProfile();
  const { favoriteIds } = useFavoriteIds();
  const { followingIds, followingProfiles } = useFollowingList();
  const { recipes: followingRecipes, isLoading: followingLoading } = useFollowingRecipes(
    filter === 'following' ? followingIds : []
  );
  const { recipes, isLoading } = useRecipeLibrary(
    search,
    filter === 'favorites' ? favoriteIds : undefined
  );
  const navigate = useNavigate();

  const showFollowing = filter === 'following';
  const displayRecipes = showFollowing ? undefined : recipes;
  const displayLoading = showFollowing ? followingLoading : isLoading;

  return (
    <div className="max-w-lg mx-auto">
      <header className="sticky top-0 z-30 bg-surface/80 backdrop-blur-md border-b border-border">
        <div className="flex items-center h-14 px-4">
          <h1 className="flex-1 text-lg font-semibold">{APP_NAME}</h1>
          {isConfigured && user && <NotificationBell />}
          <button
            onClick={() => navigate('/profile')}
            className="p-1 rounded-lg hover:bg-surface-tertiary transition-colors ml-1"
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
            className="p-1.5 rounded-lg hover:bg-surface-tertiary transition-colors"
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
            className="w-full px-3 py-2 rounded-xl border border-border bg-surface-secondary text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-none">
            {(['all', 'favorites'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                  filter === f
                    ? 'bg-primary-600 text-white'
                    : 'bg-surface-secondary text-text-secondary hover:bg-surface-tertiary'
                }`}
              >
                {f === 'all' ? 'All' : 'Favorites'}
              </button>
            ))}
            {followingProfiles.length > 0 && (
              <>
                <button
                  onClick={() => setFilter('following')}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                    filter === 'following'
                      ? 'bg-primary-600 text-white'
                      : 'bg-surface-secondary text-text-secondary hover:bg-surface-tertiary'
                  }`}
                >
                  Following
                </button>
                {followingProfiles.map((fp) => (
                  <button
                    key={fp.uid}
                    onClick={() => navigate(`/profile/${fp.uid}`)}
                    className="flex items-center gap-1 px-2 py-1 rounded-full bg-surface-secondary text-text-secondary hover:bg-surface-tertiary transition-colors whitespace-nowrap"
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
        {displayLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))
        ) : showFollowing ? (
          followingRecipes.length > 0 ? (
            followingRecipes.map((r) => (
              <button
                key={r.id}
                onClick={() => navigate(`/shared/${r.id}`)}
                className="w-full text-left bg-surface rounded-2xl border border-border p-4 hover:border-border-strong transition-colors active:scale-[0.99]"
              >
                <div className="flex gap-3">
                  <span className="text-3xl flex-shrink-0 mt-0.5">{r.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-text-primary truncate">{r.title}</h3>
                    <p className="text-sm text-text-secondary line-clamp-2 mt-0.5">{r.description}</p>
                    {r.createdBy?.displayName && (
                      <div className="flex items-center gap-1 mt-1.5 text-xs text-text-tertiary">
                        <Avatar uid={r.createdBy.uid} name={r.createdBy.displayName} size="sm" />
                        <span>{r.createdBy.displayName}</span>
                      </div>
                    )}
                  </div>
                </div>
              </button>
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
