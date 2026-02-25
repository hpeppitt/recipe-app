import { useParams, useNavigate } from 'react-router-dom';
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
    error,
    similarRecipes,
    sendMessage,
    dismissSimilar,
    saveRecipe,
  } = useRecipeChat(isVarying ? parentRecipe : undefined);
  const { user, isConfigured, isLoading: authLoading } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [parentExpanded, setParentExpanded] = useState(false);
  const [showAuth, setShowAuth] = useState(false);

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
      />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto p-4 space-y-4">
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
                    : 'You already have similar recipes'}
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
                      <span className="text-2xl">{r.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-text-primary truncate">
                          {r.title}
                        </p>
                        <p className="text-xs text-text-tertiary line-clamp-1">
                          {r.description}
                        </p>
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
            <div className="bg-danger-50 text-danger-600 text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          <div ref={scrollRef} />
        </div>
      </main>

      <ChatInput
        onSend={sendMessage}
        disabled={isLoading || (isVarying && !parentRecipe)}
        placeholder={isVarying ? 'Describe the modification...' : 'Describe what you want to cook...'}
      />

      <AuthModal
        open={showAuth}
        onAuthenticated={() => setShowAuth(false)}
        onDismiss={() => {
          setShowAuth(false);
          if (!user) navigate(-1);
        }}
      />
    </div>
  );
}
