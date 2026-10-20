import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useOwnProfile, usePublicProfile } from '../hooks/useProfile';
import { useFollow } from '../hooks/useFollow';
import { useForest, type ForestFamilyData } from '../hooks/useForest';
import { forestHeadline, layoutForestFamily } from '../lib/forest';
import { pluralize } from '../lib/utils';
import type { UserProfile } from '../types/profile';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { IconButton } from '../components/ui/IconButton';
import { Skeleton } from '../components/ui/Skeleton';
import { SignUpDialog } from '../components/auth/SignUpDialog';
import { ChevronLeft, CloudOff, RotateCw } from '../components/ui/icons';

function Tile({ family, uid }: { family: ForestFamilyData; uid: string }) {
  const layout = layoutForestFamily(family.recipes, uid);
  const root = family.recipes.find((r) => r.parentId === null);
  const head = root ?? [...family.recipes].sort((a, b) => a.createdAt - b.createdAt)[0];
  // The count query, not the drawn list, is the truth: the drawing is bounded.
  const branches = Math.max(0, family.count - 1);
  const owner = root?.createdBy.displayName ?? 'another cook';
  const meta = layout.planted
    ? `Planted · ${branches} ${pluralize(branches, 'branch', 'branches')}`
    : `Grew ${layout.grewCount} on ${owner}'s`;
  const spoken = layout.planted
    ? `Planted, ${branches} ${pluralize(branches, 'branch', 'branches')}`
    : `Grew ${layout.grewCount} ${pluralize(layout.grewCount, 'version')} on ${owner}'s recipe`;
  return (
    <Link
      to={`/recipe/${layout.target}/tree`}
      className={`flex flex-col gap-2 rounded-[28px] p-3.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 ${
        layout.planted ? 'bg-accent-100' : 'bg-surface-secondary'
      }`}
    >
      {layout.dots.length === 0 && <span aria-hidden="true" className="flex h-[74px] items-center justify-center text-2xl">🌱</span>}
      <svg viewBox="0 0 140 74" width="100%" height={layout.dots.length === 0 ? 0 : 74} aria-hidden="true">
        <path d={layout.path} fill="none" stroke="var(--color-neutral-600)" strokeWidth="3" strokeLinecap="round" />
        {layout.dots.map((d) => (
          <circle
            key={d.id}
            cx={d.x}
            cy={d.y}
            r={d.r}
            fill={d.mine ? 'var(--color-accent)' : 'var(--color-neutral-600)'}
            stroke={d.mine ? 'var(--color-accent-700)' : 'none'}
            strokeWidth="1.5"
          />
        ))}
      </svg>
      <span className="line-clamp-2 break-words text-sm font-bold text-text-primary">
        <span aria-hidden="true">{head.emoji}</span> {head.title}
      </span>
      <span aria-hidden="true" className="text-[11px] text-neutral-700">{meta}</span>
      <span className="sr-only">{spoken}</span>
    </Link>
  );
}

function ForestSkeleton() {
  return (
    <div role="status" aria-label="Loading forest" className="grid grid-cols-2 gap-2.5 px-[18px] pt-6">
      <Skeleton className="h-[150px] rounded-[28px]" />
      <Skeleton className="h-[150px] rounded-[28px]" />
    </div>
  );
}

function ForestView({
  uid,
  name,
  own,
  profile,
  right,
}: {
  uid: string;
  name: string | null;
  own: boolean;
  profile: UserProfile | null;
  right?: React.ReactNode;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, retry } = useForest(uid, own);
  const ready = state.status === 'ready' ? state : null;
  // Headline uses the counts, not the drawn lists: planted = families this person rooted.
  const planted = ready?.families.filter((f) => layoutForestFamily(f.recipes, uid).planted) ?? [];
  const summary = { planted: planted.length, grown: planted.reduce((n, f) => n + Math.max(0, f.count - 1), 0) };

  return (
    <div className="mx-auto min-h-dvh w-full max-w-lg bg-surface pb-8">
      <header className="flex items-center gap-2 px-3 pt-[50px]">
        <IconButton
          variant="flat"
          label="Back"
          icon={<ChevronLeft className="size-6" />}
          onClick={() => (location.key === 'default' ? navigate(own ? '/profile' : `/profile/${uid}`) : navigate(-1))}
        />
        <Avatar
          uid={uid}
          name={name ?? ''}
          size="md"
          photoType={profile?.photoType}
          photoEmoji={profile?.photoEmoji}
          photoBgColor={profile?.photoBgColor}
          photoURL={profile?.photoURL}
        />
        {name === null ? <Skeleton className="h-5 w-24" /> : <h1 className="min-w-0 truncate font-bold text-text-primary">{name}</h1>}
        <span className="flex-1" />
        {right}
      </header>

      {state.status === 'error' ? (
        <EmptyState
          compact
          tone="error"
          icon={<CloudOff />}
          title="Couldn't load the forest"
          description="The connection failed. Nothing is lost."
          action={
            <Button variant="secondary" onClick={retry}>
              <RotateCw className="mr-2 size-4" />
              Try again
            </Button>
          }
        />
      ) : state.status === 'loading' ? (
        <ForestSkeleton />
      ) : state.families.length === 0 ? (
        <EmptyState compact icon="🌱" title="Nothing planted yet" description={own ? 'Recipes you create will grow here.' : `${name ?? 'This cook'} has no recipes yet.`} />
      ) : (
        <>
          <h2 className="px-[22px] pt-4 font-heading text-[28px] leading-[1.12] text-text-primary">
            {forestHeadline(summary.planted, summary.grown)
              .split(/(\d+)/)
              .map((part, i) =>
                i === 1 ? <span key={i} className="text-accent">{part}</span>
                : i === 3 ? <span key={i} className="text-accent-2-600">{part}</span>
                : part
              )}
          </h2>
          <div className="flex gap-3.5 px-[22px] pt-4 text-xs text-neutral-700">
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-full bg-accent" aria-hidden="true" />
              {own ? 'Yours' : `${name ?? 'Their'}'s`}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-full bg-neutral-600" aria-hidden="true" />
              Other cooks'
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2.5 px-[18px] pt-3.5">
            {state.families.map((f) => (
              <Tile key={f.recipes[0].rootId || f.recipes[0].id} family={f} uid={uid} />
            ))}
          </div>
          {/* shortcut: families past the first 12 are only counted, not paged; add paging if people have more. */}
          {(state.more > 0 || state.moreIsLowerBound) && (
            <p className="px-[22px] pt-3 text-xs text-neutral-700">
              and {state.more}{state.moreIsLowerBound ? '+' : ''} more
            </p>
          )}
          {state.partial && (
            <div className="flex items-center gap-3 px-[22px] pt-3 text-xs text-neutral-700">
              <span role="status">Some branches couldn't load</span>
              <Button size="sm" variant="secondary" onClick={retry}>Retry</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function OwnForest({ uid, displayName }: { uid: string; displayName: string | null }) {
  const { profile } = useOwnProfile();
  return <ForestView uid={uid} own name={profile?.displayName ?? displayName ?? 'Anonymous'} profile={profile} />;
}

function PublicForest({ uid }: { uid: string }) {
  const { user, isConfigured } = useAuth();
  const { profile, isLoading: profileLoading, error: profileError, retry: retryProfile } = usePublicProfile(uid);
  const { isFollowing, toggleFollow, loading } = useFollow(uid);
  const [showSignUp, setShowSignUp] = useState(false);
  const name = profileLoading ? null : !profile && profileError ? 'This cook' : (profile?.displayName ?? 'Anonymous');
  return (
    <>
      <ForestView
        uid={uid}
        own={false}
        name={name}
        profile={profile}
        right={
          !profile && profileError ? (
            <Button size="sm" variant="secondary" className="min-h-11" onClick={retryProfile}>Retry</Button>
          ) : isConfigured && (
            <Button
              size="sm"
              variant={isFollowing ? 'secondary' : 'primary'}
              disabled={loading}
              className="h-[38px] min-h-11"
              onClick={user?.emailVerified ? toggleFollow : () => setShowSignUp(true)}
            >
              {isFollowing ? 'Following' : 'Follow'}
            </Button>
          )
        }
      />
      <SignUpDialog
        open={showSignUp}
        action={{ kind: 'follow', name: profile?.displayName ?? null }}
        body="Following shows their new recipes in your feed and lets them see who follows them, so it needs an account with an email."
        onClose={() => setShowSignUp(false)}
        pending={{ kind: 'follow', uid }}
      />
    </>
  );
}

/** 4b Forest view (RL-175): `/profile/forest` (own) and `/profile/:uid/forest`. Reads are public. */
export function ForestPage() {
  const { uid } = useParams<{ uid: string }>();
  const { user, isLoading } = useAuth();
  // Decide own vs someone else's only once auth has settled; a cold load must not redirect early.
  if (isLoading) return <div className="mx-auto min-h-dvh w-full max-w-lg bg-surface pt-[50px]"><ForestSkeleton /></div>;
  // replace: the redirect must not leave a dead entry for Back to bounce off.
  if (!uid) return user ? <OwnForest uid={user.uid} displayName={user.displayName} /> : <Navigate to="/profile" replace />;
  if (user?.uid === uid) return <Navigate to="/profile/forest" replace />;
  return <PublicForest uid={uid} />;
}
