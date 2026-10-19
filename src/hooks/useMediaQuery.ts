import { useCallback, useSyncExternalStore } from 'react';

const hasMatchMedia = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function';

/** Live result of a CSS media query. False on the server and where matchMedia is missing (jsdom). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!hasMatchMedia()) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query]
  );
  return useSyncExternalStore(
    subscribe,
    () => hasMatchMedia() && window.matchMedia(query).matches,
    () => false
  );
}
