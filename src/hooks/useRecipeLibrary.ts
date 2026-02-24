import { useLiveQuery } from 'dexie-react-hooks';
import { getCoreRecipes } from '../db/recipes';
import type { RecipeWithChildren } from '../types/recipe';

export function useRecipeLibrary(searchQuery: string = '', favoriteIds?: Set<string>) {
  const recipes = useLiveQuery(() => getCoreRecipes(), []);

  const filtered: RecipeWithChildren[] | undefined = recipes
    ? (() => {
        let result = recipes;
        if (favoriteIds && favoriteIds.size > 0) {
          result = result.filter((r) => favoriteIds.has(r.id));
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          result = result.filter(
            (r) =>
              r.title.toLowerCase().includes(q) ||
              r.description.toLowerCase().includes(q) ||
              r.tags.some((t) => t.toLowerCase().includes(q))
          );
        }
        return result;
      })()
    : undefined;

  return {
    recipes: filtered,
    isLoading: recipes === undefined,
  };
}
