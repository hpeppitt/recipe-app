import { useSyncExternalStore } from 'react';
import {
  getConsent,
  isPostHogConfigured,
  onConsentChange,
  setAnalyticsConsent,
} from '../services/analytics';
import { isGranted, shouldShowBanner } from '../lib/consent';

/** Banner and Settings read the same module state, so they stay in sync. */
export function useConsent() {
  const choice = useSyncExternalStore(onConsentChange, getConsent);
  return {
    configured: isPostHogConfigured(),
    granted: isGranted(choice),
    showBanner: shouldShowBanner(isPostHogConfigured(), choice),
    setConsent: setAnalyticsConsent,
  };
}
