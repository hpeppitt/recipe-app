import { useEffect, useId, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { KITCHEN_BUSY_MESSAGE, addLeftoversToPantry } from '../../hooks/useKitchen';
import type { useRecipeCooks } from '../../hooks/useCooks';
import { noteToBranchPrompt } from '../../lib/cooks';
import { ITEM_NAME_MAX } from '../../lib/kitchen';
import { RecipeNotPublishedError, TermsNotAcceptedError, rateLimitMessage } from '../../lib/errors';
import {
  COOK_PHOTO_MAX_SIDE_PX,
  COOK_PHOTO_MAX_URL_LENGTH,
  JPEG_DATA_URL_PREFIX,
  attachmentErrorMessage,
  maxBytesForDataUrl,
  redactInlineData,
  validateImageFile,
} from '../../lib/imageAttachments';
import { cn } from '../../lib/utils';
import { addCookPhoto } from '../../services/firestore';
import { downscaleToJpeg } from '../../services/imageDownscale';
import { reportError } from '../../services/telemetry';
import type { Cook } from '../../types/social';
import type { Recipe } from '../../types/recipe';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Camera, Check, GitBranchPlus, Repeat, Wrench, X } from '../ui/icons';
import { Sheet } from '../ui/Sheet';
import { Spinner } from '../ui/Spinner';

const MAX_NOTE = 500;
const LEFTOVERS = ' leftovers';
/** The suffix always survives a long title. */
const leftoversName = (title: string) => `${title.trim().slice(0, ITEM_NAME_MAX - LEFTOVERS.length).trimEnd()}${LEFTOVERS}`;
const GENERIC_ERROR = "Couldn't save that. Check your connection and try again.";
const PHOTO_DECODE_ERROR = "That photo didn't work. Try another.";
const PHOTO_OPTIONS = { maxSide: COOK_PHOTO_MAX_SIDE_PX, maxBytes: maxBytesForDataUrl(COOK_PHOTO_MAX_URL_LENGTH), shrinkToFit: true };
const SAVED = 'Saved to your cook log';
const SAVED_NO_PHOTO = "Saved to your cook log. The photo didn't upload.";
const VOTES = [
  { value: 'again', label: 'Would make again', Icon: Repeat },
  { value: 'tweak', label: 'Needs a tweak', Icon: Wrench },
] as const;

/** The page's `useRecipeCooks().log`, so the sheet makes no read of its own and a retry keeps its cook id. */
export type LogCook = ReturnType<typeof useRecipeCooks>['log'];

interface CookedSheetProps {
  open: boolean;
  log: LogCook;
  recipe: Pick<Recipe, 'id' | 'title'>;
  onClose: () => void;
  /** Called with the new cook's id once it is saved (with or without its photo). */
  onSaved?: (cookId: string) => void;
}

function discardCopy(hasNote: boolean, hasPhoto: boolean): { title: string; message: string } {
  if (hasNote && hasPhoto) return { title: 'Discard your note and photo?', message: 'Neither will be saved.' };
  if (hasPhoto) return { title: 'Discard this photo?', message: "It won't be saved." };
  return { title: 'Discard this note?', message: "What you wrote won't be saved." };
}

function saveErrorMessage(err: unknown): string {
  const limited = rateLimitMessage(err);
  if (limited) return limited;
  if (err instanceof TermsNotAcceptedError || err instanceof RecipeNotPublishedError) return err.message;
  return GENERIC_ERROR;
}

/** The "I made this" sheet (RL-197). Entry points open it: RL-198 and RL-203. */
export function CookedSheet({ open, log, recipe, onClose, onSaved }: CookedSheetProps) {
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);
  return (
    <>
      {/* The body mounts per open, so each visit starts empty. */}
      {open && (
        <CookedSheetBody
          log={log}
          recipe={recipe}
          onClose={onClose}
          onSaved={(id, photoFailed) => {
            setToast(photoFailed ? SAVED_NO_PHOTO : SAVED);
            onSaved?.(id);
          }}
        />
      )}
      <div role="status">
        {toast && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm rounded-xl border border-border bg-surface-secondary px-4 py-3 shadow-lg">
            <p className="text-sm font-medium text-text-primary">{toast}</p>
          </div>
        )}
      </div>
    </>
  );
}

function CookedSheetBody({
  log,
  recipe,
  onClose,
  onSaved,
}: Omit<CookedSheetProps, 'open' | 'onSaved'> & { onSaved: (id: string, photoFailed: boolean) => void }) {
  const titleId = useId();
  const noteId = useId();
  const helpId = useId();
  const saveHintId = useId();
  const photoId = useId();
  const photoHelpId = useId();
  const navigate = useNavigate();
  const { user, isConfigured } = useAuth();
  // Same test as useKitchen: the pantry is a verified user's.
  const canLeftovers = !!(isConfigured && user && !user.isAnonymous && user.emailVerified);
  const [leftovers, setLeftovers] = useState(true);
  const [vote, setVote] = useState<Cook['vote'] | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // The downscaled JPEG data URL. Held in memory only: never in Dexie, analytics or a report.
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pick = useRef(0);
  // The input is disabled while a photo is prepared, which drops focus; put it back after.
  const refocus = useRef(false);
  useEffect(() => {
    if (photoBusy || !refocus.current) return;
    refocus.current = false;
    fileRef.current?.focus();
  }, [photoBusy]);

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoError(null);
    const valid = validateImageFile(file, { inMessage: 0, inChat: 0 });
    if (!valid.ok) {
      setPhotoError(attachmentErrorMessage(valid.reason));
      return;
    }
    const token = ++pick.current;
    refocus.current = true;
    setPhotoBusy(true);
    downscaleToJpeg(file, PHOTO_OPTIONS).then(
      ({ base64 }) => {
        if (token !== pick.current) return;
        setPhoto(JPEG_DATA_URL_PREFIX + base64);
        setPhotoBusy(false);
      },
      () => {
        if (token !== pick.current) return;
        setPhotoError(PHOTO_DECODE_ERROR);
        setPhotoBusy(false);
      }
    );
  };
  // Also cancels a photo still being prepared: its result is dropped by the token.
  const removePhoto = () => {
    pick.current++;
    refocus.current = true;
    setPhoto(null);
    setPhotoBusy(false);
    setPhotoError(null);
    fileRef.current?.focus();
  };

  const prompt = noteToBranchPrompt(note);
  const requestClose = () => (note.trim() || photo ? setConfirmDiscard(true) : onClose());

  // Saves the cook; resolves to its id, or null after showing why not.
  const save = async (): Promise<string | null> => {
    if (!vote || !user || busy.current) return null;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      const id = await log({ recipeId: recipe.id, vote, note: note.trim() || null, user });
      // Second write, after the cook (the photo rule reads it). A failure here keeps the cook.
      let photoFailed = false;
      if (photo) {
        try {
          await addCookPhoto(id, recipe.id, photo);
        } catch (err) {
          reportError(redactInlineData(err), 'cook-photo');
          photoFailed = true;
        }
      }
      // Last, and never fails the cook; a busy kitchen just skips.
      if (canLeftovers && leftovers && recipe.title.trim()) {
        try {
          await addLeftoversToPantry(user.uid, leftoversName(recipe.title));
        } catch (err) {
          if (!(err instanceof Error && err.message === KITCHEN_BUSY_MESSAGE)) reportError(err, 'cook-leftovers');
        }
      }
      onSaved(id, photoFailed);
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
            <div className="flex gap-2.5">
              <div className="relative size-24 shrink-0">
                {/* The input is the tile's control; capture is not forced, so the phone offers camera or library. */}
                <input
                  ref={fileRef}
                  id={photoId}
                  type="file"
                  accept="image/*"
                  onChange={onPick}
                  disabled={saving || photoBusy}
                  className="peer sr-only"
                  aria-describedby={photo ? photoHelpId : undefined}
                />
                <label
                  htmlFor={photoId}
                  className={cn(
                    'relative flex size-24 cursor-pointer items-center justify-center overflow-hidden rounded-[28px] text-accent-700 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent',
                    !photo && 'border-2 border-dashed border-accent-400'
                  )}
                >
                  {photo ? (
                    <>
                      <img src={photo} alt="Your cook photo" className={cn('washed size-full object-cover', photoBusy && 'opacity-45')} />
                      <span className="sr-only">Replace photo</span>
                    </>
                  ) : (
                    <>
                      <Camera className={cn('size-6', photoBusy && 'opacity-0')} />
                      <span className="sr-only">Add a photo</span>
                    </>
                  )}
                  {photoBusy && (
                    <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
                      <Spinner />
                    </span>
                  )}
                </label>
                <span role="status" className="sr-only">
                  {photoBusy ? 'Preparing photo' : ''}
                </span>
                {(photo || photoBusy) && (
                  <button
                    type="button"
                    onClick={removePhoto}
                    disabled={saving}
                    aria-label="Remove photo"
                    className="absolute -top-3 -right-3 flex size-11 items-center justify-center"
                  >
                    <span className="flex size-8 items-center justify-center rounded-full bg-surface text-text-primary shadow-md">
                      <X className="size-4" />
                    </span>
                  </button>
                )}
              </div>
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
                className="min-h-24 w-full min-w-0 resize-none rounded-3xl bg-neutral-100 px-4 py-3 text-sm text-text-primary"
              />
            </div>
            <div className="flex justify-between text-xs text-neutral-700">
              <span id={helpId}>Notes show on the recipe for other cooks.</span>
              {note.length >= 450 && <span aria-hidden="true">{note.length}/{MAX_NOTE}</span>}
              <span role="status" className="sr-only">
                {note.length >= MAX_NOTE ? 'Limit reached' : note.length >= 450 ? `${MAX_NOTE - note.length} characters left` : ''}
              </span>
            </div>
            {photo && (
              <p id={photoHelpId} className="text-xs text-neutral-700">
                Food only, please. No people or personal details. It shows on the recipe for everyone.
              </p>
            )}
            {photoError && (
              <p role="alert" className="text-sm text-danger-600">
                {photoError}
              </p>
            )}
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
                disabled={saving || !user || photoBusy}
                className="group -my-1.5 shrink-0 py-1.5 font-heading text-[13px] disabled:opacity-45"
              >
                <span className="flex h-8 items-center rounded-full bg-surface px-3.5">Grow</span>
              </button>
            </div>
          )}
          {canLeftovers && (
            <div className="flex flex-wrap items-center gap-x-2.5 text-[13px] text-neutral-700">
              <span
                aria-hidden="true"
                className={cn('flex size-[22px] shrink-0 items-center justify-center rounded-full', leftovers ? 'bg-accent-2-600 text-surface' : 'bg-surface shadow-[inset_0_0_0_2px_var(--color-divider)]')}
              >
                {leftovers && <Check className="size-3.5" />}
              </span>
              <span className="min-w-0 flex-1">Add the leftovers to the pantry ·</span>
              <button
                type="button"
                role="switch"
                aria-checked={leftovers}
                aria-label="Add the leftovers to the pantry"
                onClick={() => setLeftovers((v) => !v)}
                disabled={saving}
                className="-my-3 inline-flex min-h-11 shrink-0 items-center whitespace-nowrap underline"
              >
                {leftovers ? 'No thanks' : 'Add them'}
              </button>
            </div>
          )}
          <span id={saveHintId} className="sr-only">
            {photoBusy ? 'Preparing photo' : 'Choose a vote to save'}
          </span>
          {error && (
            <p role="alert" className="text-sm text-danger-600">
              {error}
            </p>
          )}
          <Button className="h-[52px] w-full" disabled={!vote || !user || saving || photoBusy} onClick={onSave} aria-describedby={!vote || photoBusy ? saveHintId : undefined}>
            {saving ? 'Saving…' : 'Save to my cook log'}
          </Button>
        </div>
      </Sheet>
      <ConfirmDialog
        open={confirmDiscard}
        {...discardCopy(!!note.trim(), !!photo)}
        confirmLabel="Discard"
        confirmVariant="danger"
        cancelLabel="Keep editing"
        onConfirm={() => {
          setConfirmDiscard(false);
          onClose();
        }}
        onCancel={() => setConfirmDiscard(false)}
      />
    </>
  );
}
