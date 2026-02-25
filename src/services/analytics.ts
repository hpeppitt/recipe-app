import { getAnalytics, logEvent as fbLogEvent, setUserId as fbSetUserId, type Analytics } from 'firebase/analytics';
import { isFirebaseConfigured } from './firebase';

let analytics: Analytics | null = null;

function getAnalyticsInstance(): Analytics | null {
  if (!isFirebaseConfigured || !import.meta.env.VITE_FIREBASE_MEASUREMENT_ID) return null;
  if (!analytics) {
    try {
      analytics = getAnalytics();
    } catch {
      return null;
    }
  }
  return analytics;
}

function logEvent(name: string, params?: Record<string, string | number | boolean>) {
  const instance = getAnalyticsInstance();
  if (!instance) return;
  fbLogEvent(instance, name, params);
}

// User-ID
export function setAnalyticsUserId(uid: string | null) {
  const instance = getAnalyticsInstance();
  if (!instance) return;
  fbSetUserId(instance, uid);
}

// Auth events
export const trackSignIn = (method: 'anonymous' | 'email') =>
  logEvent('sign_in', { method });

export const trackSignOut = () =>
  logEvent('sign_out');

// Recipe events
export const trackRecipeCreated = (recipeId: string, isVariation: boolean) =>
  logEvent('recipe_created', { recipe_id: recipeId, is_variation: isVariation });

export const trackRecipeViewed = (recipeId: string) =>
  logEvent('recipe_viewed', { recipe_id: recipeId });

export const trackRecipeShared = (recipeId: string) =>
  logEvent('recipe_shared', { recipe_id: recipeId });

export const trackRecipeDeleted = (recipeId: string) =>
  logEvent('recipe_deleted', { recipe_id: recipeId });

// Social events
export const trackFavoriteToggled = (recipeId: string, isFavorite: boolean) =>
  logEvent(isFavorite ? 'recipe_favorited' : 'recipe_unfavorited', { recipe_id: recipeId });

export const trackSuggestionSubmitted = (recipeId: string) =>
  logEvent('suggestion_submitted', { recipe_id: recipeId });

export const trackSuggestionReviewed = (suggestionId: string, action: 'approved' | 'rejected') =>
  logEvent('suggestion_reviewed', { suggestion_id: suggestionId, action });

// Profile events
export const trackProfileUpdated = (field: string) =>
  logEvent('profile_updated', { field });

export const trackFollowToggled = (targetUid: string, isFollowing: boolean) =>
  logEvent(isFollowing ? 'user_followed' : 'user_unfollowed', { target_uid: targetUid });
