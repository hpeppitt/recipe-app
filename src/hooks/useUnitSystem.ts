import { useCallback, useEffect, useState } from 'react';
import { getUnitSystem, setUnitSystem as persist } from '../services/storage';
import type { UnitSystem } from '../lib/units';

/**
 * The display unit preference, shared across every screen.
 *
 * Kept in sync between mounted components through a window event rather than a
 * context: changing it in Settings has to affect a recipe page that is already
 * rendered, and the alternative was threading a provider through the whole tree
 * for one string.
 */
const CHANGE_EVENT = 'recipe-lab:unit-system';

export function useUnitSystem() {
  const [system, setSystem] = useState<UnitSystem>(getUnitSystem);

  useEffect(() => {
    const onChange = () => setSystem(getUnitSystem());
    window.addEventListener(CHANGE_EVENT, onChange);
    // `storage` covers the same preference changed in another tab.
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  const change = useCallback((next: UnitSystem) => {
    persist(next);
    setSystem(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { unitSystem: system, setUnitSystem: change };
}
