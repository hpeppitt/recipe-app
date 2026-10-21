import { useEffect, useState } from 'react';
import { db } from '../db/database';
import { reportError } from '../services/telemetry';
import type { RecipeCollection } from '../services/firestore';

/** Emoji for each collection's first four recipes, from this device only (no cloud reads). */
export function useLocalEmoji(collections: readonly RecipeCollection[], source: string): Map<string, string> {
  const [emoji, setEmoji] = useState<Map<string, string>>(new Map());
  const wanted = [...new Set(collections.flatMap((c) => c.recipeIds.slice(0, 4)))].join(',');
  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    db.recipes
      .bulkGet(wanted.split(','))
      .then((rows) => {
        if (cancelled) return;
        setEmoji(new Map(rows.flatMap((r) => (r ? [[r.id, r.emoji] as [string, string]] : []))));
      })
      .catch((err) => reportError(err, source));
    return () => {
      cancelled = true;
    };
  }, [wanted, source]);
  return emoji;
}
