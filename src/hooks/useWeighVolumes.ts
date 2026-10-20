import { useCallback, useEffect, useState } from 'react';
import { getWeighVolumes, setWeighVolumes as persist } from '../services/storage';

/** The "Weigh spoons and liquids" preference, kept in sync like `useUnitSystem`. */
const CHANGE_EVENT = 'recipe-lab:weigh-volumes';

export function useWeighVolumes() {
  const [on, setOn] = useState(getWeighVolumes);

  useEffect(() => {
    const onChange = () => setOn(getWeighVolumes());
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  const change = useCallback((next: boolean) => {
    persist(next);
    setOn(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { weighVolumes: on, setWeighVolumes: change };
}
