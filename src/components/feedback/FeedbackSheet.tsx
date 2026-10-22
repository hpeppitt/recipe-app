import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { rateLimitMessage } from '../../lib/errors';
import { FEEDBACK_NOTE_MAX, FEEDBACK_SCREENSHOT_MAX, cleanNote, type FeedbackContext } from '../../lib/feedback';
import {
  JPEG_DATA_URL_PREFIX,
  attachmentErrorMessage,
  maxBytesForDataUrl,
  redactInlineData,
  validateImageFile,
} from '../../lib/imageAttachments';
import { cn } from '../../lib/utils';
import { submitFeedback } from '../../services/firestore';
import { downscaleToJpeg } from '../../services/imageDownscale';
import { reportError } from '../../services/telemetry';
import type { AppUser } from '../../types/recipe';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Camera, X } from '../ui/icons';
import { Sheet } from '../ui/Sheet';
import { Spinner } from '../ui/Spinner';

const GENERIC_ERROR = "Couldn't send that. Check your connection and try again.";
const PHOTO_DECODE_ERROR = "That screenshot didn't work. Try another.";
const SHOT_OPTIONS = { maxSide: 1024, maxBytes: maxBytesForDataUrl(FEEDBACK_SCREENSHOT_MAX), shrinkToFit: true };
const COUNTER_FROM = 900;

/** Spoken only at 100, 50, 10 and 0 left, so typing is not interrupted on every key. */
const counterAnnouncement = (left: number) => (left === 0 ? 'Limit reached' : [100, 50, 10].includes(left) ? `${left} characters left` : '');

interface FeedbackSheetProps {
  user: Pick<AppUser, 'uid' | 'displayName'>;
  /** Taken when the tab was tapped, so it names the page the user was on. */
  context: FeedbackContext;
  /** One id per draft, kept by the caller across retries and reopens until a send lands. */
  draftId: string;
  /** The page capture taken before the sheet opened; null when it failed, which the sheet says. */
  initialShot?: string | null;
  onClose: () => void;
  onSent: () => void;
}

/** The "Send feedback" sheet (RL-287). Mount it per open so each visit starts empty. */
export function FeedbackSheet({ user, context, draftId, initialShot = null, onClose, onSent }: FeedbackSheetProps) {
  const titleId = useId();
  const noteId = useId();
  const helpId = useId();
  const hintId = useId();
  const shotId = useId();
  const [note, setNote] = useState('');
  // The downscaled JPEG data URL. Held in memory only: never in Dexie, analytics or a report.
  const [shot, setShot] = useState<string | null>(initialShot);
  const [shotBusy, setShotBusy] = useState(false);
  const [shotError, setShotError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const busy = useRef(false);
  // Back or forward closes an untouched sheet; a draft keeps its discard question instead.
  const { pathname } = useLocation();
  const openedOn = useRef(pathname);
  const dirty = !!(note.trim() || shot);
  useEffect(() => {
    if (pathname !== openedOn.current && !dirty && !sending) onClose();
  }, [pathname, dirty, sending, onClose]);
  const fileRef = useRef<HTMLInputElement>(null);
  const pick = useRef(0);
  // The input is disabled while a screenshot is prepared, which drops focus; put it back after.
  const refocus = useRef(false);
  useEffect(() => {
    if (shotBusy || !refocus.current) return;
    refocus.current = false;
    fileRef.current?.focus();
  }, [shotBusy]);

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setShotError(null);
    const valid = validateImageFile(file, { inMessage: 0, inChat: 0 });
    if (!valid.ok) {
      setShotError(attachmentErrorMessage(valid.reason));
      return;
    }
    const token = ++pick.current;
    refocus.current = true;
    setShotBusy(true);
    downscaleToJpeg(file, SHOT_OPTIONS).then(
      ({ base64 }) => {
        if (token !== pick.current) return;
        setShot(JPEG_DATA_URL_PREFIX + base64);
        setShotBusy(false);
      },
      () => {
        if (token !== pick.current) return;
        setShotError(PHOTO_DECODE_ERROR);
        setShotBusy(false);
      }
    );
  };
  // Also cancels a screenshot still being prepared: its result is dropped by the token.
  const removeShot = () => {
    pick.current++;
    refocus.current = true;
    setShot(null);
    setShotBusy(false);
    setShotError(null);
    fileRef.current?.focus();
  };

  const canSend = !!cleanNote(note) && !shotBusy && !sending;
  const requestClose = () => (note.trim() || shot ? setConfirmDiscard(true) : onClose());

  const send = async () => {
    if (!canSend || busy.current) return;
    busy.current = true;
    setSending(true);
    setError(null);
    try {
      await submitFeedback(user, { note, screenshot: shot }, context, draftId);
      onSent();
    } catch (err) {
      // The message is the service's own and never holds the note or screenshot; redact anyway.
      reportError(redactInlineData(err), 'send-feedback');
      setError(rateLimitMessage(err) ?? GENERIC_ERROR);
    } finally {
      busy.current = false;
      setSending(false);
    }
  };

  return (
    <>
      <Sheet open onClose={requestClose} labelledBy={titleId} dismissible={!sending}>
        <div className="flex flex-col gap-3.5">
          <h2 id={titleId} className="font-heading text-[22px] leading-[1.1] text-text-primary">
            Send feedback
          </h2>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={noteId} className="text-sm font-medium text-text-primary">
              What happened, or what would you change?
            </label>
            <textarea
              id={noteId}
              required
              rows={4}
              aria-describedby={helpId}
              value={note}
              maxLength={FEEDBACK_NOTE_MAX}
              readOnly={sending}
              onChange={(e) => {
                setNote(e.target.value);
                setError(null);
              }}
              className="w-full resize-none rounded-3xl bg-neutral-100 px-4 py-3 text-sm text-text-primary"
            />
            <div className="flex justify-end text-xs text-neutral-700">
              {note.length >= COUNTER_FROM && (
                <span id={helpId} aria-hidden="true">
                  {note.length}/{FEEDBACK_NOTE_MAX}
                </span>
              )}
              <span role="status" className="sr-only">
                {counterAnnouncement(FEEDBACK_NOTE_MAX - note.length)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="relative size-24 shrink-0">
              <input
                ref={fileRef}
                id={shotId}
                type="file"
                accept="image/*"
                onChange={onPick}
                disabled={sending || shotBusy}
                className="peer sr-only"
              />
              <label
                htmlFor={shotId}
                className={cn(
                  'relative flex size-24 cursor-pointer items-center justify-center overflow-hidden rounded-[28px] text-accent-700 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent',
                  !shot && 'border-2 border-dashed border-accent-400'
                )}
              >
                {shot ? (
                  <>
                    <img src={shot} alt="Your screenshot" className={cn('size-full object-cover', shotBusy && 'opacity-45')} />
                    <span className="sr-only">Replace screenshot</span>
                  </>
                ) : (
                  <>
                    <Camera className={cn('size-6', shotBusy && 'opacity-0')} />
                    <span className="sr-only">Add a screenshot</span>
                  </>
                )}
                {shotBusy && (
                  <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
                    <Spinner />
                  </span>
                )}
              </label>
              <span role="status" className="sr-only">
                {shotBusy ? 'Preparing screenshot' : ''}
              </span>
              {(shot || shotBusy) && (
                <button
                  type="button"
                  onClick={removeShot}
                  disabled={sending}
                  aria-label="Remove screenshot"
                  className="absolute -top-3 -right-3 flex size-11 items-center justify-center"
                >
                  <span className="flex size-8 items-center justify-center rounded-full bg-surface text-text-primary shadow-md">
                    <X className="size-4" />
                  </span>
                </button>
              )}
            </div>
            <div className="text-[13px] text-neutral-700">
              <p className="font-medium text-text-primary">{shot && shot === initialShot ? 'Screenshot of this page' : 'Add a screenshot'}</p>
              <p>
                {shot && shot === initialShot
                  ? 'Remove it if it shows something you would rather not send.'
                  : initialShot
                    ? 'Take a screenshot first, then add it here.'
                    : "We couldn't capture this page. You can add a screenshot yourself."}
              </p>
              <span role="status" className="sr-only">
                {initialShot === null && !shot ? "We couldn't capture this page." : ''}
              </span>
            </div>
          </div>
          {shotError && (
            <p role="alert" className="text-sm text-danger-600">
              {shotError}
            </p>
          )}
          <p className="text-[13px] text-neutral-700">
            Screenshots can show other people&rsquo;s names and recipes. Only the Recipe Lab team sees what you send.
          </p>
          <p className="text-[13px] text-text-tertiary">
            We&rsquo;ll include this page&rsquo;s address, the app version and your screen size.
          </p>
          <span id={hintId} className="sr-only">
            {shotBusy ? 'Preparing screenshot' : 'Write a note to send'}
          </span>
          <div role="status" className="sr-only">
            {sending ? 'Sending' : ''}
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger-600">
              {error}
            </p>
          )}
          <Button
            className="h-[52px] w-full aria-disabled:opacity-45"
            aria-disabled={!canSend}
            aria-describedby={!canSend && !sending ? hintId : undefined}
            onClick={send}
            // aria-disabled keeps focus on the button; the guard in send() does the refusing.
          >
            {sending ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </Sheet>
      <ConfirmDialog
        open={confirmDiscard}
        title="Discard this feedback?"
        message="What you wrote won't be sent."
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
