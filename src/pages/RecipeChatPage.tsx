import { useParams, useNavigate, Link } from 'react-router-dom';
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
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { SUGGESTION_CHIPS } from '../lib/constants';
import { useEffect, useRef, useState } from 'react';
import type { GeneratedRecipe } from '../types/api';

export function RecipeChatPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isVarying = !!id;
  const { recipe: parentRecipe } = useRecipe(id);
  const {
    messages,
    isLoading,
    isSaving,
    error,
    needsApiKey,
    latestRecipe,
    similarRecipes,
    sendMessage,
    dismissSimilar,
    saveRecipe,
  } = useRecipeChat(isVarying ? parentRecipe : undefined);
  const { user, isConfigured, isLoading: authLoading } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [parentExpanded, setParentExpanded] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);

  // A generated recipe lives only in component state until saved, so leaving the
  // page destroys it. isSaving excluded because saveRecipe navigates on success.
  const hasUnsavedRecipe = !!latestRecipe && !isSaving;

  const handleBack = () => {
    if (hasUnsavedRecipe) {
      setShowDiscard(true);
      return;
    }
    navigate(-1);
  };

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
          {/* Surfaced before composing: generation is impossible without a key */}
          {needsApiKey && (
            <div className="border border-warning-200 bg-warning-50 dark:border-warning-800 dark:bg-warning-950 rounded-2xl p-4 space-y-2">
              <p className="text-sm font-medium text-warning-800 dark:text-warning-200">
                A Gemini API key is required
              </p>
              <p className="text-xs text-warning-700 dark:text-warning-300">
                Recipes are generated with Gemini, so you'll need to add your own key before
                you can create one.
              </p>
              <Link
                to="/settings"
                className="inline-block text-sm font-medium text-primary-600 dark:text-primary-300 underline underline-offset-2"
              >
                Add a key in Settings
              </Link>
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

          {messages.length === 0 && isVarying && (
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
                  showSave={i === lastAssistantIdx && !isLoading}
                  saveLabel={isVarying ? 'Save Variation' : 'Save Recipe'}
                  onSave={saveRecipe}
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
                  Would you like to use one of these instead?
                </p>
              </div>
              <div className="space-y-2">
                {similarRecipes.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => navigate(`/recipe/${r.id}`)}
                    className="w-full text-left bg-surface rounded-xl border border-border p-3 hover:border-border-strong transition-colors"
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
                      <svg className="w-4 h-4 text-text-tertiary flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                      </svg>
                    </div>
                  </button>
                ))}
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

          {isLoading && <TypingIndicator />}

          {error && (
            <div className="bg-danger-50 dark:bg-danger-950 text-danger-700 dark:text-danger-300 text-sm px-4 py-3 rounded-xl space-y-2">
              <p>{error.message}</p>
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
        onSend={sendMessage}
        disabled={isLoading || needsApiKey || (isVarying && !parentRecipe)}
        placeholder={
          needsApiKey
            ? 'Add a Gemini API key in Settings first'
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
          navigate(-1);
        }}
        onCancel={() => setShowDiscard(false)}
      />
    </div>
  );
}
