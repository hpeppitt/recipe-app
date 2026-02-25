import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getRecipe, getRecipeChildren, getRecipeAncestors } from '../db/recipes';
import { getPublishedRecipe } from '../services/firestore';
import { isFirebaseConfigured } from '../services/firebase';
import type { Recipe } from '../types/recipe';

export function useRecipe(id: string | undefined) {
  const localRecipe = useLiveQuery(() => (id ? getRecipe(id) : undefined), [id]);
  const [cloudRecipe, setCloudRecipe] = useState<Recipe | null>(null);
  const [cloudChecked, setCloudChecked] = useState(false);

  useEffect(() => {
    setCloudRecipe(null);
    setCloudChecked(false);
  }, [id]);

  // Fall back to Firestore if not found locally
  useEffect(() => {
    if (!id || localRecipe !== undefined || !isFirebaseConfigured || cloudChecked) return;
    // localRecipe is undefined during Dexie loading — wait for it to resolve
    // useLiveQuery returns undefined while loading, then the value (or undefined if not found)
    // We use a short delay to let Dexie resolve first
    const timer = setTimeout(() => {
      getPublishedRecipe(id)
        .then((published) => {
          if (published) {
            // Convert SharedRecipe to Recipe-like shape for display
            setCloudRecipe({
              ...published,
              parentId: (published as Record<string, unknown>).parentId as string | null ?? null,
              rootId: ((published as Record<string, unknown>).rootId as string) ?? id,
              depth: ((published as Record<string, unknown>).depth as number) ?? 0,
              collaborators: (published as Record<string, unknown>).collaborators as Recipe['collaborators'] ?? [],
              prompt: '',
              chatHistory: [],
              createdAt: ((published as Record<string, unknown>).createdAt as number) ?? 0,
              updatedAt: ((published as Record<string, unknown>).updatedAt as number) ?? 0,
            } as Recipe);
          }
          setCloudChecked(true);
        })
        .catch(() => setCloudChecked(true));
    }, 100);
    return () => clearTimeout(timer);
  }, [id, localRecipe, cloudChecked]);

  const recipe = localRecipe ?? cloudRecipe ?? undefined;

  return {
    recipe,
    isLoading: id ? recipe === undefined && !cloudChecked : false,
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
