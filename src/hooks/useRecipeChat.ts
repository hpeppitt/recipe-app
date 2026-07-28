import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createRecipeChat, createVariationChat, type ChatSession } from '../services/gemini';
import { createRecipe, searchRecipes, searchVariations } from '../db/recipes';
import {
  publishRecipe,
  searchPublishedRecipes,
  searchPublishedVariations,
} from '../services/firestore';
import { mergeDedupById } from '../lib/search';
import {
  describeGenerationError,
  GENERATION_UNAVAILABLE,
  type FriendlyError,
} from '../lib/errors';
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
  return mergeDedupById(local, published.map((r) => toCloudSimilar(r, currentUid)), {
    limit: 5,
    maxFromSecondary: 2,
  });
}

function toCloudSimilar(
  r: { id: string; emoji: string; title: string; description: string; createdBy?: { uid: string; displayName: string | null } },
  currentUid: string | undefined
): SimilarRecipe {
  return {
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
  };
}

/**
 * Dedup for a new variation, across the local tree and the published one.
 *
 * Varying someone else's recipe means the tree isn't in local Dexie at all, so a
 * local-only check found nothing and every variation looked new.
 */
async function searchSimilarVariations(
  parentRecipe: Recipe,
  text: string,
  currentUid: string | undefined
): Promise<SimilarRecipe[]> {
  const local = toSimilar(
    await searchVariations(parentRecipe.rootId, text, parentRecipe.id)
  );
  if (!isFirebaseConfigured) return local;

  const published = await searchPublishedVariations(
    parentRecipe.rootId,
    text,
    parentRecipe.id
  ).catch(() => []);

  return mergeDedupById(local, published.map((r) => toCloudSimilar(r, currentUid)), {
    limit: 3,
    maxFromSecondary: 2,
  });
}

export function useRecipeChat(parentRecipe?: Recipe) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [latestRecipe, setLatestRecipe] = useState<GeneratedRecipe | null>(null);
  const [similarRecipes, setSimilarRecipes] = useState<SimilarRecipe[]>([]);
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const chatRef = useRef<ChatSession | null>(null);
  const sendingRef = useRef(false);
  const generatingRef = useRef(false);
  const savingRef = useRef(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  const generateRecipe = useCallback(
    async (text: string) => {
      if (!isFirebaseConfigured) {
        setError(GENERATION_UNAVAILABLE);
        return;
      }

      // Guarded here rather than at the call sites because this is the chokepoint
      // both entry paths funnel through. `sendMessage` has its own `sendingRef`,
      // but "Create New Anyway" (dismissSimilar) bypasses it and calls straight in,
      // so a synchronous double-fire started two concurrent generations — two
      // billed Gemini calls, and two assistant messages racing into the transcript.
      if (generatingRef.current) return;
      generatingRef.current = true;

      setError(null);
      setSimilarRecipes([]);
      setPendingQuery(null);
      setIsLoading(true);

      try {
        if (!chatRef.current) {
          chatRef.current = parentRecipe
            ? createVariationChat(parentRecipe)
            : createRecipeChat();
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
        // Keep the raw SDK message out of the UI but available in the console:
        // it is developer-facing and can echo request details back.
        console.error('Recipe generation failed', err);
        setError(describeGenerationError(err));
      } finally {
        setIsLoading(false);
        generatingRef.current = false;
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
              ? await searchSimilarVariations(parentRecipe, text, user?.uid)
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
    // createRecipe mints a fresh UUID per call, so a double-tap would write two
    // distinct recipes to Dexie and publish both. The ref guards the gap before
    // the isSaving re-render lands.
    if (savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);

    try {
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

      // Publish to Firestore for sharing/social features. Deliberately not
      // awaited so a slow network doesn't hold up navigation, but no longer
      // silently swallowed: Share reconciles a failed publish on demand, and
      // this leaves a trace when it doesn't land.
      if (isFirebaseConfigured) {
        publishRecipe(recipe).catch((err) => {
          console.error('Publishing recipe to the cloud failed; it stays local until shared', err);
        });
      }

      trackRecipeCreated(recipe.id, !!parentRecipe);
      navigate(`/recipe/${recipe.id}`);
      // Deliberately stays locked after a successful save: the page is
      // navigating away and re-enabling would briefly re-arm the button.
    } catch (err) {
      savingRef.current = false;
      setIsSaving(false);
      console.error('Recipe save failed', err);
      setError({ message: "Couldn't save the recipe. Please try again." });
    }
  }, [latestRecipe, messages, parentRecipe, navigate, user]);

  return {
    messages,
    isLoading,
    isSaving,
    error,
    // Blocks the composer up front instead of letting the user write a prompt and
    // only then discover generation is impossible. Users no longer supply a key —
    // AI Logic holds it — so the only remaining precondition is a Firebase project.
    generationUnavailable: !isFirebaseConfigured,
    latestRecipe,
    similarRecipes,
    sendMessage,
    dismissSimilar,
    saveRecipe,
  };
}
