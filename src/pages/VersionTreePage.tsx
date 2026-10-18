import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useRecipeTree } from '../hooks/useRecipeTree';
import { useRecipe } from '../hooks/useRecipe';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { Skeleton } from '../components/ui/Skeleton';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { familySubtitle, type TreeNode } from '../lib/tree';

// Later view tickets (Timeline RL-070, Map RL-072) append here. The switch only
// renders once there is more than one.
const VIEWS = [{ value: 'tree', label: 'Tree' }] as const;
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
              <TreeNodeView node={tree} currentId={id} onNavigate={(rid) => navigate(`/recipe/${rid}`)} depth={0} />
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

interface TreeNodeViewProps {
  node: TreeNode;
  currentId?: string;
  onNavigate: (id: string) => void;
  depth: number;
}

function TreeNodeView({ node, currentId, onNavigate, depth }: TreeNodeViewProps) {
  const isCurrent = node.recipe.id === currentId;
  const isRoot = depth === 0;

  return (
    <div className="relative">
      {/* Connector line from parent */}
      {/* Stub joining this node up to the parent's vertical rule; tracks the
          indent, so it moved with ml-6 -> ml-3. */}
      {depth > 0 && (
        <div className="absolute left-3 -top-4 w-px h-4 bg-border" />
      )}

      <button
        onClick={() => onNavigate(node.recipe.id)}
        className={`w-full min-w-56 text-left p-3 rounded-xl border-2 transition-all ${
          isCurrent
            ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-200'
            : isRoot
            ? 'border-primary-200 bg-primary-50/50 hover:border-primary-300'
            : 'border-border bg-surface hover:border-border-strong'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="text-xl">{node.recipe.emoji}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary truncate">
              {node.recipe.title}
            </p>
            <p className="text-xs text-text-tertiary truncate">
              {node.recipe.depth === 0
                ? 'Original'
                : node.recipe.prompt
                  ? `"${node.recipe.prompt}"`
                  : 'Variation'}
            </p>
          </div>
          {isCurrent && (
            <span className="text-xs bg-primary-600 text-white px-2 py-0.5 rounded-full flex-shrink-0">
              Current
            </span>
          )}
        </div>
      </button>

      {node.children.length > 0 && (
        // 24px per level, halved from 48px. Combined with the cards' min-width,
        // a deep chain now scrolls horizontally instead of crushing the cards.
        <div className="ml-3 mt-4 space-y-4 border-l-2 border-border pl-3">
          {node.children.map((child) => (
            <TreeNodeView
              key={child.recipe.id}
              node={child}
              currentId={currentId}
              onNavigate={onNavigate}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
