import { useContext, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { RecipePaneContext } from '../contexts/RecipePaneContext';
import { listOriginState } from '../lib/paneMode';
import { useAuth } from '../contexts/AuthContext';
import { useOwnCooks } from '../hooks/useCooks';
import { db } from '../db/database';
import { getPublishedRecipe } from '../services/firestore';
import { cookLogSummary, cookTag, cookWhen, COOK_TAGS, type CookTag } from '../lib/cooks';
import type { Cook } from '../types/social';
import { AuthModal } from '../components/auth/AuthModal';
import { TILE_TINTS } from '../components/profile/RecipeTileGrid';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { IconButton } from '../components/ui/IconButton';
import { Skeleton } from '../components/ui/Skeleton';
import { ChevronLeft, ChefHat, CloudOff, GitBranch, Repeat, UserRound, Wrench } from '../components/ui/icons';

type Meta = { title: string; emoji: string };
const PENDING: Meta = { title: 'Recipe', emoji: '🍽️' };
const DELETED: Meta = { title: 'A deleted recipe', emoji: '🍽️' };
// The thumbnail sits on a surface-secondary card, so that tint is skipped.
const THUMB_TINTS = TILE_TINTS.slice(0, 2);
const MAX_FETCHES = 20;
// Kept for the session so revisiting does not re-read the same recipes.
const fetched = new Map<string, Meta>();

const TAG_STYLE: Record<CookTag, string> = {
  branched: 'bg-accent-2-200 text-accent-2-900',
  again: 'bg-surface text-text-primary',
  tweak: 'bg-accent-100 text-accent-900',
};
const TAG_ICON = { GitBranch, Repeat, Wrench } as const;

/** Titles and emoji for the cooked recipes: Dexie first, then at most 20 published reads. */
function useCookedMeta(cooks: Cook[]) {
  const [meta, setMeta] = useState<Map<string, Meta>>(new Map());
  // Published reads left for this visit, across effect runs.
  const budget = useRef(MAX_FETCHES);
  const key = [...new Set(cooks.map((c) => c.recipeId))].join(',');
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const ids = key.split(',');
    (async () => {
      const out = new Map<string, Meta>();
      const rows = await db.recipes.bulkGet(ids).catch(() => []);
      ids.forEach((id, i) => {
        const r = rows[i];
        if (r) out.set(id, { title: r.title, emoji: r.emoji });
        else if (fetched.has(id)) out.set(id, fetched.get(id)!);
      });
      const missing = ids.filter((id) => !out.has(id));
      const batch = missing.slice(0, budget.current);
      budget.current -= batch.length;
      await Promise.all(
        batch.map(async (id) => {
          try {
            const p = await getPublishedRecipe(id);
            const m = p ? { title: p.title, emoji: p.emoji } : DELETED;
            fetched.set(id, m);
            out.set(id, m);
          } catch {
            // Leave it unresolved this visit rather than call a live recipe deleted.
          }
        })
      );
      if (!cancelled) setMeta(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);
  return meta;
}

function CookCard({ cook, meta, index, now }: { cook: Cook; meta: Meta | undefined; index: number; now: number }) {
  const paneId = useContext(RecipePaneContext);
  const tag = cookTag(cook);
  const { label, icon } = COOK_TAGS[tag];
  const Icon = TAG_ICON[icon as keyof typeof TAG_ICON];
  const { title, emoji } = meta ?? PENDING;
  return (
    <li className="relative flex gap-3 rounded-[28px] bg-surface-secondary p-3">
      <span
        aria-hidden="true"
        className={`flex size-16 shrink-0 items-center justify-center rounded-[22px] text-[30px] leading-none ${THUMB_TINTS[index % THUMB_TINTS.length]}`}
      >
        {emoji}
      </span>
      <div className="min-w-0 flex-1 pr-24">
        <Link
          to={`/recipe/${cook.recipeId}`}
          state={listOriginState('/kitchen/log')}
          aria-current={cook.recipeId === paneId ? 'true' : undefined}
          className="line-clamp-2 break-words text-[15px] font-bold text-text-primary after:absolute after:inset-0 after:rounded-[28px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
        >
          {title}
        </Link>
        <p className="text-xs text-neutral-700">{cookWhen(cook.createdAt, now)}</p>
        {cook.note && <p className="mt-1 break-words text-[13px] italic text-neutral-800">“{cook.note}”</p>}
      </div>
      {/* The branch link sits above the card-wide recipe link. */}
      {cook.branchId ? (
        <Link
          to={`/recipe/${cook.branchId}`}
          state={listOriginState('/kitchen/log')}
          aria-current={cook.branchId === paneId ? 'true' : undefined}
          aria-label="Open the branch"
          className={`absolute right-3 top-3 z-10 flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold before:absolute before:-inset-2 before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 ${TAG_STYLE[tag]}`}
        >
          <Icon className="size-3" />
          {label}
        </Link>
      ) : (
        <span className={`absolute right-3 top-3 flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${TAG_STYLE[tag]}`}>
          <Icon className="size-3" />
          {label}
        </span>
      )}
    </li>
  );
}

function CookSkeleton() {
  return (
    <div role="status" aria-label="Loading cook log" className="space-y-3 px-[22px] pt-6">
      <Skeleton className="h-[88px] rounded-[28px]" />
      <Skeleton className="h-[88px] rounded-[28px]" />
    </div>
  );
}

export function CookLogPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isConfigured, isLoading: authLoading } = useAuth();
  const { status, cooks } = useOwnCooks();
  const meta = useCookedMeta(cooks);
  const [showAuth, setShowAuth] = useState(false);
  const [now] = useState(() => Date.now());
  const verified = isConfigured && !!user?.emailVerified;
  // A recipe open beside this list (RL-225) is the page's h1.
  const Heading = useContext(RecipePaneContext) ? 'h2' : 'h1';

  return (
    <div className="mx-auto min-h-dvh w-full max-w-lg bg-surface pb-8">
      <header className="px-3 pt-[50px]">
        <IconButton
          variant="flat"
          label="Back"
          icon={<ChevronLeft className="size-6" />}
          onClick={() => (location.key === 'default' ? navigate('/profile') : navigate(-1))}
        />
      </header>
      <Heading className="px-[22px] pt-4 font-heading text-[30px] leading-[1.1] text-text-primary">Cook log</Heading>
      {authLoading ? (
        <CookSkeleton />
      ) : !verified ? (
        user && isConfigured && !user.isAnonymous ? (
          <EmptyState compact icon={<UserRound />} title="Verify your email to see your cook log" />
        ) : (
          <>
            <EmptyState
              tone="error"
              icon={<UserRound />}
              title="Sign in to keep a cook log"
              description="Your cooks, notes and branches live here once you sign in."
              action={isConfigured ? <Button onClick={() => setShowAuth(true)}>Sign in</Button> : undefined}
            />
            <AuthModal
              open={showAuth}
              action={{ kind: 'continue' }}
              onAuthenticated={() => setShowAuth(false)}
              onDismiss={() => setShowAuth(false)}
            />
          </>
        )
      ) : status === 'error' ? (
        <EmptyState
          compact
          tone="error"
          icon={<CloudOff />}
          title="Couldn't load your cook log"
          description="The connection failed. Nothing is lost."
          action={<Button variant="secondary" onClick={() => window.location.reload()}>Try again</Button>}
        />
      ) : status === 'loading' ? (
        <CookSkeleton />
      ) : cooks.length === 0 ? (
        <EmptyState
          compact
          icon={<ChefHat />}
          title="Nothing cooked yet"
          description="Tap Cooked on any recipe after you make it."
          action={<Button onClick={() => navigate('/')}>Explore recipes</Button>}
        />
      ) : (
        <>
          <p className="px-[22px] pt-1 text-[13px] text-neutral-700">{cookLogSummary(cooks)}</p>
          <ul className="space-y-3 px-[22px] pt-4">
            {cooks.map((c, i) => (
              <CookCard key={c.id} cook={c} meta={meta.get(c.recipeId)} index={i} now={now} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
