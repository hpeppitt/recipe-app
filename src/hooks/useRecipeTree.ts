import { useLiveQuery } from 'dexie-react-hooks';
import { getRecipeTree } from '../db/recipes';
import { buildTree } from '../lib/tree';

export function useRecipeTree(rootId: string | undefined) {
  const recipes = useLiveQuery(
    () => (rootId ? getRecipeTree(rootId) : []),
    [rootId]
  );

  const tree = recipes && recipes.length > 0 ? buildTree(recipes) : null;

  return {
    recipes: recipes ?? [],
    tree,
    isLoading: recipes === undefined,
  };
}
