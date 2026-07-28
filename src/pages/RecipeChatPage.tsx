import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { useRecipe } from '../hooks/useRecipe';
import { useRecipeChat } from '../hooks/useRecipeChat';
import { useAuth } from '../contexts/AuthContext';
import { TopBar } from '../components/layout/TopBar';
import { ChatMessageBubble } from '../components/chat/ChatMessage';
import { RecipeCardMessage } from '../components/chat/RecipeCardMessage';
import { ChatInput } from '../components/chat/ChatInput';
import { TypingIndicator } from '../components/chat/TypingIndicator';
import { RecipeContent } from '../components/recipe/RecipeContent';
import { AuthModal } from '../components/auth/AuthModal';
import { Chip } from '../components/ui/Chip';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { SUGGESTION_CHIPS } from '../lib/constants';
import { queryWords } from '../lib/search';
import { useEffect, useRef, useState } from 'react';
import type { GeneratedRecipe } from '../types/api';
import type { ChatMessage } from '../types/recipe';

/**
 * The query words this match actually shares, so the panel can say why it is
 * showing you something instead of just asserting similarity.
 */
function matchedWords(
  query: string | null,
  recipe: { title: string; description: string }
): string[] {
  if (!query) return [];
  const haystack = `${recipe.title} ${recipe.description}`.toLowerCase();
  return queryWords(query).filter((w) => haystack.includes(w));
}

/**
 * The user message that produced the assistant message at `index`.
 *
 * Saving an older version should record the prompt that actually created it, not
 * the first thing typed in the session — otherwise a refined version and the one
 * it replaced both claim the same origin.
 */
function promptFor(messages: ChatMessage[], index: number): string {
  for (let i = index - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].content;
  }
  return '';
}

export function RecipeChatPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isVarying = !!id;
  // isLoading/cloudError were being discarded, so a parent that never arrived
  // left a composer that looked usable, accepted no input, and said nothing.
  const {
    recipe: parentRecipe,
    isLoading: parentLoading,
    cloudError: parentCloudError,
    retry: retryParent,
  } = useRecipe(id);
  const {
    messages,
    isLoading,
    isSaving,
    error,
    generationUnavailable,
    latestRecipe,
    similarRecipes,
    loadingPhase,
    pendingQuery,
    sendMessage,
    retryGeneration,
    dismissSimilar,
    saveRecipe,
  } = useRecipeChat(isVarying ? parentRecipe : undefined);
  const { user, isConfigured, isLoading: authLoading } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [parentExpanded, setParentExpanded] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  // Set when the owner arrives here by approving a suggestion, so the composer
  // opens with the suggestion already written out.
  const location = useLocation();
  const suggestionSeed = (location.state as { suggestion?: string } | null)?.suggestion ?? '';

  // A generated recipe lives only in component state until saved, so leaving the
  // page destroys it. isSaving excluded because saveRecipe navigates on success.
  const hasUnsavedRecipe = !!latestRecipe && !isSaving;

  // True while a sentinel history entry is parked on top of this page, so the
  // discard confirm knows it has an extra entry to unwind past.
  const guardArmedRef = useRef(false);

  const leaveAfterDiscard = () => {
    // Consume the sentinel as well as this page's own entry. With no history
    // behind us (a direct load) there is nothing to go back to, so go home.
    if (location.key === 'default') {
      navigate('/', { replace: true });
      return;
    }
    navigate(guardArmedRef.current ? -2 : -1);
  };

  const handleBack = () => {
    if (hasUnsavedRecipe) {
      setShowDiscard(true);
      return;
    }
    navigate(-1);
  };

  /**
   * Guard hardware back, the iOS swipe gesture, and tab close.
   *
   * `useBlocker` is unavailable under `BrowserRouter`, and migrating to
   * `createBrowserRouter` did not help: with react-router 7.13.0 the blocker
   * callback was never invoked for POP at all (recorded under UI-15, including
   * that StrictMode was ruled out). So this intercepts POP directly.
   *
   * A sentinel entry is parked on top of the page while a recipe is unsaved. The
   * first Back pops the sentinel rather than leaving, at which point the sentinel
   * is immediately re-pushed — the user stays put — and the discard dialog opens.
   */
  useEffect(() => {
    if (!hasUnsavedRecipe) return;

    window.history.pushState({ recipeGuard: true }, '');
    guardArmedRef.current = true;

    const onPop = () => {
      // Re-arm first so a second Back is still caught if the dialog is dismissed
      // by any means other than the buttons.
      window.history.pushState({ recipeGuard: true }, '');
      setShowDiscard(true);
    };

    // Covers reload and tab close, which no in-app guard can see. Browsers show
    // their own generic wording; preventDefault is all that is required.
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    window.addEventListener('popstate', onPop);
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('beforeunload', onBeforeUnload);
      guardArmedRef.current = false;
    };
  }, [hasUnsavedRecipe]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, similarRecipes]);

  // Show auth modal if Firebase is configured and user not signed in
  useEffect(() => {
    if (isConfigured && !authLoading && !user) {
      setShowAuth(true);
    }
  }, [isConfigured, authLoading, user]);

  const lastAssistantIdx = messages.reduce(
    (acc, msg, i) => (msg.role === 'assistant' ? i : acc),
    -1
  );

  return (
    <div className="min-h-dvh flex flex-col bg-surface">
      <TopBar
        title={isVarying ? 'New Variation' : 'New Recipe'}
        showBack
        onBack={handleBack}
      />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto p-4 space-y-4">
          {/* Surfaced before composing rather than after. There is nothing the user
              can do about this one — no key to paste any more — so it links nowhere. */}
          {generationUnavailable && (
            <div className="border border-warning-200 bg-warning-50 dark:border-warning-800 dark:bg-warning-950 rounded-2xl p-4 space-y-2">
              <p className="text-sm font-medium text-warning-800 dark:text-warning-200">
                Recipe generation is unavailable
              </p>
              <p className="text-xs text-warning-700 dark:text-warning-300">
                This build has no Firebase configuration, so it can't reach the recipe
                generator. Your saved recipes are unaffected.
              </p>
            </div>
          )}

          {/* Why the composer is inert. Each of these three is a distinct
              situation and only one of them is worth retrying. */}
          {isVarying && !parentRecipe && parentLoading && (
            <div className="flex items-center gap-3 border border-border rounded-2xl p-4">
              <Spinner size="sm" />
              <p className="text-sm text-text-secondary">Loading the original recipe...</p>
            </div>
          )}

          {isVarying && !parentRecipe && !parentLoading && parentCloudError && (
            <div className="border border-warning-200 bg-warning-50 dark:border-warning-800 dark:bg-warning-950 rounded-2xl p-4 space-y-2">
              <p className="text-sm font-medium text-warning-800 dark:text-warning-200">
                Couldn't load the original recipe
              </p>
              <p className="text-xs text-warning-700 dark:text-warning-300">
                A variation needs it as a starting point, so this can't continue until it
                loads. Your connection may be the problem.
              </p>
              <Button size="sm" variant="secondary" onClick={retryParent}>
                Try again
              </Button>
            </div>
          )}

          {isVarying && !parentRecipe && !parentLoading && !parentCloudError && (
            <div className="border border-border bg-surface-secondary rounded-2xl p-4 space-y-2">
              <p className="text-sm font-medium text-text-primary">
                That recipe no longer exists
              </p>
              <p className="text-xs text-text-secondary">
                It may have been deleted. You can still start a brand-new recipe instead.
              </p>
              <Button size="sm" variant="secondary" onClick={() => navigate('/create')}>
                Create a new recipe
              </Button>
            </div>
          )}

          {/* Parent recipe context for variations */}
          {isVarying && parentRecipe && (
            <div className="border border-border rounded-2xl overflow-hidden">
              <button
                onClick={() => setParentExpanded(!parentExpanded)}
                className="w-full flex items-center justify-between p-3 text-left hover:bg-surface-secondary transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span>{parentRecipe.emoji}</span>
                  <span className="text-sm font-medium text-text-primary">
                    {parentRecipe.title}
                  </span>
                  <span className="text-xs text-text-tertiary">(original)</span>
                </div>
                <svg
                  className={`w-4 h-4 text-text-tertiary transition-transform ${parentExpanded ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              {parentExpanded && (
                <div className="p-4 border-t border-border">
                  <RecipeContent recipe={parentRecipe} compact />
                </div>
              )}
            </div>
          )}

          {/* Suggestion chips when chat is empty */}
          {messages.length === 0 && !isVarying && (
            <div className="py-8 text-center space-y-4">
              <p className="text-text-secondary text-sm">What would you like to cook?</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {SUGGESTION_CHIPS.map((chip) => (
                  <Chip key={chip} label={chip} onClick={() => sendMessage(chip)} />
                ))}
              </div>
            </div>
          )}

          {messages.length === 0 && isVarying && parentRecipe && (
            <div className="py-8 text-center">
              <p className="text-text-secondary text-sm">
                How would you like to modify this recipe?
              </p>
            </div>
          )}

          {/* Chat messages */}
          {messages.map((msg, i) => (
            <div key={i}>
              {msg.role === 'user' ? (
                <ChatMessageBubble message={msg} />
              ) : (
                <RecipeCardMessage
                  recipe={msg.recipe as unknown as GeneratedRecipe}
                  // Every version is savable, not just the newest. Refining and
                  // disliking the result used to discard the good version that
                  // is still sitting on screen.
                  showSave={!isLoading}
                  saveLabel={
                    i === lastAssistantIdx
                      ? isVarying
                        ? 'Save Variation'
                        : 'Save Recipe'
                      : // Distinguishes an older card from the newest one, so
                        // saving a superseded version is a deliberate choice.
                        'Save This Version'
                  }
                  onSave={() =>
                    saveRecipe({
                      recipe: msg.recipe as unknown as GeneratedRecipe,
                      prompt: promptFor(messages, i),
                    })
                  }
                  saving={isSaving}
                />
              )}
            </div>
          ))}

          {/* Similar recipes found */}
          {similarRecipes.length > 0 && !isLoading && (
            <div className="bg-surface-secondary border border-border rounded-2xl p-4 space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-medium text-text-primary">
                  {isVarying
                    ? 'Similar variations already exist'
                    : 'Similar recipes already exist'}
                </p>
                <p className="text-xs text-text-tertiary">
                  Open one, branch a new version from it, or carry on with yours.
                </p>
              </div>
              <div className="space-y-2">
                {similarRecipes.map((r) => {
                  const matched = matchedWords(pendingQuery, r);
                  return (
                    <div
                      key={r.id}
                      className="bg-surface rounded-xl border border-border p-3 space-y-2"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl" aria-hidden="true">{r.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-text-primary truncate">
                            {r.title}
                          </p>
                          <p className="text-xs text-text-tertiary line-clamp-1">
                            {r.description}
                          </p>
                          {/* Why this was surfaced. Without it the panel asserts
                              similarity and leaves the user to guess at it. */}
                          {matched.length > 0 && (
                            <p className="text-xs text-text-secondary mt-0.5">
                              Matches: {matched.join(', ')}
                            </p>
                          )}
                          {r.cloudOrigin && (
                            <p className="text-xs text-text-secondary mt-0.5">
                              {r.cloudOrigin.isOwn
                                ? 'Your recipe, not on this device'
                                : r.cloudOrigin.creatorName
                                  ? `Shared library, by ${r.cloudOrigin.creatorName}`
                                  : 'In the shared library'}
                            </p>
                          )}
                        </div>
                      </div>
                      {/* Branching is the whole point of the app and the panel
                          did not offer it — the only choices were abandon your
                          idea or duplicate an existing recipe. Carrying
                          pendingQuery through means the typed prompt is not lost
                          either way. */}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => navigate(`/recipe/${r.id}`)}
                        >
                          Open
                        </Button>
                        <Button
                          size="sm"
                          onClick={() =>
                            navigate(`/recipe/${r.id}/vary`, {
                              state: { suggestion: pendingQuery ?? '' },
                            })
                          }
                        >
                          Branch from this
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <Button
                fullWidth
                variant="secondary"
                onClick={dismissSimilar}
              >
                Create New {isVarying ? 'Variation' : 'Recipe'} Anyway
              </Button>
            </div>
          )}

          {isLoading && (
            <TypingIndicator
              label={
                loadingPhase === 'checking'
                  ? 'Checking for similar recipes...'
                  : 'Generating recipe...'
              }
            />
          )}

          {error && (
            <div className="bg-danger-50 dark:bg-danger-950 text-danger-700 dark:text-danger-300 text-sm px-4 py-3 rounded-xl space-y-2">
              <p>{error.message}</p>
              {/* The prompt is sitting in the transcript directly above, so
                  recovery used to mean retyping something already on screen.
                  Only offered where retrying could actually succeed — on a
                  misconfiguration it would just reproduce the failure. */}
              {error.retryable && (
                <Button size="sm" variant="secondary" onClick={retryGeneration} disabled={isLoading}>
                  Try again
                </Button>
              )}
              {error.action === 'settings' && (
                <Link
                  to="/settings"
                  className="inline-block font-medium underline underline-offset-2"
                >
                  Open Settings
                </Link>
              )}
            </div>
          )}

          <div ref={scrollRef} />
        </div>
      </main>

      <ChatInput
        // Keyed on the seed so a seed arriving with a new route actually reaches
        // the composer. Navigating /create -> /recipe/:id/vary keeps this page
        // mounted, so without the remount `initialValue` was read once at mount
        // and the carried-over prompt was silently dropped.
        key={suggestionSeed}
        onSend={sendMessage}
        initialValue={suggestionSeed}
        disabled={isLoading || generationUnavailable || (isVarying && !parentRecipe)}
        placeholder={
          generationUnavailable
            ? 'Recipe generation is unavailable'
            : // A disabled composer inviting you to "describe the modification"
              // is the part that made this look functional while doing nothing.
              isVarying && !parentRecipe
              ? parentLoading
                ? 'Loading the original recipe...'
                : 'The original recipe is unavailable'
              : isVarying
                ? 'Describe the modification...'
                : 'Describe what you want to cook...'
        }
      />

      <AuthModal
        open={showAuth}
        onAuthenticated={() => setShowAuth(false)}
        onDismiss={() => {
          setShowAuth(false);
          if (!user) navigate(-1);
        }}
      />

      <ConfirmDialog
        open={showDiscard}
        title={isVarying ? 'Discard this variation?' : 'Discard this recipe?'}
        message={`"${latestRecipe?.title ?? 'This recipe'}" hasn't been saved yet. Going back will discard it.`}
        confirmLabel="Discard"
        confirmVariant="danger"
        onConfirm={() => {
          setShowDiscard(false);
          leaveAfterDiscard();
        }}
        onCancel={() => setShowDiscard(false)}
      />
    </div>
  );
}
