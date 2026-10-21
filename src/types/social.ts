export interface SuggestionEdit {
  kind: 'ingredient' | 'step' | 'general';
  /** Position in the recipe when suggested: ingredients[index] or instructions[index]. Absent for general. */
  index?: number;
  /** Ingredient only: the name when suggested, so the diff row and the stale check do not depend on the index. */
  name?: string;
  /** ingredient: old amount as shown ("150 g", "" when none); step: old step text; general: "". */
  from: string;
  /** ingredient: new amount as typed ("100 g"); step: new step text; general: the note. */
  to: string;
  why?: string;
}

export interface Suggestion {
  id: string;
  recipeId: string;
  recipeOwnerId: string;
  recipeTitle: string;
  /** Optional: suggestions written before outcome notifications existed lack it. */
  recipeEmoji?: string;
  suggestedBy: { uid: string; displayName: string | null };
  message: string;
  /** Stored values; shown as Open, Approved (old documents only), Declined, Applied, Branched. */
  status: 'pending' | 'approved' | 'rejected' | 'applied' | 'branched';
  /** Absent on free-text suggestions; `message` is always written too. */
  edits?: SuggestionEdit[];
  /** The branch Keep as branch created; set with status `branched`. */
  branchId?: string;
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
   * `suggestion_applied` / `suggestion_branched` replace approval (RL-148); a
   * branched one's `recipeId` is the new branch and `recipeTitle` the parent's.
   */
  type:
    | 'favorite'
    | 'suggestion'
    | 'suggestion_approved'
    | 'suggestion_rejected'
    | 'suggestion_applied'
    | 'suggestion_branched'
    | 'suggestion_reply'
    | 'follow'
    // RL-153: someone branched your recipe; recipeId is the branch, recipeTitle the parent's.
    | 'branch'
    // RL-159: the parent of your branch was deleted, so it moved up a level. recipeId and
    // recipeTitle are your branch; message is the sender's text for the deleted version's title.
    | 'moved';
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

/** A public cook record (`cooks/{id}`); fields match isWellFormedCook in firestore.rules (RL-194). */
export interface Cook {
  id: string;
  uid: string;
  displayName: string | null;
  recipeId: string;
  rootId: string;
  recipeOwnerId: string;
  vote: 'again' | 'tweak';
  /** At most 500 characters. */
  note: string | null;
  /** Set once, to the cook's own branch made from the note. */
  branchId: string | null;
  createdAt: number;
}
