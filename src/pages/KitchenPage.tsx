import { useContext, useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { RecipePaneContext } from '../contexts/RecipePaneContext';
import { listOriginState } from '../lib/paneMode';
import { useAuth } from '../contexts/AuthContext';
import { COLLECTIONS_LOAD_FAILED_MESSAGE, useCollections } from '../hooks/useCollections';
import { useKitchen } from '../hooks/useKitchen';
import { useSavedFavorites } from '../hooks/useSavedFavorites';
import { countUserCooks } from '../services/firestore';
import { listSummary, splitByPantry } from '../lib/shopping';
import { pluralize } from '../lib/utils';
import { AuthModal } from '../components/auth/AuthModal';
import { CollectionGlyph } from '../components/recipe/CollectionGlyph';
import { useLocalEmoji } from '../hooks/useLocalEmoji';
import { collectionCount, sharedWithLine } from '../lib/kitchen';
import { AvatarStack, InviteSheet, PeopleSheet } from '../components/kitchen/KitchenPeople';
import { TILE_TINTS } from '../components/profile/RecipeTileGrid';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { CalendarDays, ChefHat, ChevronRight, CloudOff, Refrigerator, ShoppingBasket, UserPlus, UserRound } from '../components/ui/icons';

const TILE = 'flex min-h-[118px] flex-col justify-between gap-3 rounded-[28px] p-4';

function Tile({ title, sub, icon, tone, to }: { title: string; sub: string; icon: ReactNode; tone: string; to?: string }) {
  const body = (
    <>
      <span className="flex size-10 items-center justify-center rounded-full bg-surface [&_svg]:size-5">{icon}</span>
      <span>
        <span className="block font-heading text-[17px] leading-tight">{title}</span>
        <span className="block text-xs">{sub}</span>
      </span>
    </>
  );
  return to ? (
    <Link to={to} className={`${TILE} ${tone}`}>{body}</Link>
  ) : (
    <div aria-disabled="true" className={`${TILE} ${tone} opacity-70`}>{body}</div>
  );
}

/** The Kitchen hub (Organic 24a, RL-214): list, pantry, week and cook log tiles over a row of saved recipes. */
export function KitchenPage() {
  const { user, isConfigured, isLoading: authLoading } = useAuth();
  const { kitchen, loading, error, members, isOwner, createInvite, removeMember, leaveKitchen } = useKitchen();
  const location = useLocation();
  const navigate = useNavigate();
  const [showPeople, setShowPeople] = useState(false);
  const [invite, setInvite] = useState<{ url: string | null; error: string } | null>(null);
  // "You're in Hana's kitchen" after a join (RL-239), carried in the navigation state once.
  const [toast, setToast] = useState(() => {
    const joined = (location.state as { joined?: string } | null)?.joined;
    return joined === undefined ? '' : joined ? `You're in ${joined}'s kitchen` : "You're in the kitchen";
  });
  const { rows: saved, isLoading: savedLoading } = useSavedFavorites();
  const { collections, error: collectionsError, retry: retryCollections } = useCollections();
  const emoji = useLocalEmoji(collections, 'kitchen-collections-emoji');
  const [showAuth, setShowAuth] = useState(false);
  const [cooks, setCooks] = useState<number | null>(null);
  const verified = isConfigured && !!user && !user.isAnonymous && !!user.emailVerified;
  // A recipe open beside this list (RL-225) is the page's h1.
  const paneId = useContext(RecipePaneContext);
  const Heading = paneId ? 'h2' : 'h1';
  const Sub = paneId ? 'h3' : 'h2';
  const uid = verified ? user.uid : null;

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    // One-shot count, not the 200-doc cook listener; "–" while loading or when it fails.
    countUserCooks(uid).then(
      (n) => !cancelled && setCooks(n),
      () => {}
    );
    return () => {
      cancelled = true;
      setCooks(null);
    };
  }, [uid]);

  useEffect(() => {
    if (!toast) return;
    if ((location.state as { joined?: string } | null)?.joined !== undefined) navigate(location.pathname, { replace: true, state: null });
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast, navigate, location.pathname, location.state]);

  const openInvite = () => {
    setInvite({ url: null, error: '' });
    createInvite().then(
      (url) => setInvite((v) => v && { url, error: '' }),
      (e: unknown) => setInvite((v) => v && { url: null, error: e instanceof Error ? e.message : String(e) })
    );
  };

  const household = uid && kitchen ? sharedWithLine(members.filter((m) => m.uid !== uid).map((m) => m.name)) : null;

  const wait = authLoading || (verified && !kitchen && loading);

  return (
    <div className="pb-8">
      <div className="flex items-center justify-between gap-3 px-5 pt-[52px]">
        <Heading className="font-heading text-[30px] leading-tight text-text-primary">Kitchen</Heading>
        {household && (
          <button
            type="button"
            aria-haspopup="dialog"
            aria-label={`People. ${household}`}
            onClick={() => setShowPeople(true)}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full"
          >
            <AvatarStack members={members} label={household} />
          </button>
        )}
      </div>
      {household && (
        <div className="flex items-center justify-between gap-3 px-5">
          <p className="min-w-0 break-words text-[13px] text-neutral-700">{household}</p>
          {isOwner && (
            <Button variant="secondary" size="sm" className="gap-1.5" aria-haspopup="dialog" onClick={openInvite}>
              <UserPlus className="size-4" />
              Invite
            </Button>
          )}
        </div>
      )}
      <div className="px-5 pt-[18px]">
        {wait ? (
          <div className="grid grid-cols-2 gap-3" role="status" aria-label="Loading kitchen">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="min-h-[118px] rounded-[28px]" />
            ))}
          </div>
        ) : !verified ? (
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
            <AuthModal
              open={showAuth}
              action={{ kind: 'continue' }}
              onAuthenticated={() => setShowAuth(false)}
              onDismiss={() => setShowAuth(false)}
            />
          </div>
        ) : !kitchen && error ? (
          <EmptyState
            compact
            tone="error"
            icon={<CloudOff />}
            title="Couldn't load your kitchen"
            description="The connection failed. Nothing is lost."
            action={<Button variant="secondary" onClick={() => window.location.reload()}>Try again</Button>}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {/* This week stays a stub until its route exists; a link would lead to a blank page. */}
            <Tile
              to="/kitchen/list"
              title="Shopping list"
              tone="bg-accent-200 text-accent-900"
              icon={<ShoppingBasket className="text-accent-700" />}
              sub={kitchen ? listSummary({ toBuy: splitByPantry(kitchen.shopping, kitchen.pantry).toBuy, inPantry: [] }) : '–'}
            />
            <Tile
              to="/kitchen/pantry"
              title="Pantry"
              tone="bg-accent-2-200 text-accent-2-900"
              icon={<Refrigerator className="text-accent-2-700" />}
              sub={kitchen ? `${kitchen.pantry.length} ${pluralize(kitchen.pantry.length, 'thing')}` : '–'}
            />
            <Tile
              title="This week"
              tone="bg-surface-secondary text-text-primary"
              icon={<CalendarDays className="text-neutral-800" />}
              sub="Soon"
            />
            <Tile
              to="/kitchen/log"
              title="Cook log"
              tone="bg-surface-secondary text-text-primary"
              icon={<ChefHat className="text-neutral-800" />}
              sub={cooks === null ? '–' : `${cooks} ${pluralize(cooks, 'cook')}`}
            />
          </div>
        )}
      </div>
      <section className="px-5 pt-[18px]" aria-labelledby="kitchen-saved">
        <div className="flex items-baseline justify-between">
          <Sub id="kitchen-saved" className="font-heading text-[18px] text-text-primary">Saved</Sub>
          <Link to="/saved" className="inline-flex min-h-[44px] items-center text-[13px] text-accent-700">See all</Link>
        </div>
        {savedLoading ? (
          <div className="flex gap-3 py-1" role="status" aria-label="Loading saved recipes">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="size-[84px] shrink-0 rounded-[26px]" />
            ))}
          </div>
        ) : saved.length === 0 ? (
          <p className="text-[13px] text-text-tertiary">Tap the bookmark on any recipe and it'll wait for you here.</p>
        ) : (
          <ul className="-mx-5 flex gap-3 overflow-x-auto px-5 py-1">
            {saved.map((r, i) => (
              <li key={r.id} className="shrink-0">
                <Link
                  to={`/recipe/${r.id}`}
                  state={listOriginState('/kitchen')}
                  aria-current={r.id === paneId ? 'true' : undefined}
                  aria-label={r.title}
                  className={`flex size-[84px] items-center justify-center rounded-[26px] text-[40px] leading-none ${TILE_TINTS[i % TILE_TINTS.length]}`}
                >
                  {r.emoji}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      {uid && kitchen && (
        <>
          <PeopleSheet
            open={showPeople}
            onClose={() => setShowPeople(false)}
            members={members}
            uid={uid}
            ownerUid={kitchen.ownerUid}
            removeMember={removeMember}
            leaveKitchen={leaveKitchen}
            onLeft={() => {
              setShowPeople(false);
              setToast('You left the kitchen');
            }}
          />
          <InviteSheet open={!!invite} onClose={() => setInvite(null)} onRetry={openInvite} url={invite?.url ?? null} error={invite?.error ?? ''} />
        </>
      )}
      <div
        role="status"
        className={toast ? 'fixed bottom-24 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-xl border border-border bg-surface-secondary px-4 py-3 text-sm font-medium text-text-primary shadow-lg' : 'sr-only'}
      >
        {toast}
      </div>
      {(collections.length > 0 || collectionsError === COLLECTIONS_LOAD_FAILED_MESSAGE) && (
        <section className="px-5 pt-[18px]" aria-labelledby="kitchen-collections">
          <Sub id="kitchen-collections" className="font-heading text-[18px] text-text-primary">Collections</Sub>
          {collections.length === 0 && (
            <div className="flex items-center justify-between gap-3 pt-2">
              <p className="text-[13px] text-text-tertiary">Couldn't load collections</p>
              <Button variant="secondary" onClick={retryCollections}>Try again</Button>
            </div>
          )}
          <ul className="flex flex-col gap-2 pt-2">
            {collections.map((c) => (
              <li key={c.id}>
                <Link to={`/kitchen/c/${c.id}`} className="flex min-h-11 items-center gap-3 rounded-[22px] bg-surface-secondary px-3 py-2.5">
                  <CollectionGlyph collection={c} emoji={emoji} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold text-text-primary">{c.name}</span>
                    <span className="block text-xs text-neutral-700">{collectionCount(c.recipeIds.length)}</span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-neutral-700" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
