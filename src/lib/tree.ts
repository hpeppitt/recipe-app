import type { Recipe } from '../types/recipe';

export interface TreeNode {
  recipe: Recipe;
  children: TreeNode[];
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
