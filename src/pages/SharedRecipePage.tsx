import { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { decodeRecipeFromHash, type SharedRecipe } from '../lib/share';
import { getPublishedRecipe } from '../services/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useCloudFavorite } from '../hooks/useFavorites';
import { useSubmitSuggestion } from '../hooks/useSuggestions';
import { MetadataPills } from '../components/recipe/MetadataPills';
import { IngredientList } from '../components/recipe/IngredientList';
import { InstructionList } from '../components/recipe/InstructionList';
import { SuggestChangeModal } from '../components/recipe/SuggestChangeModal';
import { AuthModal } from '../components/auth/AuthModal';
import { Avatar } from '../components/ui/Avatar';
import type { Collaborator } from '../types/recipe';

interface FullSharedRecipe extends SharedRecipe {
  id?: string;
  favoriteCount?: number;
  collaborators?: Collaborator[];
}

export function SharedRecipePage() {
  const { id: paramId } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isConfigured } = useAuth();
  const [recipe, setRecipe] = useState<FullSharedRecipe | null>(null);
  const [error, setError] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const { isFavorite, toggleFavorite } = useCloudFavorite(paramId);
  const { submit: submitSuggestion } = useSubmitSuggestion();

  const recipeOwnerId = recipe?.createdBy?.uid;
  const isOwner = user && recipeOwnerId ? user.uid === recipeOwnerId : false;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Try Firestore first (via URL param)
      if (paramId) {
        const published = await getPublishedRecipe(paramId);
        if (!cancelled) {
          if (published) {
            setRecipe(published);
          } else {
            setError(true);
          }
        }
        return;
      }

      // Fallback: URL hash encoded data
      if (location.hash) {
        const decoded = decodeRecipeFromHash(location.hash);
        if (!cancelled) {
          if (decoded) {
            setRecipe(decoded);
          } else {
            setError(true);
          }
        }
        return;
      }

      if (!cancelled) setError(true);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [paramId, location.hash]);

  const handleFavoriteClick = () => {
    if (!user && isConfigured) {
      setShowAuth(true);
      return;
    }
    if (!recipe) return;
    toggleFavorite({
      ownerId: recipe.createdBy?.uid ?? 'local',
      title: recipe.title,
      emoji: recipe.emoji,
    });
  };

  const handleSuggestClick = () => {
    if (!user && isConfigured) {
      setShowAuth(true);
      return;
    }
    setShowSuggest(true);
  };

  const handleSubmitSuggestion = async (message: string) => {
    if (!recipe || !paramId) return;
    await submitSuggestion({
      recipeId: paramId,
      recipeOwnerId: recipe.createdBy?.uid ?? 'local',
      recipeTitle: recipe.title,
      recipeEmoji: recipe.emoji,
      message,
    });
  };

  if (error) {
    return (
      <div className="min-h-dvh flex flex-col bg-surface">
        <header className="sticky top-0 z-30 bg-surface/80 backdrop-blur-md border-b border-border">
          <div className="flex items-center h-14 px-4 max-w-lg mx-auto">
            <h1 className="flex-1 text-lg font-semibold">Invalid Link</h1>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center space-y-3">
            <p className="text-4xl">🔗</p>
            <p className="text-text-secondary">This shared recipe link is invalid or corrupted.</p>
            <button
              onClick={() => navigate('/')}
              className="text-primary-600 text-sm font-medium"
            >
              Go to Recipe Lab
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!recipe) return null;

  return (
    <div className="min-h-dvh flex flex-col bg-surface">
      <header className="sticky top-0 z-30 bg-surface/80 backdrop-blur-md border-b border-border">
        <div className="flex items-center h-14 px-4 max-w-lg mx-auto">
          <h1 className="flex-1 text-lg font-semibold truncate">{recipe.title}</h1>
          <div className="flex items-center gap-1 ml-2">
            {/* Favorite button (only for Firestore-shared recipes) */}
            {paramId && !isOwner && (
              <button
                onClick={handleFavoriteClick}
                className="p-1.5 rounded-lg hover:bg-surface-tertiary transition-colors"
                aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                {isFavorite ? (
                  <svg className="w-5 h-5 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                    <path d="m11.645 20.91-.007-.003-.022-.012a15.247 15.247 0 0 1-.383-.218 25.18 25.18 0 0 1-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0 1 12 5.052 5.5 5.5 0 0 1 16.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 0 1-4.244 3.17 15.247 15.247 0 0 1-.383.219l-.022.012-.007.004-.003.001a.752.752 0 0 1-.704 0l-.003-.001Z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 5.65a5.5 5.5 0 0 0-7.752.22 5.5 5.5 0 0 0-7.752-.22 5.52 5.52 0 0 0 0 7.81l6.573 6.631a1.75 1.75 0 0 0 2.358 0l6.573-6.631a5.52 5.52 0 0 0 0-7.81Z" />
                  </svg>
                )}
              </button>
            )}
            <span className="text-xs font-medium text-text-tertiary bg-surface-secondary rounded-full px-2.5 py-0.5">
              View only
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full">
        <div className="p-4 space-y-5">
          <div>
            <div className="flex items-start gap-3">
              <span className="text-4xl">{recipe.emoji}</span>
              <div>
                <h2 className="text-xl font-bold">{recipe.title}</h2>
                <p className="text-sm text-text-secondary mt-1">{recipe.description}</p>
                {recipe.createdBy?.displayName && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <Avatar uid={recipe.createdBy.uid} name={recipe.createdBy.displayName} size="sm" />
                    <p className="text-xs text-text-tertiary">
                      Added by {recipe.createdBy.displayName}
                    </p>
                  </div>
                )}
                {recipe.collaborators && recipe.collaborators.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap mt-1">
                    <span className="text-xs text-text-tertiary">Collaborators:</span>
                    {recipe.collaborators.map((c) => (
                      <span key={c.uid} className="inline-flex items-center gap-1 bg-surface-secondary rounded-full pl-0.5 pr-2 py-0.5">
                        <Avatar uid={c.uid} name={c.displayName} size="sm" />
                        <span className="text-xs text-text-secondary">{c.displayName ?? 'Anonymous'}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <MetadataPills
            prepTime={recipe.prepTime}
            cookTime={recipe.cookTime}
            totalTime={recipe.totalTime}
            servings={recipe.servings}
            difficulty={recipe.difficulty}
          />

          <IngredientList ingredients={recipe.ingredients} />
          <InstructionList instructions={recipe.instructions} />

          {recipe.notes.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-semibold text-text-primary">Notes</h3>
              <ul className="space-y-1">
                {recipe.notes.map((note, i) => (
                  <li key={i} className="flex gap-2 text-sm text-text-secondary">
                    <span className="text-primary-500">💡</span>
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {recipe.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {recipe.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 text-xs"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </main>

      <div className="sticky bottom-0 p-4 bg-surface border-t border-border">
        <div className="max-w-lg mx-auto">
          {paramId && !isOwner ? (
            <button
              onClick={handleSuggestClick}
              className="w-full py-2.5 rounded-xl border border-primary-600 text-primary-600 text-sm font-medium hover:bg-primary-50 transition-colors"
            >
              Suggest a Change
            </button>
          ) : (
            <p className="text-xs text-text-tertiary text-center">
              Shared from{' '}
              <button onClick={() => navigate('/')} className="text-primary-600 font-medium">
                Recipe Lab
              </button>
            </p>
          )}
        </div>
      </div>

      <SuggestChangeModal
        open={showSuggest}
        recipeTitle={recipe.title}
        onSubmit={handleSubmitSuggestion}
        onClose={() => setShowSuggest(false)}
      />

      <AuthModal
        open={showAuth}
        onAuthenticated={() => setShowAuth(false)}
        onDismiss={() => setShowAuth(false)}
      />
    </div>
  );
}
