import { useState } from 'react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Check } from '../ui/icons';

interface ReceiptSheetProps {
  /** The items read off the receipt; null keeps the sheet closed. */
  items: string[] | null;
  onClose: () => void;
  /** Adds the ticked items in one write; the caller closes the sheet on success. */
  onAdd: (items: string[]) => void;
  /** A kitchen write is running. */
  busy: boolean;
  error?: string | null;
}

/** The receipt confirm sheet (RL-241): every item starts ticked; untick what you did not buy. */
export function ReceiptSheet({ items, onClose, ...rest }: ReceiptSheetProps) {
  return (
    <Sheet open={items !== null} onClose={onClose} labelledBy="receipt-title">
      {items && <Body items={items} {...rest} />}
    </Sheet>
  );
}

function Body({ items, onAdd, busy, error }: Omit<ReceiptSheetProps, 'onClose'> & { items: string[] }) {
  const [off, setOff] = useState<ReadonlySet<string>>(new Set());
  const picked = items.filter((i) => !off.has(i));
  const n = picked.length;
  const toggle = (i: string) =>
    setOff((prev) => {
      const next = new Set(prev);
      if (!next.delete(i)) next.add(i);
      return next;
    });

  return (
    <>
      <h2 id="receipt-title" className="font-heading text-2xl text-text-primary">
        From your receipt
      </h2>
      {/* Only the chips scroll, so Add stays in view on a long receipt. */}
      <ul className="flex max-h-[45dvh] min-h-0 flex-1 flex-wrap content-start gap-2 overflow-y-auto">
        {items.map((i) => {
          const on = !off.has(i);
          return (
            <li key={i} className="max-w-full">
              <button
                type="button"
                aria-pressed={on}
                onClick={() => toggle(i)}
                className={`inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full px-3.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 ${on ? 'bg-accent-200 text-accent-900' : 'border border-border-strong bg-neutral-100 text-neutral-700'}`}
              >
                {on && <Check className="size-3.5 shrink-0" />}
                <span className="min-w-0 break-words text-left">{i}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p role="status" aria-live="polite" className="text-[13px] text-text-secondary">
        {`${n} of ${items.length} selected`}
      </p>
      {error && (
        <p role="alert" className="text-[13px] text-danger-600">
          {error}
        </p>
      )}
      <Button fullWidth className="min-h-[52px]" disabled={n === 0 || busy} onClick={() => onAdd(picked)}>
        {n === 0 ? 'Select items to add' : `Add ${n} to the pantry`}
      </Button>
    </>
  );
}
