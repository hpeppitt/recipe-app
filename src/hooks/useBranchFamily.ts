import { useEffect, useState } from 'react';
import { getRecipeTree } from '../db/recipes';
import { getBranchChipFamily } from '../services/firestore';
import { isFirebaseConfigured } from '../services/firebase';
import type { Recipe } from '../types/recipe';

export type FamilyRow = { id: string; prompt: string; parentId: string | null };

/** How long the 6b chips wait for the family before keeping the default order for this visit. */
export const FAMILY_WAIT_MS = 500;

// Session cache per parent id, so coming back to the composer does not read again.
const cache = new Map<string, FamilyRow[]>();

const toRow = (r: Recipe): FamilyRow => ({ id: r.id, prompt: r.prompt ?? '', parentId: r.parentId ?? null });

/**
 * RL-180: the parent's family for the 6b chips. 'loading' until settled, then the rows, or null
 * when the cloud read failed or took over FAMILY_WAIT_MS (default chips, no late reorder). Device
 * rows are used straight away when they already hold a child of the parent; otherwise the bounded
 * cloud read (`getBranchChipFamily`) is awaited and merged.
 */
export function useBranchFamily(parent: Recipe | undefined): FamilyRow[] | null | 'loading' {
  const [result, setResult] = useState<{ key: string; rows: FamilyRow[] | null } | null>(null);
  const key = parent?.id ?? '';
  const rootId = parent?.rootId ?? parent?.id;

  useEffect(() => {
    if (!key || !rootId || cache.has(key)) return;
    let live = true;
    const finish = (rows: FamilyRow[] | null) => {
      if (!live) return;
      live = false;
      clearTimeout(timer);
      if (rows) cache.set(key, rows);
      setResult({ key, rows });
    };
    const timer = setTimeout(() => finish(null), FAMILY_WAIT_MS);
    getRecipeTree(rootId)
      .catch(() => [] as Recipe[])
      .then((local) => {
        const rows = local.map(toRow);
        if (!isFirebaseConfigured || rows.some((r) => r.parentId === key)) return finish(rows);
        return getBranchChipFamily(rootId, key).then(
          (cloud) => {
            const byId = new Map(cloud.map((r) => [r.id, r]));
            for (const r of rows) byId.set(r.id, r);
            finish([...byId.values()]);
          },
          () => finish(null)
        );
      });
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [key, rootId]);

  if (!key) return null;
  if (cache.has(key)) return cache.get(key)!;
  return result && result.key === key ? result.rows : 'loading';
}
