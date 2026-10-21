import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { COLLECTIONS_LOAD_FAILED_MESSAGE, useCollections } from '../../hooks/useCollections';
import { collectionCount, collectionName } from '../../lib/kitchen';
import { cn } from '../../lib/utils';
import type { RecipeCollection } from '../../services/firestore';
import { CollectionGlyph } from './CollectionGlyph';
import { useLocalEmoji } from '../../hooks/useLocalEmoji';
import { ListAddedToast, type ListToast } from '../ui/ListAddedToast';
import { Button } from '../ui/Button';
import { Check, Plus } from '../ui/icons';
import { Sheet } from '../ui/Sheet';

/** WCAG 2.2.1: a sheet opened by a pointer closes itself only if the user has not touched it. Keyboard and assistive users keep it until they leave. */
export const COLLECTION_SHEET_AUTO_CLOSE_MS = 6000;

interface CollectionSheetProps {
  open: boolean;
  /** The save was a pointer tap, so the sheet may close itself. */
  auto: boolean;
  recipeId: string;
  onClose: () => void;
}

/**
 * "Saved. Add to a collection?" (RL-223). The dialog stays mounted so focus returns to the bookmark on
 * close; the body, and with it the collections listener, exists only while open.
 */
export function CollectionSheet({ open, auto, recipeId, onClose }: CollectionSheetProps) {
  const [toast, setToast] = useState<ListToast | null>(null);
  const titleId = useId();
  return (
    <>
      <Sheet open={open} onClose={onClose} labelledBy={titleId}>
        {open && (
          <CollectionSheetBody
            titleId={titleId}
            auto={auto}
            recipeId={recipeId}
            onClose={onClose}
            onAdded={(name) => {
              setToast({ text: `Added to ${name}`, view: false });
              onClose();
            }}
          />
        )}
      </Sheet>
      <ListAddedToast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}

function CollectionSheetBody({
  titleId,
  auto,
  recipeId,
  onClose,
  onAdded,
}: {
  titleId: string;
  auto: boolean;
  recipeId: string;
  onClose: () => void;
  onAdded: (name: string) => void;
}) {
  const nameId = useId();
  const errorId = useId();
  const { collections, loading, error: hookError, retry, addToCollection, createCollection } = useCollections();
  const loadFailed = hookError === COLLECTIONS_LOAD_FAILED_MESSAGE;
  // Any hook error stops the countdown; only a failed load blocks the controls, a failed write can be tried again.
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  // Auto-close, cancelled for good by the first touch. Focus counts only once armed: the browser
  // focuses the sheet itself when it opens, which is not the user.
  const touched = useRef(false);
  const armed = useRef(false);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    armed.current = true;
    if (!auto) return;
    const t = setTimeout(() => {
      if (!touched.current) close.current();
    }, COLLECTION_SHEET_AUTO_CLOSE_MS);
    return () => clearTimeout(t);
  }, [auto]);
  // A listener error stops the countdown: the user needs time to read it.
  useEffect(() => {
    if (hookError) touched.current = true;
  }, [hookError]);
  const touch = () => {
    touched.current = true;
  };

  const emoji = useLocalEmoji(collections, 'collection-sheet-emoji');

  const run = async (label: string, work: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await work();
      onAdded(label);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setChosenId(null);
      setBusy(false);
    }
  };

  const create = (e: FormEvent) => {
    e.preventDefault();
    let label: string;
    try {
      label = collectionName(name);
    } catch (err) {
      setError((err as Error).message);
      return;
    }
    void run(label, () => createCollection(label, recipeId));
  };

  const disabled = busy || loading || loadFailed;
  const shownError = error ?? hookError;
  return (
    <div
      className="flex flex-col gap-3"
      onPointerEnter={touch}
      onMouseMove={touch}
      onClick={touch}
      onPointerDown={touch}
      onTouchStart={touch}
      onKeyDown={touch}
      onFocus={() => armed.current && touch()}
    >
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-accent-2-600 text-surface">
          <Check className="size-3.5" />
        </span>
        <h2 id={titleId} className="font-heading text-xl text-text-primary">
          Saved. Add to a collection?
        </h2>
      </div>
      {loading && (
        <>
          <span role="status" className="sr-only">
            Loading your collections
          </span>
          <div aria-hidden="true" className="flex flex-col gap-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-[72px] animate-pulse rounded-[22px] bg-surface-secondary" />
            ))}
          </div>
        </>
      )}
      {!loading && collections.length > 0 && (
        <ul className="flex flex-col gap-2">
          {collections.map((c) => (
            <li key={c.id}>
              <Row
                collection={c}
                recipeId={recipeId}
                emoji={emoji}
                chosen={chosenId === c.id}
                disabled={disabled}
                onPick={() => {
                  setChosenId(c.id);
                  return run(c.name, () => addToCollection(c.id, recipeId));
                }}
              />
            </li>
          ))}
        </ul>
      )}
      {creating ? (
        <form onSubmit={create} className="flex items-center gap-2">
          <label htmlFor={nameId} className="sr-only">
            Collection name
          </label>
          <input
            id={nameId}
            autoFocus
            value={name}
            disabled={busy}
            aria-invalid={!!shownError}
            aria-describedby={shownError ? errorId : undefined}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            placeholder="Name your collection"
            className={cn('min-h-11 min-w-0 flex-1 rounded-full border bg-neutral-100 px-4 text-sm text-text-primary', shownError ? 'border-danger-600' : 'border-neutral-400')}
          />
          <Button type="submit" disabled={disabled} className="shrink-0">
            Create
          </Button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          disabled={disabled}
          className="flex min-h-11 items-center gap-2 self-start text-sm font-semibold text-accent-700 disabled:opacity-45"
        >
          <Plus className="size-4" />
          New collection
        </button>
      )}
      {shownError && (
        <p id={errorId} role="alert" className="text-sm text-danger-600">
          {shownError}
        </p>
      )}
      {loadFailed && (
        <Button type="button" variant="secondary" onClick={retry} className="self-center">
          Retry
        </Button>
      )}
      <Button type="button" variant="ghost" onClick={onClose} className="self-center">
        Not now
      </Button>
    </div>
  );
}

function Row({
  collection,
  recipeId,
  emoji,
  chosen,
  disabled,
  onPick,
}: {
  collection: RecipeCollection;
  recipeId: string;
  emoji: Map<string, string>;
  chosen: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  const n = collection.recipeIds.length;
  const already = collection.recipeIds.includes(recipeId);
  return (
    <button
      type="button"
      aria-label={already ? `Already in ${collection.name}, ${collectionCount(n)}` : `Add to ${collection.name}, ${collectionCount(n)}`}
      disabled={disabled || already}
      onClick={onPick}
      className={cn(
        'flex w-full items-center gap-3 rounded-[22px] px-3 py-2.5 text-left disabled:opacity-60',
        chosen ? 'bg-accent-100 shadow-[inset_0_0_0_2px_var(--color-accent)]' : 'bg-surface-secondary'
      )}
    >
      <CollectionGlyph collection={collection} emoji={emoji} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold text-text-primary">{collection.name}</span>
        <span aria-hidden="true" className="block text-xs text-neutral-700">
          {collectionCount(n)}
          {already && ' · Already in'}
        </span>
      </span>
      <span
        aria-hidden="true"
        className={cn('size-[22px] shrink-0 rounded-full', chosen ? 'bg-accent shadow-[inset_0_0_0_5px_var(--color-accent-100)]' : 'bg-surface shadow-[inset_0_0_0_2px_var(--color-divider)]')}
      />
    </button>
  );
}
