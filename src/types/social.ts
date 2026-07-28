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

export interface AppNotification {
  id: string;
  recipientUid: string;
  /**
   * `suggestion_approved` / `suggestion_rejected` close the loop back to the
   * suggester, who previously never learned what happened to their suggestion.
   */
  type: 'favorite' | 'suggestion' | 'suggestion_approved' | 'suggestion_rejected';
  recipeId: string;
  recipeTitle: string;
  recipeEmoji: string;
  fromUid: string;
  fromDisplayName: string | null;
  message: string | null;
  read: boolean;
  createdAt: number;
}
