import { useState } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useOwnProfile, usePublicProfile } from '../hooks/useProfile';
import { useOwnRecipes, useUserRecipes } from '../hooks/useUserRecipes';
import { useFollow } from '../hooks/useFollow';
import { TopBar } from '../components/layout/TopBar';
import { Avatar } from '../components/ui/Avatar';
import { AvatarEditor } from '../components/profile/AvatarEditor';
import { AuthModal } from '../components/auth/AuthModal';
import { Skeleton } from '../components/ui/Skeleton';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { pluralize } from '../lib/utils';

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex-1 text-center">
      <p className="text-lg font-bold text-text-primary">{value}</p>
      <p className="text-xs text-text-tertiary">{label}</p>
    </div>
  );
}

function EmailLinkingForm() {
  const { linkEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await linkEmail(email.trim());
      setSent(true);
    } catch {
      setError('Failed to send link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="border border-success-200 bg-success-50 dark:border-success-800 dark:bg-success-950 rounded-2xl p-4 text-center space-y-2">
        <p className="text-sm font-medium text-success-700 dark:text-success-300">
          Check your email!
        </p>
        <p className="text-xs text-success-700 dark:text-success-400">
          We sent a link to <strong>{email}</strong>. Click it to secure your account.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-warning-200 bg-warning-50 dark:border-warning-800 dark:bg-warning-950 rounded-2xl p-4 space-y-3">
      <div className="flex items-start gap-3">
        <svg className="w-5 h-5 text-warning-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
        <div>
          <p className="text-sm font-medium text-warning-800 dark:text-warning-200">
            Your account is anonymous
          </p>
          <p className="text-xs text-warning-700 dark:text-warning-300 mt-0.5">
            Add an email to keep your recipes safe and access them from any device.
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
          }}
        />
        <Button size="sm" onClick={handleSubmit} disabled={loading || !email.trim()}>
          {loading ? 'Sending...' : 'Add Email'}
        </Button>
      </div>
      {error && <p className="text-xs text-danger-600">{error}</p>}
    </div>
  );
}

function OwnProfile() {
  const { user, signOut, updateDisplayName } = useAuth();
  const { profile, updateAvatar, updateName } = useOwnProfile();
  const { recipes, stats, isLoading: recipesLoading } = useOwnRecipes(user?.uid);
  const navigate = useNavigate();
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(user?.displayName ?? '');
  const [nameSaved, setNameSaved] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  if (!user) return null;

  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    await updateDisplayName(trimmed);
    await updateName(trimmed);
    setEditingName(false);
    setNameSaved(true);
    setTimeout(() => setNameSaved(false), 2000);
  };

  return (
    <div className="flex flex-col bg-surface">
      <TopBar title="My Profile" />

      <main className="flex-1 max-w-lg mx-auto w-full">
        <div className="p-4 space-y-6">
          {/* Avatar + Name */}
          <div className="flex flex-col items-center space-y-3">
            {/* The edit affordance used to appear only on hover, which on a phone
                meant the entire avatar editor was invisible and undiscoverable.
                A persistent badge replaces it; the hover tint is kept as a
                pointer-only nicety on top. */}
            <button
              onClick={() => setEditingAvatar(!editingAvatar)}
              className="relative group rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
              aria-label="Change avatar"
              aria-expanded={editingAvatar}
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
              <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/20 transition-colors" />
              <span className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-primary-600 border-2 border-surface flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" />
                </svg>
              </span>
            </button>

            {editingName ? (
              <div className="flex items-center gap-2 w-full max-w-xs">
                <Input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Display name"
                  className="text-center"
                />
                <Button size="sm" onClick={handleSaveName} disabled={!nameInput.trim()}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingName(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setNameInput(user.displayName ?? '');
                  setEditingName(true);
                }}
                className="flex items-center gap-1.5 rounded-lg px-2 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
                aria-label={`Edit display name, currently ${user.displayName ?? 'Anonymous'}`}
              >
                <h2 className="text-xl font-bold text-text-primary">
                  {user.displayName ?? 'Anonymous'}
                </h2>
                {/* Always visible for the same reason as the avatar badge: on touch
                    there is no hover, so a hover-only pencil is no affordance at all. */}
                <svg className="w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" />
                </svg>
              </button>
            )}
            {nameSaved && <span className="text-xs text-success-600">Name saved!</span>}

            <p className="text-sm text-text-tertiary">
              {user.isAnonymous ? 'Anonymous account' : user.email}
            </p>
          </div>

          {/* Avatar editor */}
          {editingAvatar && (
            <div className="border border-border rounded-2xl p-4 bg-surface-secondary">
              <AvatarEditor
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
            </div>
          )}

          {/* Stats. Hidden entirely until there is something to report: a row of
              four zeros is a worse first impression than no row, and it is the
              first thing a brand-new user sees on their own profile.

              Labels are always plural. Previously three of the four switched to
              the singular at exactly 1 while "views" never did, so the row was
              both inconsistent and twitchy as counts crossed 1. With the number
              on its own line above the label, a static plural reads correctly. */}
          {(recipes.length > 0 ||
            stats.totalViews > 0 ||
            stats.totalFavorites > 0 ||
            (profile?.followerCount ?? 0) > 0) && (
            <div className="flex border border-border rounded-2xl overflow-hidden divide-x divide-border">
              <StatBox label="recipes" value={recipes.length} />
              <StatBox label="views" value={stats.totalViews} />
              <StatBox label="favorites" value={stats.totalFavorites} />
              <StatBox label="followers" value={profile?.followerCount ?? 0} />
            </div>
          )}

          {/* Sits above the recipe list, not below it. This is the only thing
              standing between an anonymous user and permanent loss of their
              recipes, and rendering it after the list meant the more you had to
              lose, the further you had to scroll to find it. */}
          {user.isAnonymous && <EmailLinkingForm />}

          {/* My Recipes */}
          <div className="space-y-3">
            <h3 className="font-semibold text-text-primary">My Recipes</h3>
            {recipesLoading ? (
              Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-20" />)
            ) : recipes.length > 0 ? (
              <div className="space-y-2">
                {recipes.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => navigate(`/recipe/${r.id}`)}
                    className="w-full text-left bg-surface rounded-xl border border-border p-3 hover:border-border-strong transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{r.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-text-primary truncate">{r.title}</p>
                        <div className="flex gap-3 text-xs text-text-tertiary mt-0.5">
                          <span>{r.viewCount || 0} {pluralize(r.viewCount || 0, 'view')}</span>
                          <span>{r.favoriteCount || 0} {pluralize(r.favoriteCount || 0, 'fav')}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState compact icon="🍳" title="No published recipes yet" />
            )}
          </div>

          {/* Account actions. Sign Out stays at the bottom — it is a deliberate
              exit, not something to surface urgently. The anonymous branch moved
              up above the recipe list.

              Anonymous users get this too. Withholding it did not protect them,
              it stranded them: no way off a shared device, and no way into an
              existing email account. The confirmation carries the warning. */}
          <Button
            variant="ghost"
            fullWidth
            onClick={() => (user.isAnonymous ? setShowSignOutConfirm(true) : signOut())}
          >
            Sign Out
          </Button>
        </div>
      </main>

      {/* Anonymous accounts have no credential, so signing out is one-way. Says
          so plainly rather than relying on the user to infer it, and names the
          safer alternative sitting further up the page. */}
      <ConfirmDialog
        open={showSignOutConfirm}
        title="Sign out of this anonymous account?"
        message="There's no way to sign back in to an anonymous account. Recipes on this device stay here, but you won't be able to manage the copies you've already shared. Adding an email first keeps the account."
        confirmLabel="Sign Out"
        confirmVariant="danger"
        onConfirm={() => {
          setShowSignOutConfirm(false);
          signOut();
        }}
        onCancel={() => setShowSignOutConfirm(false)}
      />
    </div>
  );
}

function PublicProfile({ uid }: { uid: string }) {
  const { user } = useAuth();
  const {
    profile,
    isLoading: profileLoading,
    error: profileError,
    retry: retryProfile,
  } = usePublicProfile(uid);
  const { recipes, stats, isLoading: recipesLoading } = useUserRecipes(uid);
  const { isFollowing, toggleFollow, loading: followLoading } = useFollow(uid);
  const navigate = useNavigate();

  const isSelf = user?.uid === uid;

  if (profileLoading) {
    return (
      <div className="min-h-dvh flex flex-col bg-surface">
        <TopBar title="Profile" showBack />
        <div className="p-4 space-y-4 max-w-lg mx-auto w-full">
          <div className="flex flex-col items-center gap-3">
            <Skeleton className="w-20 h-20 rounded-full" />
            <Skeleton className="h-6 w-32" />
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
        <TopBar title="Couldn't load" showBack />
        <div className="p-8 max-w-lg mx-auto w-full text-center space-y-3">
          <EmptyState
            icon="📡"
            title="Couldn't load this profile"
            description="The connection failed. The account is probably fine."
          />
          <Button variant="secondary" onClick={retryProfile}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-dvh flex flex-col bg-surface">
        <TopBar title="Profile" showBack />
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

  return (
    <div className="min-h-dvh flex flex-col bg-surface">
      <TopBar title={profile.displayName ?? 'Profile'} showBack />

      <main className="flex-1 max-w-lg mx-auto w-full">
        <div className="p-4 space-y-6">
          {/* Avatar + Name + Follow */}
          <div className="flex flex-col items-center space-y-3">
            <Avatar
              uid={uid}
              name={profile.displayName}
              size="xl"
              photoType={profile.photoType}
              photoEmoji={profile.photoEmoji}
              photoBgColor={profile.photoBgColor}
              photoURL={profile.photoURL}
            />
            <h2 className="text-xl font-bold text-text-primary">
              {profile.displayName ?? 'Anonymous'}
            </h2>

            {user && !isSelf && (
              <Button
                onClick={toggleFollow}
                disabled={followLoading}
                variant={isFollowing ? 'secondary' : 'primary'}
                className="px-6"
              >
                {isFollowing ? 'Following' : 'Follow'}
              </Button>
            )}
          </div>

          {/* Stats */}
          <div className="flex border border-border rounded-2xl overflow-hidden divide-x divide-border">
            <StatBox label="recipes" value={recipes.length} />
            <StatBox label="views" value={stats.totalViews} />
            <StatBox label="favorites" value={stats.totalFavorites} />
            <StatBox label="followers" value={profile.followerCount} />
          </div>

          {/* Recipes */}
          <div className="space-y-3">
            <h3 className="font-semibold text-text-primary">Recipes</h3>
            {recipesLoading ? (
              Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-20" />)
            ) : recipes.length > 0 ? (
              <div className="space-y-2">
                {recipes.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => navigate(`/recipe/${r.id}`)}
                    className="w-full text-left bg-surface rounded-xl border border-border p-3 hover:border-border-strong transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{r.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-text-primary truncate">{r.title}</p>
                        <p className="text-xs text-text-tertiary mt-0.5 line-clamp-1">{r.description}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState compact icon="🍳" title="No recipes yet" />
            )}
          </div>
        </div>
      </main>
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
  if (!isConfigured) {
    return (
      <div className="min-h-dvh flex flex-col bg-surface">
        <TopBar title="Profile" showBack />
        <div className="p-8 text-center text-text-secondary max-w-lg mx-auto">
          Sign in is not available in local-only mode.
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-dvh flex flex-col bg-surface">
        <TopBar title="Profile" showBack />
        <div className="flex-1 flex flex-col items-center justify-center p-8 max-w-lg mx-auto">
          <div className="text-center space-y-4">
            <div className="w-20 h-20 rounded-full bg-surface-secondary flex items-center justify-center mx-auto">
              <svg className="w-10 h-10 text-text-tertiary" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Sign in to view your profile</h2>
              <p className="text-sm text-text-tertiary mt-1">
                Track your recipe stats and customize your avatar
              </p>
            </div>
            <Button onClick={() => setShowAuth(true)} className="px-6">
              Sign In
            </Button>
          </div>
        </div>

        <AuthModal
          open={showAuth}
          onAuthenticated={() => setShowAuth(false)}
          onDismiss={() => setShowAuth(false)}
        />
      </div>
    );
  }

  return <OwnProfile />;
}
