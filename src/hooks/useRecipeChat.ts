import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createRecipeChat, createVariationChat, type ChatSession } from '../services/gemini';
import { getApiKey } from '../services/storage';
import { createRecipe } from '../db/recipes';
import { publishRecipe } from '../services/firestore';
import { isFirebaseConfigured } from '../services/firebase';
import { useAuth } from '../contexts/AuthContext';
import type { Recipe, ChatMessage } from '../types/recipe';
import { trackRecipeCreated } from '../services/analytics';
import type { GeneratedRecipe } from '../types/api';

export function useRecipeChat(parentRecipe?: Recipe) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestRecipe, setLatestRecipe] = useState<GeneratedRecipe | null>(null);
  const chatRef = useRef<ChatSession | null>(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  const sendMessage = useCallback(
    async (text: string) => {
      const apiKey = getApiKey();
      if (!apiKey) {
        setError('Please set your Gemini API key in Settings.');
        return;
      }

      setError(null);
      const userMessage: ChatMessage = {
        role: 'user',
        content: text,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      try {
        if (!chatRef.current) {
          chatRef.current = parentRecipe
            ? createVariationChat(apiKey, parentRecipe)
            : createRecipeChat(apiKey);
        }

        const generated = await chatRef.current.sendMessage(text);
        setLatestRecipe(generated);

        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: JSON.stringify(generated),
          recipe: generated as unknown as Recipe,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to generate recipe';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    },
    [parentRecipe]
  );

  const saveRecipe = useCallback(async () => {
    if (!latestRecipe) return;

    const firstUserMessage = messages.find((m) => m.role === 'user');
    const prompt = firstUserMessage?.content ?? '';

    const createdBy = {
      uid: user?.uid ?? 'local',
      displayName: user?.displayName ?? null,
    };

    const recipe = await createRecipe(
      latestRecipe,
      prompt,
      messages,
      parentRecipe?.id ?? null,
      parentRecipe?.rootId ?? null,
      parentRecipe?.depth ?? -1,
      createdBy
    );

    // Publish to Firestore for sharing/social features
    if (isFirebaseConfigured) {
      publishRecipe(recipe).catch(() => {});
    }

    trackRecipeCreated(recipe.id, !!parentRecipe);
    navigate(`/recipe/${recipe.id}`);
  }, [latestRecipe, messages, parentRecipe, navigate, user]);

  return {
    messages,
    isLoading,
    error,
    latestRecipe,
    sendMessage,
    saveRecipe,
  };
}
