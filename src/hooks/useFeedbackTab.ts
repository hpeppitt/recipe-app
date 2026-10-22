import { useCallback, useEffect, useState } from 'react';
import { getFeedbackTab, setFeedbackTab as persist } from '../services/storage';

/** The "Show the feedback tab" preference (RL-287), kept in sync like `useWeighVolumes`. */
const CHANGE_EVENT = 'recipe-lab:feedback-tab';

export function useFeedbackTab() {
  const [on, setOn] = useState(getFeedbackTab);

  useEffect(() => {
    const onChange = () => setOn(getFeedbackTab());
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

  return { feedbackTab: on, setFeedbackTab: change };
}
