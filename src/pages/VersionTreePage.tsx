import { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { addRecipeToKitchen, KITCHEN_BUSY_MESSAGE, KITCHEN_FULL_MESSAGE, KITCHEN_MAYBE_SAVED_MESSAGE } from '../hooks/useKitchen';
import { AuthModal } from '../components/auth/AuthModal';
import { SignUpDialog } from '../components/auth/SignUpDialog';
import { ListAddedToast, type ListToast } from '../components/ui/ListAddedToast';
import { ShopFamilySheet } from '../components/tree/ShopFamilySheet';
import type { Recipe } from '../types/recipe';
import { useRecipeTree } from '../hooks/useRecipeTree';
import { useBranchEntry } from '../hooks/useBranchEntry';
import { useRecipe } from '../hooks/useRecipe';
import { useFamilyCooks } from '../hooks/useFamilyCooks';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { Skeleton } from '../components/ui/Skeleton';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { TreeView } from '../components/tree/TreeView';
import { TimelineView } from '../components/tree/TimelineView';
import { MapView } from '../components/tree/MapView';
import { familySubtitle } from '../lib/tree';
import { ChevronLeft, CloudOff, RotateCw, ShoppingBasket } from '../components/ui/icons';

// The switch only renders once there is more than one view.
const VIEWS = [
  { value: 'tree', label: 'Tree' },
  { value: 'timeline', label: 'Timeline' },
  { value: 'map', label: 'Map' },
] as const;
type ViewId = (typeof VIEWS)[number]['value'];

function BackButton() {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(-1)}
      className="-ml-2 w-11 h-11 flex items-center justify-center flex-shrink-0 rounded-full border border-border-strong text-text-primary hover:bg-surface-tertiary transition-colors"
      aria-label="Go back"
    >
      <ChevronLeft className="w-5 h-5" />
    </button>
  );
}

export function VersionTreePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { branch, signUp } = useBranchEntry();
  const { user, isConfigured } = useAuth();
  // Add to shopping list (RL-219), toasting as the recipe page does (RL-218).
  const [shopOpen, setShopOpen] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showSignUp, setShowSignUp] = useState(false);
  const [adding, setAdding] = useState(false);
  // Shown inside the sheet: a toast sits under a modal dialog.
  const [shopError, setShopError] = useState<string | null>(null);
  const [toast, setToast] = useState<ListToast | null>(null);
  const openShop = () => {
    if (!user || user.isAnonymous || !user.emailVerified) {
      // AuthModal closes itself for anyone already signed in, so an anonymous or unverified user gets the sign-up dialog.
      (user ? setShowSignUp : setShowAuth)(true);
      return;
    }
    setShopError(null);
    setShopOpen(true);
  };
  const addToList = async (r: Recipe, servings: number) => {
    if (!user || adding) return;
    setAdding(true);
    setShopError(null);
    try {
      const n = await addRecipeToKitchen(user.uid, r, servings);
      setToast(
        n === 0
          ? { text: 'Everything is already in your pantry', view: false }
          : { text: `Added ${n} ${n === 1 ? 'thing' : 'things'} to your list`, view: true }
      );
      setShopOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setShopError(
        [KITCHEN_FULL_MESSAGE, KITCHEN_MAYBE_SAVED_MESSAGE, KITCHEN_BUSY_MESSAGE].includes(msg) ? msg : "Couldn't add to your list. Check your connection and try again."
      );
    } finally {
      setAdding(false);
    }
  };
  const [searchParams, setSearchParams] = useSearchParams();
  const { recipe, isLoading: recipeLoading, cloudError, retry } = useRecipe(id);
  const { tree, recipes, isLoading: treeLoading } = useRecipeTree(recipe?.rootId);
  const cooks = useFamilyCooks(recipe?.rootId);

  // Anything other than a known view means Tree. Tree is the default, so it is
  // dropped from the URL rather than written.
  const param = searchParams.get('view');
  const view: ViewId = VIEWS.find((v) => v.value === param)?.value ?? 'tree';
  const setView = (next: ViewId) =>
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next === 'tree') params.delete('view');
        else params.set('view', next);
        return params;
      },
      { replace: true }
    );

  // The recipe's own resolution has to be part of "loading". While it is still
  // in flight rootId is undefined, so useRecipeTree reports an empty tree
  // immediately — which is how a still-loading page showed "No tree data found"
  // for up to the full 6s cloud window.
  const isLoading = recipeLoading || treeLoading;

  if (isLoading) {
    return (
      <div className="max-w-lg mx-auto">
        <header className="px-4 pt-3">
          <BackButton />
        </header>
        <div className="p-4 space-y-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      </div>
    );
  }

  // A failed cloud lookup is not an absent tree. Previously both ended
  // at the same dead-end string, telling the user their recipe had no
  // versions when the network was the actual problem.
  const showTree = !cloudError && !!tree && !!recipe;

  return (
    <div className="min-h-dvh flex flex-col bg-surface">
      <header className="px-4 pt-3 max-w-lg w-full mx-auto space-y-3">
        <div className="flex items-center justify-between">
          <BackButton />
          {showTree && isConfigured && (
            <button
              onClick={openShop}
              className="w-11 h-11 flex items-center justify-center flex-shrink-0 rounded-full border border-border-strong text-text-primary hover:bg-surface-tertiary transition-colors"
              aria-label="Add to shopping list"
            >
              <ShoppingBasket className="w-5 h-5" />
            </button>
          )}
        </div>
        {showTree && (
          <>
            {VIEWS.length > 1 && (
              <SegmentedControl label="Tree view" options={VIEWS} value={view} onChange={setView} />
            )}
            <div>
              <h1 className="font-heading text-[30px] leading-tight text-text-primary">{tree.recipe.title}</h1>
              <p className="text-sm text-text-secondary mt-1">{familySubtitle(recipes, undefined, cooks.total)}</p>
            </div>
          </>
        )}
      </header>

      <main className="flex-1 overflow-auto p-4 pb-6">
        <div className="max-w-lg mx-auto">
          {cloudError ? (
            <EmptyState
              tone="error"
              icon={<CloudOff />}
              title="Couldn't load the version tree"
              description="The shared library is unreachable right now. Your recipe is fine."
              action={
                <Button variant="secondary" onClick={retry}>
                  <RotateCw className="mr-2 size-4" />
                  Try again
                </Button>
              }
            />
          ) : showTree ? (
            <div className="space-y-4">
              {view === 'timeline' ? (
                <TimelineView recipes={recipes} currentId={id} />
              ) : view === 'map' ? (
                <MapView recipes={recipes} currentId={id} onShowTimeline={() => setView('timeline')} />
              ) : (
                <TreeView tree={tree} cooks={cooks} currentId={id} onOpen={(rid) => navigate(`/recipe/${rid}`)} />
              )}
              {/* The common case is a single card sitting alone with nothing
                  explaining what this screen is for. The sticky bar below is
                  the action that fills the tree. */}
              {tree.children.length === 0 && (
                <div className="bg-surface-secondary rounded-card p-4 text-center">
                  <p className="text-sm text-text-secondary">
                    This recipe has no variations yet. Branch it to try a change —
                    the original stays exactly as it is.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              icon="🔍"
              title="Recipe not found"
              description="It may have been deleted, or the link may be wrong."
            />
          )}
        </div>
      </main>

      {/* This route is outside AppShell, so there is no BottomNav to clear. The
          bar is sticky (in flow after main), so it never covers the last node,
          and pads for the iOS home indicator. */}
      {showTree && (
        <div className="sticky bottom-0 z-30">
          <div className="max-w-lg mx-auto bg-surface shadow-lg border-t border-border px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Button fullWidth className="min-w-0" onClick={() => branch(recipe.id)}>
              <span className="truncate">{`Branch from "${recipe.title}"`}</span>
            </Button>
          </div>
        </div>
      )}
      {signUp}
      {showTree && user && (
        <ShopFamilySheet open={shopOpen} onClose={() => setShopOpen(false)} recipes={recipes} currentId={recipe.id} uid={user.uid} adding={adding} error={shopError} onAdd={addToList} />
      )}
      <AuthModal open={showAuth} action={{ kind: 'continue' }} onAuthenticated={() => setShowAuth(false)} onDismiss={() => setShowAuth(false)} />
      <SignUpDialog
        open={showSignUp}
        action={{ kind: 'continue' }}
        body={
          user && !user.isAnonymous
            ? 'Check your inbox to verify your email, then add to your list again.'
            : "Your shopping list lives in your kitchen, which needs an account with a verified email. Once you're signed in, add to your list again."
        }
        onClose={() => setShowSignUp(false)}
      />
      {/* bottom-28 clears the sticky Branch bar. */}
      <ListAddedToast toast={toast} onDismiss={() => setToast(null)} bottomClass="bottom-28" />
    </div>
  );
}
