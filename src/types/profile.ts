export interface UserProfile {
  uid: string;
  displayName: string | null;
  photoType: 'generated' | 'emoji' | 'uploaded';
  photoEmoji: string | null;
  photoBgColor: string | null;
  photoURL: string | null;
  recipeCount: number;
  followerCount: number;
  followingCount: number;
  createdAt: number;
}

export interface Follow {
  followerId: string;
  followingId: string;
  followerDisplayName: string | null;
  createdAt: number;
}
