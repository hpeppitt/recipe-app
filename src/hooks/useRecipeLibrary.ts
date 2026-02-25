import { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getCoreRecipes } from '../db/recipes';
import { getAllPublishedRecipes, type PublishedRecipe } from '../services/firestore';
import { isFirebaseConfigured } from '../services/firebase';
import type { RecipeWithChildren } from '../types/recipe';

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
  createdBy: { uid: string; displayName: string | null };
  childCount: number;
  createdAt: number;
}

export function useRecipeLibrary(searchQuery: string = '', favoriteIds?: Set<string>) {
  const localRecipes = useLiveQuery(() => getCoreRecipes(), []);
  const [cloudRecipes, setCloudRecipes] = useState<PublishedRecipe[] | null>(null);
  const [cloudLoading, setCloudLoading] = useState(isFirebaseConfigured);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    getAllPublishedRecipes()
      .then((r) => {
        setCloudRecipes(r);
        setCloudLoading(false);
      })
      .catch(() => {
        setCloudRecipes([]);
        setCloudLoading(false);
      });
  }, []);

  // Merge local + cloud, deduplicate by ID, prefer cloud data for shared fields
  const merged = useMemo<FeedRecipe[] | undefined>(() => {
    if (localRecipes === undefined && cloudLoading) return undefined;

    const byId = new Map<string, FeedRecipe>();

    // Add local recipes first
    if (localRecipes) {
      for (const r of localRecipes) {
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
          createdBy: r.createdBy,
          childCount: r.childCount,
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
            createdBy: r.createdBy,
            childCount: 0,
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
      result = result.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return result;
  }, [merged, favoriteIds, searchQuery]);

  return {
    recipes: filtered as (RecipeWithChildren & FeedRecipe)[] | undefined,
    isLoading: merged === undefined,
  };
}
