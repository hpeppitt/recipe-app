import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createRecipeChat, createVariationChat, type ChatSession } from '../services/gemini';
import {
  buildRecipe,
  createRecipe,
  getRecipeTree,
  searchRecipes,
  searchVariations,
} from '../db/recipes';
import {
  getTasteProfile,
  saveTasteProfile,
  notifyBranched,
  searchPublishedVariations,
  setCookBranch,
  type PublishedRecipe,
} from '../services/firestore';
import { readPublishedWindow } from '../services/publishedWindow';
import { dedupKey, familyCounts, mergeDedupById, rankByQuery, recipeHaystack } from '../lib/search';
import {
  describeGenerationError,
  GENERATION_UNAVAILABLE,
  type FriendlyError,
} from '../lib/errors';
import { normaliseAvoids, type TasteProfile } from '../lib/taste';
import { isFirebaseConfigured } from '../services/firebase';
import { useAuth } from '../contexts/AuthContext';
import type { Recipe, ChatMessage } from '../types/recipe';
import { trackRecipeCreated } from '../services/analytics';
import type { GeneratedRecipe } from '../types/api';
import { reportError } from '../services/telemetry';
import { publishThenCache } from '../services/recipeSave';
import {
  IMAGE_ONLY_PROMPT,
  MAX_IMAGES_PER_CHAT,
  MAX_IMAGES_PER_MESSAGE,
  redactInlineData,
  type ImageAttachment,
} from '../lib/imageAttachments';

/** The typing pause after which a new-recipe chat looks for similar recipes (7a, RL-178). */
export const TYPING_PAUSE_MS = 700;

/** A dedup match, which may live only in the shared cloud library. */
export type SimilarRecipe = {
  id: string;
  /** The match's family, recorded on a new original made despite it (RL-162). Null when unknown. */
  rootId: string | null;
  emoji: string;
  title: string;
  description: string;
  totalTime: number;
  difficulty: string;
  /** Who made it, for a UserPill. Null for a recipe saved on this device with no account. */
  author: { uid: string; name: string | null } | null;
  /** Set when the match was found in the cloud and is not on this device. */
  cloudOrigin: { isOwn: boolean; creatorName: string | null; creatorUid: string | null } | null;
};

function toSimilar(recipes: Recipe[]): SimilarRecipe[] {
  return recipes.map((r) => ({
    id: r.id,
    rootId: r.rootId,
    emoji: r.emoji,
    title: r.title,
    description: r.description,
    totalTime: r.totalTime,
    difficulty: r.difficulty,
    author: r.createdBy.uid === 'local' ? null : { uid: r.createdBy.uid, name: r.createdBy.displayName },
    cloudOrigin: null,
  }));
}

/** The 7a card: up to three matches, and the top match's family size when known. */
export type TypingMatches = {
  matches: SimilarRecipe[];
  family: { versions: number; cooks: number } | null;
  /** The text that produced them, carried into Branch like the on-send panel does. */
  query: string;
};

/**
 * Dedup for a brand-new recipe, checking the local library and the shared cloud
 * library. Local matches are deduped against cloud ones by id, so a recipe the
 * user already has on this device is only ever reported once. A cloud failure
 * degrades to local-only rather than blocking generation.
 */
export async function searchSimilarRecipes(
  text: string,
  currentUid: string | undefined,
  cloudWindow: () => Promise<PublishedRecipe[] | null>
): Promise<{ matches: SimilarRecipe[]; cloud: PublishedRecipe[] | null }> {
  const local = toSimilar(await searchRecipes(text));
  if (!isFirebaseConfigured) return { matches: local, cloud: null };

  // Firestore has no full-text search, so the newest published window is scored
  // client-side. Recipes past that window are not considered: an accepted limit.
  const cloud = await cloudWindow();
  const published = rankByQuery(cloud ?? [], text, {
    haystack: recipeHaystack,
    threshold: 0.5,
    limit: 5,
  });
  const matches = mergeDedupById(local, published.map((r) => toCloudSimilar(r, currentUid)), {
    limit: 5,
    maxFromSecondary: 2,
  });
  return { matches, cloud };
}

function toCloudSimilar(
  r: { id: string; rootId?: string; parentId?: string | null; emoji: string; title: string; description: string; totalTime: number; difficulty: string; createdBy?: { uid: string; displayName: string | null } },
  currentUid: string | undefined
): SimilarRecipe {
  return {
    id: r.id,
    // An original is its own root; a branch with no rootId has an unknown family.
    rootId: r.rootId ?? (r.parentId == null ? r.id : null),
    emoji: r.emoji,
    title: r.title,
    description: r.description,
    totalTime: r.totalTime,
    difficulty: r.difficulty,
    author: r.createdBy ? { uid: r.createdBy.uid, name: r.createdBy.displayName } : null,
    cloudOrigin: {
      // A cloud match can be the user's own recipe published from another
      // device, which is a different message than someone else's recipe.
      isOwn: !!currentUid && r.createdBy?.uid === currentUid,
      creatorName: r.createdBy?.displayName ?? null,
      creatorUid: r.createdBy?.uid ?? null,
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

/**
 * The verified user's stored taste profile for a new chat session (RL-233), or null when the read failed.
 * One read, bounded by getTasteProfile's 5 s. Permission denied means no profile can be stored yet
 * (rules not deployed, RL-249), so it counts as no avoids, not a failure; other errors are reported.
 */
async function readAvoids(uid: string): Promise<TasteProfile | null> {
  try {
    return await getTasteProfile(uid);
  } catch (err) {
    if ((err as { code?: unknown } | null)?.code === 'permission-denied') return { avoids: [], hidden: [], askedAt: Date.now() }; // askedAt set so the ask card stays hidden (nothing can be saved)
    reportError(err, 'taste-avoids');
    return null;
  }
}

/** `fromCookId` is the cook whose note this variation was grown from (RL-197), credited on save (RL-201). */
export function useRecipeChat(parentRecipe?: Recipe, fromCookId?: string) {
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
  // Photos sent with each user message, as data URLs keyed by its timestamp, for
  // the transcript to show. React state only: never in `messages` (decision 3).
  const [attachmentPreviews, setAttachmentPreviews] = useState<Record<number, string[]>>({});
  // The photos of the last send, so retry and "Create New Anyway" resend them.
  // Replaced by every send and cleared once it generates, so they never ride
  // along with a later message.
  const lastImagesRef = useRef<ImageAttachment[] | undefined>(undefined);
  // Photos in successful turns only: the SDK keeps (and resends every turn) the
  // history of turns that succeeded, so a failed or abandoned send costs nothing.
  const chatImageCountRef = useRef(0);
  const chatRef = useRef<ChatSession | null>(null);
  const sendingRef = useRef(false);
  const generatingRef = useRef(false);
  // Dedup is a once-per-chat check, but "once" has to mean "once a recipe
  // actually exists", not "once a message was typed". Keyed off messages.length
  // it was spent by the first send even if that send failed, so every retry
  // after an error silently skipped dedup for the rest of the session.
  const generatedOnceRef = useRef(false);
  const savingRef = useRef(false);
  // A cook takes one branchId (the rules allow it once), so only the first saved variation credits it.
  const cookCreditedRef = useRef(false);
  // The record built for the version last sent to the cloud. A retry of that
  // version reuses its id, so a publish that timed out but landed is merged by
  // publishRecipe instead of becoming a second recipe (RL-049, RL-082).
  const builtRef = useRef<{ source: GeneratedRecipe; recipe: Recipe } | null>(null);
  // The first shown match's family, held from "Create New Recipe Anyway" for the
  // rest of this chat and recorded on the original it saves (RL-162).
  const relatedFamilyRef = useRef<string | null>(null);
  // The published window, read on the first typing pause or first send and shared
  // by both checks (and, through readPublishedWindow, by chats within its TTL). A
  // failure is not kept: the next caller retries once, then the chat is local-only.
  const cloudWindowRef = useRef<Promise<PublishedRecipe[] | null> | null>(null);
  const windowFailsRef = useRef(0);
  const cloudWindow = useCallback(() => {
    if (!cloudWindowRef.current) {
      if (windowFailsRef.current >= 2) return Promise.resolve(null);
      const read: Promise<PublishedRecipe[] | null> = readPublishedWindow().then((rows) => {
        if (rows) return rows;
        windowFailsRef.current++;
        if (cloudWindowRef.current === read) cloudWindowRef.current = null;
        return null;
      });
      cloudWindowRef.current = read;
    }
    return cloudWindowRef.current;
  }, []);
  // The 7a typing-pause card (RL-178). Results are cached by normalised query and
  // a stale lookup is dropped by sequence number.
  const [typingMatches, setTypingMatches] = useState<TypingMatches | null>(null);
  const [typingAnnouncement, setTypingAnnouncement] = useState('');
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const typingSeqRef = useRef(0);
  const typingCacheRef = useRef(new Map<string, Omit<TypingMatches, 'query'> | null>());
  const typingDismissedRef = useRef(false);
  const typingAnnouncedRef = useRef(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  // The avoids read starts on mount so it is usually done by the first send (RL-233).
  const avoidsUid = isFirebaseConfigured && user?.emailVerified ? user.uid : null;
  const avoidsRef = useRef<{ uid: string; read: Promise<TasteProfile | null> } | null>(null);
  const [avoidsUnavailable, setAvoidsUnavailable] = useState(false);
  const startAvoids = useCallback(() => {
    if (!avoidsUid) return null;
    if (avoidsRef.current?.uid !== avoidsUid) avoidsRef.current = { uid: avoidsUid, read: readAvoids(avoidsUid) };
    return avoidsRef.current.read;
  }, [avoidsUid]);
  // RL-234: the "Anything the kitchen should avoid?" card shows when this same read found nothing stored and no ask yet.
  // A failed read hides it (do not nag), and so does a permission-denied one, because nothing could be saved.
  const [askFor, setAskFor] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void startAvoids()?.then((p) => {
      if (!cancelled && p && p.askedAt === null && p.avoids.length === 0) setAskFor(avoidsUid);
    });
    return () => {
      cancelled = true;
    };
  }, [startAvoids, avoidsUid]);
  /** Stores the ask (RL-234): `terms` as avoids, or none for Skip; both set askedAt. Rejects on failure so the card can say so. */
  const answerAsk = useCallback(
    async (terms: string[]) => {
      if (!avoidsUid) return;
      const saved = await saveTasteProfile(avoidsUid, (cur) => ({
        avoids: normaliseAvoids([...cur.avoids, ...terms]),
        askedAt: Date.now(),
      }));
      // The next session opened uses them; the card shows before the first recipe, so none is open with history to lose.
      avoidsRef.current = { uid: avoidsUid, read: Promise.resolve(saved) };
      if (!generatedOnceRef.current) chatRef.current = null;
      setAskFor(null);
    },
    [avoidsUid]
  );

  useEffect(() => () => clearTimeout(typingTimerRef.current), []);

  /** Clears the card and drops any pending or in-flight lookup. */
  const clearTyping = useCallback(() => {
    clearTimeout(typingTimerRef.current);
    typingSeqRef.current++;
    setTypingMatches(null);
  }, []);

  /**
   * Called on every composer change. After TYPING_PAUSE_MS without another call
   * it ranks local recipes and the cached cloud window. Never touches sending.
   */
  const previewDuplicates = useCallback(
    (text: string) => {
      clearTimeout(typingTimerRef.current);
      const seq = ++typingSeqRef.current;
      if (parentRecipe || generatedOnceRef.current || typingDismissedRef.current || !isFirebaseConfigured) return;
      if (text.trim().length < 3) {
        setTypingMatches(null);
        return;
      }
      typingTimerRef.current = setTimeout(async () => {
        const key = dedupKey(text);
        let result = typingCacheRef.current.get(key);
        if (result === undefined) {
          try {
            const found = key ? await searchSimilarRecipes(text, user?.uid, cloudWindow) : null;
            const matches = found?.matches.slice(0, 3) ?? [];
            const rootId = matches[0]?.rootId;
            const family = rootId
              ? familyCounts([...(await getRecipeTree(rootId)), ...(found?.cloud ?? [])], rootId)
              : null;
            result = matches.length ? { matches, family } : null;
            // A local-only result after a failed window read is shown but not kept.
            if (!found || found.cloud) typingCacheRef.current.set(key, result);
          } catch {
            // A local read failed: show nothing, as the send check would.
            if (seq === typingSeqRef.current) setTypingMatches(null);
            return;
          }
        }
        if (seq !== typingSeqRef.current) return;
        setTypingMatches(result && { ...result, query: text.trim() });
        if (result && !typingAnnouncedRef.current) {
          typingAnnouncedRef.current = true;
          const n = result.matches.length;
          setTypingAnnouncement(`${n} similar ${n === 1 ? 'recipe' : 'recipes'} already here`);
        }
      }, TYPING_PAUSE_MS);
    },
    [parentRecipe, user?.uid, cloudWindow]
  );

  /** "Hide matches": no more typing-pause cards in this chat. */
  const hideTypingMatches = useCallback(() => {
    typingDismissedRef.current = true;
    clearTyping();
  }, [clearTyping]);

  const generateRecipe = useCallback(
    async (text: string, images?: ImageAttachment[]) => {
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
        let chat = chatRef.current;
        if (!chat) {
          // Avoids live in the session's system prompt, so they are fixed when it opens:
          // a change mid-chat applies from the next chat, never mid-conversation.
          const read = startAvoids();
          const avoids = read ? ((await read)?.avoids ?? null) : [];
          setAvoidsUnavailable(avoids === null);
          chat = parentRecipe ? createVariationChat(parentRecipe, avoids ?? []) : createRecipeChat(avoids ?? []);
          // Allergy safety: a session opened without the avoids is used for this send only.
          // The next send reads again and opens a fresh session (losing this one's history).
          if (avoids === null) avoidsRef.current = null;
          else chatRef.current = chat;
        }

        const generated = await chat.sendMessage(text, images);
        chatImageCountRef.current += images?.length ?? 0;
        lastImagesRef.current = undefined;
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
        // The SDK may echo request parts, photos included, into its message.
        const safe = redactInlineData(err);
        console.error('Recipe generation failed', safe);
        reportError(safe, 'generate-recipe');
        setError(describeGenerationError(safe));
      } finally {
        setIsLoading(false);
        setLoadingPhase(null);
        generatingRef.current = false;
      }
    },
    [parentRecipe, startAvoids]
  );

  /**
   * Resolves to the reason when the photos would break a limit, in which case
   * nothing is sent and the caller keeps the typed text; otherwise to null.
   */
  const sendMessage = useCallback(
    async (
      typed: string,
      images?: ImageAttachment[]
    ): Promise<'message-limit' | 'chat-limit' | null> => {
      // The dedup check hits the network, so a second send while it is in flight
      // would race a second generation against the pending search.
      if (sendingRef.current) return null;
      const photos = images?.length ? images : undefined;
      if (photos && photos.length > MAX_IMAGES_PER_MESSAGE) return 'message-limit';
      if (photos && chatImageCountRef.current + photos.length > MAX_IMAGES_PER_CHAT) return 'chat-limit';
      sendingRef.current = true;
      // The composer empties on send, so the typing card and its announcement go with it.
      clearTyping();
      setTypingAnnouncement('');

      try {
        // Photos with no text still need a meaningful `prompt` once saved.
        const photosOnly = !!photos && !typed.trim();
        const text = photosOnly ? IMAGE_ONLY_PROMPT : typed;
        // Dedup searches typed text, so a photos-only send has nothing to match.
        const shouldCheckDuplicates = !generatedOnceRef.current && !photosOnly;
        const userMessage: ChatMessage = {
          role: 'user',
          content: text,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, userMessage]);
        lastImagesRef.current = photos;
        if (photos) {
          const urls = photos.map((p) => `data:${p.mimeType};base64,${p.base64}`);
          setAttachmentPreviews((prev) => ({ ...prev, [userMessage.timestamp]: urls }));
        }

        // Check for duplicates until a recipe has actually been generated.
        if (shouldCheckDuplicates) {
          // A fresh dedup decides afresh: a Create anyway whose generation failed must not tag this one.
          relatedFamilyRef.current = null;
          // Covers the cloud round trip: disables the input and shows the
          // typing indicator instead of leaving the chat looking idle.
          setIsLoading(true);
          setLoadingPhase('checking');
          try {
            const matches = parentRecipe
              ? await searchSimilarVariations(parentRecipe, text, user?.uid)
              : (await searchSimilarRecipes(text, user?.uid, cloudWindow)).matches;

            if (matches.length > 0) {
              setSimilarRecipes(matches);
              setPendingQuery(text);
              return null;
            }
          } catch {
            // Search failed — proceed to generation
          } finally {
            setIsLoading(false);
            setLoadingPhase(null);
          }
        }

        await generateRecipe(text, photos);
        return null;
      } finally {
        sendingRef.current = false;
      }
    },
    [parentRecipe, generateRecipe, user?.uid, clearTyping, cloudWindow]
  );

  /**
   * Re-run the last prompt after a failure. The prompt is still on screen in the
   * transcript, so making the user retype it was pure friction — and it goes
   * straight to generation rather than back through dedup, which already ran.
   */
  const retryGeneration = useCallback(async () => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    await generateRecipe(lastUser.content, lastImagesRef.current);
  }, [messages, generateRecipe]);

  const dismissSimilar = useCallback(async () => {
    if (pendingQuery) {
      if (!parentRecipe) relatedFamilyRef.current = similarRecipes[0]?.rootId ?? null;
      await generateRecipe(pendingQuery, lastImagesRef.current);
    }
  }, [pendingQuery, generateRecipe, parentRecipe, similarRecipes]);

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
    // Each build mints a fresh UUID, so a double-tap would save two distinct
    // recipes. The ref guards the gap before the isSaving re-render lands.
    if (savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);

    // A saved branch opens What changed against its parent (RL-181). The recipe
    // page goes in history first, without state, so Back from the diff lands on
    // the new branch; both navigates run in one tick, so it is never painted.
    const openSaved = (id: string, saved: 'cloud' | 'local') => {
      if (parentRecipe) navigate(`/recipe/${id}`);
      navigate(parentRecipe ? `/recipe/${id}/changes` : `/recipe/${id}`, { state: { saved, note: null } });
    };

    try {
      const firstUserMessage = messages.find((m) => m.role === 'user');
      const prompt = target?.prompt ?? firstUserMessage?.content ?? '';

      const createdBy = {
        uid: user?.uid ?? 'local',
        displayName: user?.displayName ?? null,
      };

      const args = [
        toSave,
        prompt,
        messages,
        parentRecipe?.id ?? null,
        parentRecipe?.rootId ?? null,
        parentRecipe?.depth ?? -1,
        createdBy,
      ] as const;

      if (!isFirebaseConfigured) {
        // Local-only mode cannot generate, so this is not reached in practice;
        // kept as the plain Dexie save it always was.
        const recipe = await createRecipe(...args);
        trackRecipeCreated(recipe.id, !!parentRecipe);
        openSaved(recipe.id, 'local');
        return;
      }

      // Only an original records a related family; a variation clears it.
      const relatedFamilyId = parentRecipe ? null : relatedFamilyRef.current;
      if (parentRecipe) relatedFamilyRef.current = null;
      const recipe =
        builtRef.current?.source === toSave
          ? builtRef.current.recipe
          : { ...buildRecipe(...args), ...(relatedFamilyId ? { relatedFamilyId } : {}) };
      builtRef.current = { source: toSave, recipe };

      const failure = await publishThenCache(recipe, () => {
        // Only the parent's author is told, and never yourself (so Keep as branch
        // stays silent). Fire-and-forget: it cannot fail or delay the save.
        if (parentRecipe && user && parentRecipe.createdBy.uid !== 'local' && parentRecipe.createdBy.uid !== user.uid) {
          notifyBranched({ branch: recipe, parent: parentRecipe, from: createdBy });
        }
        // After the publish only: the rules need the branch to exist. Fire-and-forget.
        if (parentRecipe && fromCookId && !cookCreditedRef.current) {
          cookCreditedRef.current = true;
          setCookBranch(fromCookId, recipe.id).catch((err: unknown) => reportError(err, 'cook-branch'));
        }
      });
      if (failure) {
        savingRef.current = false;
        setIsSaving(false);
        setError(failure);
        return;
      }

      trackRecipeCreated(recipe.id, !!parentRecipe);
      openSaved(recipe.id, 'cloud');
      // Deliberately stays locked after a successful save: the page is
      // navigating away and re-enabling would briefly re-arm the button.
    } catch (err) {
      savingRef.current = false;
      setIsSaving(false);
      console.error('Recipe save failed', err);
      reportError(err, 'save-recipe');
      setError({ message: "Couldn't save the recipe. Please try again." });
    }
  }, [latestRecipe, messages, parentRecipe, fromCookId, navigate, user]);

  return {
    messages,
    isLoading,
    isSaving,
    error,
    // Blocks the composer up front instead of letting the user write a prompt and
    // only then discover generation is impossible. Users no longer supply a key —
    // AI Logic holds it — so the only remaining precondition is a Firebase project.
    generationUnavailable: !isFirebaseConfigured,
    /** The newest session opened without the user's avoids because reading them failed (RL-233). */
    avoidsUnavailable,
    /** True when the first-time avoids card should show (RL-234). */
    askAvoids: !!avoidsUid && askFor === avoidsUid,
    answerAsk,
    latestRecipe,
    similarRecipes,
    loadingPhase,
    /** The prompt that produced the current matches, so the UI can carry it forward. */
    pendingQuery,
    attachmentPreviews,
    /** Photos in turns that generated: what counts towards the per-chat limit. */
    sentImageCount: chatImageCountRef.current,
    sendMessage,
    retryGeneration,
    dismissSimilar,
    saveRecipe,
    /** The 7a card's matches after a typing pause; null when there is nothing to show. */
    typingMatches,
    /** Polite text for the card's first appearance in this chat, cleared on send. */
    typingAnnouncement,
    previewDuplicates,
    hideTypingMatches,
  };
}
