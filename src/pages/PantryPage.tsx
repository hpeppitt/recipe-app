import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useKitchen } from '../hooks/useKitchen';
import { itemKey } from '../lib/shopping';
import { AuthModal } from '../components/auth/AuthModal';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { IconButton } from '../components/ui/IconButton';
import { Skeleton } from '../components/ui/Skeleton';
import { ChevronLeft, CloudOff, Plus, Refrigerator, Sparkles, UserRound, X } from '../components/ui/icons';

const GROUPS = [
  { id: 'fresh', label: 'Fresh' },
  { id: 'cupboard', label: 'Cupboard' },
] as const;

/** The pantry (Organic 24a, RL-220): add and remove what you have, then search recipes with it. */
export function PantryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isConfigured, isLoading: authLoading } = useAuth();
  const { kitchen, loading, error, addPantryItems, removePantry } = useKitchen();
  const [showAuth, setShowAuth] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState('');
  const fieldRef = useRef<HTMLInputElement>(null);
  const verified = isConfigured && !!user && !user.isAnonymous && !!user.emailVerified;

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
    if (!names.length || busy || !kitchen) return;
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
    }
  };

  const header = (
    <header className="flex items-center px-3 pt-[50px]">
      <IconButton
        variant="flat"
        label="Back"
        icon={<ChevronLeft className="size-6" />}
        onClick={() => (location.key === 'default' ? navigate('/kitchen') : navigate(-1))}
      />
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
    // Commas separate the names in ?p=; URLSearchParams escapes the rest.
    const cook = `/search?${new URLSearchParams({ p: pantry.map((i) => i.name.replace(/,\s*/g, ' ')).join(',') })}`;
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
              placeholder="Add things…"
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
            <button type="submit" aria-label="Add" disabled={busy} className="flex size-11 shrink-0 items-center justify-center rounded-full text-text-primary disabled:opacity-60">
              <Plus className="size-5" />
            </button>
          </div>
        </form>
        {error && <p role="alert" className="px-[22px] pt-2 text-[13px] text-danger-600">{error}</p>}
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
                        <li key={i.id} className="flex max-w-full items-center break-words rounded-full bg-surface-secondary py-[7px] pl-[14px] pr-[10px] text-[14px] text-text-primary">
                          {i.name}
                          <button
                            type="button"
                            aria-label={`Remove ${i.name}`}
                            disabled={busy}
                            onClick={async () => {
                              if (await run(() => removePantry(i.id))) setNote(`Removed ${i.name}`);
                            }}
                            className="relative ml-1 inline-flex size-6 shrink-0 before:absolute before:-inset-3 before:content-[''] items-center justify-center rounded-full disabled:opacity-60"
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
