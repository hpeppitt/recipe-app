import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createRecipeChat, createVariationChat, type ChatSession } from '../services/gemini';
import { getApiKey } from '../services/storage';
import { createRecipe, searchRecipes, searchVariations } from '../db/recipes';
import { publishRecipe, searchPublishedRecipes } from '../services/firestore';
import { mergeDedupById } from '../lib/search';
import { isFirebaseConfigured } from '../services/firebase';
import { useAuth } from '../contexts/AuthContext';
import type { Recipe, ChatMessage } from '../types/recipe';
import { trackRecipeCreated } from '../services/analytics';
import type { GeneratedRecipe } from '../types/api';

/** A dedup match, which may live only in the shared cloud library. */
export type SimilarRecipe = {
  id: string;
  emoji: string;
  title: string;
  description: string;
  /** Set when the match was found in the cloud and is not on this device. */
  cloudOrigin: { isOwn: boolean; creatorName: string | null } | null;
};

function toSimilar(recipes: Recipe[]): SimilarRecipe[] {
  return recipes.map((r) => ({
    id: r.id,
    emoji: r.emoji,
    title: r.title,
    description: r.description,
    cloudOrigin: null,
  }));
}

/**
 * Dedup for a brand-new recipe, checking the local library and the shared cloud
 * library. Local matches are deduped against cloud ones by id, so a recipe the
 * user already has on this device is only ever reported once. A cloud failure
 * degrades to local-only rather than blocking generation.
 */
async function searchSimilarRecipes(
  text: string,
  currentUid: string | undefined
): Promise<SimilarRecipe[]> {
  const local = toSimilar(await searchRecipes(text));
  if (!isFirebaseConfigured) return local;

  const published = await searchPublishedRecipes(text).catch(() => []);
  const cloud: SimilarRecipe[] = published.map((r) => ({
    id: r.id,
    emoji: r.emoji,
    title: r.title,
    description: r.description,
    cloudOrigin: {
      // A cloud match can be the user's own recipe published from another
      // device, which is a different message than someone else's recipe.
      isOwn: !!currentUid && r.createdBy?.uid === currentUid,
      creatorName: r.createdBy?.displayName ?? null,
    },
  }));

  return mergeDedupById(local, cloud, { limit: 5, maxFromSecondary: 2 });
}

export function useRecipeChat(parentRecipe?: Recipe) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestRecipe, setLatestRecipe] = useState<GeneratedRecipe | null>(null);
  const [similarRecipes, setSimilarRecipes] = useState<SimilarRecipe[]>([]);
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  const chatRef = useRef<ChatSession | null>(null);
  const sendingRef = useRef(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  const generateRecipe = useCallback(
    async (text: string) => {
      const apiKey = getApiKey();
      if (!apiKey) {
        setError('Please set your Gemini API key in Settings.');
        return;
      }

      setError(null);
      setSimilarRecipes([]);
      setPendingQuery(null);
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

  const sendMessage = useCallback(
    async (text: string) => {
      // The dedup check now hits the network, so a second send while it is in
      // flight would skip dedup (messages.length is no longer 0) and race a
      // second generation against the pending search.
      if (sendingRef.current) return;
      sendingRef.current = true;

      try {
        const isFirstMessage = messages.length === 0;
        const userMessage: ChatMessage = {
          role: 'user',
          content: text,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, userMessage]);

        // Only check for duplicates on the first message
        if (isFirstMessage) {
          // Covers the cloud round trip: disables the input and shows the
          // typing indicator instead of leaving the chat looking idle.
          setIsLoading(true);
          try {
            const matches = parentRecipe
              ? await searchVariations(parentRecipe.rootId, text, parentRecipe.id).then(toSimilar)
              : await searchSimilarRecipes(text, user?.uid);

            if (matches.length > 0) {
              setSimilarRecipes(matches);
              setPendingQuery(text);
              return;
            }
          } catch {
            // Search failed — proceed to generation
          } finally {
            setIsLoading(false);
          }
        }

        await generateRecipe(text);
      } finally {
        sendingRef.current = false;
      }
    },
    [messages.length, parentRecipe, generateRecipe, user?.uid]
  );

  const dismissSimilar = useCallback(async () => {
    if (pendingQuery) {
      await generateRecipe(pendingQuery);
    }
  }, [pendingQuery, generateRecipe]);

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
    similarRecipes,
    sendMessage,
    dismissSimilar,
    saveRecipe,
  };
}
