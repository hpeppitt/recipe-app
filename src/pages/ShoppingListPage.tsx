import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useKitchen } from '../hooks/useKitchen';
import { useWakeLock } from '../hooks/useWakeLock';
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
  const [params, setParams] = useSearchParams();
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
  // Shop mode is a view of this page (?mode=shop, written with replace so a reload keeps it).
  const shop = params.get('mode') === 'shop' && verified && !!kitchen && kitchen.shopping.length > 0;
  const awake = useWakeLock(shop);
  const doneRef = useRef<HTMLButtonElement>(null);
  const allDoneRef = useRef<HTMLButtonElement>(null);
  const focusRef = useRef<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const shopBtnRef = useRef<HTMLButtonElement>(null);
  const wasShop = useRef(shop);
  useEffect(() => {
    if (wasShop.current !== shop) (shop ? doneRef : shopBtnRef).current?.focus();
    wasShop.current = shop;
  }, [shop]);
  // After a tick settles, focus the next unticked row (or All done) once the list has re-rendered.
  useEffect(() => {
    const id = focusRef.current;
    if (!id || pendingId) return;
    const el =
      id === 'done'
        ? allDoneRef.current
        : [...document.querySelectorAll<HTMLInputElement>('input[data-line]')].find((i) => i.dataset.line === id);
    if (el) {
      el.focus();
      focusRef.current = null;
    }
  });
  const setShop = (on: boolean) => setParams(on ? { mode: 'shop' } : {}, { replace: true });

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
  const order = groupByAisle(toBuy.filter((l) => !l.done)).flatMap((g) => g.lines.map((l) => l.id));
  const left = toBuy.filter((l) => !l.done).length;
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

  const header = shop ? (
    <header className="flex items-center justify-between px-3 pt-[50px]">
      <Button ref={doneRef} variant="secondary" onClick={() => setShop(false)}>Done</Button>
      <p role="status" aria-atomic="true" className="px-3 text-[15px] font-semibold text-text-primary">{left} left</p>
    </header>
  ) : (
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
  const renderLine = (l: (typeof toBuy)[number]) => {
    const amt = formatLineAmount(l);
    return (
      <li key={l.id} className="border-b border-divider">
        <label className={`flex items-center gap-3 ${shop ? 'min-h-14' : 'py-[9px]'} ${pendingId === l.id ? 'opacity-60' : ''}`}>
          <input
            type="checkbox"
            className="peer sr-only"
            data-line={l.id}
            checked={l.done}
            // Shop mode locks only the row being written; the hook drops an overlapping write (see QA.md).
            disabled={shop ? pendingId === l.id : busy}
            aria-label={amt ? `${l.name}, ${amt}` : l.name}
            onChange={async (e) => {
              const checked = e.target.checked;
              const i = order.indexOf(l.id);
              focusRef.current = shop && checked ? (order[i + 1] ?? order[i - 1] ?? 'done') : null;
              setPendingId(l.id);
              await run(() => toggleLine(l.id, checked));
              setPendingId(null);
            }}
          />
          <span
            aria-hidden="true"
            className={`flex shrink-0 items-center justify-center rounded-full text-surface peer-focus-visible:outline-2 peer-focus-visible:outline-primary-500 ${shop ? 'size-10' : 'size-[26px]'} ${l.done ? 'bg-accent-2-600' : 'shadow-[inset_0_0_0_2px_var(--color-neutral-600)]'}`}
          >
            {l.done && <Check className={shop ? 'size-6' : 'size-4'} />}
          </span>
          <span className={shop ? 'flex min-w-0 flex-1 flex-col py-1' : 'contents'}>
            <span className={`min-w-0 flex-1 break-words ${shop ? 'text-[22px]' : 'text-[15px]'} ${l.done ? 'text-neutral-700 line-through' : 'text-text-primary'}`}>{l.name}</span>
            {amt && <span className={`${shop ? 'text-[22px]' : 'text-[13px]'} font-semibold text-text-primary`}>{amt}</span>}
          </span>
          {!shop && <span aria-hidden="true">{l.sources.map((s) => s.emoji).filter((e, i, a) => a.indexOf(e) === i).join('')}</span>}
        </label>
      </li>
    );
  };
  const aisleHeading = (a: string, cls = '') => <h2 className={`${shop ? 'text-[14px]' : 'text-xs'} font-bold uppercase text-neutral-700 ${cls}`}>{a}</h2>;
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
        {!shop && <p className="px-[22px] pt-1 text-[13px] text-neutral-700">{listSummary({ toBuy, inPantry })}</p>}
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
            {!shop && <ul className="flex gap-2 overflow-x-auto px-[22px] pt-[14px]" aria-label="Recipes on the list">
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
            </ul>}
            <div className="space-y-[14px] px-[22px] pt-4">
              {groupByAisle(shop ? toBuy.filter((l) => !l.done) : toBuy).map((g) => (
                <section key={g.aisle} aria-label={g.aisle}>
                  {aisleHeading(g.aisle)}
                  <ul>{g.lines.map(renderLine)}</ul>
                </section>
              ))}
              {shop && left === 0 && (
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-full bg-accent-2-600 text-surface"><Check className="size-8" /></span>
                  <p className="font-heading text-[22px] text-text-primary">All done</p>
                  <Button ref={allDoneRef} variant="secondary" onClick={() => setShop(false)}>Done</Button>
                </div>
              )}
              {shop && toBuy.some((l) => l.done) && (
                <section aria-label="Got it">
                  {aisleHeading(`Got it (${toBuy.filter((l) => l.done).length})`, 'mt-6')}
                  <ul>{toBuy.filter((l) => l.done).map(renderLine)}</ul>
                </section>
              )}
            </div>
            {!shop && inPantry.length > 0 && (
              <p className="mx-[22px] mt-4 flex items-center gap-2 rounded-[20px] bg-accent-2-100 px-[14px] py-[10px] text-[13px] text-accent-2-900">
                <Refrigerator className="size-4 shrink-0" />
                {sentence(inPantry.map((l) => l.name))}
              </p>
            )}
            {!shop && <div className="flex gap-[10px] px-5 pb-7 pt-3">
              <button
                ref={shopBtnRef}
                type="button"
                disabled={busy}
                onClick={() => setShop(true)}
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
            </div>}
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
      {shop && !awake && <p role="status" className="px-[22px] pt-1 text-[12px] text-text-secondary">Your screen may still dim.</p>}
      {content}
      <div role="status" className={toast ? 'fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-border bg-surface-secondary px-4 py-3 text-sm font-medium text-text-primary shadow-lg' : 'sr-only'}>
        {toast}
      </div>
    </div>
  );
}
