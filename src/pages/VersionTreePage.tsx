import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useRecipeTree } from '../hooks/useRecipeTree';
import { useRecipe } from '../hooks/useRecipe';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { Skeleton } from '../components/ui/Skeleton';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { TreeView } from '../components/tree/TreeView';
import { TimelineView } from '../components/tree/TimelineView';
import { familySubtitle } from '../lib/tree';

// Later view tickets (Map RL-072) append here. The switch only renders once there is
// more than one.
const VIEWS = [
  { value: 'tree', label: 'Tree' },
  { value: 'timeline', label: 'Timeline' },
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
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
      </svg>
    </button>
  );
}

export function VersionTreePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { recipe, isLoading: recipeLoading, cloudError, retry } = useRecipe(id);
  const { tree, recipes, isLoading: treeLoading } = useRecipeTree(recipe?.rootId);

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
        <BackButton />
        {showTree && (
          <>
            {VIEWS.length > 1 && (
              <SegmentedControl label="Tree view" options={VIEWS} value={view} onChange={setView} />
            )}
            <div>
              <h1 className="font-heading text-[30px] leading-tight text-text-primary">{tree.recipe.title}</h1>
              <p className="text-sm text-text-secondary mt-1">{familySubtitle(recipes)}</p>
            </div>
          </>
        )}
      </header>

      <main className="flex-1 overflow-auto p-4 pb-6">
        <div className="max-w-lg mx-auto">
          {cloudError ? (
            <EmptyState
              icon="📡"
              title="Couldn't load the version tree"
              description="The shared library is unreachable right now. Your recipe is fine."
              action={
                <Button variant="secondary" onClick={retry}>
                  Try again
                </Button>
              }
            />
          ) : showTree ? (
            <div className="space-y-4">
              {view === 'timeline' ? (
                <TimelineView recipes={recipes} currentId={id} />
              ) : (
                <TreeView tree={tree} currentId={id} onOpen={(rid) => navigate(`/recipe/${rid}`)} />
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
            <Button fullWidth className="min-w-0" onClick={() => navigate(`/recipe/${recipe.id}/vary`)}>
              <span className="truncate">{`Branch from "${recipe.title}"`}</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
