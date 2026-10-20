import { useEffect, useRef, useState } from 'react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Plus, Sparkles, X } from '../ui/icons';
import { PANTRY_TIMES, pantryItems, type PantryTimeId } from '../../lib/library';

const OPTIONS = PANTRY_TIMES.map((t) => ({ value: t.id, label: t.label }));

interface PantrySheetProps {
  open: boolean;
  onClose: () => void;
  /** The filter already applied, so the sheet reopens as it was left. */
  items: string[];
  time: PantryTimeId;
  /** How many recipes the draft would show, counted by the caller from Search's own data. */
  count: (items: string[], time: PantryTimeId) => number;
  onShow: (items: string[], time: PantryTimeId) => void;
  /** Omitted in local-only mode, which cannot generate. */
  onWrite?: (items: string[], time: PantryTimeId) => void;
  /** The shared library is still loading, so the count may grow. */
  partial?: boolean;
}

/** The 1c "What have you got?" sheet (RL-169). The body mounts on open, so its draft restarts from the applied filter. */
export function PantrySheet({ open, onClose, ...rest }: PantrySheetProps) {
  return (
    <Sheet open={open} onClose={onClose} labelledBy="pantry-title">
      {open && <Body {...rest} />}
    </Sheet>
  );
}

function Body({ items: initial, time: initialTime, count, onShow, onWrite, partial }: Omit<PantrySheetProps, 'open' | 'onClose'>) {
  const [items, setItems] = useState(initial);
  const [time, setTime] = useState(initialTime);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const escaped = useRef(false);
  const [announced, setAnnounced] = useState('');

  // showModal() (Sheet's effect, which runs after this one) would focus Reset, first in the DOM;
  // the first chip or Add is the start point, so focus after it.
  useEffect(() => {
    const t = setTimeout(() => wrapRef.current?.querySelector('button')?.focus(), 0);
    return () => clearTimeout(t);
  }, []);
  // Only Escape sends focus back to Add; a blur must leave it where the user went.
  useEffect(() => {
    if (!adding && escaped.current) addRef.current?.focus();
    escaped.current = false;
  }, [adding]);

  // A pasted "eggs, feta" is two items; a half-typed draft counts as typed.
  const withDraft = pantryItems([...items, ...draft.split(',')]);
  const add = () => {
    setItems(withDraft);
    setDraft('');
  };
  const n = count(withDraft, time);
  const empty = withDraft.length === 0;
  const label = empty ? 'Add an ingredient' : n === 0 ? 'Show recipes' : `Show ${n} ${n === 1 ? 'recipe' : 'recipes'}${partial ? ' so far' : ''}`;
  // Debounced, so typing does not read out every count.
  useEffect(() => {
    const t = setTimeout(() => setAnnounced(empty ? '' : label), 400);
    return () => clearTimeout(t);
  }, [label, empty]);
  const pill = 'inline-flex h-11 items-center rounded-full text-sm';
  const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500';

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h2 id="pantry-title" className="font-heading text-2xl text-text-primary">
          What have you got?
        </h2>
        <button
          type="button"
          onClick={() => {
            setItems([]);
            setTime('any');
          }}
          className={`min-h-11 rounded-full px-2 text-[13px] font-semibold text-accent-700 ${focus}`}
        >
          Reset
        </button>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold text-neutral-700">Ingredients</p>
        <div ref={wrapRef} className="flex flex-wrap gap-2">
          {items.map((it) => (
            <button
              key={it}
              type="button"
              aria-label={`Remove ${it}`}
              onClick={() => setItems(items.filter((x) => x !== it))}
              className={`${pill} max-w-full gap-2 bg-accent-200 py-[7px] pl-3.5 pr-2.5 text-accent-900 ${focus}`}
            >
              <span className="min-w-0 truncate">{it}</span>
              <X className="size-3.5 shrink-0" />
            </button>
          ))}
          {adding ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  add();
                } else if (e.key === 'Escape') {
                  // Cancels the field only; a second Escape closes the sheet.
                  e.preventDefault();
                  e.stopPropagation();
                  setDraft('');
                  escaped.current = true;
                  setAdding(false);
                }
              }}
              onBlur={() => !draft.trim() && setAdding(false)}
              aria-label="Add an ingredient"
              enterKeyHint="done"
              className={`${pill} w-40 border-[1.5px] border-dashed border-neutral-500 bg-transparent px-3.5 text-neutral-800 focus:outline-2 focus:outline-offset-2 focus:outline-primary-500`}
            />
          ) : (
            <button
              ref={addRef}
              type="button"
              onClick={() => setAdding(true)}
              className={`${pill} gap-1.5 border-[1.5px] border-dashed border-neutral-500 px-3.5 text-neutral-800 ${focus}`}
            >
              <Plus className="size-3.5" />
              Add
            </button>
          )}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold text-neutral-700">Time</p>
        <SegmentedControl label="Time" options={OPTIONS} value={time} onChange={setTime} />
      </div>

      <div role="status" className="sr-only">
        {announced}
      </div>

      <div className="sticky -bottom-7 -mx-[22px] flex flex-col gap-1.5 bg-surface px-[22px] pb-7 pt-2">
        <Button fullWidth className="min-h-[52px]" disabled={empty} onClick={() => onShow(withDraft, time)}>
          {label}
        </Button>
        {onWrite && (
          <Button variant="ghost" fullWidth className="min-h-11 gap-1.5" onClick={() => onWrite(withDraft, time)}>
            <Sparkles className="size-4" />
            Or write a new one with these
          </Button>
        )}
      </div>
    </>
  );
}
