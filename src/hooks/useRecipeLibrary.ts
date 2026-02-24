import { useLiveQuery } from 'dexie-react-hooks';
import { getCoreRecipes } from '../db/recipes';
import type { RecipeWithChildren } from '../types/recipe';

export function useRecipeLibrary(searchQuery: string = '') {
  const recipes = useLiveQuery(() => getCoreRecipes(), []);

  const filtered: RecipeWithChildren[] | undefined = recipes
    ? searchQuery.trim()
      ? recipes.filter(
          (r) =>
            r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            r.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
            r.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
        )
      : recipes
    : undefined;

  return {
    recipes: filtered,
    isLoading: recipes === undefined,
  };
}
