import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { useRecipe } from '../hooks/useRecipe';
import { useRecipeChat } from '../hooks/useRecipeChat';
import { useUnsavedGuard } from '../hooks/useUnsavedGuard';
import { useAuth } from '../contexts/AuthContext';
import { IconButton } from '../components/ui/IconButton';
import { EmptyState } from '../components/ui/EmptyState';
import { ChatMessageBubble } from '../components/chat/ChatMessage';
import { RecipeCardMessage } from '../components/chat/RecipeCardMessage';
import { ChatInput } from '../components/chat/ChatInput';
import { TypingIndicator } from '../components/chat/TypingIndicator';
import { BranchComposer, GrowingCard } from '../components/chat/BranchComposer';
import { RecipeContent } from '../components/recipe/RecipeContent';
import { EmailLinkingForm } from '../components/auth/EmailLinkingForm';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { REFINEMENT_CHIPS, SUGGESTION_CHIPS } from '../lib/constants';
import { queryWords } from '../lib/search';
import { canGenerate } from '../lib/generation';
import { useEffect, useRef, useState } from 'react';
import type { GeneratedRecipe } from '../types/api';
import type { ChatMessage } from '../types/recipe';
import { ChevronDown, GitBranch, Sparkles, X } from '../components/ui/icons';

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

/** The 6a header: Close (runs the discard guard) and the page title. */
function ChatHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <header className="flex items-center gap-1 px-3 pt-3 pb-2">
      <IconButton variant="flat" label="Close" icon={<X className="size-5" />} onClick={onClose} />
      <h1 className="min-w-0 flex-1 break-words font-heading text-lg text-text-primary">{title}</h1>
    </header>
  );
}

function GenerationUnavailableNotice() {
  return (
    <div className="rounded-[22px] bg-surface-secondary p-4 space-y-2">
      <p className="text-sm font-medium text-text-primary">Recipe generation is unavailable</p>
      <p className="text-sm text-text-secondary">
        This build has no Firebase configuration, so it can't reach the recipe generator. Your
        saved recipes are unaffected.
      </p>
    </div>
  );
}

/** A 36px pill inside a 44px row, so the target is 44px without clipping in a scrolling row. */
function PillChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 flex-shrink-0 items-center focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary-500"
    >
      <span className="flex h-9 items-center whitespace-nowrap rounded-full bg-accent-200 px-3.5 text-[13px] text-accent-900">
        {label}
      </span>
    </button>
  );
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
    attachmentPreviews,
    sentImageCount,
    sendMessage,
    retryGeneration,
    dismissSimilar,
    saveRecipe,
  } = useRecipeChat(isVarying ? parentRecipe : undefined);
  const { user, isConfigured, isLoading: authLoading } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [parentExpanded, setParentExpanded] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  // Cards the user has opened or closed by hand, by message index (the list is
  // append-only, so an index is a stable id). Any card not in here follows the
  // default: the newest is open, every older one is closed. A new card therefore
  // opens and the previous one closes, unless the user touched the previous one.
  const [toggled, setToggled] = useState<Record<number, boolean>>({});
  // Set when the owner arrives here by approving a suggestion, so the composer
  // opens with the suggestion already written out.
  const location = useLocation();
  const suggestionSeed = (location.state as { suggestion?: string } | null)?.suggestion ?? '';

  // A generated recipe lives only in component state until saved, so leaving the
  // page destroys it. isSaving excluded because saveRecipe navigates on success.
  const hasUnsavedRecipe = !!latestRecipe && !isSaving;

  // Guards hardware back, the iOS swipe gesture, reload and tab close. The
  // mechanism and the reasoning behind it (useBlocker does not work here — UI-15)
  // now live in the hook, which RecipeEditPage shares.
  const { leave: leaveAfterDiscard } = useUnsavedGuard(hasUnsavedRecipe, () =>
    setShowDiscard(true)
  );

  // Close on a cold load or deep link has no history to pop, so go home instead
  // of doing nothing. location.key is 'default' for the first entry.
  const goBack = () => (location.key === 'default' ? navigate('/') : navigate(-1));

  const handleBack = () => {
    if (hasUnsavedRecipe) {
      setShowDiscard(true);
      return;
    }
    goBack();
  };

  const scrollToNewest = () => scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, similarRecipes]);

  const lastAssistantIdx = messages.reduce(
    (acc, msg, i) => (msg.role === 'assistant' ? i : acc),
    -1
  );

  // "Ready" only while the newest message is the assistant's and nothing failed:
  // latestRecipe still holds the previous recipe after a failed refinement or
  // save, so it cannot say whether something new just arrived.
  const lastMsg = messages[messages.length - 1];
  const readyTitle =
    !isLoading && !error && lastMsg?.role === 'assistant' ? (lastMsg.recipe?.title ?? '') : null;

  // The first turn of a variation shows the growing card, which is then the
  // live region (and the sr-only one is silent), so it is announced once.
  const growingFirst = isVarying && isLoading && messages.length === 1;

  // The one live region, permanently mounted (a region that appears already
  // containing its text is not announced by NVDA or VoiceOver) and in the same
  // spot in both the composer and chat trees so it survives the switch. The
  // visible typing label and growing card are aria-hidden.
  const liveRegion = (
    <p role="status" aria-live="polite" className="sr-only">
      {growingFirst
        ? 'Growing your branch…'
        : isLoading
          ? loadingPhase === 'checking'
            ? 'Checking for similar recipes...'
            : 'Generating recipe...'
          : readyTitle !== null
            ? `${readyTitle || 'Your recipe'} is ready`
            : ''}
    </p>
  );

  const title = isVarying ? 'New variation' : 'New recipe';

  // The contribute gate, and the one place it cannot be a rule.
  //
  // firestore.rules stops an unverified account *publishing*, but generation
  // never touches Firestore: gemini.ts calls Firebase AI Logic straight from the
  // browser. So this check is the only thing between an anonymous visitor and
  // the shared Gemini quota, and it has to sit in front of the composer rather
  // than at save time.
  //
  // Blocking here rather than at save is also the kinder half. Letting someone
  // spend a generation and then refusing the save would be a worse first meeting
  // than asking up front, and up front is where the ask can be an offer.
  //
  // Signed-out and anonymous deliberately land on the same screen. This route
  // used to open the sign-in modal for signed-out visitors, which offered
  // "Continue Anonymously" beside email; that option is now a dead end here,
  // since an anonymous account cannot generate, so taking it walked straight
  // into this gate. One screen asking for the one thing that unblocks them
  // beats a choice where half the options do not.
  //
  // `!authLoading` is load-bearing, not defensive. Firebase restores the
  // session asynchronously, so `user` is null for the first frames of every
  // reload; without this, a signed-up user refreshing the page would be shown
  // the sign-up screen before their own session arrived.
  if (!authLoading && !canGenerate({ isConfigured, user })) {
    return (
      <div className="min-h-dvh flex flex-col bg-surface">
        <ChatHeader title={title} onClose={goBack} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-lg min-w-0">
            <EmptyState
              icon={<Sparkles />}
              title="Sign up to start cooking up recipes"
              description="Recipe Lab writes recipes with AI and keeps them in one shared library. Add your email to create your own, suggest changes to other people's, and keep everything you make across devices."
              action={
                <div className="w-[calc(100vw-3rem)] max-w-sm min-w-0 space-y-4">
                  <EmailLinkingForm
                    tone="invite"
                    icon="✉️"
                    title="No password needed"
                    description="We'll email you a link. Tap it and you're in, on this device or any other."
                    submitLabel="Sign up"
                  />

                  <p className="text-xs text-text-tertiary text-center">
                    You can keep browsing and bookmarking on this device without signing up.
                  </p>
                  <Button variant="secondary" fullWidth onClick={() => navigate('/')}>
                    Back to recipes
                  </Button>
                </div>
              }
            />
          </div>
        </main>
      </div>
    );
  }

  // The 6b first screen. Once the first message exists the chat below takes over.
  if (isVarying && parentRecipe && messages.length === 0) {
    return (
      <div className="min-h-dvh flex flex-col bg-surface">
        {liveRegion}
        <ChatHeader title={title} onClose={handleBack} />
        <BranchComposer
          // Keyed on the seed, as the ChatInput was: navigating /create ->
          // /recipe/:id/vary keeps this page mounted.
          key={suggestionSeed}
          parent={parentRecipe}
          seed={suggestionSeed}
          generating={isLoading}
          unavailableNotice={generationUnavailable ? <GenerationUnavailableNotice /> : undefined}
          onGrow={sendMessage}
        />
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col bg-surface">
      {liveRegion}
      <ChatHeader title={title} onClose={handleBack} />

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-lg min-w-0 flex-col gap-3 px-[18px] pt-1 pb-3">
          {/* Surfaced before composing rather than after. There is nothing the user
              can do about this one — no key to paste any more — so it links nowhere. */}
          {generationUnavailable && <GenerationUnavailableNotice />}

          {/* Why the composer is inert. Each of these three is a distinct
              situation and only one of them is worth retrying. */}
          {isVarying && !parentRecipe && parentLoading && (
            <div className="flex items-center gap-3 rounded-[22px] bg-surface-secondary p-4">
              <Spinner size="sm" />
              <p className="text-sm text-text-secondary">Loading the original recipe...</p>
            </div>
          )}

          {isVarying && !parentRecipe && !parentLoading && parentCloudError && (
            <div className="rounded-[22px] bg-surface-secondary p-4 space-y-2">
              <p className="text-sm font-medium text-text-primary">
                Couldn't load the original recipe
              </p>
              <p className="text-sm text-text-secondary">
                A variation needs it as a starting point, so this can't continue until it
                loads. Your connection may be the problem.
              </p>
              <Button size="sm" variant="secondary" onClick={retryParent}>
                Try again
              </Button>
            </div>
          )}

          {isVarying && !parentRecipe && !parentLoading && !parentCloudError && (
            <div className="rounded-[22px] bg-surface-secondary p-4 space-y-2">
              <p className="text-sm font-medium text-text-primary">
                That recipe no longer exists
              </p>
              <p className="text-sm text-text-secondary">
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
                aria-expanded={parentExpanded}
                aria-controls="parent-preview"
                className="w-full flex items-center justify-between p-3 text-left hover:bg-surface-secondary transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span>{parentRecipe.emoji}</span>
                  <span className="text-sm font-medium text-text-primary">
                    {parentRecipe.title}
                  </span>
                  <span className="text-xs text-text-tertiary">(original)</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-text-tertiary transition-transform ${parentExpanded ? 'rotate-180' : ''}`} />
              </button>
              {parentExpanded && (
                <div id="parent-preview" className="p-4 border-t border-border">
                  <RecipeContent recipe={parentRecipe} compact />
                </div>
              )}
            </div>
          )}

          {/* Suggestion chips when chat is empty */}
          {messages.length === 0 && !isVarying && (
            <div className="py-8 text-center space-y-4">
              <p className="text-[15px] text-text-secondary">What would you like to cook?</p>
              <div className="flex flex-wrap justify-center gap-x-2">
                {SUGGESTION_CHIPS.map((chip) => (
                  <PillChip key={chip} label={chip} onClick={() => sendMessage(chip)} />
                ))}
              </div>
            </div>
          )}

          {/* Chat messages */}
          {messages.map((msg, i) => (
            <div key={i} className="min-w-0">
              {msg.role === 'user' ? (
                <ChatMessageBubble message={msg} photos={attachmentPreviews[msg.timestamp]} />
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
                  expanded={toggled[i] ?? i === lastAssistantIdx}
                  onToggle={() =>
                    setToggled((t) => ({ ...t, [i]: !(t[i] ?? i === lastAssistantIdx) }))
                  }
                />
              )}
            </div>
          ))}

          {/* Similar recipes found */}
          {similarRecipes.length > 0 && !isLoading && (
            <div className="rounded-[24px] bg-accent-2-100 px-3.5 py-3 text-[13px] text-accent-2-900 space-y-3">
              <div className="space-y-1">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <GitBranch className="size-4 flex-shrink-0" />
                  {isVarying
                    ? 'Similar variations already exist'
                    : 'Similar recipes already exist'}
                </p>
                <p>
                  Open one, branch a new version from it, or carry on with yours.
                </p>
              </div>
              <div className="space-y-2">
                {similarRecipes.map((r) => {
                  const matched = matchedWords(pendingQuery, r);
                  return (
                    <div
                      key={r.id}
                      className="bg-surface text-text-primary rounded-[20px] p-3 space-y-2"
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

          {growingFirst && <GrowingCard />}

          {isLoading && !growingFirst && (
            <TypingIndicator
              label={
                loadingPhase === 'checking'
                  ? 'Checking for similar recipes...'
                  : 'Generating recipe...'
              }
            />
          )}

          {error && (
            <div role="alert" className="rounded-[18px] bg-accent-100 px-4 py-3 text-sm text-accent-900 space-y-2">
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
                  className="inline-flex min-h-11 items-center font-medium underline underline-offset-2"
                >
                  Open Settings
                </Link>
              )}
            </div>
          )}

          <div ref={scrollRef} />
        </div>
      </main>

      <div className="sticky bottom-0 bg-surface pt-1">
        {/* Refinements need a recipe to refine and a free composer, so they are
            hidden before the first result and while one is being generated. */}
        {latestRecipe && !isLoading && (
          <div className="mx-auto flex max-w-lg min-w-0 gap-2 overflow-x-auto px-4 scrollbar-none">
            {REFINEMENT_CHIPS.map((chip) => (
              <PillChip key={chip} label={chip} onClick={() => sendMessage(chip)} />
            ))}
          </div>
        )}
        <ChatInput
          // Keyed on the seed so a seed arriving with a new route actually reaches
          // the composer. Navigating /create -> /recipe/:id/vary keeps this page
          // mounted, so without the remount `initialValue` was read once at mount
          // and the carried-over prompt was silently dropped.
          key={suggestionSeed}
          onSend={sendMessage}
          sentImageCount={sentImageCount}
          onLayoutChange={scrollToNewest}
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
                : latestRecipe
                  ? 'Ask for a change…'
                  : isVarying
                  ? 'Describe the modification...'
                  : 'Describe what you want to cook...'
          }
        />
      </div>

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
