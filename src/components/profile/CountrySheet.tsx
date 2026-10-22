import { useId, useState } from 'react';
import { Sheet } from '../ui/Sheet';
import { Input } from '../ui/Input';
import { Check } from '../ui/icons';
import { COUNTRY_CODES, countryName, flagEmoji } from '../../lib/country';

interface CountrySheetProps {
  onClose: () => void;
  /** The saved code, or null for No flag. */
  current: string | null;
  /** Resolves when saved; rejects (or throws) when not, which keeps the sheet open. */
  onSave: (code: string | null) => Promise<void>;
}

const ROW =
  'flex min-h-[52px] w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] text-text-primary hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 aria-disabled:opacity-60';

/** Mount it to open it: the search and error reset each time. */
export function CountrySheet({ onClose, current, onSave }: CountrySheetProps) {
  const headingId = useId();
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const q = query.trim().toLowerCase();
  const rows = COUNTRY_CODES.map((code) => ({ code, name: countryName(code) })).filter((c) =>
    c.name.toLowerCase().includes(q),
  );
  const showNoFlag = !q || 'no flag'.includes(q);
  const count = rows.length;

  const choose = async (code: string | null) => {
    if (saving) return;
    setSaving(true);
    setError(false);
    try {
      await onSave(code);
      onClose();
    } catch {
      setError(true);
      setSaving(false);
    }
  };

  const row = (code: string | null, label: string, flag: string) => (
    <li key={code ?? 'none'}>
      <button
        type="button"
        className={ROW}
        aria-disabled={saving || undefined}
        aria-current={current === code ? 'true' : undefined}
        onClick={() => choose(code)}
      >
        <span aria-hidden="true" className="w-7 min-w-7 shrink-0 text-center text-[22px]">{flag}</span>
        <span className="min-w-0 flex-1 break-words">{label}</span>
        {current === code && <Check className="size-5 shrink-0 text-primary-600" />}
        {current === code && <span className="sr-only">Selected</span>}
      </button>
    </li>
  );

  return (
    <Sheet open onClose={() => !saving && onClose()} labelledBy={headingId}>
      <div className="sticky -top-3 z-10 -mx-[22px] -mt-3 flex flex-col gap-4 bg-surface px-[22px] pb-2 pt-3">
        <h2 id={headingId} className="font-heading text-[22px] text-text-primary">Where do you cook?</h2>
        <Input
          type="search"
          aria-label="Search countries"
          placeholder="Search countries"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {saving ? 'Saving...' : count > 0 ? `${count} ${count === 1 ? 'country' : 'countries'}` : 'No countries match'}
      </p>
      {error && <p role="alert" className="text-sm text-danger-700">Couldn't save that. Try again.</p>}
      <ul className="-mx-3 flex flex-col">
        {showNoFlag && row(null, 'No flag', '')}
        {rows.map((c) => row(c.code, c.name, flagEmoji(c.code)))}
      </ul>
      {!showNoFlag && rows.length === 0 && <p className="text-sm text-text-tertiary">No countries match.</p>}
    </Sheet>
  );
}
