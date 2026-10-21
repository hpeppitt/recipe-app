import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useRecipeCooks } from '../../hooks/useCooks';
import { noteToBranchPrompt } from '../../lib/cooks';
import { RecipeNotPublishedError, TermsNotAcceptedError, rateLimitMessage } from '../../lib/errors';
import { cn } from '../../lib/utils';
import { reportError } from '../../services/telemetry';
import type { Cook } from '../../types/social';
import type { Recipe } from '../../types/recipe';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { GitBranchPlus, Repeat, Wrench } from '../ui/icons';
import { Sheet } from '../ui/Sheet';

const MAX_NOTE = 500;
const GENERIC_ERROR = "Couldn't save that. Check your connection and try again.";
const VOTES = [
  { value: 'again', label: 'Would make again', Icon: Repeat },
  { value: 'tweak', label: 'Needs a tweak', Icon: Wrench },
] as const;

interface CookedSheetProps {
  open: boolean;
  recipe: Recipe;
  onClose: () => void;
  /** Called with the new cook's id once it is saved. */
  onSaved?: (cookId: string) => void;
}

function saveErrorMessage(err: unknown): string {
  const limited = rateLimitMessage(err);
  if (limited) return limited;
  if (err instanceof TermsNotAcceptedError || err instanceof RecipeNotPublishedError) return err.message;
  return GENERIC_ERROR;
}

/** The "I made this" sheet (RL-197). Entry points open it: RL-198 and RL-203. */
export function CookedSheet({ open, recipe, onClose, onSaved }: CookedSheetProps) {
  const [toast, setToast] = useState(false);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(false), 3000);
    return () => clearTimeout(t);
  }, [toast]);
  return (
    <>
      {/* The body mounts per open, so each visit starts empty. */}
      {open && (
        <CookedSheetBody
          recipe={recipe}
          onClose={onClose}
          onSaved={(id) => {
            setToast(true);
            onSaved?.(id);
          }}
        />
      )}
      <div role="status">
        {toast && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm rounded-xl border border-border bg-surface-secondary px-4 py-3 shadow-lg">
            <p className="text-sm font-medium text-text-primary">Saved to your cook log</p>
          </div>
        )}
      </div>
    </>
  );
}

function CookedSheetBody({ recipe, onClose, onSaved }: Omit<CookedSheetProps, 'open'> & { onSaved: (id: string) => void }) {
  const titleId = useId();
  const noteId = useId();
  const helpId = useId();
  const saveHintId = useId();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { log } = useRecipeCooks(recipe.id);
  const [vote, setVote] = useState<Cook['vote'] | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const prompt = noteToBranchPrompt(note);
  const requestClose = () => (note.trim() ? setConfirmDiscard(true) : onClose());

  // Saves the cook; resolves to its id, or null after showing why not.
  const save = async (): Promise<string | null> => {
    if (!vote || !user || busy.current) return null;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      const id = await log({ recipeId: recipe.id, vote, note: note.trim() || null, user });
      onSaved(id);
      return id;
    } catch (err) {
      reportError(err, 'log-cook');
      setError(saveErrorMessage(err));
      return null;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const onSave = async () => {
    if (await save()) onClose();
  };
  const onGrow = async () => {
    const id = await save();
    if (id && prompt) {
      onClose();
      navigate(`/recipe/${recipe.id}/vary`, { state: { suggestion: prompt, fromCookId: id } });
    }
  };

  // Radiogroup keys; moves from the focused option because nothing is selected at first.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const radios = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'));
    const i = Math.max(0, radios.indexOf(document.activeElement as HTMLElement));
    const next = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? 1 : next === undefined ? undefined : (i + next + 2) % 2;
    if (to === undefined) return;
    e.preventDefault();
    setVote(VOTES[to].value);
    setError(null);
    radios[to]?.focus();
  };

  return (
    <>
      <Sheet open onClose={requestClose} labelledBy={titleId} dismissible={!saving}>
        <div className="flex flex-col gap-3.5">
          <h2 id={titleId} className="font-heading text-[26px] leading-[1.1] text-text-primary">
            You made it. How did it go?
          </h2>
          <div role="radiogroup" aria-label="How did it go?" onKeyDown={onKeyDown} className="flex gap-2">
            {VOTES.map(({ value, label, Icon }, i) => {
              const selected = vote === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={selected || (!vote && i === 0) ? 0 : -1}
                  onClick={() => {
                    setVote(value);
                    setError(null);
                  }}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 min-h-[50px] px-2 rounded-full font-heading text-[13px] min-[360px]:text-sm leading-tight',
                    selected
                      ? 'bg-accent-2-700 text-accent-2-100'
                      : 'bg-surface text-text-primary shadow-[inset_0_0_0_2px_var(--color-divider)]'
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              );
            })}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={noteId} className="sr-only">
              Your note (optional)
            </label>
            <textarea
              id={noteId}
              aria-describedby={helpId}
              value={note}
              maxLength={MAX_NOTE}
              onChange={(e) => {
                setNote(e.target.value);
                setError(null);
              }}
              placeholder="How did it go? What would you change?"
              className="min-h-24 w-full resize-none rounded-3xl bg-neutral-100 px-4 py-3 text-sm text-text-primary"
            />
            <div className="flex justify-between text-xs text-neutral-700">
              <span id={helpId}>Notes show on the recipe for other cooks.</span>
              {note.length >= 450 && <span aria-hidden="true">{note.length}/{MAX_NOTE}</span>}
              <span role="status" className="sr-only">
                {note.length >= MAX_NOTE ? 'Limit reached' : note.length >= 450 ? `${MAX_NOTE - note.length} characters left` : ''}
              </span>
            </div>
          </div>
          {prompt && vote === 'tweak' && (
            <div className="flex items-center gap-2.5 rounded-[22px] bg-accent-100 px-3.5 py-3 text-[13px] text-accent-900">
              <GitBranchPlus className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                Turn the note into a branch: <strong>&ldquo;{prompt}&rdquo;</strong>
              </span>
              <button
                type="button"
                onClick={onGrow}
                disabled={saving || !user}
                className="group -my-1.5 shrink-0 py-1.5 font-heading text-[13px] disabled:opacity-45"
              >
                <span className="flex h-8 items-center rounded-full bg-surface px-3.5">Grow</span>
              </button>
            </div>
          )}
          <span id={saveHintId} className="sr-only">
            Choose a vote to save
          </span>
          {error && (
            <p role="alert" className="text-sm text-danger-600">
              {error}
            </p>
          )}
          <Button className="h-[52px] w-full" disabled={!vote || !user || saving} onClick={onSave} aria-describedby={!vote ? saveHintId : undefined}>
            {saving ? 'Saving…' : 'Save to my cook log'}
          </Button>
        </div>
      </Sheet>
      <ConfirmDialog
        open={confirmDiscard}
        title="Discard this note?"
        message="What you wrote won't be saved."
        confirmLabel="Discard"
        confirmVariant="danger"
        cancelLabel="Keep writing"
        onConfirm={() => {
          setConfirmDiscard(false);
          onClose();
        }}
        onCancel={() => setConfirmDiscard(false)}
      />
    </>
  );
}
