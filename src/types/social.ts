export interface Suggestion {
  id: string;
  recipeId: string;
  recipeOwnerId: string;
  recipeTitle: string;
  suggestedBy: { uid: string; displayName: string | null };
  message: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
}

export interface AppNotification {
  id: string;
  recipientUid: string;
  type: 'favorite' | 'suggestion';
  recipeId: string;
  recipeTitle: string;
  recipeEmoji: string;
  fromUid: string;
  fromDisplayName: string | null;
  message: string | null;
  read: boolean;
  createdAt: number;
}
