import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRecipe, useRecipeChildren, useRecipeAncestors } from '../hooks/useRecipe';
import { deleteRecipeTree } from '../db/recipes';
import { encodeRecipeToUrl } from '../lib/share';
import { TopBar } from '../components/layout/TopBar';
import { RecipeContent } from '../components/recipe/RecipeContent';
import { LineageBreadcrumb } from '../components/recipe/LineageBreadcrumb';
import { VariationChips } from '../components/recipe/VariationChips';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Skeleton } from '../components/ui/Skeleton';

export function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { recipe, isLoading } = useRecipe(id);
  const { children } = useRecipeChildren(id);
  const { ancestors } = useRecipeAncestors(recipe);
  const [showDelete, setShowDelete] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

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
    navigate('/', { replace: true });
  };

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
              onClick={handleShare}
              className="p-1.5 rounded-lg hover:bg-surface-tertiary transition-colors relative"
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
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1.5 rounded-lg hover:bg-surface-tertiary transition-colors"
              aria-label="More options"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
              </svg>
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
          <VariationChips children={children} />
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
