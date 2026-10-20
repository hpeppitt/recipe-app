import { useState, type ReactNode } from 'react';
import { useParams, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useOwnProfile, usePublicProfile } from '../hooks/useProfile';
import { useCollabRecipes } from '../hooks/useCollabRecipes';
import { useOwnRecipes, useUserRecipes } from '../hooks/useUserRecipes';
import { useLocalLibrary } from '../hooks/useRecipeLibrary';
import { useOwnRecipesSyncStatus } from '../hooks/useOwnRecipesSync';
import { useOnline } from '../hooks/useOnline';
import { splitLibrary, type FeedRecipe, type FeedSource } from '../lib/library';
import { useFollow, useFollowers, useFollowingList } from '../hooks/useFollow';
import { usePendingAction } from '../hooks/usePendingAction';
import { Avatar } from '../components/ui/Avatar';
import { AvatarEditor } from '../components/profile/AvatarEditor';
import { AuthModal } from '../components/auth/AuthModal';
import { EmailLinkingForm } from '../components/auth/EmailLinkingForm';
import { SignUpDialog } from '../components/auth/SignUpDialog';
import { useOwnRecipesWaiting } from '../hooks/useOwnRecipesWaiting';
import { Skeleton } from '../components/ui/Skeleton';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { pluralize } from '../lib/utils';
import { EmojiBlob } from '../components/ui/EmojiBlob';
import { IconButton } from '../components/ui/IconButton';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { RecipeTileGrid } from '../components/profile/RecipeTileGrid';
import { ChevronLeft, CloudOff, Pencil, RotateCw, Settings, Trees, UserRound } from '../components/ui/icons';

/** One row in the followers / following list. */
function PersonRow({
  uid,
  displayName,
  onOpen,
}: {
  uid: string;
  displayName: string | null;
  onOpen: (uid: string) => void;
}) {
  return (
    <button
      onClick={() => onOpen(uid)}
      className="w-full min-h-11 flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-surface-secondary transition-colors text-left"
    >
      <Avatar uid={uid} name={displayName} size="sm" />
      <span className="text-sm text-text-primary truncate">
        {displayName ?? 'Anonymous'}
      </span>
    </button>
  );
}

/** A tappable (or inert) stat tile on the own profile, Organic 4a. */
function StatTile({
  label,
  value,
  onClick,
  expanded,
  controls,
}: {
  label: string;
  /** A string is a placeholder while the count is still loading. */
  value: number | string;
  onClick?: () => void;
  expanded?: boolean;
  /** Id of the panel a tappable tile opens. */
  controls?: string;
}) {
  const cls = `min-w-0 rounded-[20px] px-1 py-3 text-center ${expanded ? 'bg-surface-tertiary ring-1 ring-border-strong' : 'bg-surface-secondary'}`;
  const name = `${label}: ${typeof value === 'string' ? 'loading' : value}`;
  const body = (
    <>
      <p className="min-w-0 overflow-hidden font-heading text-xl leading-tight text-text-primary tabular-nums">{value}</p>
      <p className="truncate text-[11px] text-text-tertiary">{label}</p>
    </>
  );
  if (!onClick)
    return (
      <div role="group" aria-label={name} className={cls}>
        {body}
      </div>
    );
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-controls={controls}
      aria-label={name}
      className={`${cls} min-h-11 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500`}
    >
      {body}
    </button>
  );
}

type Tab = 'started' | 'grew' | 'collabs';

/**
 * The Started / Grew (/ Collabs) tabs over the tile grid, shared by the own profile and the
 * local-only "Your recipes" view. Started is own recipes with no parent, Grew is own recipes
 * with a parent, whoever owns the parent (`splitLibrary`). Collabs (RL-173) is other cooks'
 * recipes that credit this person; `collabsUid` is omitted in local-only mode, which hides it. It is
 * read only once the tab is first opened.
 */
function RecipeTabs({
  created,
  branched,
  promptById,
  loading,
  offline,
  hideNoBranches = false,
  collabsUid,
  collabsSelf = false,
}: {
  created: FeedRecipe[];
  branched: FeedRecipe[];
  promptById: ReadonlyMap<string, string>;
  loading: boolean;
  offline: boolean;
  /** Another cook's profile only knows their own recipes, so "No branches yet" could be false there. */
  hideNoBranches?: boolean;
  collabsUid?: string;
  /** Own profile: the empty line says "your suggestion". */
  collabsSelf?: boolean;
}) {
  const [tab, setTab] = useState<Tab>('started');
  const [collabsOpened, setCollabsOpened] = useState(false);
  const collabs = useCollabRecipes(collabsUid, collabsOpened);
  // The count is aria-hidden with a spoken "N recipes", so the name stays "Started ..." as it loads.
  const withCount = (label: string, n: number | string | null) =>
    n === null ? (
      label
    ) : (
      <>
        {label} <span aria-hidden="true">{n}</span>
        <span className="sr-only">{n} recipes</span>
      </>
    );
  const options: { value: Tab; label: ReactNode }[] = [
    { value: 'started', label: withCount('Started', loading ? null : created.length) },
    { value: 'grew', label: withCount('Grew', loading ? null : branched.length) },
    ...(collabsUid
      ? [
          {
            value: 'collabs' as const,
            label: withCount('Collabs', collabs.status === 'ready' ? `${collabs.recipes.length}${collabs.truncated ? '+' : ''}` : null),
          },
        ]
      : []),
  ];
  const showCollabs = tab === 'collabs' && !!collabsUid;
  const tiles =
    tab === 'started'
      ? created.map((r) => ({
          id: r.id,
          emoji: r.emoji,
          title: r.title,
          meta:
            r.childCount > 0
              ? `${r.childCount} ${pluralize(r.childCount, 'branch', 'branches')}`
              : hideNoBranches
                ? ''
                : 'No branches yet',
        }))
      : tab === 'grew'
        ? branched.map((r) => ({
            id: r.id,
            emoji: r.emoji,
            title: r.title,
            meta: promptById.get(r.id)?.trim() ? `"${promptById.get(r.id)}"` : 'Branched',
          }))
        : collabs.recipes.map((r) => ({
            id: r.id,
            emoji: r.emoji,
            title: r.title,
            meta: '',
            owner: { uid: r.createdBy?.uid ?? '', name: r.createdBy?.displayName ?? null },
          }));
  const gridLoading = showCollabs ? collabs.status === 'loading' : loading;
  return (
    <div className="space-y-3">
      <SegmentedControl
        compact
        label="Recipes"
        options={options}
        value={tab}
        onChange={(v) => {
          if (v === 'collabs') setCollabsOpened(true);
          setTab(v);
        }}
      />
      {offline && !showCollabs && (
        <p role="status" className="text-xs text-text-tertiary">
          You're offline. Showing the recipes saved on this device.
        </p>
      )}
      <div aria-live="polite" aria-busy={gridLoading}>
      {gridLoading ? (
        <div className="grid grid-cols-2 gap-2.5">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="aspect-square rounded-[28px]" />
          ))}
        </div>
      ) : showCollabs && collabs.status === 'error' ? (
        <div role="alert">
          <EmptyState
            compact
            icon={<CloudOff />}
            title="Couldn't load collabs"
            description="The connection failed. Nothing is lost."
            action={
              <Button variant="secondary" className="border-border-strong!" onClick={collabs.retry}>
                <RotateCw className="mr-2 size-4" />
                Try again
              </Button>
            }
          />
        </div>
      ) : showCollabs && tiles.length === 0 ? (
        <EmptyState
          compact
          icon="🤝"
          title="No collabs yet"
          description={`Recipes where ${collabsSelf ? 'your' : 'their'} suggestion was applied show up here.`}
        />
      ) : (
        <RecipeTileGrid tiles={tiles} />
      )}
      </div>
      {showCollabs && collabs.status === 'ready' && collabs.truncated && (
        <p className="px-1 text-xs text-text-tertiary">Showing the first 50.</p>
      )}
    </div>
  );
}

/** Dexie rows split for the tabs, plus the loading and offline state the tabs need. */
function useRecipeTabs(uid: string | undefined, isConfigured: boolean) {
  const rows: readonly (FeedSource & { prompt?: string })[] | undefined = useLocalLibrary();
  const waitingForSync = useOwnRecipesWaiting();
  const syncStatus = useOwnRecipesSyncStatus();
  const online = useOnline();
  const split = rows ? splitLibrary(rows, rows, { uid, isConfigured }) : undefined;
  const created = split?.created ?? [];
  const branched = split?.branched ?? [];
  return {
    created,
    branched,
    promptById: new Map((rows ?? []).map((r) => [r.id, r.prompt ?? ''])),
    // The skeleton replaces only an empty list, never recipes already in Dexie.
    loading: !rows || (waitingForSync && created.length + branched.length === 0),
    offline: !online && syncStatus !== 'synced' && syncStatus !== 'off',
  };
}

function OwnProfile() {
  const { user, updateDisplayName, isConfigured } = useAuth();
  const { profile, loaded: profileLoaded, updateAvatar, updateName } = useOwnProfile();
  const { stats, statsStatus } = useOwnRecipes(user?.uid);
  const tabs = useRecipeTabs(user?.uid, isConfigured);
  const navigate = useNavigate();
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(user?.displayName ?? '');
  const [nameSaved, setNameSaved] = useState(false);
  const [showSignUp, setShowSignUp] = useState(false);
  // Which list, if any, the user has opened from the stat row. Inline disclosure
  // rather than a new route: it is a short list read in context, and a separate
  // screen would be more navigation for less.
  const [openList, setOpenList] = useState<'followers' | 'following' | null>(null);
  const { followers, isLoading: followersLoading, error: followersError } = useFollowers();
  const { followingProfiles, isLoading: followingLoading } = useFollowingList();

  if (!user) return null;

  // The profile document is cloud-only and verified-only (decision 1a), so an
  // anonymous account's edit buttons lead to sign-up instead of a denied write.
  const needsSignUp = !user.emailVerified;

  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    await updateDisplayName(trimmed);
    await updateName(trimmed);
    setEditingName(false);
    setNameSaved(true);
    setTimeout(() => setNameSaved(false), 2000);
  };

  const since = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString('en', { month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="flex flex-col bg-surface">
      <main className="flex-1 max-w-lg mx-auto w-full">
        <div className="flex justify-end px-3 pt-2">
          <IconButton variant="flat" label="Forest view" href="/profile/forest" icon={<Trees className="size-6" />} />
          <IconButton variant="flat" label="Settings" href="/settings" icon={<Settings className="size-6" />} />
        </div>
        <div className="space-y-5 px-[22px] pb-6">
          <div className="flex items-center gap-4">
            {/* The edit affordance used to appear only on hover, which on a phone
                meant the avatar editor was invisible. A persistent badge stays. */}
            <button
              onClick={() => (needsSignUp ? setShowSignUp(true) : setEditingAvatar(true))}
              className="relative shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
              aria-label="Change avatar"
              aria-haspopup="dialog"
            >
              <EmojiBlob
                size={84}
                tint="bg-transparent"
                className="overflow-hidden [&>div]:size-full! [&>div]:text-4xl! [&>div]:font-heading"
              >
                <Avatar
                  uid={user.uid}
                  name={user.displayName}
                  size="xl"
                  photoType={profile?.photoType}
                  photoEmoji={profile?.photoEmoji}
                  photoBgColor={profile?.photoBgColor}
                  photoURL={profile?.photoURL}
                />
              </EmojiBlob>
              <span className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-primary-600 border-2 border-surface flex items-center justify-center">
                <Pencil className="w-3.5 h-3.5 text-on-accent" />
              </span>
            </button>

            <div className="min-w-0 flex-1">
              {editingName ? (
                <div className="flex w-full flex-col gap-2">
                  <Input
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Display name"
                    className="w-full min-w-0"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveName} disabled={!nameInput.trim()}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingName(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    if (needsSignUp) {
                      setShowSignUp(true);
                      return;
                    }
                    setNameInput(user.displayName ?? '');
                    setEditingName(true);
                  }}
                  className="flex min-h-11 w-full min-w-0 items-center gap-1.5 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
                  aria-label={`Edit display name, currently ${user.displayName ?? 'Anonymous'}`}
                >
                  <h2 className="min-w-0 break-words font-heading text-[26px] leading-[1.1] text-text-primary">
                    {user.displayName ?? 'Anonymous'}
                  </h2>
                  {/* Always visible: on touch there is no hover. */}
                  <Pencil className="size-4 shrink-0 text-text-tertiary" />
                </button>
              )}
              {nameSaved && <span className="text-xs text-success-600">Name saved!</span>}
              {(user.isAnonymous || since) && (
                <p className="text-[13px] text-text-tertiary">
                  {user.isAnonymous ? 'Guest · this device only' : `Cooking since ${since}`}
                </p>
              )}
            </div>
          </div>

          {/* Above the grid, not below: this is all that stands between an
              anonymous user and losing their recipes. */}
          {user.isAnonymous && (
            <div className="space-y-2.5 rounded-[28px] bg-accent-100 p-4">
              <p className="text-[15px] font-bold text-text-primary">Your bookmarks only live on this device</p>
              <p className="text-[13px] text-accent-900">
                Add an email to keep them if you switch or lose this device.
              </p>
              <EmailLinkingForm bare />
            </div>
          )}

          <div className="space-y-2">
            <div className="grid grid-cols-4 gap-2">
              <StatTile label="Started" value={tabs.loading ? '–' : tabs.created.length} />
              <StatTile label="Grew" value={tabs.loading ? '–' : tabs.branched.length} />
              <StatTile
                label="Followers"
                value={profileLoaded ? (profile?.followerCount ?? 0) : '–'}
                expanded={openList === 'followers'}
                controls="followers-panel"
                onClick={() => setOpenList(openList === 'followers' ? null : 'followers')}
              />
              <StatTile label="Saves" value={tabs.loading || statsStatus !== 'ready' ? '–' : stats.totalFavorites} />
            </div>
            <button
              type="button"
              onClick={() => setOpenList(openList === 'following' ? null : 'following')}
              aria-expanded={openList === 'following'}
              aria-controls="following-panel"
              className="min-h-11 rounded-lg text-sm text-accent-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
            >
              Following{profileLoaded ? ` ${profile?.followingCount ?? followingProfiles.length}` : ''}
            </button>
            {stats.totalViews > 0 && (
              <p className="text-[13px] text-text-tertiary">
                {stats.totalViews} {pluralize(stats.totalViews, 'view')}
              </p>
            )}

            {openList === 'followers' && (
              <div id="followers-panel" className="border border-border rounded-2xl p-2">
                {followersLoading ? (
                  <p className="text-sm text-text-tertiary text-center py-3">Loading...</p>
                ) : followersError ? (
                  <p className="text-sm text-text-secondary text-center py-3">
                    Couldn't load your followers.
                  </p>
                ) : followers.length === 0 ? (
                  <EmptyState compact icon="👤" title="No followers yet" />
                ) : (
                  followers.map((f) => (
                    <PersonRow
                      key={f.uid}
                      uid={f.uid}
                      displayName={f.displayName}
                      onOpen={(uid) => navigate(`/profile/${uid}`)}
                    />
                  ))
                )}
              </div>
            )}

            {openList === 'following' && (
              <div id="following-panel" className="border border-border rounded-2xl p-2">
                {followingLoading ? (
                  <p className="text-sm text-text-tertiary text-center py-3">Loading...</p>
                ) : followingProfiles.length === 0 ? (
                  <EmptyState compact icon="👥" title="Not following anyone yet" />
                ) : (
                  followingProfiles.map((p) => (
                    <PersonRow
                      key={p.uid}
                      uid={p.uid}
                      displayName={p.displayName}
                      onOpen={(uid) => navigate(`/profile/${uid}`)}
                    />
                  ))
                )}
              </div>
            )}
          </div>

          <RecipeTabs {...tabs} collabsUid={user.uid} collabsSelf />
        </div>
      </main>

      <AvatarEditor
        open={editingAvatar}
        onClose={() => setEditingAvatar(false)}
        uid={user.uid}
        name={user.displayName}
        currentPhotoType={profile?.photoType ?? 'generated'}
        currentPhotoEmoji={profile?.photoEmoji ?? null}
        currentPhotoBgColor={profile?.photoBgColor ?? null}
        currentPhotoURL={profile?.photoURL ?? null}
        onSave={async (data) => {
          await updateAvatar(data);
          setEditingAvatar(false);
        }}
      />

      <SignUpDialog
        open={showSignUp}
        action={{ kind: 'edit-profile' }}
        body="Your name and avatar are shown to other cooks, so they belong to an account with an email. Your bookmarks stay on this device either way."
        onClose={() => setShowSignUp(false)}
      />
    </div>
  );
}

/** Local-only build: no account, so no identity or stats, just every recipe on the device. */
function LocalRecipes() {
  const tabs = useRecipeTabs(undefined, false);
  return (
    <div className="max-w-lg mx-auto w-full space-y-4 px-[22px] pt-4 pb-6">
      <h1 className="font-heading text-[26px] leading-[1.1] text-text-primary">Your recipes</h1>
      <RecipeTabs {...tabs} />
    </div>
  );
}

/** Flat back button, shared by every public profile state. With no history (a deep link) it goes home. */
function BackRow({ forestUid }: { forestUid?: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <div className="flex justify-between px-3 pt-2">
      <IconButton
        variant="flat"
        label="Back"
        icon={<ChevronLeft className="size-6" />}
        onClick={() => (location.key === 'default' ? navigate('/') : navigate(-1))}
      />
      {forestUid && <IconButton variant="flat" label="Forest view" href={`/profile/${forestUid}/forest`} icon={<Trees className="size-6" />} />}
    </div>
  );
}

function PublicProfile({ uid }: { uid: string }) {
  const { user, isConfigured } = useAuth();
  const [showSignUp, setShowSignUp] = useState(false);
  const {
    profile,
    isLoading: profileLoading,
    error: profileError,
    retry: retryProfile,
  } = usePublicProfile(uid);
  const { recipes, stats, isLoading: recipesLoading } = useUserRecipes(uid);
  const {
    isFollowing,
    toggleFollow,
    loading: followLoading,
    error: followError,
    ready: followReady,
  } = useFollow(uid);

  const isSelf = user?.uid === uid;
  // The follow a sign-in link was asked for (RL-136). Follows only, never unfollows; on your
  // own profile it is dropped, since the lookup never runs there.
  usePendingAction(
    (a) => a.kind === 'follow' && a.uid === uid && !profileLoading && !!profile && (isSelf || followReady),
    () => {
      if (!isSelf && !isFollowing) void toggleFollow();
    }
  );
  // Following is a cloud write, so signed-out and anonymous visitors see the
  // button but get the sign-up call to action (decision 1a).
  const needsSignUp = !user?.emailVerified;

  if (profileLoading) {
    return (
      <div className="min-h-dvh flex flex-col bg-surface">
        <BackRow />
        <div className="px-[22px] space-y-4 max-w-lg mx-auto w-full">
          <div className="flex items-center gap-4">
            <Skeleton className="size-[84px] rounded-full" />
            <Skeleton className="h-7 w-32" />
          </div>
          <Skeleton className="h-16" />
        </div>
      </div>
    );
  }

  // A dropped connection is not a deleted account. Saying "User not found" for a
  // network failure tells the visitor something untrue about another person.
  if (!profile && profileError) {
    return (
      <div className="min-h-dvh flex flex-col bg-surface">
        <BackRow />
        <div className="p-8 max-w-lg mx-auto w-full">
          <EmptyState
            tone="error"
            icon={<CloudOff />}
            title="Couldn't load this profile"
            description="The connection failed. The account is probably fine."
            action={
              <Button variant="secondary" className="border-border-strong!" onClick={retryProfile}>
                <RotateCw className="mr-2 size-4" />
                Try again
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-dvh flex flex-col bg-surface">
        <BackRow />
        <div className="p-8 max-w-lg mx-auto w-full">
          <EmptyState
            icon="🔍"
            title="User not found"
            description="This account may have been deleted."
          />
        </div>
      </div>
    );
  }

  const name = profile.displayName ?? 'Anonymous';
  const { created, branched } = splitLibrary(recipes, recipes, { uid, isConfigured: true });
  const promptById = new Map(recipes.map((r) => [r.id, r.prompt ?? '']));

  return (
    <div className="min-h-dvh flex flex-col bg-surface">
      <BackRow forestUid={uid} />

      <main className="flex-1 max-w-lg mx-auto w-full">
        <div className="space-y-5 px-[22px] pb-6">
          <div className="flex items-center gap-4">
            <EmojiBlob
              size={84}
              tint="bg-transparent"
              className="shrink-0 overflow-hidden [&>div]:size-full! [&>div]:text-4xl! [&>div]:font-heading"
            >
              <Avatar
                uid={uid}
                name={profile.displayName}
                size="xl"
                photoType={profile.photoType}
                photoEmoji={profile.photoEmoji}
                photoBgColor={profile.photoBgColor}
                photoURL={profile.photoURL}
              />
            </EmojiBlob>
            <h2 className="min-w-0 flex-1 break-words font-heading text-[26px] leading-[1.1] text-text-primary">
              {name}
            </h2>
          </div>

          {isConfigured && !isSelf && (
            <Button
              onClick={needsSignUp ? () => setShowSignUp(true) : toggleFollow}
              disabled={followLoading}
              variant={isFollowing ? 'secondary' : 'primary'}
              fullWidth
              className="h-[46px] text-[15px]"
            >
              <span className="min-w-0 truncate">{isFollowing ? 'Following' : `Follow ${name}`}</span>
            </Button>
          )}
          {followError && (
            <p role="alert" className="text-sm text-danger-700 text-center">
              {followError}
            </p>
          )}

          <div className="space-y-2">
            <div className="grid grid-cols-4 gap-2">
              <StatTile label="Started" value={recipesLoading ? '–' : created.length} />
              <StatTile label="Grew" value={recipesLoading ? '–' : branched.length} />
              <StatTile label="Followers" value={profile.followerCount ?? 0} />
              <StatTile label="Saves" value={recipesLoading ? '–' : stats.totalFavorites} />
            </div>
            {stats.totalViews > 0 && (
              <p className="text-[13px] text-text-tertiary">
                {stats.totalViews} {pluralize(stats.totalViews, 'view')}
              </p>
            )}
          </div>

          <RecipeTabs
            created={created}
            branched={branched}
            promptById={promptById}
            loading={recipesLoading}
            offline={false}
            hideNoBranches
            collabsUid={isConfigured ? uid : undefined}
          />
        </div>
      </main>

      <SignUpDialog
        open={showSignUp}
        action={{ kind: 'follow', name: profile.displayName }}
        body="Following shows their new recipes in your feed and lets them see who follows them, so it needs an account with an email."
        onClose={() => setShowSignUp(false)}
        pending={{ kind: 'follow', uid }}
      />
    </div>
  );
}

export function ProfilePage() {
  const { uid } = useParams<{ uid: string }>();
  const { user, isConfigured } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

  // Public profile
  if (uid) {
    // A real redirect rather than rendering OwnProfile in place. OwnProfile now
    // lives inside AppShell and relies on it for height and nav; rendering it
    // here would drop it outside the shell with no bottom nav.
    if (user && user.uid === uid) {
      return <Navigate to="/profile" replace />;
    }
    return <PublicProfile uid={uid} />;
  }

  // Own profile - needs auth
  if (!isConfigured) return <LocalRecipes />;

  if (!user) {
    return (
      <>
        <div className="mx-auto flex w-full max-w-lg justify-end px-3 pt-2">
          <IconButton variant="flat" label="Settings" href="/settings" icon={<Settings className="size-6" />} />
        </div>
        {/* The error tone is the terracotta blob the 19a signed-out state asks for. */}
        <EmptyState
          tone="error"
          icon={<UserRound />}
          title="You're browsing"
          description="Reading is free. Sign in to save recipes, branch them and follow cooks."
          action={<Button onClick={() => setShowAuth(true)}>Sign in</Button>}
        />
        <AuthModal
          open={showAuth}
          action={{ kind: 'continue' }}
          onAuthenticated={() => setShowAuth(false)}
          onDismiss={() => setShowAuth(false)}
        />
      </>
    );
  }

  return <OwnProfile />;
}
