import { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getAllRecipes } from '../db/recipes';
import { countDescendantsByRoot } from '../lib/tree';
import { recipeHaystack } from '../lib/search';
import { getAllPublishedRecipes, type PublishedRecipe } from '../services/firestore';
import { isFirebaseConfigured } from '../services/firebase';
import { withTimeout } from '../lib/utils';
import type { RecipeWithChildren } from '../types/recipe';

/** How long the feed waits for the shared library before showing local only. */
const LIBRARY_CLOUD_TIMEOUT_MS = 6000;

interface FeedRecipe {
  id: string;
  parentId: string | null;
  rootId: string;
  depth: number;
  emoji: string;
  title: string;
  description: string;
  totalTime: number;
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];
  /**
   * Carried purely so search can match them. Searching "chicken" and missing
   * every recipe full of chicken is the opposite of what a recipe app should do.
   */
  ingredients: { name: string }[];
  createdBy: { uid: string; displayName: string | null };
  childCount: number;
  createdAt: number;
}

export function useRecipeLibrary(searchQuery: string = '', favoriteIds?: Set<string>) {
  // All local recipes, not just roots: the descendant counts are computed here
  // now, from local and cloud records together, so the whole set is needed.
  const localRecipes = useLiveQuery(() => getAllRecipes(), []);
  const [cloudRecipes, setCloudRecipes] = useState<PublishedRecipe[] | null>(null);
  const [cloudLoading, setCloudLoading] = useState(isFirebaseConfigured);
  // Failing to reach the shared library used to be indistinguishable from it
  // being empty, so an offline user was told "No recipes yet" (UI-12).
  const [cloudError, setCloudError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    setCloudLoading(true);
    setCloudError(false);
    // Bounded: against an unreachable backend Firestore retries rather than
    // rejecting, so a plain .catch() never fires and the feed would sit silently
    // in a partial state forever. A timeout is treated as a failure.
    withTimeout(
      getAllPublishedRecipes()
        .then((r) => ({ recipes: r }))
        .catch((err) => {
          console.error('Loading the shared library failed', err);
          return null;
        }),
      LIBRARY_CLOUD_TIMEOUT_MS,
      null as { recipes: PublishedRecipe[] } | null
    ).then((result) => {
      // Either way fall through to the local-only merge, but say so on failure.
      setCloudRecipes(result ? result.recipes : []);
      setCloudError(result === null);
      setCloudLoading(false);
    });
  }, [reloadKey]);

  // Merge local + cloud, deduplicate by ID, prefer cloud data for shared fields
  const merged = useMemo<FeedRecipe[] | undefined>(() => {
    if (localRecipes === undefined && cloudLoading) return undefined;

    const byId = new Map<string, FeedRecipe>();

    // Variation counts span both stores: a root saved locally can have
    // variations that only exist in the cloud, and vice versa. Counting one
    // store at a time is what left cloud feed entries showing zero.
    const childCounts = countDescendantsByRoot([
      ...(localRecipes ?? []).map((r) => ({ id: r.id, rootId: r.rootId })),
      ...(cloudRecipes ?? []).map((r) => ({ id: r.id, rootId: r.rootId ?? r.id })),
    ]);

    // Add local recipes first (roots only — the rest exist just for the counts)
    if (localRecipes) {
      for (const r of localRecipes) {
        if (r.parentId) continue;
        byId.set(r.id, {
          id: r.id,
          parentId: r.parentId,
          rootId: r.rootId,
          depth: r.depth,
          emoji: r.emoji,
          title: r.title,
          description: r.description,
          totalTime: r.totalTime,
          difficulty: r.difficulty,
          tags: r.tags,
          ingredients: r.ingredients ?? [],
          createdBy: r.createdBy,
          childCount: childCounts.get(r.id) ?? 0,
          createdAt: r.createdAt,
        });
      }
    }

    // Add/overlay cloud recipes (only root-level recipes for the feed)
    if (cloudRecipes) {
      for (const r of cloudRecipes) {
        if (r.parentId) continue; // Only show root recipes in the feed
        if (!byId.has(r.id)) {
          byId.set(r.id, {
            id: r.id,
            parentId: r.parentId ?? null,
            rootId: r.rootId ?? r.id,
            depth: r.depth ?? 0,
            emoji: r.emoji,
            title: r.title,
            description: r.description,
            totalTime: r.totalTime,
            difficulty: r.difficulty,
            tags: r.tags,
            ingredients: r.ingredients ?? [],
            createdBy: r.createdBy,
            childCount: childCounts.get(r.id) ?? 0,
            createdAt: r.createdAt ?? 0,
          });
        }
      }
    }

    const all = Array.from(byId.values());
    all.sort((a, b) => b.createdAt - a.createdAt);
    return all;
  }, [localRecipes, cloudRecipes, cloudLoading]);

  const filtered = useMemo<FeedRecipe[] | undefined>(() => {
    if (!merged) return undefined;
    let result = merged;
    if (favoriteIds) {
      result = result.filter((r) => favoriteIds.has(r.id));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      // Same haystack the dedup check uses, so "already exists" and "I can find
      // it" cannot disagree about what a recipe contains. Adds ingredients,
      // which title/description/tags alone were missing.
      result = result.filter((r) => recipeHaystack(r).toLowerCase().includes(q));
    }
    return result;
  }, [merged, favoriteIds, searchQuery]);

  return {
    recipes: filtered as (RecipeWithChildren & FeedRecipe)[] | undefined,
    isLoading: merged === undefined,
    /** True when the shared library could not be reached; local recipes still show. */
    cloudError,
    retryCloud: () => setReloadKey((k) => k + 1),
  };
}
