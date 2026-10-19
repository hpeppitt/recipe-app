import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useRecipe, useRecipeLineage } from '../hooks/useRecipe';
import { useFavorite } from '../hooks/useFavorites';
import { useSuggestions, useSubmitSuggestion } from '../hooks/useSuggestions';
import { useSuggestionReview } from '../hooks/useSuggestionReview';
import { useAuth } from '../contexts/AuthContext';
import { deleteRecipeTree, getSubtreeIds } from '../db/recipes';
import {
  deletePublishedRecipeTree,
  getPublishedRecipe,
  incrementRecipeViews,
  publishRecipe,
} from '../services/firestore';
import { isFirebaseConfigured } from '../services/firebase';
import { pickShareUrl } from '../lib/share';
import { withTimeout, pluralize } from '../lib/utils';
import { trackRecipeViewed, trackRecipeShared, trackRecipeDeleted } from '../services/analytics';
import { TopBar } from '../components/layout/TopBar';
import { RecipeHeader } from '../components/recipe/RecipeHeader';
import { RecipeContent } from '../components/recipe/RecipeContent';
import { LineageStrip } from '../components/recipe/LineageStrip';
import { BranchCarousel } from '../components/recipe/BranchCarousel';
import { Button } from '../components/ui/Button';
import { GitBranchPlus, MessageCircle, Network, Pencil } from '../components/ui/icons';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { AuthModal } from '../components/auth/AuthModal';
import { SignUpDialog } from '../components/auth/SignUpDialog';
import { SuggestMode } from '../components/recipe/SuggestMode';
import { SuggestionList } from '../components/recipe/SuggestionList';
import { Skeleton } from '../components/ui/Skeleton';
import { Spinner } from '../components/ui/Spinner';
import { Avatar } from '../components/ui/Avatar';
import { canManageRecipe } from '../lib/ownership';
import { rateLimitMessage } from '../lib/errors';
import { SavedToast } from '../components/recipe/SavedToast';
import { TreeIntro } from '../components/recipe/TreeIntro';
import { getIntroState, setIntroState as persistIntroState } from '../services/storage';
import { countRecipeViewed, markSeen, shouldShowTreeIntro } from '../lib/onboarding';

/** How long Share waits on the cloud before falling back to a self-contained link. */
const SHARE_PUBLISH_TIMEOUT_MS = 4000;
/** How long Delete waits on the cloud before telling the user copies may remain. */
const CLOUD_DELETE_TIMEOUT_MS = 10000;

const footerButton =
  'inline-flex h-[52px] lg:h-12 min-w-0 items-center justify-center gap-1.5 rounded-full px-1.5 font-heading text-[15px] whitespace-nowrap transition-all active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500';

interface PaneProps {
  /** Passed when the page renders in the wide-screen pane, outside its own route (RL-116). */
  id?: string;
  /** Pane only: called with the title each time a recipe is shown, for the shell's announcement. */
  onShown?: (title: string) => void;
}

export function RecipeDetailPage({ id: paneId, onShown }: PaneProps = {}) {
  const params = useParams<{ id: string }>();
  const id = paneId ?? params.id;
  const inPane = paneId !== undefined;
  const Main = inPane ? 'div' : 'main';
  const navigate = useNavigate();
  const { user, isConfigured, isLoading: authLoading } = useAuth();
  const { recipe, source, isLoading, cloudError, retry } = useRecipe(id);
  const location = useLocation();
  // One hook, and cloud-aware: a feed-browsed recipe now shows its real
  // variations, lineage and descendant count instead of local-only emptiness.
  const { children, ancestors, descendantCount, recipes: family, isLoading: treeLoading } = useRecipeLineage(recipe);
  const { isFavorite, toggleFavorite, canFavorite } = useFavorite(id);
  const { suggestions, approve, reject } = useSuggestions(id, recipe?.createdBy?.uid);
  const { submit: submitSuggestion } = useSubmitSuggestion();
  // The confirm message, captured on open: the RL-078 sync can remove the recipe
  // once the cloud delete lands, while the dialog is still open, so it cannot be
  // read live.
  const [showDelete, setShowDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  // Set when the cloud delete failed or timed out, so nothing was removed from
  // this device. Holds the same ids so "Try again" repeats exactly that delete.
  const [cloudDeleteFailure, setCloudDeleteFailure] = useState<{
    uid: string;
    rootId: string;
    extraIds: string[];
    /** null after a timeout, when how many copies remain is unknown. */
    failed: number | null;
  } | null>(null);
  // A delete can outlive the page (back gesture mid-wait); late results check this.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareMode, setShareMode] = useState<'cloud' | 'self-contained'>('cloud');
  // Why the share fell back to a self-contained link, when known (RL-049 daily limit).
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  // Holds the link when the clipboard is unavailable, so it can be shown for
  // manual copying instead of the action silently failing.
  const [shareFallback, setShareFallback] = useState<{
    url: string;
    mode: 'cloud' | 'self-contained';
  } | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showShareSignUp, setShowShareSignUp] = useState(false);
  // The recipe id suggest mode is open for, so it closes by itself when the
  // route moves to another recipe (this page stays mounted across ids).
  const [suggestingFor, setSuggestingFor] = useState<string | null>(null);
  const [showSuggestSignUp, setShowSuggestSignUp] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  // Latest route id, so a send that lands after navigating away cannot toast on another recipe.
  const idRef = useRef(id);
  useEffect(() => {
    idRef.current = id;
  }, [id]);
  // Set by the save flow via navigation state. 'local' means the recipe is on
  // this device but the cloud publish did not land, which the user previously
  // had no way of knowing — it was a console.error and nothing else.
  const savedState = location.state as { saved?: 'cloud' | 'local'; note?: string | null } | null;
  const savedOutcome = savedState?.saved;
  const [showSavedToast, setShowSavedToast] = useState(!!savedOutcome);
  const { reviewingId, reviewError, review: handleReview } = useSuggestionReview(id, approve, reject);
  const [introState, setIntroState] = useState(getIntroState);

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
    setShareNote(null);
    try {
      let isPublished = false;
      if (isFirebaseConfigured && !user?.emailVerified) {
        // Unverified accounts never publish (decision 1a, RL-061): an already
        // public recipe is shareable, anything else asks for an email first.
        isPublished = await withTimeout(
          getPublishedRecipe(recipe.id).then(
            (doc) => !!doc,
            () => false
          ),
          SHARE_PUBLISH_TIMEOUT_MS,
          false
        );
        if (!isPublished) {
          setShowShareSignUp(true);
          return;
        }
      } else if (isFirebaseConfigured) {
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
            setShareNote(rateLimitMessage(err));
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

  const leaveAfterDelete = () => navigate('/', { replace: true });

  const deleteLocally = async () => {
    if (!id) return;
    try {
      await deleteRecipeTree(id);
    } catch (err) {
      // Nothing was removed locally, so the page stays for another attempt.
      // After a cloud delete the RL-078 sync removes the rows anyway.
      console.error('Deleting the local recipe tree failed', err);
      if (mountedRef.current) setIsDeleting(false);
      return;
    }
    if (mountedRef.current) leaveAfterDelete();
  };

  // Cloud first, device second: a recipe left in the cloud would be synced
  // straight back into Dexie by the RL-078 listener, so the device copy only
  // goes once the cloud confirms. Descendants owned by other users are skipped
  // (the rules deny them); removing those needs a Cloud Function.
  const runCloudDelete = async (target: Omit<NonNullable<typeof cloudDeleteFailure>, 'failed'>) => {
    if (!id) return;
    const unknown = { deleted: 0, failed: null };
    const { failed } = await withTimeout(
      deletePublishedRecipeTree(target.uid, id, target.rootId, target.extraIds).catch(
        () => unknown
      ),
      CLOUD_DELETE_TIMEOUT_MS,
      unknown
    );
    // Left the page mid-delete: no late navigation or local write. If the cloud
    // delete landed, the RL-078 sync removes the device copy.
    if (!mountedRef.current) return;
    if (failed === 0) {
      setCloudDeleteFailure(null);
      await deleteLocally();
      return;
    }
    setShowDelete(null);
    setCloudDeleteFailure({ ...target, failed });
    setIsDeleting(false);
  };

  const handleDelete = async () => {
    if (!id || isDeleting) return;
    setIsDeleting(true);
    trackRecipeDeleted(id);
    // Only verified accounts can publish (RL-040), so anyone else has no cloud
    // copy to remove and the delete is local only.
    if (!isFirebaseConfigured || !user?.emailVerified) {
      await deleteLocally();
      return;
    }
    let extraIds: string[];
    try {
      // Passed on so variations the cloud tree query misses are still attempted.
      extraIds = await getSubtreeIds(id);
    } catch (err) {
      console.error('Reading the local recipe tree failed', err);
      setIsDeleting(false);
      return;
    }
    await runCloudDelete({ uid: user.uid, rootId: recipe?.rootId ?? id, extraIds });
  };

  const handleRetryCloudDelete = async () => {
    if (!cloudDeleteFailure || isDeleting) return;
    setIsDeleting(true);
    await runCloudDelete(cloudDeleteFailure);
  };

  // Only cloud recipes belonging to someone else can be suggested against:
  // canManageRecipe treats anything in this device's library as the user's own,
  // and a suggestion needs a published doc to reference.
  const canSuggest = isConfigured && !isOwner && source === 'cloud';

  const handleSuggestClick = () => {
    // Suggesting needs a verified email (firestore.rules). Anyone else gets the
    // sign-up prompt and the page stays as it is; signed-out and anonymous are
    // both offered the email, since neither can suggest yet.
    if (isConfigured && !user?.emailVerified) {
      setShowSuggestSignUp(true);
      return;
    }
    setSuggestingFor(id ?? null);
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
  useEffect(() => {
    if (!sentTo) return;
    const timer = setTimeout(() => setSentTo(null), 3000);
    return () => clearTimeout(timer);
  }, [sentTo]);

  // Auto-dismiss the save confirmation. Kept longer for the local-only case:
  // that one carries a consequence the user needs time to actually read.
  useEffect(() => {
    if (!showSavedToast) return;
    const ms = savedOutcome === 'local' ? 8000 : 3000;
    const timer = setTimeout(() => setShowSavedToast(false), ms);
    return () => clearTimeout(timer);
  }, [showSavedToast, savedOutcome]);

  // Counts distinct recipes opened, which is what holds the tree explainer back
  // until the idea has somewhere to land. Ref-guarded per id for the same reason
  // the view counter below is: StrictMode double-invokes effects in dev.
  const introCountedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!recipe?.id) return;
    if (introCountedRef.current === recipe.id) return;
    introCountedRef.current = recipe.id;
    setIntroState((prev) => {
      const next = countRecipeViewed(prev);
      persistIntroState(next);
      return next;
    });
  }, [recipe?.id]);

  const dismissTreeIntro = () => {
    setIntroState((prev) => {
      const next = markSeen(prev, 'recipe-tree');
      persistIntroState(next);
      return next;
    });
  };

  // Keyed on the id so a re-render does not re-announce; waits for the title to load.
  const shownTitle = recipe?.id === id ? recipe?.title : undefined;
  useEffect(() => {
    if (shownTitle !== undefined) onShown?.(shownTitle);
  }, [id, shownTitle, onShown]);

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

  // The owner sees every suggestion; anyone else sees only their own.
  //
  // Non-owners previously saw none at all, so a suggester had no view of what
  // they had sent and no way into its reply thread — which would have made
  // replies one-sided. Since RL-018 the query and the read rule already return
  // only the viewer's own unless they created the recipe, so this filter is a
  // second guard, not the privacy boundary.
  const visibleSuggestions = isOwner
    ? suggestions
    : suggestions.filter((s) => s.suggestedBy.uid === user?.uid);

  const failedCopies = cloudDeleteFailure?.failed;
  // Rendered in every branch: once the local copy is deleted the recipe stops
  // resolving, and the dialogs must survive that.
  const deleteDialogs = (
    <>
      <ConfirmDialog
        open={showDelete !== null}
        title="Delete Recipe"
        message={showDelete ?? ''}
        confirmLabel={isDeleting ? 'Deleting...' : 'Delete'}
        confirmVariant="danger"
        busy={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(null)}
      />
      <ConfirmDialog
        open={cloudDeleteFailure !== null}
        title="Couldn't delete this recipe"
        message={
          "It's still saved in your account and on this device. Check your connection and try again." +
          (failedCopies == null
            ? ''
            : ` ${failedCopies} ${pluralize(failedCopies, 'copy', 'copies')} couldn't be removed.`)
        }
        confirmLabel={isDeleting ? 'Trying again...' : 'Try again'}
        busy={isDeleting}
        onConfirm={handleRetryCloudDelete}
        onCancel={() => setCloudDeleteFailure(null)}
      />
    </>
  );

  // Without this, the lookup below would show "not found" or a cloud error
  // behind the dialogs for a recipe the user has just deleted on purpose.
  if (!recipe && (isDeleting || cloudDeleteFailure)) {
    return (
      <div className="max-w-lg mx-auto">
        <TopBar title="Deleting..." showBack />
        {deleteDialogs}
      </div>
    );
  }

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
        <TopBar title={cloudError ? 'Could not load' : 'Not found'} showBack />
        <div className="p-8 text-center space-y-3">
          <p className="text-4xl">{cloudError ? '📡' : '🔍'}</p>
          <p className="text-text-secondary">
            {cloudError
              ? 'Could not load this recipe. Check your connection and try again.'
              : 'Recipe not found.'}
          </p>
          {cloudError && <Button onClick={retry}>Try again</Button>}
        </div>
      </div>
    );
  }

  if (suggestingFor !== null && suggestingFor === id) {
    return (
      <SuggestMode
        key={recipe.id}
        recipe={recipe}
        onSend={handleSubmitSuggestion}
        onCancel={() => setSuggestingFor(null)}
        onSent={() => {
          if (idRef.current !== recipe.id) return;
          setSuggestingFor(null);
          setSentTo(recipe.createdBy?.displayName?.trim() || 'the author');
        }}
      />
    );
  }

  return (
    // In the pane one padding wraps the page, 36px 48px once the pane is 36rem wide (its @container is in AppShell).
    <div className={`min-h-dvh flex flex-col bg-surface${inPane ? ' px-4 pt-4 @xl:px-12 @xl:pt-9' : ''}`}>
      <RecipeHeader
        inPane={inPane}
        recipe={recipe}
        familyRoot={ancestors[0]}
        onBack={handleBack}
        showFavorite={isConfigured}
        isFavorite={isFavorite}
        onFavorite={handleFavoriteToggle}
        pendingCount={pendingSuggestions.length}
        isOwner={isOwner}
        canSuggest={canSuggest}
        isSharing={isSharing}
        shareDisabled={authLoading}
        onShare={handleShare}
        onDelete={() =>
          setShowDelete(
            descendantCount > 0
              ? `This will delete "${recipe.title}" and all ${descendantCount} variation(s) beneath it. This cannot be undone.`
              : `Delete "${recipe.title}"? This cannot be undone.`
          )
        }
        onSuggest={handleSuggestClick}
      />

      {recipe.depth > 0 && (
        <div className={`mx-auto w-full max-w-lg lg:max-w-[720px]${inPane ? ' [&>*]:mx-0' : ''}`}>
          <LineageStrip recipe={recipe} ancestors={ancestors} />
        </div>
      )}

      {/* A size container, so ingredients and method go side by side only when the column is wide enough.
          A div in the pane: the shell already has the page's main landmark. */}
      <Main className="@container flex-1 max-w-lg lg:max-w-[720px] mx-auto w-full">
        <div className={`${inPane ? 'py-4' : 'p-4'} space-y-6`}>
          {/* Above the recipe body: it explains what the
              Branch this recipe button at the bottom of this page will do, so it
              needs to be read before the user gets there. */}
          {shouldShowTreeIntro(introState, recipe) && (
            <TreeIntro
              onDismiss={dismissTreeIntro}
              // Only offered when there is a tree worth looking at. One node
              // teaches nothing.
              onOpenTree={
                children.length > 0
                  ? () => navigate(`/recipe/${recipe.id}/tree`)
                  : undefined
              }
            />
          )}

          <RecipeContent recipe={recipe} hideHeader />

          {/* Moved below the body (RL-105); it used to sit above it as the owner's
              action item. The pending badge on More (RL-100) keeps that attention. */}
          <SuggestionList
            suggestions={visibleSuggestions}
            isOwner={isOwner}
            reviewingId={reviewingId}
            reviewError={reviewError}
            onReview={handleReview}
          />

          {/* The count existed on the document and was never shown anywhere, so a
              recipe others had favourited looked exactly like one nobody had.
              Only rendered when there is something to report. */}
          {favoriteCount > 0 && (
            <p className="text-xs text-text-tertiary">
              {favoriteCount} {pluralize(favoriteCount, 'save')}
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
                  className="min-h-11 flex items-center gap-2 hover:opacity-80 transition-opacity"
                >
                  <Avatar uid={recipe.createdBy.uid} name={creatorName} size="sm" />
                  <p className="text-xs text-text-tertiary">
                    Added by <span className="text-primary-600 dark:text-primary-400 font-medium">{creatorName}</span>
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

          {recipe && <BranchCarousel recipe={recipe} recipes={family} isLoading={treeLoading} />}

        </div>
      </Main>

      {/* Not sticky. Branching or suggesting is a before/after action, and pinning
          it cost ~72px of the one screen people read while their hands are busy.
          At the end of the recipe is also where the decision actually happens. */}
      <div className={`bg-surface ${inPane ? '' : 'px-5 '}pt-3 pb-[calc(28px+env(safe-area-inset-bottom))] shadow-[0_-1px_0_var(--color-border)]`}>
        {/* Wraps in the pane, where three nowrap buttons do not fit a 384px column. */}
        <div className={`max-w-lg lg:max-w-[720px] mx-auto flex gap-2.5${inPane ? ' flex-wrap' : ''}`}>
          {/* The inline wide-screen row (RL-116); below lg the family stays in the header and More sheet. */}
          <button
            type="button"
            onClick={() => navigate(`/recipe/${recipe.id}/tree`)}
            className={`${footerButton} hidden lg:inline-flex lg:flex-[1_1_auto] border border-border text-text-primary hover:bg-surface-secondary`}
          >
            <Network className="h-4 w-4 shrink-0" />
            Family
          </button>
          {/* Owner: Edit. Someone else's cloud recipe: Suggest. Flex basis comes
              from content (auto) and free space is split 1:2, so a wide heading
              font cannot be squeezed to a fixed 90px/180px at 320px. The Suggest
              and Edit icon is hidden under 360px for the same reason. Not
              measured: jsdom cannot lay out, so check on a device. */}
          {/* Currently always true (local is owned, every other cloud recipe can
              be suggested to). Kept so an empty slot cannot appear if the
              ownership or suggest rules tighten. */}
          {(isOwner || canSuggest) && (
            <button
              type="button"
              onClick={isOwner ? () => navigate(`/recipe/${recipe.id}/edit`) : handleSuggestClick}
              className={`${footerButton} flex-[1_1_auto] border border-border text-text-primary hover:bg-surface-secondary`}
            >
              {isOwner ? <Pencil className="h-4 w-4 shrink-0 max-[359px]:hidden" /> : <MessageCircle className="h-4 w-4 shrink-0 max-[359px]:hidden" />}
              {isOwner ? 'Edit' : 'Suggest'}
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate(`/recipe/${recipe.id}/vary`)}
            className={`${footerButton} flex-[2_1_auto] bg-primary-600 text-on-accent hover:bg-primary-700 active:bg-primary-800`}
          >
            <GitBranchPlus className="h-4 w-4 shrink-0" />
            Branch this recipe
          </button>
        </div>
      </div>

      {deleteDialogs}

      <AuthModal
        open={showAuth}
        action={{ kind: 'save' }}
        onAuthenticated={() => setShowAuth(false)}
        onDismiss={() => setShowAuth(false)}
      />

      <SignUpDialog
        open={showShareSignUp}
        action={{ kind: 'share' }}
        body="Share links open from the shared library, so the recipe needs an account with an email. Once you're signed in, tap Share again."
        onClose={() => setShowShareSignUp(false)}
      />

      <SignUpDialog
        open={showSuggestSignUp}
        action={{ kind: 'suggest' }}
        body={`Suggestions go to the person who wrote ${recipe.title}, so they come from a name rather than an anonymous account. Add your email and you can suggest, reply, and publish recipes of your own.`}
        onClose={() => setShowSuggestSignUp(false)}
      />

      {sentTo && (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm rounded-xl border border-border bg-surface-secondary px-4 py-3 shadow-lg"
        >
          <p className="break-words text-sm font-medium text-text-primary">Sent to {sentTo}</p>
        </div>
      )}

      {showSavedToast && savedOutcome && <SavedToast outcome={savedOutcome} note={savedState?.note} />}

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
              This link carries the whole recipe, so it works without the cloud. Recipients can
              keep a copy, but they can't suggest changes.
            </p>
          )}
          {shareNote && <p className="text-xs text-text-secondary">{shareNote}</p>}
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
              This link carries the whole recipe, so it works without the cloud. Recipients can
              keep a copy, but they can't suggest changes.
            </p>
          )}
          {shareNote && <p className="mt-0.5 text-xs text-text-secondary">{shareNote}</p>}
        </div>
      )}
    </div>
  );
}
