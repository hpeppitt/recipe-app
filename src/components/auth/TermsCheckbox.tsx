// inline-block with padding gives a touch target near 44px tall without a heavier look.
export const LEGAL_LINK =
  'inline-block py-2 px-1 underline text-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500';

/** New tab so a half-finished sign-up survives. */
export function LegalLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={LEGAL_LINK}>
      {children}
    </a>
  );
}

/**
 * The required acceptance box on every email form (RL-047). Unticked by default;
 * the form keeps its send button disabled until it is ticked. `invalid` marks it
 * after a submit attempt without it, e.g. Enter in the email field.
 */
export function TermsCheckbox({
  checked,
  onChange,
  disabled = false,
  invalid = false,
  describedBy,
  autoFocus = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  invalid?: boolean;
  /** Id of the TermsHint, while it shows. */
  describedBy?: string;
  /** For a sheet whose first control is this box (Google on, RL-188). */
  autoFocus?: boolean;
}) {
  return (
    // The whole row is the label, so the tap target is the full width and at least 44px tall.
    <label className={`flex items-start gap-2 min-h-11 py-1 text-xs text-text-secondary cursor-pointer ${disabled ? 'opacity-50' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        required
        aria-required="true"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoFocus={autoFocus}
        className={`mt-2 h-5 w-5 shrink-0 rounded accent-primary-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 ${
          invalid ? 'outline-2 outline-offset-2 outline-danger-500' : ''
        }`}
      />
      <span>
        I accept the <LegalLink href="/terms">Terms of Service</LegalLink> and have read the{' '}
        <LegalLink href="/privacy">Privacy Policy</LegalLink>
      </span>
    </label>
  );
}

/**
 * Says why the send button is disabled. Render it only while the box is unticked and point
 * both the box and the button at it with aria-describedby.
 */
export function TermsHint({ id }: { id: string }) {
  return (
    <p id={id} className="text-xs text-text-tertiary">
      Tick the box above to continue.
    </p>
  );
}
