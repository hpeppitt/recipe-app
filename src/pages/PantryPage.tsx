import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useKitchen } from '../hooks/useKitchen';
import { ageingLine, agedItems, itemKey } from '../lib/shopping';
import { sharedWithLine, type PantryItem } from '../lib/kitchen';
import { getPantryNudgeDismissed, setPantryNudgeDismissed } from '../services/storage';
import { readReceipt } from '../services/gemini';
import { downscaleToJpeg } from '../services/imageDownscale';
import { canGenerate } from '../lib/generation';
import { ACCEPTED_IMAGE_TYPES, attachmentErrorMessage, validateImageFile } from '../lib/imageAttachments';
import { RECEIPT_ERROR_MESSAGE, notInPantry } from '../lib/receipt';
import { ReceiptSheet } from '../components/kitchen/ReceiptSheet';
import { Avatar } from '../components/ui/Avatar';
import { AvatarStack } from '../components/kitchen/KitchenPeople';
import { AuthModal } from '../components/auth/AuthModal';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { IconButton } from '../components/ui/IconButton';
import { Skeleton } from '../components/ui/Skeleton';
import { Spinner } from '../components/ui/Spinner';
import { Camera, ChevronLeft, Clock, CloudOff, Plus, Refrigerator, Sparkles, UserRound, X } from '../components/ui/icons';

const DAY_MS = 86_400_000;
const today = () => new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD
// Commas separate the names in ?p=; URLSearchParams escapes the rest.
const searchLink = (names: string[]) => `/search?${new URLSearchParams({ p: names.map((n) => n.replace(/,\s*/g, ' ')).join(',') })}`;

const GROUPS = [
  { id: 'fresh', label: 'Fresh' },
  { id: 'cupboard', label: 'Cupboard' },
] as const;

/** The pantry (Organic 24a, RL-220): add and remove what you have, then search recipes with it. */
export function PantryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isConfigured, isLoading: authLoading } = useAuth();
  const { kitchen, loading, error, addPantryItems, removePantry, members } = useKitchen();
  const [showAuth, setShowAuth] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState('');
  const [dismissedDay, setDismissedDay] = useState(() => (getPantryNudgeDismissed(today()) ? today() : ''));
  const fieldRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLButtonElement>(null);
  // State updates are async, so a second pick in the same tick would pass a `reading` check.
  const readingRef = useRef(false);
  // Set when the receipt sheet closes; the effect below focuses the camera once the dialog has closed.
  const refocusCamera = useRef(false);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState('');
  const [receipt, setReceipt] = useState<string[] | null>(null);
  const [receiptFailed, setReceiptFailed] = useState(false);
  const verified = isConfigured && !!user && !user.isAnonymous && !!user.emailVerified;
  const canRead = verified && canGenerate({ isConfigured, user });
  useEffect(() => {
    if (receipt !== null || !refocusCamera.current) return;
    refocusCamera.current = false;
    cameraRef.current?.focus();
  }, [receipt]);
  const closeReceipt = () => {
    refocusCamera.current = true;
    setReceipt(null);
  };

  // useKitchen drops an action started during a write, so lock every control until it settles.
  const run = async (p: () => Promise<void>) => {
    setBusy(true);
    try {
      await p();
      return true;
    } catch {
      return false; // The hook has set `error` with the user copy.
    } finally {
      setBusy(false);
    }
  };
  // Add the given names in one write; `keep` is the text left in the field afterwards.
  const add = async (raw: string[], keep: string) => {
    const names = raw.map((x) => x.trim()).filter(Boolean);
    if (!names.length || busy || !kitchen) return false;
    const have = new Set(kitchen.pantry.map((i) => itemKey(i.name)));
    const fresh = new Set<string>();
    const dupes: string[] = [];
    for (const n of names) {
      if (have.has(itemKey(n)) || fresh.has(itemKey(n))) dupes.push(n);
      else fresh.add(itemKey(n));
    }
    if (await run(() => addPantryItems(names))) {
      setDraft(keep);
      setNote(
        [fresh.size ? `Added ${fresh.size}.` : '', ...dupes.slice(0, 3).map((d) => `${d[0].toUpperCase()}${d.slice(1)} is already in your pantry.`)]
          .filter(Boolean)
          .join(' ')
      );
      fieldRef.current?.focus();
      return true;
    }
    return false;
  };

  // The photo lives only in this handler and the request: never in state, storage or a report (RL-241).
  const onReceipt = async (file: File | undefined) => {
    if (!file || readingRef.current || busy || !kitchen) return;
    setReadError('');
    const valid = validateImageFile(file, { inMessage: 0, inChat: 0 });
    if (!valid.ok) return setReadError(attachmentErrorMessage(valid.reason));
    readingRef.current = true;
    setReading(true);
    setNote('Reading the receipt…');
    try {
      const items = notInPantry(await readReceipt(await downscaleToJpeg(file, { shrinkToFit: true })), kitchen.pantry);
      setNote('');
      if (items.length) {
        setReceiptFailed(false);
        setReceipt(items);
      } else setNote('Everything on that receipt is already in your pantry.');
    } catch {
      setNote('');
      setReadError(RECEIPT_ERROR_MESSAGE);
    } finally {
      readingRef.current = false;
      setReading(false);
    }
  };

  const header = (
    <header className="flex items-center justify-between px-3 pt-[50px]">
      <IconButton
        variant="flat"
        label="Back"
        icon={<ChevronLeft className="size-6" />}
        onClick={() => (location.key === 'default' ? navigate('/kitchen') : navigate(-1))}
      />
      {verified && kitchen && (
        <Link to="/kitchen" className="mr-2 flex min-h-11 items-center rounded-full bg-surface-secondary px-2">
          <AvatarStack members={members} ring="ring-surface-secondary" label={sharedWithLine(members.filter((m) => m.uid !== user.uid).map((m) => m.name))} />
        </Link>
      )}
    </header>
  );
  const title = <h1 className="px-[22px] pt-4 font-heading text-[30px] leading-[1.1] text-text-primary">Pantry</h1>;
  const skeleton = (
    <div role="status" aria-label="Loading pantry" className="space-y-3 px-[22px] pt-6">
      <Skeleton className="h-12" />
      <Skeleton className="h-12" />
      <Skeleton className="h-12" />
    </div>
  );

  let content;
  if (authLoading || (verified && !kitchen && loading)) {
    content = skeleton;
  } else if (!verified) {
    content = (
      <div className="px-[22px] pt-4">
        <div className="rounded-[28px] bg-surface-secondary">
          <EmptyState
            compact
            icon={<UserRound />}
            title={
              !isConfigured
                ? 'Kitchen needs an online account'
                : user && !user.isAnonymous
                  ? 'Verify your email to keep a shopping list and pantry'
                  : 'Sign in to keep a shopping list and pantry'
            }
            action={isConfigured && (!user || user.isAnonymous) ? <Button onClick={() => setShowAuth(true)}>Sign in</Button> : undefined}
          />
          <AuthModal open={showAuth} action={{ kind: 'continue' }} onAuthenticated={() => setShowAuth(false)} onDismiss={() => setShowAuth(false)} />
        </div>
      </div>
    );
  } else if (!kitchen && error) {
    content = (
      <div className="px-[22px] pt-4">
      <EmptyState
        compact
        tone="error"
        icon={<CloudOff />}
        title="Couldn't load your kitchen"
        description="The connection failed. Nothing is lost."
        action={<Button variant="secondary" onClick={() => window.location.reload()}>Try again</Button>}
      />
      </div>
    );
  } else if (!kitchen) {
    content = skeleton;
  } else {
    const pantry = kitchen.pantry;
    const cook = searchLink(pantry.map((i) => i.name));
    const now = Date.now();
    const aged = agedItems(pantry, now);
    const agedIds = new Set(aged.map((i) => i.id));
    const showNudge = aged.length > 0 && dismissedDay !== today();
    const addedLabel = (i: PantryItem) => {
      const who = members.find((m) => m.uid === i.addedBy);
      const days = Math.max(0, Math.floor((now - i.addedAt) / DAY_MS));
      const when = days === 0 ? 'today' : `${days} ${days === 1 ? 'day' : 'days'} ago`;
      return `added by ${who ? who.name?.trim() || 'a cook' : 'a former member'} ${when}`;
    };
    content = (
      <>
        <form
          className="px-[22px] pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void add(draft.split(','), '');
          }}
        >
          <div className="flex h-[52px] items-center rounded-full border border-border-strong bg-neutral-100 pl-5 pr-1.5">
            <input
              aria-label="Add things"
              placeholder={canRead ? 'Add or snap a receipt…' : 'Add things…'}
              value={draft}
              ref={fieldRef}
              readOnly={busy}
              aria-disabled={busy}
              onChange={(e) => {
                const parts = e.target.value.split(',');
                if (parts.length === 1) return setDraft(e.target.value);
                setDraft(e.target.value);
                void add(parts.slice(0, -1), parts[parts.length - 1]);
              }}
              className="min-w-0 flex-1 bg-transparent text-[16px] text-text-primary outline-none placeholder:text-text-tertiary aria-disabled:opacity-60"
            />
            {canRead && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept={ACCEPTED_IMAGE_TYPES.join(',')}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    void onReceipt(file);
                  }}
                />
                <button
                  ref={cameraRef}
                  type="button"
                  aria-label={reading ? 'Reading the receipt' : 'Snap a receipt'}
                  aria-busy={reading}
                  // aria-disabled while reading keeps focus here, so the sheet returns focus to it on close.
                  aria-disabled={reading}
                  disabled={busy}
                  onClick={() => !reading && fileRef.current?.click()}
                  // after: extends the 40px circle to a 44px hit area
                  className="relative flex size-10 shrink-0 items-center justify-center rounded-full text-text-primary after:absolute after:-inset-0.5 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:opacity-60 aria-disabled:opacity-60"
                >
                  <Camera className={`size-5 ${reading ? 'motion-safe:animate-pulse' : ''}`} />
                </button>
              </>
            )}
            <button type="submit" aria-label="Add" disabled={busy} className="flex size-11 shrink-0 items-center justify-center rounded-full text-text-primary disabled:opacity-60">
              <Plus className="size-5" />
            </button>
          </div>
        </form>
        {showNudge && (
          <div className="mx-[22px] mt-4 flex items-start gap-2.5 rounded-[22px] border border-accent-300 bg-accent-100 px-[14px] py-3 text-[13px] text-accent-900">
            <Clock className="mt-0.5 size-4 shrink-0" />
            <p className="min-w-0 flex-1">
              {ageingLine(aged.map((i) => i.name))}{' '}
              <Link to={searchLink(aged.map((i) => i.name))} className="font-bold underline">
                Find something to use them
              </Link>
            </p>
            <button
              type="button"
              aria-label="Dismiss for today"
              onClick={() => {
                setPantryNudgeDismissed(today());
                setDismissedDay(today());
                setNote('Reminder dismissed for today');
                fieldRef.current?.focus();
              }}
              className="relative inline-flex size-6 shrink-0 before:absolute before:-inset-x-3 before:-inset-y-1.5 before:content-[''] items-center justify-center rounded-full"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
        {reading && (
          // Announced through the page's status line; this is the visible copy.
          <p aria-hidden="true" className="flex items-center gap-2 px-[22px] pt-2 text-[13px] text-text-secondary">
            <Spinner size="sm" />
            Reading the receipt…
          </p>
        )}
        {readError && <p role="alert" className="px-[22px] pt-2 text-[13px] text-danger-600">{readError}</p>}
        <ReceiptSheet
          items={receipt}
          busy={busy}
          error={receiptFailed ? error ?? "Couldn't add those. Try again." : null}
          onClose={closeReceipt}
          onAdd={async (names) => {
            setReceiptFailed(false);
            if (await add(names, draft)) closeReceipt();
            else setReceiptFailed(true);
          }}
        />
        {/* While the sheet is open it shows the error itself. */}
        {error && receipt === null && <p role="alert" className="px-[22px] pt-2 text-[13px] text-danger-600">{error}</p>}
        {pantry.length === 0 ? (
          <EmptyState
            compact
            icon={<Refrigerator />}
            title="Your pantry is empty"
            description="Add what you have and we'll find recipes that use it."
          />
        ) : (
          <div className="space-y-4 px-[22px] pt-4">
            {GROUPS.map((g) => {
              const items = pantry.filter((i) => (i.group ?? 'cupboard') === g.id);
              return (
                items.length > 0 && (
                  <section key={g.id} aria-label={g.label}>
                    <h2 className="text-xs font-bold uppercase text-neutral-700">{g.label}</h2>
                    <ul className="flex flex-wrap gap-1.5 pt-2">
                      {items.map((i) => (
                        <li key={i.id} className={`flex max-w-full items-center break-words rounded-full py-[7px] pl-[14px] pr-[10px] text-[14px] ${agedIds.has(i.id) ? 'border border-accent-300 bg-accent-100 text-accent-900' : 'border border-transparent bg-surface-secondary text-text-primary'}`}>
                          {agedIds.has(i.id) && <Clock className="mr-1 size-3.5 shrink-0" />}
                          <span className="min-w-0 break-words">{i.name}</span>
                          <span role="img" aria-label={addedLabel(i)} className="ml-1.5 flex shrink-0">
                            <Avatar uid={members.some((m) => m.uid === i.addedBy) ? i.addedBy : 'former'} name={members.find((m) => m.uid === i.addedBy)?.name ?? null} size="sm" {...members.find((m) => m.uid === i.addedBy)?.avatar} />
                          </span>
                          <button
                            type="button"
                            aria-label={`Remove ${i.name}`}
                            disabled={busy}
                            onClick={async () => {
                              if (await run(() => removePantry(i.id))) setNote(`Removed ${i.name}`);
                            }}
                            className="relative ml-1 inline-flex size-6 shrink-0 before:absolute before:-inset-x-3 before:-inset-y-1.5 before:content-[''] items-center justify-center rounded-full disabled:opacity-60"
                          >
                            <X className="size-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )
              );
            })}
          </div>
        )}
        <div className="px-[22px] pt-6">
          {pantry.length === 0 ? (
            <button type="button" disabled className="flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-accent-2-700 text-accent-2-100 opacity-50">
              <Sparkles className="size-5" />
              Cook from what's here
            </button>
          ) : (
            <Link to={cook} className="flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-accent-2-700 text-accent-2-100">
              <Sparkles className="size-5" />
              Cook from what's here
            </Link>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="pb-8">
      {header}
      {title}
      <p role="status" aria-live="polite" className="sr-only">{note}</p>
      {content}
    </div>
  );
}
