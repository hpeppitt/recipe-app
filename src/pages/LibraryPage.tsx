import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRecipeLibrary } from '../hooks/useRecipeLibrary';
import { useFavoriteIds } from '../hooks/useFavorites';
import { useAuth } from '../contexts/AuthContext';
import { RecipeCard } from '../components/recipe/RecipeCard';
import { NotificationBell } from '../components/notifications/NotificationBell';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { FAB } from '../components/ui/FAB';
import { Avatar } from '../components/ui/Avatar';
import { APP_NAME } from '../lib/constants';

type Filter = 'all' | 'favorites';

export function LibraryPage() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const { user, isConfigured } = useAuth();
  const { favoriteIds } = useFavoriteIds();
  const { recipes, isLoading } = useRecipeLibrary(
    search,
    filter === 'favorites' ? favoriteIds : undefined
  );
  const navigate = useNavigate();

  return (
    <div className="max-w-lg mx-auto">
      <header className="sticky top-0 z-30 bg-surface/80 backdrop-blur-md border-b border-border">
        <div className="flex items-center h-14 px-4">
          <h1 className="flex-1 text-lg font-semibold">{APP_NAME}</h1>
          {user && (
            <button
              onClick={() => navigate('/settings')}
              className="flex items-center gap-1.5 mr-2"
            >
              <Avatar uid={user.uid} name={user.displayName} size="sm" />
              <span className="text-xs text-text-tertiary truncate max-w-[100px]">
                {user.displayName ?? (user.isAnonymous ? 'Anonymous' : user.email)}
              </span>
            </button>
          )}
          {isConfigured && user && <NotificationBell />}
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
          <div className="flex gap-2">
            {(['all', 'favorites'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  filter === f
                    ? 'bg-primary-600 text-white'
                    : 'bg-surface-secondary text-text-secondary hover:bg-surface-tertiary'
                }`}
              >
                {f === 'all' ? 'All' : 'Favorites'}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="p-4 space-y-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))
        ) : recipes && recipes.length > 0 ? (
          recipes.map((recipe) => (
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
