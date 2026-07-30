export interface Suggestion {
  id: string;
  recipeId: string;
  recipeOwnerId: string;
  recipeTitle: string;
  /** Optional: suggestions written before outcome notifications existed lack it. */
  recipeEmoji?: string;
  suggestedBy: { uid: string; displayName: string | null };
  message: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
}

/**
 * One message in a suggestion's reply thread.
 *
 * Stored in a `messages` subcollection under the suggestion rather than as an
 * array on it, so the parent's owner-only, status-only update rule stays intact.
 * Immutable once sent: there is no edit or delete path, in the rules or the UI.
 */
export interface SuggestionMessage {
  id: string;
  fromUid: string;
  fromDisplayName: string | null;
  text: string;
  createdAt: number;
}

export interface AppNotification {
  id: string;
  recipientUid: string;
  /**
   * `suggestion_approved` / `suggestion_rejected` close the loop back to the
   * suggester, who previously never learned what happened to their suggestion.
   */
  type:
    | 'favorite'
    | 'suggestion'
    | 'suggestion_approved'
    | 'suggestion_rejected'
    | 'suggestion_reply'
    | 'follow';
  /**
   * Absent on `follow`, which is about a person rather than a recipe. Optional
   * rather than a separate type so one subscription and one list still cover
   * every notification.
   */
  recipeId?: string;
  recipeTitle?: string;
  recipeEmoji?: string;
  fromUid: string;
  fromDisplayName: string | null;
  message: string | null;
  read: boolean;
  createdAt: number;
}
