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
  //
  // Stamped with the rootId it belongs to so a result from the previous tree is
  // never mistaken for this one's, and so "still fetching" is distinguishable
  // from "fetched, nothing there".
  const [cloud, setCloud] = useState<{ rootId: string | undefined; recipes: Recipe[] | null }>({
    rootId: undefined,
    recipes: null,
  });

  useEffect(() => {
    if (!rootId || !isFirebaseConfigured) {
      // Nothing to wait for: mark this rootId settled so the caller does not
      // sit on a spinner forever in local-only mode.
      setCloud({ rootId, recipes: null });
      return;
    }
    setCloud({ rootId: undefined, recipes: null });
    let cancelled = false;
    getPublishedRecipeTree(rootId)
      .then((published) => {
        if (!cancelled) setCloud({ rootId, recipes: published.map(toRecipeLike) });
      })
      .catch(() => {
        // Degrade to the local tree rather than losing the whole view.
        if (!cancelled) setCloud({ rootId, recipes: null });
      });
    return () => {
      cancelled = true;
    };
  }, [rootId]);

  const cloudSettled = cloud.rootId === rootId;
  const cloudRecipes = cloudSettled ? cloud.recipes : null;

  // Local wins on id: it has the full record, including chat history.
  const recipes = mergeDedupById(localRecipes ?? [], cloudRecipes ?? [], {
    limit: Number.MAX_SAFE_INTEGER,
  });

  const tree = recipes.length > 0 ? buildTree(recipes) : null;

  return {
    recipes,
    tree,
    // The cloud fetch counts as loading. It previously did not, so for a recipe
    // that is not in local Dexie the tree reported "loaded, empty" while its
    // variations were still in flight — which is what actually rendered the
    // page's dead-end state mid-load.
    isLoading: localRecipes === undefined || !cloudSettled,
  };
}
