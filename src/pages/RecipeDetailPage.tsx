import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRecipe, useRecipeChildren, useRecipeAncestors } from '../hooks/useRecipe';
import { useFavorite } from '../hooks/useFavorites';
import { useSuggestions } from '../hooks/useSuggestions';
import { useAuth } from '../contexts/AuthContext';
import { deleteRecipeTree } from '../db/recipes';
import { deletePublishedRecipe } from '../services/firestore';
import { isFirebaseConfigured } from '../services/firebase';
import { encodeRecipeToUrl } from '../lib/share';
import { TopBar } from '../components/layout/TopBar';
import { RecipeContent } from '../components/recipe/RecipeContent';
import { LineageBreadcrumb } from '../components/recipe/LineageBreadcrumb';
import { VariationChips } from '../components/recipe/VariationChips';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Skeleton } from '../components/ui/Skeleton';
import { Avatar } from '../components/ui/Avatar';

export function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isConfigured } = useAuth();
  const { recipe, isLoading } = useRecipe(id);
  const { children } = useRecipeChildren(id);
  const { ancestors } = useRecipeAncestors(recipe);
  const { isFavorite, toggleFavorite } = useFavorite(id);
  const { suggestions, approve, reject } = useSuggestions(id);
  const [showDelete, setShowDelete] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const isOwner =
    !isConfigured || !user || !recipe?.createdBy
      ? true // If no auth, treat as owner (local-only mode)
      : recipe.createdBy.uid === user.uid || recipe.createdBy.uid === 'local';

  const handleShare = async () => {
    if (!recipe) return;
    const url = encodeRecipeToUrl(recipe);
    await navigator.clipboard.writeText(url);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  const handleDelete = async () => {
    if (!id) return;
    await deleteRecipeTree(id);
    if (isFirebaseConfigured) {
      deletePublishedRecipe(id).catch(() => {});
    }
    navigate('/', { replace: true });
  };

  const handleFavoriteToggle = () => {
    if (!recipe) return;
    toggleFavorite({
      ownerId: recipe.createdBy?.uid ?? 'local',
      title: recipe.title,
      emoji: recipe.emoji,
    });
  };

  const creatorName = recipe?.createdBy?.displayName;
  const pendingSuggestions = suggestions.filter((s) => s.status === 'pending');

  if (isLoading) {
    return (
      <div className="max-w-lg mx-auto">
        <TopBar title="Loading..." showBack />
        <div className="p-4 space-y-4">
          <Skeleton className="h-12" />
          <Skeleton className="h-8" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="max-w-lg mx-auto">
        <TopBar title="Not found" showBack />
        <div className="p-8 text-center text-text-secondary">Recipe not found</div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col bg-surface">
      <TopBar
        title={recipe.title}
        showBack
        right={
          <div className="relative">
            <button
              onClick={handleFavoriteToggle}
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
            <button
              onClick={handleShare}
              className="p-1.5 rounded-lg hover:bg-surface-tertiary transition-colors"
              aria-label="Share recipe"
            >
              {shareCopied ? (
                <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
                </svg>
              )}
            </button>
            <button
              onClick={() => navigate(`/recipe/${recipe.id}/tree`)}
              className="p-1.5 rounded-lg hover:bg-surface-tertiary transition-colors"
              aria-label="Version tree"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
              </svg>
            </button>
            {isOwner && (
              <>
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-1.5 rounded-lg hover:bg-surface-tertiary transition-colors relative"
                  aria-label="More options"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
                  </svg>
                  {pendingSuggestions.length > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary-500" />
                  )}
                </button>
                {showMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                    <div className="absolute right-0 top-full mt-1 z-50 bg-surface border border-border rounded-xl shadow-lg py-1 min-w-[140px]">
                      <button
                        onClick={() => {
                          setShowMenu(false);
                          setShowDelete(true);
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-danger-600 hover:bg-surface-secondary"
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        }
      />

      <main className="flex-1 max-w-lg mx-auto w-full">
        <div className="p-4 space-y-6">
          {recipe.depth > 0 && (
            <div className="space-y-2">
              <LineageBreadcrumb ancestors={ancestors} current={recipe} />
              <div className="bg-surface-secondary rounded-xl px-3 py-2 text-sm text-text-secondary">
                <span className="text-text-tertiary">Prompt: </span>"{recipe.prompt}"
              </div>
            </div>
          )}

          <RecipeContent recipe={recipe} />

          {(creatorName || (recipe.collaborators && recipe.collaborators.length > 0)) && (
            <div className="space-y-2">
              {creatorName && recipe.createdBy && (
                <div className="flex items-center gap-2">
                  <Avatar uid={recipe.createdBy.uid} name={creatorName} size="sm" />
                  <p className="text-xs text-text-tertiary">
                    Added by {creatorName}
                  </p>
                </div>
              )}
              {recipe.collaborators && recipe.collaborators.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
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
          )}

          <VariationChips children={children} />

          {/* Suggestions section (owner only) */}
          {isOwner && suggestions.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-text-primary">
                Suggestions ({pendingSuggestions.length} pending)
              </h3>
              <div className="space-y-2">
                {suggestions.map((s) => (
                  <div
                    key={s.id}
                    className={`border rounded-xl p-3 ${
                      s.status === 'pending'
                        ? 'border-primary-200 bg-primary-50/30'
                        : 'border-border bg-surface-secondary'
                    }`}
                  >
                    <p className="text-sm text-text-primary">"{s.message}"</p>
                    <p className="text-xs text-text-tertiary mt-1">
                      from {s.suggestedBy.displayName ?? 'Anonymous'}
                      {s.status !== 'pending' && (
                        <span
                          className={`ml-2 font-medium ${
                            s.status === 'approved'
                              ? 'text-success-600'
                              : 'text-text-tertiary'
                          }`}
                        >
                          {s.status === 'approved' ? 'Approved' : 'Rejected'}
                        </span>
                      )}
                    </p>
                    {s.status === 'pending' && (
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => approve(s.id)}
                          className="text-xs font-medium text-success-600 hover:underline"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => reject(s.id)}
                          className="text-xs font-medium text-text-tertiary hover:underline"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      <div className="sticky bottom-0 p-4 bg-surface border-t border-border">
        <div className="max-w-lg mx-auto">
          <Button fullWidth onClick={() => navigate(`/recipe/${recipe.id}/vary`)}>
            Create Variation
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={showDelete}
        title="Delete Recipe"
        message={
          children.length > 0
            ? `This will delete "${recipe.title}" and all ${children.length} variation(s). This cannot be undone.`
            : `Delete "${recipe.title}"? This cannot be undone.`
        }
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
      />
    </div>
  );
}
