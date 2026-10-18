import { useEffect, useRef } from 'react';
import type { TreeNode } from '../../lib/tree';

interface TreeViewProps {
  tree: TreeNode;
  currentId?: string;
  onOpen: (id: string) => void;
}

interface Ctx {
  path: string[];
  currentId?: string;
  onOpen: (id: string) => void;
}

// Connector geometry. A child row is 16px of gap, then a card. The elbow meets the
// card ELBOW_Y px below the row top: the centre of a two-line card (52px tall plus
// its 1px border). A card with wrapped or larger text would meet it off-centre.
const RAIL = 'w-[3px]';
const ELBOW_Y = 43;
const RADIUS = 16;

const line = (onPath: boolean) => (onPath ? 'bg-primary-500' : 'bg-neutral-400');

/** Ids from the root down to currentId, inclusive. Empty when currentId is not in the tree. */
function pathTo(node: TreeNode, id?: string): string[] {
  if (node.recipe.id === id) return [id];
  for (const child of node.children) {
    const rest = pathTo(child, id);
    if (rest.length) return [node.recipe.id, ...rest];
  }
  return [];
}

function Card({
  node,
  isRoot,
  onPath,
  isCurrent,
  onOpen,
}: {
  node: TreeNode;
  isRoot: boolean;
  onPath: boolean;
  isCurrent: boolean;
  onOpen: (id: string) => void;
}) {
  const { recipe } = node;
  const ref = useRef<HTMLButtonElement>(null);
  // Deep families would otherwise open with the current node off screen. jsdom has no scrollIntoView.
  useEffect(() => {
    if (isCurrent) ref.current?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  }, [isCurrent]);
  const author = recipe.createdBy.displayName || 'Anonymous';
  const what = isRoot ? 'Original' : recipe.prompt ? `"${recipe.prompt}"` : 'Variation';
  return (
    <button
      ref={ref}
      onClick={() => onOpen(recipe.id)}
      className={`flex items-center gap-2 w-60 min-w-56 min-h-11 px-3 py-2 text-left rounded-card border transition-colors hover:border-primary-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 ${
        isRoot ? 'bg-surface-secondary' : 'bg-surface'
      } ${onPath ? 'border-primary-500' : 'border-border'} ${isCurrent ? 'ring-2 ring-primary-500' : ''}`}
    >
      <span className="text-xl flex-shrink-0" aria-hidden="true">
        {recipe.emoji}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-text-primary truncate">{recipe.title}</span>
        <span className="block text-xs text-text-tertiary truncate">{`${what} · ${author}`}</span>
      </span>
      {isCurrent && (
        <>
          <span className="text-[11px] leading-4 rounded-xl bg-primary-50 text-primary-700 px-2 py-0.5 flex-shrink-0" aria-hidden="true">
            Here
          </span>
          <span className="sr-only">current version</span>
        </>
      )}
    </button>
  );
}

function Children({ node, ctx }: { node: TreeNode; ctx: Ctx }) {
  const { path } = ctx;
  // Index of the child the path continues through, or -1 when it stops here.
  const pathIdx = node.children.findIndex((c) => path.includes(c.recipe.id));
  return (
    <ul role="list" className="ml-4">
      {node.children.map((child, i) => {
        const last = i === node.children.length - 1;
        const onPath = path.includes(child.recipe.id);
        return (
          <li key={child.recipe.id} className="relative pl-7 pt-4">
            {/* z-10 puts a path elbow above a neutral rail-out; a neutral elbow stays below a path rail-out (later in DOM). */}
            {/* data-path is "true" exactly where the ancestry path passes. */}
            <span
              aria-hidden="true"
              data-child={child.recipe.id}
              data-segment="rail-in"
              data-path={String(pathIdx >= i)}
              className={`absolute left-0 top-0 ${RAIL} ${line(pathIdx >= i)}`}
              style={{ height: ELBOW_Y - RADIUS }}
            />
            <span
              aria-hidden="true"
              data-child={child.recipe.id}
              data-segment="elbow"
              data-path={String(onPath)}
              className={`absolute left-0 w-7 ${onPath ? 'z-10' : ''} border-b-[3px] border-l-[3px] ${onPath ? 'border-primary-500' : 'border-neutral-400'}`}
              style={{ top: ELBOW_Y - RADIUS, height: RADIUS, borderBottomLeftRadius: RADIUS }}
            />
            {!last && (
              <span
                aria-hidden="true"
                data-child={child.recipe.id}
                data-segment="rail-out"
                data-path={String(pathIdx > i)}
                className={`absolute left-0 bottom-0 ${RAIL} ${line(pathIdx > i)}`}
                style={{ top: ELBOW_Y - RADIUS }}
              />
            )}
            <Node node={child} ctx={ctx} isRoot={false} />
          </li>
        );
      })}
    </ul>
  );
}

function Node({ node, ctx, isRoot }: { node: TreeNode; ctx: Ctx; isRoot: boolean }) {
  return (
    <div>
      <Card
        node={node}
        isRoot={isRoot}
        onPath={ctx.path.includes(node.recipe.id)}
        isCurrent={node.recipe.id === ctx.currentId}
        onOpen={ctx.onOpen}
      />
      {node.children.length > 0 && <Children node={node} ctx={ctx} />}
    </div>
  );
}

export function TreeView({ tree, currentId, onOpen }: TreeViewProps) {
  const path = pathTo(tree, currentId);
  return (
    <div
      role="region"
      aria-label="Version tree, scrolls sideways"
      tabIndex={0}
      className="overflow-x-auto rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
    >
      <div className="w-max min-w-full p-1">
        <Node node={tree} ctx={{ path, currentId, onOpen }} isRoot />
      </div>
    </div>
  );
}
