import type { Suggestion } from '../types/social';

/**
 * Who should be told about a reply: whichever participant did not write it.
 *
 * A reply thread has two sides and either may speak, so the recipient cannot be
 * hardcoded to the owner or the suggester. Getting this backwards would notify
 * the author of their own message and leave the other side unaware, which is the
 * failure that makes a thread feel broken rather than merely quiet.
 *
 * Returns null when the two sides are the same person, which happens when an
 * owner suggests a change on their own recipe. Self-notification is noise.
 */
export function replyRecipient(suggestion: Suggestion, fromUid: string): string | null {
  const other =
    fromUid === suggestion.recipeOwnerId
      ? suggestion.suggestedBy.uid
      : suggestion.recipeOwnerId;
  return other === fromUid ? null : other;
}
