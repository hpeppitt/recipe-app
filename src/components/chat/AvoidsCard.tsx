import { useState } from 'react';
import { Button } from '../ui/Button';
import { normaliseAvoid, TASTE_TERM_MAX } from '../../lib/taste';

const COMMON = ['Peanuts', 'Tree nuts', 'Dairy', 'Gluten', 'Shellfish', 'Pork', 'Alcohol', 'Very spicy'];

/** The first-time "Anything the kitchen should avoid?" card above the composer (RL-234). Does not block typing. */
export function AvoidsCard({
  onSave,
  onSkip,
}: {
  onSave: (terms: string[]) => Promise<void>;
  onSkip: () => Promise<void>;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [other, setOther] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const custom = other === null ? '' : normaliseAvoid(other);
  const terms = custom ? [...picked, custom] : picked;
  const duplicate = !!custom && picked.some((p) => p.toLowerCase() === custom.toLowerCase());

  const run = async (go: () => Promise<void>) => {
    setBusy(true);
    setMessage('');
    try {
      await go();
    } catch {
      setMessage("Couldn't save that. Try again.");
      setBusy(false);
    }
  };

  const chip = (on: boolean) =>
    `min-h-11 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 px-3.5 text-[13px] ${on ? 'bg-accent-2-700 text-accent-2-100' : 'bg-neutral-100 text-neutral-800 shadow-[inset_0_0_0_1px_var(--color-divider)]'}`;

  return (
    <section
      aria-labelledby="avoids-heading"
      className="mx-auto mb-2 flex max-w-lg min-w-0 flex-col gap-2.5 rounded-[24px] bg-accent-2-100 px-4 py-3.5"
    >
      <h2 id="avoids-heading" className="font-heading text-lg text-accent-2-900">Anything the kitchen should avoid?</h2>
      <p className="text-[13px] text-neutral-800">
        We'll ask the AI to leave these out. Always check the ingredients if it's an allergy.
      </p>
      <div className="flex flex-wrap gap-2">
        {COMMON.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={picked.includes(t)}
            className={chip(picked.includes(t))}
            onClick={() => setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]))}
          >
            {t}
          </button>
        ))}
        <button type="button" aria-pressed={other !== null} className={chip(other !== null)} onClick={() => setOther(other === null ? '' : null)}>
          Something else
        </button>
      </div>
      {other !== null && (
        <div>
          <input
            aria-label="Something else to avoid"
            aria-invalid={duplicate}
            aria-describedby={duplicate ? 'avoids-error' : undefined}
            placeholder="e.g. coriander"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !busy && !duplicate && terms.length > 0) {
                e.preventDefault();
                void run(() => onSave(terms));
              }
            }}
            maxLength={TASTE_TERM_MAX}
            value={other}
            onChange={(e) => setOther(e.target.value)}
            className="min-h-11 w-full rounded-full border border-border bg-surface px-3 text-text-primary"
          />
          {duplicate && <p id="avoids-error" role="alert" className="mt-1 text-sm text-danger-700">That one is already picked.</p>}
        </div>
      )}
      {message && (
        <p role="alert" className="text-sm text-danger-700">
          {message}
        </p>
      )}
      <div className="flex gap-2">
        <Button size="sm" disabled={busy || duplicate || terms.length === 0} onClick={() => run(() => onSave(terms))}>
          {busy ? 'Saving...' : 'Save'}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(onSkip)}>
          Skip
        </Button>
      </div>
    </section>
  );
}
