import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
        <p className="text-xs text-success-600 dark:text-success-400">
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
    <div className="min-h-dvh flex flex-col bg-surface">
      <TopBar title="My Profile" showBack />

      <main className="flex-1 max-w-lg mx-auto w-full">
        <div className="p-4 space-y-6">
          {/* Avatar + Name */}
          <div className="flex flex-col items-center space-y-3">
            <button onClick={() => setEditingAvatar(!editingAvatar)} className="relative group">
              <Avatar
                uid={user.uid}
                name={user.displayName}
                size="xl"
                photoType={profile?.photoType}
                photoEmoji={profile?.photoEmoji}
                photoBgColor={profile?.photoBgColor}
                photoURL={profile?.photoURL}
              />
              <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                <svg className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" />
                </svg>
              </div>
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
                className="group flex items-center gap-1"
              >
                <h2 className="text-xl font-bold text-text-primary">
                  {user.displayName ?? 'Anonymous'}
                </h2>
                <svg className="w-4 h-4 text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
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

          {/* Stats */}
          <div className="flex border border-border rounded-2xl overflow-hidden divide-x divide-border">
            <StatBox label={pluralize(recipes.length, 'recipe')} value={recipes.length} />
            <StatBox label="views" value={stats.totalViews} />
            <StatBox label={pluralize(stats.totalFavorites, 'favorite')} value={stats.totalFavorites} />
            <StatBox label={pluralize(profile?.followerCount ?? 0, 'follower')} value={profile?.followerCount ?? 0} />
          </div>

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
              <p className="text-sm text-text-tertiary text-center py-4">
                No published recipes yet
              </p>
            )}
          </div>

          {/* Account actions */}
          {user.isAnonymous ? (
            <EmailLinkingForm />
          ) : (
            <Button variant="ghost" fullWidth onClick={signOut}>
              Sign Out
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}

function PublicProfile({ uid }: { uid: string }) {
  const { user } = useAuth();
  const { profile, isLoading: profileLoading } = usePublicProfile(uid);
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

  if (!profile) {
    return (
      <div className="min-h-dvh flex flex-col bg-surface">
        <TopBar title="Profile" showBack />
        <div className="p-8 text-center text-text-secondary max-w-lg mx-auto">
          User not found
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
              <button
                onClick={toggleFollow}
                disabled={followLoading}
                className={`px-6 py-2 rounded-xl text-sm font-medium transition-colors ${
                  isFollowing
                    ? 'bg-surface-secondary text-text-secondary border border-border hover:bg-surface-tertiary'
                    : 'bg-primary-600 text-white hover:bg-primary-700'
                }`}
              >
                {isFollowing ? 'Following' : 'Follow'}
              </button>
            )}
          </div>

          {/* Stats */}
          <div className="flex border border-border rounded-2xl overflow-hidden divide-x divide-border">
            <StatBox label={pluralize(recipes.length, 'recipe')} value={recipes.length} />
            <StatBox label="views" value={stats.totalViews} />
            <StatBox label={pluralize(stats.totalFavorites, 'favorite')} value={stats.totalFavorites} />
            <StatBox label={pluralize(profile.followerCount, 'follower')} value={profile.followerCount} />
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
              <p className="text-sm text-text-tertiary text-center py-4">
                No recipes yet
              </p>
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
    // If viewing own profile via UID, redirect to own profile view
    if (user && user.uid === uid) {
      return <OwnProfile />;
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
            <button
              onClick={() => setShowAuth(true)}
              className="px-6 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors"
            >
              Sign In
            </button>
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
