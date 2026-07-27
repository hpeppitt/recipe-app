import type { Recipe } from '../types/recipe';

export interface TreeNode {
  recipe: Recipe;
  children: TreeNode[];
}

/**
 * The given id plus every descendant of it, from a flat node list.
 *
 * Shared by the local and cloud delete cascades so both remove exactly the same
 * subtree. Nodes whose parent is missing from the list are simply unreachable
 * rather than an error, which keeps a partially-synced cloud tree safe to pass in.
 */
export function collectSubtreeIds(
  nodes: Array<{ id: string; parentId: string | null }>,
  id: string
): string[] {
  const childrenByParent = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const siblings = childrenByParent.get(node.parentId) ?? [];
    siblings.push(node.id);
    childrenByParent.set(node.parentId, siblings);
  }

  const collected = new Set<string>([id]);
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const child of childrenByParent.get(current) ?? []) {
      // Guards against a cycle in malformed data looping forever.
      if (collected.has(child)) continue;
      collected.add(child);
      queue.push(child);
    }
  }

  return [...collected];
}

export function buildTree(recipes: Recipe[]): TreeNode | null {
  if (recipes.length === 0) return null;

  const root = recipes.find((r) => r.parentId === null);
  if (!root) return null;

  const byParent = new Map<string, Recipe[]>();
  for (const recipe of recipes) {
    if (recipe.parentId) {
      const siblings = byParent.get(recipe.parentId) ?? [];
      siblings.push(recipe);
      byParent.set(recipe.parentId, siblings);
    }
  }

  function buildNode(recipe: Recipe): TreeNode {
    const children = (byParent.get(recipe.id) ?? [])
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(buildNode);
    return { recipe, children };
  }

  return buildNode(root);
}
