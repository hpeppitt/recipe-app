import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getRecipeTree } from '../db/recipes';
import { getPublishedRecipeTree, type PublishedRecipe } from '../services/firestore';
import { isFirebaseConfigured } from '../services/firebase';
import { buildTree } from '../lib/tree';
import { mergeDedupById } from '../lib/search';
import type { Recipe } from '../types/recipe';

/** Fill in the fields the tree UI needs but a published doc doesn't carry. */
function toRecipeLike(published: PublishedRecipe): Recipe {
  return {
    ...published,
    parentId: published.parentId ?? null,
    rootId: published.rootId ?? published.id,
    depth: published.depth ?? 0,
    collaborators: published.collaborators ?? [],
    prompt: published.prompt ?? '',
    chatHistory: [],
    createdAt: published.createdAt ?? 0,
    updatedAt: published.createdAt ?? 0,
  } as Recipe;
}

export function useRecipeTree(rootId: string | undefined) {
  const localRecipes = useLiveQuery(
    () => (rootId ? getRecipeTree(rootId) : []),
    [rootId]
  );

  // Variations published by other users (or from another device) are not in this
  // device's Dexie, so a local-only read showed an empty tree for them.
  const [cloudRecipes, setCloudRecipes] = useState<Recipe[] | null>(null);

  useEffect(() => {
    if (!rootId || !isFirebaseConfigured) {
      setCloudRecipes(null);
      return;
    }
    let cancelled = false;
    getPublishedRecipeTree(rootId)
      .then((published) => {
        if (!cancelled) setCloudRecipes(published.map(toRecipeLike));
      })
      .catch(() => {
        // Degrade to the local tree rather than losing the whole view.
        if (!cancelled) setCloudRecipes(null);
      });
    return () => {
      cancelled = true;
    };
  }, [rootId]);

  // Local wins on id: it has the full record, including chat history.
  const recipes = mergeDedupById(localRecipes ?? [], cloudRecipes ?? [], {
    limit: Number.MAX_SAFE_INTEGER,
  });

  const tree = recipes.length > 0 ? buildTree(recipes) : null;

  return {
    recipes,
    tree,
    isLoading: localRecipes === undefined,
  };
}
