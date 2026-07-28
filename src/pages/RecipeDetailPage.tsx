import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useRecipe, useRecipeChildren, useRecipeAncestors } from '../hooks/useRecipe';
import { useFavorite } from '../hooks/useFavorites';
import { useSuggestions, useSubmitSuggestion } from '../hooks/useSuggestions';
import { useAuth } from '../contexts/AuthContext';
import { deleteRecipeTree } from '../db/recipes';
import {
  deletePublishedRecipeTree,
  getPublishedRecipe,
  incrementRecipeViews,
  publishRecipe,
} from '../services/firestore';
import { isFirebaseConfigured } from '../services/firebase';
import { pickShareUrl } from '../lib/share';
import { withTimeout, timeAgo, pluralize } from '../lib/utils';
import { trackRecipeViewed, trackRecipeShared, trackRecipeDeleted } from '../services/analytics';
import { TopBar } from '../components/layout/TopBar';
import { RecipeContent } from '../components/recipe/RecipeContent';
import { LineageBreadcrumb } from '../components/recipe/LineageBreadcrumb';
import { VariationChips } from '../components/recipe/VariationChips';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { AuthModal } from '../components/auth/AuthModal';
import { SuggestChangeModal } from '../components/recipe/SuggestChangeModal';
import { Skeleton } from '../components/ui/Skeleton';
import { Spinner } from '../components/ui/Spinner';
import { Avatar } from '../components/ui/Avatar';
import { canManageRecipe } from '../lib/ownership';

/** How long Share waits on the cloud before falling back to a self-contained link. */
const SHARE_PUBLISH_TIMEOUT_MS = 4000;

export function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isConfigured } = useAuth();
  const { recipe, source, isLoading, cloudError, retry } = useRecipe(id);
  const location = useLocation();
  const { children } = useRecipeChildren(id);
  const { ancestors } = useRecipeAncestors(recipe);
  const { isFavorite, toggleFavorite, canFavorite } = useFavorite(id);
  const { suggestions, approve, reject } = useSuggestions(id);
  const { submit: submitSuggestion } = useSubmitSuggestion();
  const [showDelete, setShowDelete] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareMode, setShareMode] = useState<'cloud' | 'self-contained'>('cloud');
  const [isSharing, setIsSharing] = useState(false);
  // Holds the link when the clipboard is unavailable, so it can be shown for
  // manual copying instead of the action silently failing.
  const [shareFallback, setShareFallback] = useState<{
    url: string;
    mode: 'cloud' | 'self-contained';
  } | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);
  // Set by the save flow via navigation state. 'local' means the recipe is on
  // this device but the cloud publish did not land, which the user previously
  // had no way of knowing — it was a console.error and nothing else.
  const savedOutcome = (location.state as { saved?: 'cloud' | 'local' } | null)?.saved;
  const [showSavedToast, setShowSavedToast] = useState(!!savedOutcome);
  // Which suggestion is mid-review. Both buttons on every row disable while one
  // is in flight: a slow link previously allowed a double-tap, or approving one
  // suggestion while rejecting another.
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<{ id: string; message: string } | null>(null);

  // Fails closed: while the recipe is still resolving, `source` is undefined and
  // the destructive menu stays hidden rather than flashing in.
  const isOwner = canManageRecipe({
    isConfigured,
    source,
    userUid: user?.uid,
    createdByUid: recipe?.createdBy?.uid,
  });

  const handleBack = () => {
    // Respect real history: arriving from the version tree, a profile or a
    // notification should return there, not jump to the parent recipe. The old
    // handler also used `replace: true`, which discarded the current entry and
    // left the hardware back button inconsistent with the on-screen one.
    // React Router labels the first entry of a session 'default', so any other
    // key means there is somewhere in-app to go back to.
    if (location.key !== 'default') {
      navigate(-1);
      return;
    }
    // Deep link with nothing behind it: go up the lineage if there is one.
    navigate(recipe?.parentId ? `/recipe/${recipe.parentId}` : '/');
  };

  const handleShare = async () => {
    if (!recipe || isSharing) return;
    setIsSharing(true);
    try {
      let isPublished = false;
      if (isFirebaseConfigured) {
        // Bounded so an unreachable backend degrades to a self-contained link
        // instead of leaving the user waiting on a Firestore retry loop.
        isPublished = await withTimeout(
          (async () => {
            if (await getPublishedRecipe(recipe.id)) return true;
            // Publishing at save time is fire-and-forget, so it may never have
            // landed. Retry here rather than hand out a link that 404s.
            // publishRecipe itself now distinguishes create from update, so a
            // re-publish no longer resets the counters.
            await publishRecipe(recipe);
            return true;
          })().catch((err) => {
            console.error('Could not publish recipe before sharing', err);
            return false;
          }),
          SHARE_PUBLISH_TIMEOUT_MS,
          false
        );
      }

      const { url, mode } = pickShareUrl(recipe, {
        firebaseConfigured: isFirebaseConfigured,
        isPublished,
      });

      // The clipboard write was inside a try with only a finally, so a rejection
      // — insecure context, denied permission, unfocused document — produced no
      // signal whatsoever: the tap simply did nothing. Surfacing the URL is
      // better than reporting failure, since the user can still copy it by hand.
      try {
        await navigator.clipboard.writeText(url);
      } catch (err) {
        console.error('Copying the share link to the clipboard failed', err);
        setShareFallback({ url, mode });
        return;
      }

      setShareMode(mode);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 3000);
      trackRecipeShared(recipe.id);
    } finally {
      setIsSharing(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    trackRecipeDeleted(id);
    const rootId = recipe?.rootId;
    const deletedLocally = await deleteRecipeTree(id);
    if (isFirebaseConfigured) {
      // Cascade to the cloud so published variations aren't left orphaned and
      // still reachable via /shared/:id. Descendants owned by other users are
      // denied by the rules and stay published; that needs a Cloud Function.
      deletePublishedRecipeTree(id, rootId ?? id, deletedLocally).catch(() => {});
    }
    navigate('/', { replace: true });
  };

  // Only cloud recipes belonging to someone else can be suggested against:
  // canManageRecipe treats anything in this device's library as the user's own,
  // and a suggestion needs a published doc to reference.
  const canSuggest = isConfigured && !isOwner && source === 'cloud';

  const handleSuggestClick = () => {
    if (!user) {
      setShowAuth(true);
      return;
    }
    setShowSuggest(true);
  };

  const handleSubmitSuggestion = async (message: string) => {
    if (!recipe || !id) return;
    await submitSuggestion({
      recipeId: id,
      recipeOwnerId: recipe.createdBy?.uid ?? 'local',
      recipeTitle: recipe.title,
      recipeEmoji: recipe.emoji,
      message,
    });
  };

  const handleReview = async (
    suggestionId: string,
    action: 'approve' | 'reject',
    message: string
  ) => {
    if (reviewingId) return;
    setReviewingId(suggestionId);
    setReviewError(null);
    try {
      if (action === 'approve') {
        await approve(suggestionId);
        navigate(`/recipe/${id}/vary`, { state: { suggestion: message } });
        return;
      }
      await reject(suggestionId);
    } catch (err) {
      console.error(`Reviewing the suggestion (${action}) failed`, err);
      setReviewError(
        action === 'approve'
          ? "Couldn't approve that suggestion. Please try again."
          : "Couldn't reject that suggestion. Please try again."
      );
    } finally {
      // Left set on the approve path only if navigation did not happen; the
      // early return above means a successful approve unmounts this anyway.
      setReviewingId(null);
    }
  };

  const handleFavoriteToggle = () => {
    if (!recipe) return;
    // Favourites are keyed by uid. Signed out with Firebase available, offer to
    // sign in rather than no-op silently, matching SharedRecipePage (FUN-16).
    if (!canFavorite) {
      setShowAuth(true);
      return;
    }
    toggleFavorite({
      ownerId: recipe.createdBy?.uid ?? 'local',
      title: recipe.title,
      emoji: recipe.emoji,
    });
  };

  // Track view, at most once per recipe per mount.
  //
  // StrictMode runs effects twice in dev (mount, cleanup, mount again), which
  // fired two increments for every page view. Since dev now points at the real
  // Firestore project, that inflated live view counts. The ref survives the
  // remount because React reuses the same component instance, so it is the
  // standard guard for a genuinely one-shot side effect.
  // Auto-dismiss the save confirmation. Kept longer for the local-only case:
  // that one carries a consequence the user needs time to actually read.
  useEffect(() => {
    if (!showSavedToast) return;
    const ms = savedOutcome === 'local' ? 8000 : 3000;
    const timer = setTimeout(() => setShowSavedToast(false), ms);
    return () => clearTimeout(timer);
  }, [showSavedToast, savedOutcome]);

  const viewCountedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!id || !isFirebaseConfigured) return;
    if (viewCountedRef.current === id) return;
    viewCountedRef.current = id;
    incrementRecipeViews(id);
    trackRecipeViewed(id);
  }, [id]);

  const creatorName = recipe?.createdBy?.displayName;
  // Published docs carry favoriteCount; a purely local recipe has none. Read
  // defensively rather than widening Recipe, since it is a cloud-only field.
  const favoriteCount =
    (recipe as unknown as { favoriteCount?: number } | undefined)?.favoriteCount ?? 0;
  const pendingSuggestions = suggestions.filter((s) => s.status === 'pending');

  if (isLoading) {
    return (
      <div className="max-w-lg mx-auto">
        <TopBar title="Loading..." showBack />
        <div className="p-4 space-y-4">
          <Skeleton className="h-12" />
          <Skeleton className="h-8" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  if (!recipe) {
    // Absence after a failed lookup is not the same as absence: telling someone
    // their recipe doesn't exist when the network broke is actively misleading.
    return (
      <div className="max-w-lg mx-auto">
        <TopBar title={cloudError ? "Couldn't load" : 'Not found'} showBack />
        <div className="p-8 text-center space-y-3">
          <p className="text-4xl">{cloudError ? '📡' : '🔍'}</p>
          <p className="text-text-secondary">
            {cloudError
              ? "We couldn't reach the recipe library. Check your connection and try again."
              : 'Recipe not found.'}
          </p>
          {cloudError && <Button onClick={retry}>Try Again</Button>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col bg-surface">
      <TopBar
        title={recipe.title}
        showBack
        onBack={handleBack}
        right={
          // Two visible controls and a menu, never four. The old row put four
          // 44px buttons in an h-14 header with no flex direction set, so they
          // stacked: 176px centred in 56px pushed the first two to y=-60 and
          // y=-16, off-screen and unreachable (UX-36). `flex` fixes the stacking;
          // moving Share and Version tree into the menu is what stops the title
          // being crushed to ~55px at 320px (UX-19).
          <div className="relative flex items-center gap-1 flex-shrink-0">
            {/* Hidden entirely in local-only mode: favourites need a uid and no
                account can be created without Firebase, so the control could
                never do anything (FUN-16). When Firebase is available but the
                user is signed out, it stays and prompts sign-in. */}
            {isConfigured && (
              <button
                onClick={handleFavoriteToggle}
                className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-surface-tertiary transition-colors flex-shrink-0"
                aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                {isFavorite ? (
                  <svg className="w-5 h-5 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                    <path d="m11.645 20.91-.007-.003-.022-.012a15.247 15.247 0 0 1-.383-.218 25.18 25.18 0 0 1-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0 1 12 5.052 5.5 5.5 0 0 1 16.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 0 1-4.244 3.17 15.247 15.247 0 0 1-.383.219l-.022.012-.007.004-.003.001a.752.752 0 0 1-.704 0l-.003-.001Z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 5.65a5.5 5.5 0 0 0-7.752.22 5.5 5.5 0 0 0-7.752-.22 5.52 5.52 0 0 0 0 7.81l6.573 6.631a1.75 1.75 0 0 0 2.358 0l6.573-6.631a5.52 5.52 0 0 0 0-7.81Z" />
                  </svg>
                )}
              </button>
            )}

            {/* The menu is no longer owner-only, since Share and Version tree
                live in it and everyone needs those. */}
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-surface-tertiary transition-colors relative flex-shrink-0"
              aria-label={
                pendingSuggestions.length > 0
                  ? `More options, ${pendingSuggestions.length} suggestions pending`
                  : 'More options'
              }
              aria-expanded={showMenu}
              aria-haspopup="menu"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
              </svg>
              {pendingSuggestions.length > 0 && (
                <span className="absolute top-1 right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-primary-600 text-white text-[10px] font-bold px-1">
                  {pendingSuggestions.length > 99 ? '99+' : pendingSuggestions.length}
                </span>
              )}
            </button>

            {showMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 bg-surface border border-border rounded-xl shadow-lg py-1 min-w-[180px]">
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      handleShare();
                    }}
                    disabled={isSharing}
                    className="w-full px-4 py-2.5 text-left text-sm text-text-primary hover:bg-surface-secondary disabled:opacity-50"
                  >
                    {isSharing ? 'Preparing link...' : 'Share'}
                  </button>
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      navigate(`/recipe/${recipe.id}/tree`);
                    }}
                    className="w-full px-4 py-2.5 text-left text-sm text-text-primary hover:bg-surface-secondary"
                  >
                    Version tree
                  </button>
                  {isOwner && (
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        setShowDelete(true);
                      }}
                      className="w-full px-4 py-2.5 text-left text-sm text-danger-600 hover:bg-surface-secondary"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        }
      />

      <main className="flex-1 max-w-lg mx-auto w-full">
        <div className="p-4 space-y-6">
          {recipe.depth > 0 && (
            <div className="space-y-2">
              <LineageBreadcrumb ancestors={ancestors} current={recipe} />
              <div className="bg-surface-secondary rounded-xl px-3 py-2 text-sm text-text-secondary">
                <span className="text-text-tertiary">Prompt: </span>"{recipe.prompt}"
              </div>
            </div>
          )}

          {/* Pending review sits above the recipe body. This is the owner's
              action item on their own page; it was previously below ingredients,
              instructions, notes, tags, credits, collaborators and variations. */}
          {/* Suggestions section (owner only) */}
          {isOwner && suggestions.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-text-primary">
                Suggestions ({pendingSuggestions.length} pending)
              </h3>
              {/* A failed review used to be entirely silent: the row stayed
                  pending and the owner had no idea the write had been rejected. */}
              {reviewError && (
                <p role="alert" className="text-xs text-danger-600">
                  {reviewError}
                </p>
              )}
              <div className="space-y-2">
                {suggestions.map((s) => (
                  <div
                    key={s.id}
                    className={`border rounded-xl p-3 ${
                      s.status === 'pending'
                        ? 'border-primary-200 bg-primary-50/30 dark:border-primary-800 dark:bg-primary-950/30'
                        : 'border-border bg-surface-secondary'
                    }`}
                  >
                    <p className="text-sm text-text-primary">"{s.message}"</p>
                    <p className="text-xs text-text-tertiary mt-1">
                      from{' '}
                      {/* Deciding on a suggestion means knowing who sent it.
                          The name was plain text with nowhere to go. */}
                      <button
                        onClick={() => navigate(`/profile/${s.suggestedBy.uid}`)}
                        className="underline hover:text-text-secondary"
                      >
                        {s.suggestedBy.displayName ?? 'Anonymous'}
                      </button>
                      {' · '}
                      {/* Age matters: a suggestion from an hour ago and one from
                          last March are not the same decision. */}
                      <span>{timeAgo(s.createdAt)}</span>
                      {s.status !== 'pending' && (
                        <span
                          className={`ml-2 font-medium ${
                            s.status === 'approved'
                              ? 'text-success-600'
                              : 'text-text-tertiary'
                          }`}
                        >
                          {s.status === 'approved' ? 'Approved' : 'Rejected'}
                        </span>
                      )}
                    </p>
                    {s.status === 'pending' && (
                      // Padded to a 44px target. The -ml-3 offsets the first
                      // button's padding so its label stays flush with the text
                      // above rather than looking indented.
                      <div className="flex gap-1 mt-1 -ml-3">
                        <button
                          // Approving used to end here: status flipped, and that
                          // was all. It now carries the owner into the variation
                          // composer with the suggestion prefilled, which is the
                          // action the approval was implicitly promising.
                          onClick={() => handleReview(s.id, 'approve', s.message)}
                          disabled={reviewingId !== null}
                          className="min-h-11 px-3 inline-flex items-center rounded-lg text-xs font-medium text-success-700 dark:text-success-400 hover:underline hover:bg-surface-tertiary transition-colors disabled:opacity-50 disabled:pointer-events-none"
                        >
                          {reviewingId === s.id ? 'Working…' : 'Approve'}
                        </button>
                        <button
                          // Rejection is one-way and now notifies the suggester,
                          // so it gets a confirm. Approve does not: it navigates
                          // to a composer the owner can simply back out of.
                          onClick={() => setRejecting({ id: s.id, message: s.message })}
                          disabled={reviewingId !== null}
                          className="min-h-11 px-3 inline-flex items-center rounded-lg text-xs font-medium text-text-secondary hover:underline hover:bg-surface-tertiary transition-colors disabled:opacity-50 disabled:pointer-events-none"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <RecipeContent recipe={recipe} />

          {/* The count existed on the document and was never shown anywhere, so a
              recipe others had favourited looked exactly like one nobody had.
              Only rendered when there is something to report. */}
          {favoriteCount > 0 && (
            <p className="text-xs text-text-tertiary">
              {favoriteCount} {pluralize(favoriteCount, 'favourite')}
            </p>
          )}

          {(creatorName || (recipe.collaborators && recipe.collaborators.length > 0)) && (
            <div className="space-y-2">
              {creatorName && recipe.createdBy && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/profile/${recipe.createdBy.uid}`);
                  }}
                  className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                >
                  <Avatar uid={recipe.createdBy.uid} name={creatorName} size="sm" />
                  <p className="text-xs text-text-tertiary">
                    Added by <span className="text-primary-600 font-medium">{creatorName}</span>
                  </p>
                </button>
              )}
              {recipe.collaborators && recipe.collaborators.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-text-tertiary">Collaborators:</span>
                  {recipe.collaborators.map((c) => (
                    <span key={c.uid} className="inline-flex items-center gap-1 bg-surface-secondary rounded-full pl-0.5 pr-2 py-0.5">
                      <Avatar uid={c.uid} name={c.displayName} size="sm" />
                      <span className="text-xs text-text-secondary">{c.displayName ?? 'Anonymous'}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <VariationChips children={children} />

        </div>
      </main>

      <div className="sticky bottom-0 p-4 bg-surface border-t border-border">
        <div className="max-w-lg mx-auto space-y-2">
          {/* Suggesting a change used to exist only on /shared/:id, so anyone who
              reached another user's recipe through the library never saw it.

              On someone else's recipe, suggesting is the contextually right
              action and now takes the primary slot; branching drops to secondary.
              On your own, branching stays primary — there is nobody to suggest to. */}
          {canSuggest ? (
            <>
              <Button fullWidth onClick={handleSuggestClick}>
                Suggest a Change
              </Button>
              <Button
                variant="secondary"
                fullWidth
                onClick={() => navigate(`/recipe/${recipe.id}/vary`)}
              >
                Create Variation
              </Button>
            </>
          ) : (
            <Button fullWidth onClick={() => navigate(`/recipe/${recipe.id}/vary`)}>
              Create Variation
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={showDelete}
        title="Delete Recipe"
        message={
          children.length > 0
            ? `This will delete "${recipe.title}" and all ${children.length} variation(s). This cannot be undone.`
            : `Delete "${recipe.title}"? This cannot be undone.`
        }
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
      />

      <AuthModal
        open={showAuth}
        onAuthenticated={() => setShowAuth(false)}
        onDismiss={() => setShowAuth(false)}
      />

      {/* Rejection cannot be undone and now sends the suggester a notification,
          so it asks first. The suggestion text is echoed because the list can
          hold several and the buttons are small. */}
      <ConfirmDialog
        open={rejecting !== null}
        title="Reject this suggestion?"
        message={
          rejecting
            ? `"${rejecting.message}" will be marked rejected and the suggester will be notified. This can't be undone.`
            : ''
        }
        confirmLabel="Reject"
        confirmVariant="danger"
        onConfirm={() => {
          const target = rejecting;
          setRejecting(null);
          if (target) handleReview(target.id, 'reject', target.message);
        }}
        onCancel={() => setRejecting(null)}
      />

      <SuggestChangeModal
        open={showSuggest}
        recipeTitle={recipe.title}
        onSubmit={handleSubmitSuggestion}
        onClose={() => setShowSuggest(false)}
      />

      {/* Saving used to be silent: the page simply changed. Worse, a failed cloud
          publish was console-only, so the user believed a local-only recipe was
          shared. Reuses the Share toast treatment. */}
      {showSavedToast && savedOutcome && (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm rounded-xl border border-border bg-surface-secondary px-4 py-3 shadow-lg"
        >
          <p className="text-sm font-medium text-text-primary">
            {savedOutcome === 'cloud' ? 'Recipe saved' : 'Saved on this device'}
          </p>
          {savedOutcome === 'local' && (
            <p className="mt-0.5 text-xs text-text-secondary">
              It couldn't be shared to the library just now, so others can't see it yet.
              Sharing this recipe will retry.
            </p>
          )}
        </div>
      )}

      {/* The publish step can take up to 4s and its only previous indication was
          disabled:opacity-50 on a 20px icon. Share now lives in a menu that
          closes on tap, so the menu item's own label is not visible either —
          this is the only progress the user can actually see. */}
      {isSharing && (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 w-[calc(100%-2rem)] max-w-sm rounded-xl border border-border bg-surface-secondary px-4 py-3 shadow-lg"
        >
          <Spinner size="sm" />
          <p className="text-sm font-medium text-text-primary">Preparing share link...</p>
        </div>
      )}

      {/* Clipboard refused. Show the link rather than an error: the user came
          here to get a URL, and they can still select this one. */}
      {shareFallback && (
        <div
          role="alert"
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm rounded-xl border border-border bg-surface-secondary px-4 py-3 shadow-lg space-y-2"
        >
          <p className="text-sm font-medium text-text-primary">Copy this link</p>
          <p className="text-xs text-text-secondary">
            This browser wouldn't let the app use the clipboard, so copy it yourself.
          </p>
          <input
            readOnly
            value={shareFallback.url}
            aria-label="Share link"
            onFocus={(e) => e.currentTarget.select()}
            className="w-full px-2 py-1.5 rounded-lg border border-border bg-surface text-xs text-text-primary"
          />
          {shareFallback.mode === 'self-contained' && (
            <p className="text-xs text-text-secondary">
              This link carries the whole recipe, so it works without the cloud — but
              recipients can't favourite it or suggest changes.
            </p>
          )}
          <Button size="sm" variant="secondary" onClick={() => setShareFallback(null)}>
            Done
          </Button>
        </div>
      )}

      {shareCopied && (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm rounded-xl border border-border bg-surface-secondary px-4 py-3 shadow-lg"
        >
          <p className="text-sm font-medium text-text-primary">Link copied</p>
          {shareMode === 'self-contained' && (
            <p className="mt-0.5 text-xs text-text-secondary">
              This link carries the whole recipe, so it works without the cloud — but
              recipients can't favourite it or suggest changes.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
