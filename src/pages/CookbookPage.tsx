import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCookbook } from '../hooks/useCookbook';
import { usePublicProfile } from '../hooks/useProfile';
import { SignUpDialog } from '../components/auth/SignUpDialog';
import { RecipeTileGrid } from '../components/profile/RecipeTileGrid';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { BookOpen, ChevronLeft } from '../components/ui/icons';

const bannerLink =
  'inline-flex min-h-11 items-center rounded-full px-3 text-[13px] font-semibold text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500';

/** A shared cookbook (Organic 27b, RL-258): public, outside the shell, with the slim banner of /shared. */
export function CookbookPage() {
  const { id = '' } = useParams();
  // Keyed so a move to another cookbook never shows the last one's recipes or follow.
  return <CookbookView key={id} id={id} />;
}

function CookbookView({ id }: { id: string }) {
  const { user, isConfigured } = useAuth();
  const [showSignUp, setShowSignUp] = useState(false);
  const c = useCookbook(id);
  const ownerUid = c.cookbook?.ownerUid;
  const { profile } = usePublicProfile(ownerUid);
  const author = profile?.displayName?.trim() || 'a cook';

  const banner = (
    <header className="mx-auto flex w-full max-w-lg items-center gap-1 px-4 pt-3">
      <div className="flex min-w-0 flex-1 items-center gap-1 rounded-full bg-surface-secondary py-0.5 pl-1 pr-1 text-[13px] text-text-secondary">
        <Link to="/" aria-label="Back to Recipe Lab" className="flex size-11 items-center justify-center rounded-full text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500">
          <ChevronLeft className="size-5" />
        </Link>
        <span className="min-w-0 flex-1 truncate">A shared cookbook</span>
        <Link to="/" className={`${bannerLink} bg-surface`}>Get the app</Link>
      </div>
    </header>
  );

  if (c.status === 'loading') {
    return (
      <div className="flex min-h-dvh flex-col bg-surface">
        {banner}
        <div role="status" aria-label="Loading cookbook" className="mx-auto w-full max-w-lg space-y-3 px-[22px] pt-6">
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
  if (c.status !== 'ready' || !c.cookbook) {
    const failed = c.status === 'failed';
    return (
      <div className="flex min-h-dvh flex-col bg-surface">
        {banner}
        <div className="mx-auto w-full max-w-lg px-[22px] pt-4">
          <EmptyState
            compact
            tone="error"
            icon={<BookOpen />}
            title={failed ? "Couldn't load this cookbook" : !isConfigured ? 'Cookbooks need an online account' : "This cookbook isn't available"}
            description={failed ? 'The connection failed. Check it and try again.' : !isConfigured ? 'This copy of Recipe Lab is not connected to the cloud.' : 'It may be private, or it may have been removed.'}
            action={failed ? <Button variant="secondary" onClick={c.retry}>Try again</Button> : <Link to="/" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-700">Go to Recipe Lab</Link>}
          />
        </div>
      </div>
    );
  }

  const { cookbook } = c;
  const needsSignUp = !user?.emailVerified;
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      {banner}
      <main className="mx-auto w-full max-w-lg flex-1 px-[22px] pb-8 pt-4">
        <p className="text-xs font-bold uppercase tracking-wide text-accent-700">
          Cookbook · by{' '}
          {ownerUid ? <Link to={`/profile/${ownerUid}`} className="underline">{author}</Link> : author}
        </p>
        <h1 className="mt-1 break-words font-heading text-[30px] leading-[1.1] text-text-primary">{cookbook.name}</h1>
        {cookbook.description && <p className="mt-2 break-words text-[15px] text-neutral-800">{cookbook.description}</p>}
        {isConfigured && (
          <div className="mt-4">
            <Button
              fullWidth
              variant={c.isFollowing ? 'secondary' : 'primary'}
              disabled={c.followBusy || !c.followReady}
              onClick={needsSignUp ? () => setShowSignUp(true) : () => void c.toggleFollow()}
            >
              <BookOpen className="size-5" />
              {c.isFollowing ? 'Following' : 'Follow this cookbook'}
            </Button>
            <p aria-live="polite" className="mt-1.5 text-center text-[13px] text-neutral-700">{c.followerCount === 1 ? '1 follower' : `${c.followerCount} followers`}</p>
            {c.followLookupFailed && (
              <p role="alert" className="mt-1 text-center text-sm text-danger-700">
                Couldn't check whether you follow this.{' '}
                <button type="button" onClick={c.retryFollowLookup} className="min-h-11 font-semibold underline">Try again</button>
              </p>
            )}
            {c.followError && <p role="alert" className="mt-1 text-center text-sm text-danger-700">{c.followError}</p>}
          </div>
        )}
        <div className="mt-5">
          {c.total === 0 ? <p className="text-sm text-text-tertiary">Nothing here yet.</p> : <RecipeTileGrid tiles={c.tiles} />}
          {c.hasMore && (
            <Button variant="secondary" className="mt-4 w-full" onClick={c.showMore}>
              Show more
            </Button>
          )}
        </div>
      </main>
      <SignUpDialog
        open={showSignUp}
        action={{ kind: 'follow-cookbook' }}
        body="Following a cookbook needs an account with an email."
        onClose={() => setShowSignUp(false)}
      />
    </div>
  );
}
