import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getRecipe, getRecipeChildren, getRecipeAncestors } from '../db/recipes';
import { getPublishedRecipe } from '../services/firestore';
import { isFirebaseConfigured } from '../services/firebase';
import { withTimeout } from '../lib/utils';
import type { Recipe } from '../types/recipe';

/** How long a cloud recipe lookup waits before reporting failure. */
const RECIPE_CLOUD_TIMEOUT_MS = 6000;

export function useRecipe(id: string | undefined) {
  // Wrapping the result is what lets us tell "Dexie is still loading" (the hook
  // returns undefined) apart from "Dexie resolved and there is no such recipe"
  // ({ value: undefined }). A bare useLiveQuery collapses both to undefined,
  // which is why the cloud fallback used to guess with a 100ms setTimeout.
  const localQuery = useLiveQuery(
    async () => ({ value: id ? await getRecipe(id) : undefined }),
    [id]
  );
  const localSettled = localQuery !== undefined;
  const localRecipe = localQuery?.value;

  const [cloudRecipe, setCloudRecipe] = useState<Recipe | null>(null);
  const [cloudChecked, setCloudChecked] = useState(false);
  // A failed lookup used to be reported as "Recipe not found", which tells the
  // user their link is dead when the network is the actual problem (UI-12).
  const [cloudError, setCloudError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setCloudRecipe(null);
    setCloudChecked(false);
    setCloudError(false);
  }, [id, reloadKey]);

  // Fall back to Firestore only once Dexie has definitively said "not here".
  useEffect(() => {
    // localSettled is the whole point: before it is true we genuinely do not know
    // whether the recipe is local, so consulting the cloud would be premature.
    if (!id || !localSettled || localRecipe !== undefined || cloudChecked) return;

    // Local-only mode: there is no cloud to consult, so the lookup is complete.
    // Without this the page sat on a loading skeleton forever for a missing recipe.
    if (!isFirebaseConfigured) {
      setCloudChecked(true);
      return;
    }

    let cancelled = false;
    // Bounded for the same reason as the library feed: an unreachable Firestore
    // retries instead of rejecting, so without a deadline this never resolves
    // and the page shows a spinner indefinitely.
    withTimeout(
      getPublishedRecipe(id).then((r) => ({ published: r })),
      RECIPE_CLOUD_TIMEOUT_MS,
      null
    )
      .then((result) => {
        if (cancelled) return;
        if (result === null) {
          console.error('Timed out loading the published recipe');
          setCloudError(true);
          setCloudChecked(true);
          return;
        }
        const published = result.published;
        if (published) {
          // Convert SharedRecipe to Recipe-like shape for display
          setCloudRecipe({
            ...published,
            parentId: (published as Record<string, unknown>).parentId as string | null ?? null,
            rootId: ((published as Record<string, unknown>).rootId as string) ?? id,
            depth: ((published as Record<string, unknown>).depth as number) ?? 0,
            collaborators: (published as Record<string, unknown>).collaborators as Recipe['collaborators'] ?? [],
            // Published docs do carry the prompt — publishRecipe strips only
            // chatHistory — and the tree and lineage views display it.
            prompt: ((published as Record<string, unknown>).prompt as string) ?? '',
            chatHistory: [],
            createdAt: ((published as Record<string, unknown>).createdAt as number) ?? 0,
            updatedAt: ((published as Record<string, unknown>).updatedAt as number) ?? 0,
          } as Recipe);
        }
        setCloudChecked(true);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Loading the published recipe failed', err);
        setCloudError(true);
        setCloudChecked(true);
      });

    // Guards a late response landing after the id changed, which the old
    // clearTimeout happened to cover.
    return () => {
      cancelled = true;
    };
  }, [id, localSettled, localRecipe, cloudChecked]);

  const recipe = localRecipe ?? cloudRecipe ?? undefined;

  return {
    recipe,
    // Which store the recipe came from. Callers need this to tell "on my device,
    // so mine to delete" apart from "someone else's published recipe" — the
    // createdBy uid alone can't distinguish a pre-auth 'local' recipe of mine
    // from a published one that merely carries the same placeholder uid.
    source: localRecipe ? ('local' as const) : cloudRecipe ? ('cloud' as const) : undefined,
    isLoading: id ? recipe === undefined && !cloudChecked : false,
    /** The cloud lookup failed, so absence does NOT mean the recipe is gone. */
    cloudError,
    retry: () => setReloadKey((k) => k + 1),
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
