import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { pluralize } from '../lib/utils';
import { useOwnCooks } from '../hooks/useCooks';
import { useTasteProfile, TasteAvoidError } from '../hooks/useTasteProfile';
import { AuthModal } from '../components/auth/AuthModal';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { IconButton } from '../components/ui/IconButton';
import { ListAddedToast, type ListToast } from '../components/ui/ListAddedToast';
import { Skeleton } from '../components/ui/Skeleton';
import { ChevronLeft, CloudOff, Flame, GitBranch, Plus, ShieldCheck, UserRound, X } from '../components/ui/icons';

const AVOID_MESSAGE = {
  full: 'You can keep up to 12. Remove one to add another.',
  duplicate: 'That is already on your list.',
  empty: 'Type something to avoid.',
};

function Card({ title, source, icon, children }: { title: string; source: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-[28px] bg-surface-secondary p-4">
      <header className="flex items-center gap-2">
        <span className="text-text-primary [&>svg]:size-5">{icon}</span>
        <h2 className="text-[15px] font-bold text-text-primary">{title}</h2>
        <span className="ml-auto text-xs text-neutral-700">{source}</span>
      </header>
      {children}
    </section>
  );
}

/** Your taste (Organic 28b, RL-232): the stored avoids and the learned terms, each removable. */
export function TastePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isConfigured, isLoading: authLoading } = useAuth();
  const { cooks } = useOwnCooks();
  const taste = useTasteProfile(cooks);
  const [showAuth, setShowAuth] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [toast, setToast] = useState<ListToast | null>(null);
  const verified = isConfigured && !!user && !user.isAnonymous && !!user.emailVerified;

  const [pending, setPending] = useState(false);
  const addChipRef = useRef<HTMLButtonElement>(null);
  const wasAdding = useRef(false);
  useEffect(() => {
    if (wasAdding.current && !adding) addChipRef.current?.focus();
    wasAdding.current = adding;
  }, [adding]);

  const fail = (e: unknown) => setNote(e instanceof Error && !(e instanceof TasteAvoidError) ? e.message : 'Something went wrong. Try again.');
  // One write at a time: every control is disabled while one is in flight.
  const run = async (p: Promise<unknown>, onDone?: () => void, onFail: (e: unknown) => void = fail) => {
    setPending(true);
    setNote('');
    try {
      await p;
      onDone?.();
    } catch (e) {
      onFail(e);
    } finally {
      setPending(false);
    }
  };
  const cancel = () => {
    setDraft('');
    setError('');
    setAdding(false);
  };
  const add = () => {
    if (pending) return;
    setError('');
    void run(taste.addAvoid(draft), cancel, (e) => (e instanceof TasteAvoidError ? setError(AVOID_MESSAGE[e.code]) : fail(e)));
  };
  const undoToast = (text: string, undo: () => Promise<unknown>) =>
    setToast({ text, view: false, undo: () => {
      setToast(null);
      void run(undo());
    } });
  const hide = (term: string) => {
    if (!pending) void run(taste.hideTerm(term), () => undoToast('Hidden.', () => taste.unhideTerm(term)));
  };
  const removeAvoid = (term: string) => {
    if (!pending) void run(taste.removeAvoid(term), () => undoToast('Removed.', () => taste.addAvoid(term)));
  };

  const chip = (term: string, label: string, onClick: () => void, filled: boolean) => (
    <li
      key={term}
      className={`flex max-w-full items-center rounded-full pl-3.5 pr-1 text-[14px] ${filled ? 'bg-accent-2-700 text-accent-2-100' : 'bg-surface text-text-primary'}`}
    >
      <span className="break-words">{term}</span>
      <button
        type="button"
        aria-label={`${label} ${term}`}
        disabled={pending}
        onClick={onClick}
        className="relative flex size-7 shrink-0 items-center justify-center rounded-full before:absolute before:-inset-2 before:content-[''] focus-visible:outline-2 focus-visible:outline-primary-500"
      >
        <X className="size-4" />
      </button>
    </li>
  );
  const learned = (terms: string[]) =>
    terms.length ? (
      <ul className="flex flex-wrap gap-x-1.5 gap-y-4 pt-3">{terms.map((t) => chip(t, 'Hide', () => hide(t), false))}</ul>
    ) : (
      <p className="pt-3 text-[14px] text-neutral-700">Nothing yet.</p>
    );

  let content;
  if (authLoading || (verified && taste.loading)) {
    content = (
      <div role="status" aria-label="Loading your taste" className="space-y-3 px-[22px] pt-6">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  } else if (!verified) {
    content = (
      <div className="px-[22px] pt-4">
        <div className="rounded-[28px] bg-surface-secondary">
          <EmptyState
            compact
            icon={<UserRound />}
            title={
              !isConfigured
                ? 'Your taste needs an online account'
                : user && !user.isAnonymous
                  ? 'Verify your email to see what we have learned about your taste'
                  : 'Sign in to see what we have learned about your taste'
            }
            action={isConfigured && (!user || user.isAnonymous) ? <Button onClick={() => setShowAuth(true)}>Sign in</Button> : undefined}
          />
          <AuthModal open={showAuth} action={{ kind: 'continue' }} onAuthenticated={() => setShowAuth(false)} onDismiss={() => setShowAuth(false)} />
        </div>
      </div>
    );
  } else if (taste.loadFailed) {
    content = (
      <div className="px-[22px] pt-4">
        <EmptyState
          compact
          tone="error"
          icon={<CloudOff />}
          title="Couldn't load your taste"
          description="The connection failed. Nothing is lost."
          action={<Button variant="secondary" onClick={taste.reload}>Retry</Button>}
        />
      </div>
    );
  } else {
    content = (
      <div className="space-y-3 px-[22px] pt-4">
        <Card title="Always avoid" source="You told us" icon={<ShieldCheck />}>
          <ul className="flex flex-wrap gap-x-1.5 gap-y-4 pt-3">
            {taste.avoids.map((a) => chip(a, 'Remove', () => removeAvoid(a), true))}
            {!adding && !taste.full && (
              <li>
                <button type="button" ref={addChipRef} disabled={pending} onClick={() => setAdding(true)} className="flex min-h-11 items-center gap-1 rounded-full border border-dashed border-border-strong px-3.5 text-[14px] text-text-primary">
                  <Plus className="size-4" />
                  Add
                </button>
              </li>
            )}
          </ul>
          {(adding || taste.full) && (
            <form
              className="flex items-center gap-2 pt-3"
              onSubmit={(e) => {
                e.preventDefault();
                add();
              }}
            >
              <input
                aria-label="Add something to avoid"
                autoFocus={adding}
                value={draft}
                disabled={taste.full || pending}
                aria-invalid={!!error}
                aria-describedby={error ? 'taste-error' : undefined}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setError('');
                }}
                onKeyDown={(e) => e.key === 'Escape' && cancel()}
                className="h-11 min-w-0 flex-1 rounded-full border border-border-strong bg-neutral-100 px-4 text-[16px] text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:opacity-60"
              />
              <Button type="submit" disabled={taste.full || pending}>Add</Button>
            </form>
          )}
          {error && <p id="taste-error" role="alert" className="pt-2 text-[13px] text-danger-600">{error}</p>}
          {taste.full && <p className="pt-2 text-[13px] text-neutral-700">{AVOID_MESSAGE.full}</p>}
        </Card>
        <Card title="You cook a lot of" source={taste.cookCount ? `From ${taste.cookCount} ${pluralize(taste.cookCount, 'cook')}` : ''} icon={<Flame />}>{learned(taste.cookALot)}</Card>
        <Card title="You tend to change" source={taste.branchCount ? `From ${taste.branchCount} ${pluralize(taste.branchCount, 'branch')}` : ''} icon={<GitBranch />}>{learned(taste.tendToChange)}</Card>
        {note && <p role="alert" className="text-[13px] text-danger-600">{note}</p>}
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-surface pb-[calc(30px+env(safe-area-inset-bottom))]">
      <header className="flex items-center px-3 pt-[50px]">
        <IconButton
          variant="flat"
          label="Back"
          icon={<ChevronLeft className="size-6" />}
          onClick={() => (location.key === 'default' ? navigate('/settings') : navigate(-1))}
        />
      </header>
      <h1 className="px-[22px] pt-4 font-heading text-[30px] leading-[1.1] text-text-primary">Your taste</h1>
      {verified && !taste.loading && !taste.loadFailed && (
        <p className="px-[22px] pt-1 text-[13px] text-neutral-700">{taste.headline}{taste.avoids.length + taste.cookALot.length + taste.tendToChange.length > 0 && ' Tap anything to correct it.'}</p>
      )}
      {content}
      <ListAddedToast toast={toast} onDismiss={() => setToast(null)} bottomClass="bottom-6" />
    </div>
  );
}
