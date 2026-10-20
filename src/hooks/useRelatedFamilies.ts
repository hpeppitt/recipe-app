import { useEffect, useState } from 'react';
import { getRelatedFamilies, type RelatedFamily } from '../services/firestore';
import { reportError } from '../services/telemetry';
import { withTimeout } from '../lib/utils';
import { useOnline } from './useOnline';

const RELATED_TIMEOUT_MS = 5000;

/** RL-163: one read per recipe view, no listener. Empty while loading, offline or on any failure. */
export function useRelatedFamilies(recipe: { id: string; depth: number; relatedFamilyId?: string | null }): RelatedFamily[] {
  const online = useOnline();
  const [state, setState] = useState<{ key: string; items: RelatedFamily[] }>({ key: '', items: [] });
  const { id, depth, relatedFamilyId } = recipe;
  const key = `${id}|${relatedFamilyId ?? ''}`;

  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    void withTimeout(
      getRelatedFamilies({ id, depth, relatedFamilyId }).catch((err: unknown) => {
        reportError(err, 'related-families');
        return [] as RelatedFamily[];
      }),
      RELATED_TIMEOUT_MS,
      [] as RelatedFamily[]
    ).then((items) => {
      if (!cancelled) setState({ key, items });
    });
    return () => {
      cancelled = true;
    };
  }, [online, id, depth, relatedFamilyId, key]);

  return online && state.key === key ? state.items : [];
}
