import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { decodeRecipeFromHash, type SharedRecipe } from '../lib/share';
import { getPublishedRecipe } from '../services/firestore';
import { createRecipe } from '../db/recipes';
import type { GeneratedRecipe } from '../types/api';
import { useAuth } from '../contexts/AuthContext';
import { useCloudFavorite, useFavorite } from '../hooks/useFavorites';
import { useSubmitSuggestion } from '../hooks/useSuggestions';
import { RecipeContent } from '../components/recipe/RecipeContent';
import { SuggestMode } from '../components/recipe/SuggestMode';
import { AuthModal } from '../components/auth/AuthModal';
import { SignUpDialog } from '../components/auth/SignUpDialog';
import { Button } from '../components/ui/Button';
import { EmojiBlob } from '../components/ui/EmojiBlob';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { Spinner } from '../components/ui/Spinner';
import { UserPill } from '../components/ui/UserPill';
import { incrementRecipeViews } from '../services/firestore';
import { trackRecipeViewed } from '../services/analytics';
import type { Collaborator, Recipe } from '../types/recipe';
import { Bookmark, BookmarkCheck, GitBranch, GitBranchPlus, MessageCircle } from '../components/ui/icons';

interface FullSharedRecipe extends SharedRecipe {
  id?: string;
  favoriteCount?: number;
  collaborators?: Collaborator[];
  // Cloud documents carry these; a hash link never does (the schema strips them).
  parentId?: string | null;
  prompt?: string;
}

const footerButton =
  'inline-flex h-[52px] min-w-0 items-center justify-center gap-1.5 rounded-full px-1.5 font-heading text-[15px] whitespace-nowrap transition-all active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:pointer-events-none disabled:opacity-45';
// A 44px hit area around a smaller visual pill, via a pseudo-element, so the
// element itself never needs overflow handling that would clip it.
const hitArea = "relative before:absolute before:inset-x-0 before:-inset-y-2.5 before:content-['']";

// Keyed on the shared link so suggest mode, the saved copy, the save guard and
// toasts all reset when the route moves to another recipe (this page stays
// mounted across params and hashes).
export function SharedRecipePage() {
  const { id } = useParams<{ id: string }>();
  const { hash } = useLocation();
  return <SharedRecipeView key={`${id ?? ''}|${hash}`} />;
}

function SharedRecipeView() {
  const { id: paramId } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isConfigured } = useAuth();
  const [recipe, setRecipe] = useState<FullSharedRecipe | null>(null);
  // 'not-found' is a permanent dead end (bad or corrupted link); 'failed' is a
  // fetch that blew up and is worth retrying. Conflating them told users with a
  // flaky connection that a perfectly good link was corrupt.
  const [status, setStatus] = useState<'loading' | 'ready' | 'not-found' | 'failed'>('loading');
  const [reloadKey, setReloadKey] = useState(0);
  const [suggesting, setSuggesting] = useState(false);
  const [showSuggestSignUp, setShowSuggestSignUp] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const openSavedRef = useRef<HTMLButtonElement>(null);
  // Verified accounts favourite in the cloud; anyone else keeps a local Dexie
  // bookmark, since the rules deny them cloud writes (decision 1a).
  const cloudFavorite = useCloudFavorite(paramId);
  const localFavorite = useFavorite(paramId);
  const { isFavorite, toggleFavorite } = user?.emailVerified ? cloudFavorite : localFavorite;
  // Only the cloud path can fail; the local bookmark handles its own errors.
  const favoriteError = user?.emailVerified ? cloudFavorite.error : null;
  const { submit: submitSuggestion } = useSubmitSuggestion();
  // createRecipe mints a fresh UUID per call, so every tap makes another copy.
  // The guard has to be a ref, not the `saving` state: three synchronous taps all
  // land before React re-renders, and measured against the state-only version
  // that produced 3 saved copies. Same failure mode as saveRecipe (FUN-14).
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const handleSaveCopy = async () => {
    if (!recipe || savingRef.current || savedId) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(false);
    try {
      // Deliberately not published: this is the recipient's private copy of
      // someone else's recipe, and the original creator is preserved in
      // createdBy rather than being overwritten with the saver's identity.
      const saved = await createRecipe(
        recipe as unknown as GeneratedRecipe,
        '',
        [],
        null,
        null,
        -1,
        recipe.createdBy ?? { uid: 'local', displayName: null }
      );
      setSavedId(saved.id);
    } catch (err) {
      console.error('Saving the shared recipe failed', err);
      setSaveError(true);
      // Only released on failure: after a success the button becomes a link to
      // the saved recipe, so re-arming it would invite a duplicate.
      savingRef.current = false;
    } finally {
      setSaving(false);
    }
  };

  const recipeOwnerId = recipe?.createdBy?.uid;
  const isOwner = user && recipeOwnerId ? user.uid === recipeOwnerId : false;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Try Firestore first (via URL param)
      if (paramId) {
        try {
          const published = await getPublishedRecipe(paramId);
          if (cancelled) return;
          if (published) {
            setRecipe(published);
            setStatus('ready');
            incrementRecipeViews(paramId);
            trackRecipeViewed(paramId);
          } else {
            setStatus('not-found');
          }
        } catch {
          // Offline, rules denial, Firestore outage. Previously this threw out
          // of the effect and left the page blank forever.
          if (!cancelled) setStatus('failed');
        }
        return;
      }

      // Fallback: URL hash encoded data
      if (location.hash) {
        const decoded = decodeRecipeFromHash(location.hash);
        if (cancelled) return;
        if (decoded) {
          setRecipe(decoded);
          setStatus('ready');
        } else {
          setStatus('not-found');
        }
        return;
      }

      if (!cancelled) setStatus('not-found');
    }

    setStatus('loading');
    load();
    return () => {
      cancelled = true;
    };
  }, [paramId, location.hash, reloadKey]);

  const handleFavoriteClick = () => {
    if (!user && isConfigured) {
      setShowAuth(true);
      return;
    }
    if (!recipe) return;
    toggleFavorite({
      ownerId: recipe.createdBy?.uid ?? 'local',
      title: recipe.title,
      emoji: recipe.emoji,
    });
  };

  // Same gate as RecipeDetailPage: suggesting needs a verified email, so anyone
  // else gets the sign-up dialog and the page stays as it is.
  const handleSuggestClick = () => {
    if (!user?.emailVerified) {
      setShowSuggestSignUp(true);
      return;
    }
    setSuggesting(true);
  };

  useEffect(() => {
    if (!sentTo) return;
    const timer = setTimeout(() => setSentTo(null), 3000);
    return () => clearTimeout(timer);
  }, [sentTo]);

  // The Save button is replaced by this one, so focus would otherwise fall to the body.
  useEffect(() => {
    if (savedId) openSavedRef.current?.focus();
  }, [savedId]);

  const handleSubmitSuggestion = async (message: string) => {
    if (!recipe || !paramId) return;
    await submitSuggestion({
      recipeId: paramId,
      recipeOwnerId: recipe.createdBy?.uid ?? 'local',
      recipeTitle: recipe.title,
      recipeEmoji: recipe.emoji,
      message,
    });
  };

  if (status !== 'ready' || !recipe) {
    if (status === 'loading') {
      return (
        <div role="status" aria-label="Loading recipe" className="mx-auto max-w-lg space-y-4 p-4">
          <Skeleton className="h-12" />
          <Skeleton className="h-8" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      );
    }
    const failed = status === 'failed';
    return (
      <div className="mx-auto max-w-lg">
        <EmptyState
          tone="error"
          icon={failed ? '📡' : '🔗'}
          title={failed ? "Couldn't Load Recipe" : 'Invalid Link'}
          description={
            failed
              ? "We couldn't reach the recipe library. Check your connection and try again."
              : 'This shared recipe link is invalid or corrupted.'
          }
          action={
            <div className="flex flex-col items-start gap-2">
              {failed && <Button onClick={() => setReloadKey((k) => k + 1)}>Try Again</Button>}
              <Button variant="ghost" onClick={() => navigate('/')}>
                Go to Recipe Lab
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  // The cloud document is a full Recipe; a hash link is not, but everything the
  // shared components read is present in both.
  const fullRecipe = { ...recipe, id: paramId ?? 'shared' } as unknown as Recipe;
  const authorName = recipe.createdBy?.displayName?.trim();
  const authorUid = recipe.createdBy?.uid;
  const prompt = recipe.prompt?.trim();
  const canSuggest = isConfigured && !!paramId && !isOwner;
  const authorPill = authorUid ? <UserPill wrap uid={authorUid} name={recipe.createdBy?.displayName ?? null} /> : null;

  if (suggesting && canSuggest) {
    return (
      <SuggestMode
        key={fullRecipe.id}
        recipe={fullRecipe}
        onSend={handleSubmitSuggestion}
        onCancel={() => setSuggesting(false)}
        onSent={() => {
          setSuggesting(false);
          setSentTo(authorName || 'the author');
        }}
      />
    );
  }

  return (
    <div className="min-h-dvh flex flex-col bg-surface">
      <header className="mx-auto flex w-full max-w-lg items-center gap-1 px-4 pt-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-3 rounded-full bg-surface-secondary py-2 pl-3.5 pr-2 text-[13px] text-text-secondary">
          <span>Shared by</span>
          {authorPill ? (
            authorUid !== 'local' ? (
              <Link
                to={`/profile/${authorUid}`}
                className={`${hitArea} inline-flex min-w-0 max-w-full rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500`}
              >
                {authorPill}
              </Link>
            ) : (
              authorPill
            )
          ) : (
            <span className="font-medium text-text-primary">Someone</span>
          )}
          <div className="flex-1" />
          <Link
            to="/"
            className={`${hitArea} inline-flex h-8 items-center rounded-full bg-surface px-3 text-[13px] font-semibold text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500`}
          >
            Open Recipe Lab
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1">
        <div className="space-y-5 px-[22px] pb-4 pt-4">
          <div>
            <div className="flex items-start gap-4">
              <h1 className="min-w-0 flex-1 break-words font-heading text-[34px] leading-[1.04]">{recipe.title}</h1>
              <EmojiBlob size={72} emoji={recipe.emoji} />
            </div>
            <p className="mt-2.5 break-words text-[15px] text-text-secondary [text-wrap:pretty]">{recipe.description}</p>
            {recipe.parentId && (
              <p className="mt-[14px] flex items-start gap-2.5 rounded-[22px] bg-accent-2-100 px-4 py-3 text-[14px] text-accent-2-900">
                <GitBranch className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0 break-words">
                  {authorName || 'Someone'}
                  {prompt ? (
                    <>
                      {' asked for '}
                      <i>&quot;{prompt}&quot;</i>.
                    </>
                  ) : (
                    ' made this variation.'
                  )}
                </span>
              </p>
            )}
          </div>

          <RecipeContent recipe={fullRecipe} hideHeader />

          {recipe.collaborators && recipe.collaborators.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-text-tertiary">Collaborators:</span>
              {recipe.collaborators.map((c) => (
                <UserPill key={c.uid} uid={c.uid} name={c.displayName} />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Not sticky, as on the recipe page: the decision happens at the end of the recipe. */}
      <div className="bg-surface px-5 pt-3 pb-[calc(28px+env(safe-area-inset-bottom))] shadow-[0_-1px_0_var(--color-border)]">
        <div className="mx-auto flex max-w-lg flex-col gap-2">
          {favoriteError && (
            <p role="alert" className="break-words text-sm text-danger-700">
              {favoriteError}
            </p>
          )}
          {saveError && (
            <p role="alert" className="break-words text-sm text-danger-700">
              Couldn&apos;t save a copy. Try again.
            </p>
          )}
          {paramId ? (
            <>
              <div className="flex gap-2.5">
                {!isOwner && (
                  <button
                    type="button"
                    aria-pressed={isFavorite}
                    onClick={handleFavoriteClick}
                    className={`${footerButton} flex-[1_1_auto] border border-border text-text-primary hover:bg-surface-secondary`}
                  >
                    {isFavorite ? (
                      <BookmarkCheck className="h-4 w-4 shrink-0 text-accent max-[359px]:hidden" />
                    ) : (
                      <Bookmark className="h-4 w-4 shrink-0 max-[359px]:hidden" />
                    )}
                    {isFavorite ? 'Saved' : 'Save'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => navigate(`/recipe/${paramId}/vary`)}
                  className={`${footerButton} flex-[2_1_auto] bg-primary-600 text-on-accent hover:bg-primary-700 active:bg-primary-800`}
                >
                  <GitBranchPlus className="h-4 w-4 shrink-0" />
                  Make it yours
                </button>
              </div>
              {canSuggest && (
                <Button variant="ghost" fullWidth onClick={handleSuggestClick}>
                  <MessageCircle className="mr-1.5 h-4 w-4 shrink-0" />
                  Suggest a change
                </Button>
              )}
            </>
          ) : (
            // A hash link carries the whole recipe and nothing else: no cloud doc
            // to favourite, branch or suggest on. Saving a copy is the one thing
            // the recipient can keep.
            <>
              {savedId ? (
                <button
                  ref={openSavedRef}
                  type="button"
                  onClick={() => navigate(`/recipe/${savedId}`)}
                  className={`${footerButton} w-full bg-primary-600 text-on-accent hover:bg-primary-700 active:bg-primary-800`}
                >
                  Open in my library
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSaveCopy}
                  disabled={saving}
                  className={`${footerButton} w-full bg-primary-600 text-on-accent hover:bg-primary-700 active:bg-primary-800`}
                >
                  {saving ? <Spinner size="sm" /> : 'Save to my library'}
                </button>
              )}
              <p className="text-center text-xs text-text-tertiary">
                Saves a copy on this device. You can then branch it into your own variations.
              </p>
            </>
          )}
        </div>
      </div>

      <AuthModal
        open={showAuth}
        action={{ kind: 'save' }}
        onAuthenticated={() => setShowAuth(false)}
        onDismiss={() => setShowAuth(false)}
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
          className="fixed bottom-24 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-xl border border-border bg-surface-secondary px-4 py-3 shadow-lg"
        >
          <p className="break-words text-sm font-medium text-text-primary">Sent to {sentTo}</p>
        </div>
      )}
    </div>
  );
}
