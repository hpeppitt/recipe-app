/**
 * Copy for the one silent data-loss path this app has.
 *
 * When an anonymous account is upgraded to an email account that already exists,
 * Firebase signs the user in under the *existing* uid. Local recipes follow them
 * (Dexie has no rules), but the cloud copies cannot: `firestore.rules` requires
 * `createdBy.uid` to be unchanged on every recipe update, so reassigning
 * ownership from the browser is denied — correctly, since a rule permissive
 * enough to allow it would let anyone claim anyone's recipes.
 *
 * The real fix is server-side (Admin SDK, which bypasses rules). That needs the
 * Blaze plan, which has been declined until abuse appears, so this notice is the
 * permanent answer rather than a placeholder — it has to name a real route to a
 * human.
 */

/** Recorded when a cloud migration leaves published recipes behind. */
export interface StrandedIdentity {
  /** The uid the recipes are still filed under. */
  oldUid: string;
  /** The name they were published as, e.g. "CrispyWaffle". */
  oldDisplayName: string | null;
  /** How many published recipes stayed behind. Never 0 — see shouldNotify. */
  recipeCount: number;
  /** When the migration was attempted. */
  at: number;
}

export interface StrandedNotice {
  title: string;
  body: string;
  /** mailto: link, prefilled so the user does not have to explain the problem. */
  contactHref: string;
}

/**
 * Whether a failed migration is worth telling the user about.
 *
 * A user who published nothing under the old identity has lost nothing, and a
 * notice would be pure alarm. This is the gate, not a UI concern, so it is
 * testable.
 */
export function shouldNotify(outcome: {
  ok: boolean;
  strandedRecipes: number;
}): boolean {
  return !outcome.ok && outcome.strandedRecipes > 0;
}

/**
 * Builds the user-facing copy.
 *
 * Deliberately states what is true rather than apologising: the recipes still
 * exist and are still readable, they are simply filed under the old name. It
 * does not promise a fix, because there is no client-side one, and it does not
 * suggest re-publishing, which would duplicate them in the shared library.
 */
export function describeStrandedIdentity(
  stranded: StrandedIdentity,
  supportEmail: string
): StrandedNotice {
  const name = stranded.oldDisplayName ?? 'your previous account';
  const count = stranded.recipeCount;
  const plural = count === 1 ? 'recipe' : 'recipes';

  const subject = `Move ${count} ${plural} to my account`;
  const bodyLines = [
    `${count} ${plural} published as ${name} did not move to my new account.`,
    '',
    `Previous account id: ${stranded.oldUid}`,
  ];

  return {
    title: `${count} ${plural} stayed under ${name}`,
    body:
      `They are still published and still readable — they are filed under your ` +
      `previous name, not this account, so they will not show up as yours. ` +
      `Moving them needs a hand from us.`,
    contactHref:
      `mailto:${supportEmail}` +
      `?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(bodyLines.join('\n'))}`,
  };
}
