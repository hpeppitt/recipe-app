import { useParams, useNavigate } from 'react-router-dom';
import { useRecipeTree } from '../hooks/useRecipeTree';
import { useRecipe } from '../hooks/useRecipe';
import { TopBar } from '../components/layout/TopBar';
import { Skeleton } from '../components/ui/Skeleton';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import type { TreeNode } from '../lib/tree';

export function VersionTreePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { recipe, isLoading: recipeLoading, cloudError, retry } = useRecipe(id);
  const { tree, isLoading: treeLoading } = useRecipeTree(recipe?.rootId);

  // The recipe's own resolution has to be part of "loading". While it is still
  // in flight rootId is undefined, so useRecipeTree reports an empty tree
  // immediately — which is how a still-loading page showed "No tree data found"
  // for up to the full 6s cloud window.
  const isLoading = recipeLoading || treeLoading;

  if (isLoading) {
    return (
      <div className="max-w-lg mx-auto">
        <TopBar title="Version Tree" showBack />
        <div className="p-4 space-y-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col bg-surface">
      <TopBar title="Version Tree" showBack />

      <main className="flex-1 overflow-auto p-4">
        <div className="max-w-lg mx-auto">
          {/* A failed cloud lookup is not an absent tree. Previously both ended
              at the same dead-end string, telling the user their recipe had no
              versions when the network was the actual problem. */}
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
          ) : tree ? (
            <div className="space-y-4">
              <TreeNodeView node={tree} currentId={id} onNavigate={(rid) => navigate(`/recipe/${rid}`)} depth={0} />
              {/* The common case is a single card sitting alone with nothing
                  explaining what this screen is for. Say it, and offer the
                  action that fills the tree. */}
              {tree.children.length === 0 && (
                <div className="border border-border bg-surface-secondary rounded-2xl p-4 space-y-3 text-center">
                  <p className="text-sm text-text-secondary">
                    This recipe has no variations yet. Branch it to try a change —
                    the original stays exactly as it is.
                  </p>
                  <Button size="sm" onClick={() => navigate(`/recipe/${id}/vary`)}>
                    Create a variation
                  </Button>
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
            ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-200 dark:bg-primary-950 dark:ring-primary-800'
            : isRoot
            ? 'border-primary-200 bg-primary-50/50 hover:border-primary-300 dark:border-primary-800 dark:bg-primary-950/50 dark:hover:border-primary-700'
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
