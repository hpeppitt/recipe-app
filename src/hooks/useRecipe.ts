import { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getRecipe } from '../db/recipes';
import { collectSubtreeIds } from '../lib/tree';
import { useRecipeTree } from './useRecipeTree';
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

  // Stamped with the id the result belongs to, rather than a bare boolean.
  // React reuses this component across a param change, so a plain `cloudChecked`
  // stayed true from the previous recipe for the one render before the reset
  // effect ran — long enough to flash a confident "Recipe not found" (~69ms,
  // measured) before the new recipe resolved.
  const [cloud, setCloud] = useState<{
    id: string | undefined;
    recipe: Recipe | null;
    error: boolean;
  }>({ id: undefined, recipe: null, error: false });

  // Derived, so a stale result can never be read as this id's answer.
  const cloudChecked = cloud.id === id;
  const cloudRecipe = cloudChecked ? cloud.recipe : null;
  const cloudError = cloudChecked ? cloud.error : false;
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setCloud({ id: undefined, recipe: null, error: false });
  }, [id, reloadKey]);

  // Fall back to Firestore only once Dexie has definitively said "not here".
  useEffect(() => {
    // localSettled is the whole point: before it is true we genuinely do not know
    // whether the recipe is local, so consulting the cloud would be premature.
    if (!id || !localSettled || localRecipe !== undefined || cloudChecked) return;

    // Local-only mode: there is no cloud to consult, so the lookup is complete.
    // Without this the page sat on a loading skeleton forever for a missing recipe.
    if (!isFirebaseConfigured) {
      setCloud({ id, recipe: null, error: false });
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
          setCloud({ id, recipe: null, error: true });
          return;
        }
        const published = result.published;
        if (published) {
          // Convert SharedRecipe to Recipe-like shape for display
          setCloud({
            id,
            error: false,
            recipe: {
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
            } as Recipe,
          });
          return;
        }
        setCloud({ id, recipe: null, error: false });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Loading the published recipe failed', err);
        setCloud({ id, recipe: null, error: true });
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

/**
 * Children, ancestors and full descendant count for a recipe, across both stores.
 *
 * Replaces separate Dexie-only `useRecipeChildren`/`useRecipeAncestors` hooks.
 * Those read local IndexedDB exclusively, so a recipe browsed from the shared
 * feed had no variations carousel and a lineage breadcrumb that rendered a bare
 * "Prompt:" quote with no parent to attribute it to — FUN-11 merged cloud data
 * into `useRecipeTree` only, and this is the half it missed.
 *
 * Derived from `useRecipeTree` rather than issuing its own queries: that hook
 * already merges the local and published tree for this root, so lineage and the
 * tree view cannot disagree about what exists.
 */
export function useRecipeLineage(recipe: Recipe | undefined) {
  const { recipes, isLoading } = useRecipeTree(recipe?.rootId);

  const children = useMemo(
    () => (recipe ? recipes.filter((r) => r.parentId === recipe.id) : []),
    [recipes, recipe]
  );

  const ancestors = useMemo(() => {
    if (!recipe) return [];
    const byId = new Map(recipes.map((r) => [r.id, r]));
    const chain: Recipe[] = [];
    const seen = new Set<string>([recipe.id]);
    let current: Recipe | undefined = recipe;
    while (current?.parentId) {
      const parent = byId.get(current.parentId);
      // Cycle guard: a corrupted parentId chain would otherwise spin forever.
      if (!parent || seen.has(parent.id)) break;
      seen.add(parent.id);
      chain.unshift(parent);
      current = parent;
    }
    return chain;
  }, [recipes, recipe]);

  /**
   * Every descendant, not just direct children. The delete warning counted
   * `children.length` while `deleteRecipeTree` removes the whole subtree, so it
   * undercounted whenever a variation had its own variation.
   */
  const descendantCount = useMemo(() => {
    if (!recipe) return 0;
    const nodes = recipes.map((r) => ({ id: r.id, parentId: r.parentId }));
    return Math.max(0, collectSubtreeIds(nodes, recipe.id).length - 1);
  }, [recipes, recipe]);

  return { children, ancestors, descendantCount, isLoading };
}
