// inline-block with padding gives a touch target near 44px tall without a heavier look.
const LINK =
  'inline-block py-2 px-1 underline text-primary-700 dark:text-primary-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500';

/**
 * A pointer to the policies, not an agreement: nothing records acceptance until RL-047,
 * so the wording must not say "you agree". New tab so a half-finished sign-up survives.
 */
export function LegalLinks() {
  return (
    <p className="text-xs text-text-tertiary">
      Read our{' '}
      <a href="/terms" target="_blank" rel="noopener noreferrer" className={LINK}>
        Terms of Service
      </a>{' '}
      and{' '}
      <a href="/privacy" target="_blank" rel="noopener noreferrer" className={LINK}>
        Privacy Policy
      </a>
      .
    </p>
  );
}
