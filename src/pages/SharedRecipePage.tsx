import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { decodeRecipeFromHash, type SharedRecipe } from '../lib/share';
import { getPublishedRecipe } from '../services/firestore';
import { createRecipe } from '../db/recipes';
import type { GeneratedRecipe } from '../types/api';
import { useAuth } from '../contexts/AuthContext';
import { useCloudFavorite } from '../hooks/useFavorites';
import { useSubmitSuggestion } from '../hooks/useSuggestions';
import { MetadataPills } from '../components/recipe/MetadataPills';
import { IngredientList } from '../components/recipe/IngredientList';
import { InstructionList } from '../components/recipe/InstructionList';
import { SuggestChangeModal } from '../components/recipe/SuggestChangeModal';
import { AuthModal } from '../components/auth/AuthModal';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { incrementRecipeViews } from '../services/firestore';
import { trackRecipeViewed } from '../services/analytics';
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
  // 'not-found' is a permanent dead end (bad or corrupted link); 'failed' is a
  // fetch that blew up and is worth retrying. Conflating them told users with a
  // flaky connection that a perfectly good link was corrupt.
  const [status, setStatus] = useState<'loading' | 'ready' | 'not-found' | 'failed'>('loading');
  const [reloadKey, setReloadKey] = useState(0);
  const [showSuggest, setShowSuggest] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const { isFavorite, toggleFavorite } = useCloudFavorite(paramId);
  const { submit: submitSuggestion } = useSubmitSuggestion();
  // createRecipe mints a fresh UUID per call, so every tap makes another copy.
  // The guard has to be a ref, not the `saving` state: three synchronous taps all
  // land before React re-renders, and measured against the state-only version
  // that produced 3 saved copies. Same failure mode as saveRecipe (FUN-14).
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const handleSaveCopy = async () => {
    if (!recipe || savingRef.current || savedId) return;
    savingRef.current = true;
    setSaving(true);
    try {
      // Deliberately not published: this is the recipient's private copy of
      // someone else's recipe, and the original creator is preserved in
      // createdBy rather than being overwritten with the saver's identity.
      const saved = await createRecipe(
        recipe as unknown as GeneratedRecipe,
        '',
        [],
        null,
        null,
        -1,
        recipe.createdBy ?? { uid: 'local', displayName: null }
      );
      setSavedId(saved.id);
    } catch (err) {
      console.error('Saving the shared recipe failed', err);
      // Only released on failure: after a success the button becomes a link to
      // the saved recipe, so re-arming it would invite a duplicate.
      savingRef.current = false;
    } finally {
      setSaving(false);
    }
  };

  const recipeOwnerId = recipe?.createdBy?.uid;
  const isOwner = user && recipeOwnerId ? user.uid === recipeOwnerId : false;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Try Firestore first (via URL param)
      if (paramId) {
        try {
          const published = await getPublishedRecipe(paramId);
          if (cancelled) return;
          if (published) {
            setRecipe(published);
            setStatus('ready');
            incrementRecipeViews(paramId);
            trackRecipeViewed(paramId);
          } else {
            setStatus('not-found');
          }
        } catch {
          // Offline, rules denial, Firestore outage. Previously this threw out
          // of the effect and left the page blank forever.
          if (!cancelled) setStatus('failed');
        }
        return;
      }

      // Fallback: URL hash encoded data
      if (location.hash) {
        const decoded = decodeRecipeFromHash(location.hash);
        if (cancelled) return;
        if (decoded) {
          setRecipe(decoded);
          setStatus('ready');
        } else {
          setStatus('not-found');
        }
        return;
      }

      if (!cancelled) setStatus('not-found');
    }

    setStatus('loading');
    load();
    return () => {
      cancelled = true;
    };
  }, [paramId, location.hash, reloadKey]);

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

  if (status !== 'ready' || !recipe) {
    const heading =
      status === 'loading'
        ? 'Loading Recipe'
        : status === 'failed'
          ? "Couldn't Load Recipe"
          : 'Invalid Link';

    return (
      <div className="min-h-dvh flex flex-col bg-surface">
        <header className="sticky top-0 z-30 bg-surface/80 backdrop-blur-md border-b border-border">
          <div className="flex items-center h-14 px-4 max-w-lg mx-auto">
            <h1 className="flex-1 text-lg font-semibold">{heading}</h1>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center p-8">
          {status === 'loading' ? (
            <Spinner className="text-primary-600" />
          ) : (
            <div className="text-center space-y-3">
              <p className="text-4xl">{status === 'failed' ? '📡' : '🔗'}</p>
              <p className="text-text-secondary">
                {status === 'failed'
                  ? "We couldn't reach the recipe library. Check your connection and try again."
                  : 'This shared recipe link is invalid or corrupted.'}
              </p>
              <div className="flex flex-col items-center gap-2">
                {status === 'failed' && (
                  <Button onClick={() => setReloadKey((k) => k + 1)}>Try Again</Button>
                )}
                <button
                  onClick={() => navigate('/')}
                  className="text-primary-600 text-sm font-medium py-2 px-3"
                >
                  Go to Recipe Lab
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

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
                className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-surface-tertiary transition-colors"
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
            {/* Only the hash link is genuinely read-only. On /shared/:id the
                badge sat directly beside a working favourite button and a
                Suggest a Change action, flatly contradicting both. */}
            {!paramId && (
              <span className="text-xs font-medium text-text-tertiary bg-surface-secondary rounded-full px-2.5 py-0.5">
                Read-only copy
              </span>
            )}
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
                  <button
                    onClick={() => navigate(`/profile/${recipe.createdBy!.uid}`)}
                    className="min-h-11 flex items-center gap-1.5 mt-1 hover:opacity-80 transition-opacity"
                  >
                    <Avatar uid={recipe.createdBy.uid} name={recipe.createdBy.displayName} size="sm" />
                    <p className="text-xs text-text-tertiary">
                      Added by <span className="text-primary-600 font-medium">{recipe.createdBy.displayName}</span>
                    </p>
                  </button>
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

          <IngredientList ingredients={recipe.ingredients} checkable />
          <InstructionList instructions={recipe.instructions} checkable />

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
                  className="px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300 text-xs"
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
              className="w-full py-2.5 min-h-11 rounded-xl border border-primary-600 text-primary-600 text-sm font-medium hover:bg-primary-50 dark:hover:bg-primary-950 transition-colors"
            >
              Suggest a Change
            </button>
          ) : !paramId ? (
            // A hash link carries the whole recipe in the URL and nothing else:
            // no Firestore doc to favourite, no owner to suggest to. Without a
            // save action the recipient could only read it and close the tab,
            // which is the one moment they most want to keep it.
            <div className="space-y-2">
              {savedId ? (
                <Button fullWidth onClick={() => navigate(`/recipe/${savedId}`)}>
                  Saved — open it
                </Button>
              ) : (
                <Button fullWidth onClick={handleSaveCopy} disabled={saving}>
                  {saving ? <Spinner size="sm" /> : 'Save to my library'}
                </Button>
              )}
              <p className="text-xs text-text-tertiary text-center">
                Saves a copy on this device. You can then branch it into your own
                variations.
              </p>
            </div>
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
