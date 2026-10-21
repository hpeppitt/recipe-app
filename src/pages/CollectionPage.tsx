import { useContext, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { RecipePaneContext } from '../contexts/RecipePaneContext';
import { listOriginState } from '../lib/paneMode';
import { db } from '../db/database';
import { TermsContext, useAuth } from '../contexts/AuthContext';
import { COLLECTIONS_LOAD_FAILED_MESSAGE, useCollections } from '../hooks/useCollections';
import { fetchFavoriteCached } from '../hooks/useSavedFavorites';
import { COLLECTION_GONE_MESSAGE, COLLECTION_NAME_MAX, COOKBOOK_DESCRIPTION_MAX, collectionCount } from '../lib/kitchen';
import { reportError } from '../services/telemetry';
import { AuthModal } from '../components/auth/AuthModal';
import { RecipeTileGrid, type RecipeTile } from '../components/profile/RecipeTileGrid';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { IconButton } from '../components/ui/IconButton';
import { Sheet } from '../components/ui/Sheet';
import { Skeleton } from '../components/ui/Skeleton';
import { BookOpen, ChevronLeft, CloudOff, EllipsisVertical, UserRound } from '../components/ui/icons';

/** Recipes shown per page; ids not on this device cost one cached read each, so never all 200 at once. */
export const COLLECTION_PAGE_SIZE = 24;

type Known = { title: string; emoji: string; meta: string } | 'gone' | 'failed';

/** A collection (Organic 27b, RL-224): its recipes as tiles, with rename, delete and an edit mode to remove. */
export function CollectionPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isConfigured, isLoading: authLoading } = useAuth();
  const { collections, loading, error, retry, renameCollection, deleteCollection, removeFromCollection, setCookbookSharing } = useCollections();
  const terms = useContext(TermsContext);
  const [showAuth, setShowAuth] = useState(false);
  const [edit, setEdit] = useState(false);
  const [menu, setMenu] = useState<'more' | 'rename' | 'share' | null>(null);
  const [description, setDescription] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [shown, setShown] = useState(COLLECTION_PAGE_SIZE);
  const [known, setKnown] = useState<ReadonlyMap<string, Known>>(new Map());
  const [localDone, setLocalDone] = useState(false);
  const titleId = useId();
  const descId = useId();
  const countId = useId();
  const inFlight = useRef(new Set<string>());
  const editRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const deleted = useRef(false);
  // A recipe open beside this list (RL-225) is the page's h1.
  const paneId = useContext(RecipePaneContext);
  const Heading = paneId ? 'h2' : 'h1';
  const verified = isConfigured && !!user && !user.isAnonymous && !!user.emailVerified;
  const collection = collections.find((c) => c.id === id);
  const ids = collection?.recipeIds.join(',') ?? '';

  const meta = (minutes: number) => (minutes > 0 ? `${minutes} min` : '');
  // This device first: one Dexie read for every id, no cloud.
  useEffect(() => {
    if (!ids) return;
    let cancelled = false;
    db.recipes
      .bulkGet(ids.split(','))
      .then((rows) => {
        if (cancelled) return;
        setKnown((prev) => {
          const next = new Map(prev);
          for (const r of rows) if (r) next.set(r.id, { title: r.title, emoji: r.emoji, meta: meta(r.totalTime) });
          return next;
        });
        setLocalDone(true);
      })
      .catch((err) => {
        reportError(err, 'collection-page-local');
        if (!cancelled) setLocalDone(true);
      });
    return () => {
      cancelled = true;
    };
  }, [ids]);

  // Then the cloud, for the visible page only, through the Saved page's session cache.
  useEffect(() => {
    if (!localDone || !ids) return;
    for (const rid of ids.split(',').slice(0, shown)) {
      if (known.has(rid) || inFlight.current.has(rid)) continue;
      inFlight.current.add(rid);
      void fetchFavoriteCached(rid).then((r) => {
        inFlight.current.delete(rid);
        const value: Known = r.status === 'recipe' ? { title: r.recipe.title, emoji: r.recipe.emoji, meta: meta(r.recipe.totalTime) } : r.status === 'missing' ? 'gone' : 'failed';
        setKnown((prev) => new Map(prev).set(rid, value));
      });
    }
  }, [localDone, ids, shown, known]);

  const run = async (work: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    setMessage(null);
    try {
      await work();
      return true;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Something went wrong.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  // A public collection's every owner write needs the current Terms: open the dialog instead of failing.
  const termsOk = async () => (await terms?.ensureCurrent?.()) ?? true;
  const rename = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (await run(async () => {
      if (collection?.visibility === 'public' && !(await termsOk())) throw new Error('Accept the Terms, then try again.');
      await renameCollection(id, name);
    })) setMenu(null);
  };
  const setSharing = (on: boolean) =>
    run(async () => {
      if (on && !(await termsOk())) throw new Error('Accept the Terms, then press Share again.');
      await setCookbookSharing(id, on ? 'public' : 'private', on ? description.trim() || null : collection?.description ?? null);
      setStatus(on ? 'Shared. Link ready.' : 'Sharing stopped.');
    });
  const link = `${window.location.origin}/c/${id}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setMessage(null);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage("Couldn't copy the link.");
    }
  };
  const shareLink = async () => {
    try {
      await navigator.share({ title: collection?.name, url: link });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setMessage("Couldn't share the link.");
    }
  };
  const closeMenu = () => {
    setMenu(null);
    setMessage(null);
    setCopied(false);
    setStatus('');
  };
  const retryTile = (rid: string) =>
    setKnown((prev) => {
      const next = new Map(prev);
      next.delete(rid);
      return next;
    });
  const remove = async (rid: string, pos: number, shownIds: string[]) => {
    if (!(await run(async () => {
      if (collection?.visibility === 'public' && !(await termsOk())) throw new Error('Accept the Terms, then try again.');
      await removeFromCollection(id, rid);
    }))) return;
    // The removed tile unmounts, so move focus to its neighbour (or Edit) before it is lost.
    const to = shownIds[pos + 1] ?? shownIds[pos - 1];
    const target = to && gridRef.current?.querySelector<HTMLElement>(`[data-remove-id="${CSS.escape(to)}"]`);
    // Next tick: the buttons are still disabled until `busy` clears and renders.
    setTimeout(() => (target || editRef.current)?.focus());
  };
  const del = async () => {
    if (await run(() => deleteCollection(id))) {
      deleted.current = true; // The listener drops the collection before navigation lands; do not flash "gone".
      // replace: Back must not return to a page for a collection that no longer exists.
      navigate('/kitchen', { replace: true });
    }
    else setConfirming(false);
  };

  const back = (
    <IconButton variant="flat" label="Back" icon={<ChevronLeft className="size-6" />} onClick={() => (location.key === 'default' ? navigate('/kitchen') : navigate(-1))} />
  );
  const header = (extra?: React.ReactNode) => (
    <header className="flex items-center justify-between px-3 pt-[50px]">
      {back}
      {extra}
    </header>
  );
  const gone = (
    <div className="px-[22px] pt-4">
      <EmptyState
        compact
        icon={<BookOpen />}
        title="This collection is gone"
        description={COLLECTION_GONE_MESSAGE}
        action={<Link to="/kitchen" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-700">Back to Kitchen</Link>}
      />
    </div>
  );

  if (authLoading || (verified && loading)) {
    return (
      <div className="pb-8">
        {header()}
        <div role="status" aria-label="Loading collection" className="space-y-3 px-[22px] pt-6">
          <Skeleton className="h-10 w-2/3" />
          <div className="grid grid-cols-2 gap-2.5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="aspect-square rounded-[28px]" />
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (!verified) {
    return (
      <div className="pb-8">
        {header()}
        <div className="px-[22px] pt-4">
          <div className="rounded-[28px] bg-surface-secondary">
            <EmptyState
              compact
              icon={<UserRound />}
              title={
                !isConfigured ? 'Kitchen needs an online account' : user && !user.isAnonymous ? 'Verify your email to use collections' : 'Sign in to use collections'
              }
              action={isConfigured && (!user || user.isAnonymous) ? <Button onClick={() => setShowAuth(true)}>Sign in</Button> : undefined}
            />
            <AuthModal open={showAuth} action={{ kind: 'continue' }} onAuthenticated={() => setShowAuth(false)} onDismiss={() => setShowAuth(false)} />
          </div>
        </div>
      </div>
    );
  }
  if (!collection) {
    if (deleted.current) return header();
    return (
      <div className="pb-8">
        {header()}
        {error === COLLECTIONS_LOAD_FAILED_MESSAGE ? (
          <div className="px-[22px] pt-4">
            <EmptyState
              compact
              tone="error"
              icon={<CloudOff />}
              title="Couldn't load your collections"
              description="The connection failed. Nothing is lost."
              action={<Button variant="secondary" onClick={retry}>Try again</Button>}
            />
          </div>
        ) : (
          gone
        )}
      </div>
    );
  }

  const list = collection.recipeIds;
  const unpublished = list.filter((rid) => known.get(rid) === 'gone').length;
  const shownIds = list.slice(0, shown);
  const editing = edit && list.length > 0;
  const tiles: RecipeTile[] = shownIds.map((rid, i) => {
    const k = known.get(rid);
    const pos = `recipe ${i + 1} of ${list.length}`;
    if (k === 'gone') return { id: rid, emoji: '🍽️', title: 'A deleted recipe', meta: '', gone: true, removeLabel: `Remove deleted ${pos}` };
    if (k === 'failed') return { id: rid, emoji: '⚠️', title: "Couldn't load this recipe", meta: '', gone: true, retry: () => retryTile(rid), removeLabel: `Remove unloaded ${pos}` };
    // Not resolved yet: a placeholder, still removable.
    return k ? { id: rid, ...k } : { id: rid, emoji: '…', title: 'Loading recipe', meta: '', removeLabel: `Remove loading ${pos}` };
  });

  return (
    <div className="pb-8">
      {header(
        <div className="flex items-center gap-1">
          {list.length > 0 && (
            <button
              type="button"
              ref={editRef}
              aria-pressed={editing}
              onClick={() => setEdit((v) => !v)}
              className={`min-h-11 rounded-full px-3 text-sm font-semibold ${editing ? 'bg-accent-100 text-accent-900' : 'text-accent-700'}`}
            >
              Edit
            </button>
          )}
          <IconButton variant="flat" label="More" haspopup="dialog" icon={<EllipsisVertical className="size-6" />} onClick={() => setMenu('more')} />
        </div>
      )}
      <Heading className="break-words px-[22px] pt-4 font-heading text-[30px] leading-[1.1] text-text-primary">{collection.name}</Heading>
      <p aria-live="polite" className="px-[22px] pt-1 text-sm text-neutral-700">{collectionCount(list.length)}</p>
      {menu === null && (message || error) && (
        <p role="alert" className="px-[22px] pt-3 text-sm text-danger-600">
          {message ?? error}
        </p>
      )}
      <div className="px-[22px] pt-4">
        {list.length === 0 ? (
          <p className="text-sm text-text-tertiary">Nothing here yet. Save a recipe and add it to this collection.</p>
        ) : (
          <div ref={gridRef}>
            <RecipeTileGrid
              tiles={tiles}
              removeDisabled={busy}
              linkState={listOriginState(`/kitchen/c/${collection.id}`)}
              currentId={paneId}
              onRemove={editing ? (rid) => void remove(rid, shownIds.indexOf(rid), shownIds) : undefined}
            />
          </div>
        )}
        {shown > COLLECTION_PAGE_SIZE && (
          <p role="status" className="sr-only">
            Showing {Math.min(shown, list.length)} of {list.length} recipes
          </p>
        )}
        {list.length > shown && (
          <Button variant="secondary" className="mt-4 w-full" onClick={() => setShown((n) => n + COLLECTION_PAGE_SIZE)}>
            Show more
          </Button>
        )}
      </div>
      <Sheet open={menu !== null} onClose={closeMenu} labelledBy={titleId}>
        {menu === 'rename' ? (
          <form onSubmit={rename} className="flex flex-col gap-3">
            <h2 id={titleId} className="font-heading text-xl text-text-primary">Rename collection</h2>
            <input
              aria-label="Collection name"
              autoFocus
              value={name}
              disabled={busy}
              maxLength={COLLECTION_NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              className="min-h-11 rounded-full border border-neutral-400 bg-neutral-100 px-4 text-base text-text-primary"
            />
            {message && <p role="alert" className="text-sm text-danger-600">{message}</p>}
            <Button type="submit" disabled={busy}>Save</Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={closeMenu}>Cancel</Button>
          </form>
        ) : menu === 'share' ? (
          <div className="flex flex-col gap-3">
            <h2 id={titleId} className="font-heading text-[22px] text-text-primary">Share as a cookbook</h2>
            {collection.visibility === 'public' ? (
              <>
                <input aria-label="Cookbook link" autoFocus readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="min-h-11 rounded-full border border-neutral-400 bg-neutral-100 px-4 text-base text-text-primary" />
                {message && <p role="alert" className="text-sm text-danger-700">{message}</p>}
                <p role="status" className="sr-only">{copied ? 'Link copied' : status}</p>
                <Button onClick={() => void copy()}>{copied ? 'Copied' : 'Copy link'}</Button>
                {typeof navigator.share === 'function' && <Button variant="secondary" onClick={() => void shareLink()}>Share</Button>}
                <Button variant="ghost" disabled={busy} onClick={() => setStopping(true)}>Stop sharing</Button>
              </>
            ) : (
              <>
                <label htmlFor={descId} className="text-sm font-semibold text-text-primary">Description</label>
                <textarea
                  id={descId}
                  aria-describedby={countId}
                  autoFocus
                  rows={3}
                  value={description}
                  disabled={busy}
                  maxLength={COOKBOOK_DESCRIPTION_MAX}
                  placeholder="What makes these worth cooking?"
                  onChange={(e) => setDescription(e.target.value)}
                  className="rounded-2xl border border-neutral-400 bg-neutral-100 px-4 py-3 text-base text-text-primary"
                />
                <p id={countId} className="text-[13px] text-neutral-700">{description.length}/{COOKBOOK_DESCRIPTION_MAX}</p>
                {unpublished > 0 && <p className="text-[13px] text-neutral-700">{unpublished === 1 ? "1 recipe isn't" : `${unpublished} recipes aren't`} published and won't show.</p>}
                <p className="text-[13px] text-neutral-700">Anyone with the link can see it. Recipes only on your device stay hidden.</p>
                {message && <p role="alert" className="text-sm text-danger-700">{message}</p>}
                <Button disabled={busy} onClick={() => void setSharing(true)}>Share</Button>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <h2 id={titleId} className="font-heading text-xl text-text-primary">{collection.name}</h2>
            <Button
              variant="secondary"
              onClick={() => {
                setName(collection.name);
                setMessage(null);
                setMenu('rename');
              }}
            >
              Rename
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setDescription(collection.description ?? '');
                setMessage(null);
                setMenu('share');
              }}
            >
              Share as a cookbook
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setMenu(null);
                setConfirming(true);
              }}
            >
              Delete
            </Button>
          </div>
        )}
      </Sheet>
      <ConfirmDialog
        open={stopping}
        title="Stop sharing?"
        message="The link stops working for anyone who has it."
        confirmLabel="Stop sharing"
        confirmVariant="danger"
        busy={busy}
        onConfirm={() => void setSharing(false).then(() => setStopping(false))}
        onCancel={() => setStopping(false)}
      />
      <ConfirmDialog
        open={confirming}
        title={`Delete ${collection.name}?`}
        message="The recipes stay saved."
        confirmLabel="Delete"
        confirmVariant="danger"
        busy={busy}
        onConfirm={() => void del()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
