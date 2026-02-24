import { useLiveQuery } from 'dexie-react-hooks';
import { getRecipe, getRecipeChildren, getRecipeAncestors } from '../db/recipes';
import type { Recipe } from '../types/recipe';

export function useRecipe(id: string | undefined) {
  const recipe = useLiveQuery(() => (id ? getRecipe(id) : undefined), [id]);

  return {
    recipe,
    isLoading: id ? recipe === undefined : false,
  };
}

export function useRecipeChildren(parentId: string | undefined) {
  const children = useLiveQuery(
    () => (parentId ? getRecipeChildren(parentId) : []),
    [parentId]
  );

  return {
    children: children ?? [],
    isLoading: children === undefined,
  };
}

export function useRecipeAncestors(recipe: Recipe | undefined) {
  const ancestors = useLiveQuery(
    () => (recipe ? getRecipeAncestors(recipe) : []),
    [recipe?.id]
  );

  return {
    ancestors: ancestors ?? [],
    isLoading: ancestors === undefined,
  };
}
