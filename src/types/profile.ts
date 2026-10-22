export interface UserProfile {
  uid: string;
  displayName: string | null;
  photoType: 'generated' | 'emoji' | 'uploaded';
  photoEmoji: string | null;
  photoBgColor: string | null;
  photoURL: string | null;
  /** Absent or null when unset; read through `cleanBio`, the live rules do not bound it yet. */
  bio?: string | null;
  /** ISO 3166-1 alpha-2 code; null means No flag, absent means never set. Read through `isCountryCode`. */
  country?: string | null;
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
