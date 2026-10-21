import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useKitchen } from '../hooks/useKitchen';
import { useSavedFavorites } from '../hooks/useSavedFavorites';
import { countUserCooks } from '../services/firestore';
import { listSummary, splitByPantry } from '../lib/shopping';
import { pluralize } from '../lib/utils';
import { AuthModal } from '../components/auth/AuthModal';
import { TILE_TINTS } from '../components/profile/RecipeTileGrid';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { CalendarDays, ChefHat, CloudOff, Refrigerator, ShoppingBasket, UserRound } from '../components/ui/icons';

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
  const { kitchen, loading, error } = useKitchen();
  const { rows: saved, isLoading: savedLoading } = useSavedFavorites();
  const [showAuth, setShowAuth] = useState(false);
  const [cooks, setCooks] = useState<number | null>(null);
  const verified = isConfigured && !!user && !user.isAnonymous && !!user.emailVerified;
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

  const wait = authLoading || (verified && !kitchen && loading);

  return (
    <div className="pb-8">
      <h1 className="px-5 pt-[52px] font-heading text-[30px] leading-tight text-text-primary">Kitchen</h1>
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
          <h2 id="kitchen-saved" className="font-heading text-[18px] text-text-primary">Saved</h2>
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
    </div>
  );
}
