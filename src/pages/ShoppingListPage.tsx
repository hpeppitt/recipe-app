import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useKitchen } from '../hooks/useKitchen';
import { formatLineAmount, groupByAisle, listSummary, shareText, splitByPantry } from '../lib/shopping';
import { AuthModal } from '../components/auth/AuthModal';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { IconButton } from '../components/ui/IconButton';
import { Skeleton } from '../components/ui/Skeleton';
import { Check, ChevronLeft, CloudOff, Plus, Refrigerator, Share, ShoppingBag, Store, UserRound, X } from '../components/ui/icons';

const CHIP_TINTS = ['bg-accent-200 text-accent-900', 'bg-accent-2-200 text-accent-2-900'];

function sentence(names: string[]): string {
  const n = names.map((s) => s.toLowerCase());
  return `In your pantry: ${n.slice(0, 4).join(', ')}${n.length > 4 ? ` and ${n.length - 4} more` : ''}`;
}

/** The shopping list (Organic 26a, RL-216). */
export function ShoppingListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isConfigured, isLoading: authLoading } = useAuth();
  const { kitchen, loading, error, toggleLine, removeSource, boughtItAll } = useKitchen();
  const [showAuth, setShowAuth] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [removing, setRemoving] = useState<{ id: string; title: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2500);
    return () => clearTimeout(t);
  }, [toast]);
  const verified = isConfigured && !!user && !user.isAnonymous && !!user.emailVerified;

  // useKitchen drops an action started during a write, so lock every control until it settles.
  const run = async (p: () => Promise<void>) => {
    setBusy(true);
    try {
      await p();
    } catch {
      // The hook has set `error` with the user copy.
    } finally {
      setBusy(false);
    }
  };

  const { toBuy, inPantry } = kitchen ? splitByPantry(kitchen.shopping, kitchen.pantry) : { toBuy: [], inPantry: [] };
  const sources = new Map<string, { emoji: string; title: string }>();
  kitchen?.shopping.forEach((l) => l.sources.forEach((s) => sources.set(s.recipeId, s)));

  const share = async () => {
    const text = shareText(toBuy.filter((l) => !l.done));
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        setToast('Copied');
      }
    } catch (e) {
      // Cancelling the share sheet rejects; only a failed copy is worth saying.
      if (!navigator.share && !(e instanceof DOMException && e.name === 'AbortError')) setToast("Couldn't copy");
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
      {verified && kitchen && toBuy.some((l) => !l.done) && (
        <IconButton variant="flat" label="Share" icon={<Share className="size-5" />} onClick={share} />
      )}
    </header>
  );
  const title = <h1 className="px-[22px] pt-4 font-heading text-[30px] leading-[1.1] text-text-primary">Shopping list</h1>;

  let content;
  if (authLoading || (verified && !kitchen && loading)) {
    content = <div role="status" aria-label="Loading shopping list" className="space-y-3 px-[22px] pt-6"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>;
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
      <EmptyState
        compact
        tone="error"
        icon={<CloudOff />}
        title="Couldn't load your kitchen"
        description="The connection failed. Nothing is lost."
        action={<Button variant="secondary" onClick={() => window.location.reload()}>Try again</Button>}
      />
    );
  } else if (!kitchen) {
    content = <div role="status" aria-label="Loading shopping list" className="space-y-3 px-[22px] pt-6"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>;
  } else {
    content = (
      <>
        <p className="px-[22px] pt-1 text-[13px] text-neutral-700">{listSummary({ toBuy, inPantry })}</p>
        {error && <p role="alert" className="px-[22px] pt-2 text-[13px] text-danger-600">{error}</p>}
        {kitchen.shopping.length === 0 ? (
          <EmptyState
            compact
            icon={<ShoppingBag />}
            title="Nothing to buy"
            description="Add a recipe's ingredients from its menu."
            action={<Button onClick={() => navigate('/')}>Explore recipes</Button>}
          />
        ) : (
          <>
            <ul className="flex gap-2 overflow-x-auto px-[22px] pt-[14px]" aria-label="Recipes on the list">
              {[...sources].map(([id, s], i) => (
                <li key={id} className={`flex h-[34px] max-w-[70vw] shrink-0 items-center rounded-full pl-3 text-[13px] font-semibold ${CHIP_TINTS[i % 2]}`}>
                  <span className="truncate">{s.emoji} {s.title}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${s.title}`}
                    disabled={busy}
                    onClick={() => setRemoving({ id, title: s.title })}
                    className="-my-[5px] flex size-11 shrink-0 items-center justify-center rounded-full disabled:opacity-50"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
              <li className="shrink-0">
                <Link to="/" aria-label="Add a recipe" className="relative flex size-[34px] items-center justify-center rounded-full text-text-primary shadow-[inset_0_0_0_2px_var(--color-divider)] before:absolute before:-inset-[5px] before:content-['']">
                  <Plus className="size-4" />
                </Link>
              </li>
            </ul>
            <div className="space-y-[14px] px-[22px] pt-4">
              {groupByAisle(toBuy).map((g) => (
                <section key={g.aisle} aria-label={g.aisle}>
                  <h2 className="text-xs font-bold uppercase text-neutral-700">{g.aisle}</h2>
                  <ul>
                    {g.lines.map((l) => {
                      const amt = formatLineAmount(l);
                      return (
                        <li key={l.id} className="border-b border-divider">
                          <label className="flex items-center gap-3 py-[9px]">
                            <input
                              type="checkbox"
                              className="peer sr-only"
                              checked={l.done}
                              disabled={busy}
                              aria-label={amt ? `${l.name}, ${amt}` : l.name}
                              onChange={(e) => run(() => toggleLine(l.id, e.target.checked))}
                            />
                            <span
                              aria-hidden="true"
                              className={`flex size-[26px] shrink-0 items-center justify-center rounded-full text-surface peer-focus-visible:outline-2 peer-focus-visible:outline-primary-500 ${l.done ? 'bg-accent-2-600' : 'shadow-[inset_0_0_0_2px_var(--color-neutral-400)]'}`}
                            >
                              {l.done && <Check className="size-4" />}
                            </span>
                            <span className={`min-w-0 flex-1 break-words text-[15px] ${l.done ? 'text-neutral-700 line-through' : 'text-text-primary'}`}>{l.name}</span>
                            {amt && <span className="text-[13px] font-semibold text-text-primary">{amt}</span>}
                            <span aria-hidden="true">{l.sources.map((s) => s.emoji).filter((e, i, a) => a.indexOf(e) === i).join('')}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
            {inPantry.length > 0 && (
              <p className="mx-[22px] mt-4 flex items-center gap-2 rounded-[20px] bg-accent-2-100 px-[14px] py-[10px] text-[13px] text-accent-2-900">
                <Refrigerator className="size-4 shrink-0" />
                {sentence(inPantry.map((l) => l.name))}
              </p>
            )}
            <div className="flex gap-[10px] px-5 pb-7 pt-3">
              {/* Shop mode (RL-217) has no route yet: focusable but inert. */}
              <button
                type="button"
                aria-disabled="true"
                aria-label="Shop mode (Soon)"
                className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-full font-heading text-[15px] text-text-primary shadow-[inset_0_0_0_2px_var(--color-divider)]"
              >
                <Store className="size-5" />
                Shop mode
              </button>
              {kitchen.shopping.length > 0 && toBuy.length > 0 && (
                <Button className="h-[52px] flex-1 gap-2" disabled={busy} onClick={() => setConfirm(true)}>
                  <ShoppingBag className="size-5" />
                  Bought it all
                </Button>
              )}
            </div>
          </>
        )}
        <ConfirmDialog
          open={!!removing}
          title={`Remove ${removing?.title ?? ''} from the list?`}
          message="Its ingredients come off the list."
          cancelLabel="Keep it"
          confirmLabel="Remove"
          busy={busy}
          onCancel={() => setRemoving(null)}
          onConfirm={() => run(() => removeSource(removing!.id)).then(() => setRemoving(null))}
        />
        <ConfirmDialog
          open={confirm}
          title="Move everything to the pantry?"
          message="The list will be emptied and its items added to your pantry."
          cancelLabel="Keep it"
          confirmLabel="Move"
          busy={busy}
          onCancel={() => setConfirm(false)}
          onConfirm={() => run(boughtItAll).then(() => setConfirm(false))}
        />
      </>
    );
  }

  return (
    <div className="mx-auto min-h-dvh w-full max-w-lg bg-surface">
      {header}
      {title}
      {content}
      <div role="status" className={toast ? 'fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-border bg-surface-secondary px-4 py-3 text-sm font-medium text-text-primary shadow-lg' : 'sr-only'}>
        {toast}
      </div>
    </div>
  );
}
