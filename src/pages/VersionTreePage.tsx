import { useParams, useNavigate } from 'react-router-dom';
import { useRecipeTree } from '../hooks/useRecipeTree';
import { useRecipe } from '../hooks/useRecipe';
import { TopBar } from '../components/layout/TopBar';
import { Skeleton } from '../components/ui/Skeleton';
import type { TreeNode } from '../lib/tree';

export function VersionTreePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { recipe } = useRecipe(id);
  const { tree, isLoading } = useRecipeTree(recipe?.rootId);

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
          {tree ? (
            <TreeNodeView node={tree} currentId={id} onNavigate={(rid) => navigate(`/recipe/${rid}`)} depth={0} />
          ) : (
            <p className="text-center text-text-secondary py-8">No tree data found</p>
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
      {depth > 0 && (
        <div className="absolute left-6 -top-4 w-px h-4 bg-border" />
      )}

      <button
        onClick={() => onNavigate(node.recipe.id)}
        className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
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
              {node.recipe.depth === 0 ? 'Original' : `"${node.recipe.prompt}"`}
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
        <div className="ml-6 mt-4 space-y-4 border-l-2 border-border pl-6">
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
