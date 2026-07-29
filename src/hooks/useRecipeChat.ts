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
import { withTimeout } from '../lib/utils';
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

/** How long a save waits for the cloud publish before reporting local-only. */
const PUBLISH_TIMEOUT_MS = 4000;

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
  // Which of the two waits is in progress. They were indistinguishable, so the
  // dedup search sat behind a "Generating recipe..." indicator — announcing work
  // that had not started, and that the panel then contradicted.
  const [loadingPhase, setLoadingPhase] = useState<'checking' | 'generating' | null>(null);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [latestRecipe, setLatestRecipe] = useState<GeneratedRecipe | null>(null);
  const [similarRecipes, setSimilarRecipes] = useState<SimilarRecipe[]>([]);
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const chatRef = useRef<ChatSession | null>(null);
  const sendingRef = useRef(false);
  const generatingRef = useRef(false);
  // Dedup is a once-per-chat check, but "once" has to mean "once a recipe
  // actually exists", not "once a message was typed". Keyed off messages.length
  // it was spent by the first send even if that send failed, so every retry
  // after an error silently skipped dedup for the rest of the session.
  const generatedOnceRef = useRef(false);
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
      setLoadingPhase('generating');

      try {
        if (!chatRef.current) {
          chatRef.current = parentRecipe
            ? createVariationChat(parentRecipe)
            : createRecipeChat();
        }

        const generated = await chatRef.current.sendMessage(text);
        generatedOnceRef.current = true;
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
        setLoadingPhase(null);
        generatingRef.current = false;
      }
    },
    [parentRecipe]
  );

  const sendMessage = useCallback(
    async (text: string) => {
      // The dedup check hits the network, so a second send while it is in flight
      // would race a second generation against the pending search.
      if (sendingRef.current) return;
      sendingRef.current = true;

      try {
        const shouldCheckDuplicates = !generatedOnceRef.current;
        const userMessage: ChatMessage = {
          role: 'user',
          content: text,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, userMessage]);

        // Check for duplicates until a recipe has actually been generated.
        if (shouldCheckDuplicates) {
          // Covers the cloud round trip: disables the input and shows the
          // typing indicator instead of leaving the chat looking idle.
          setIsLoading(true);
          setLoadingPhase('checking');
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
            setLoadingPhase(null);
          }
        }

        await generateRecipe(text);
      } finally {
        sendingRef.current = false;
      }
    },
    [parentRecipe, generateRecipe, user?.uid]
  );

  /**
   * Re-run the last prompt after a failure. The prompt is still on screen in the
   * transcript, so making the user retype it was pure friction — and it goes
   * straight to generation rather than back through dedup, which already ran.
   */
  const retryGeneration = useCallback(async () => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    await generateRecipe(lastUser.content);
  }, [messages, generateRecipe]);

  const dismissSimilar = useCallback(async () => {
    if (pendingQuery) {
      await generateRecipe(pendingQuery);
    }
  }, [pendingQuery, generateRecipe]);

  /**
   * Save a specific generation, defaulting to the newest.
   *
   * Every generated version stays on screen, so pinning save to `latestRecipe`
   * meant refining once and disliking the result discarded the good version the
   * user was still looking at. The caller passes the version it rendered, along
   * with the prompt that produced it, so the saved recipe's `prompt` describes
   * that version rather than the first thing typed in the session.
   */
  const saveRecipe = useCallback(async (target?: { recipe: GeneratedRecipe; prompt: string }) => {
    const toSave = target?.recipe ?? latestRecipe;
    if (!toSave) return;
    // createRecipe mints a fresh UUID per call, so a double-tap would write two
    // distinct recipes to Dexie and publish both. The ref guards the gap before
    // the isSaving re-render lands.
    if (savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);

    try {
      const firstUserMessage = messages.find((m) => m.role === 'user');
      const prompt = target?.prompt ?? firstUserMessage?.content ?? '';

      const createdBy = {
        uid: user?.uid ?? 'local',
        displayName: user?.displayName ?? null,
      };

      const recipe = await createRecipe(
        toSave,
        prompt,
        messages,
        parentRecipe?.id ?? null,
        parentRecipe?.rootId ?? null,
        parentRecipe?.depth ?? -1,
        createdBy
      );

      // Bounded wait on the publish rather than fire-and-forget. The outcome has
      // to be known before navigating, because the confirmation is shown on the
      // destination page and "Saved and shared" is a claim we should not make
      // when the write never landed. Bounded because an unreachable Firestore
      // retries instead of rejecting, so an unbounded await would hang the save.
      let published = false;
      if (isFirebaseConfigured) {
        published = await withTimeout(
          publishRecipe(recipe)
            .then(() => true)
            .catch((err) => {
              console.error(
                'Publishing recipe to the cloud failed; it stays local until shared',
                err
              );
              return false;
            }),
          PUBLISH_TIMEOUT_MS,
          false
        );
      }

      trackRecipeCreated(recipe.id, !!parentRecipe);
      // The destination reads this to confirm what actually happened. Local-only
      // mode reports 'local' too, which is accurate: nothing was shared.
      navigate(`/recipe/${recipe.id}`, {
        state: { saved: published ? 'cloud' : 'local' },
      });
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
    loadingPhase,
    /** The prompt that produced the current matches, so the UI can carry it forward. */
    pendingQuery,
    sendMessage,
    retryGeneration,
    dismissSimilar,
    saveRecipe,
  };
}
