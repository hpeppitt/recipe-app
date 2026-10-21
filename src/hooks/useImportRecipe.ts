import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { importRecipeFromPhotos, importRecipeFromUrl } from '../services/gemini';
import { buildRecipe, getRecipeTree } from '../db/recipes';
import { readPublishedWindow } from '../services/publishedWindow';
import { notifyBranched } from '../services/firestore';
import { publishThenCache } from '../services/recipeSave';
import { trackRecipeCreated } from '../services/analytics';
import { reportError } from '../services/telemetry';
import { useAuth } from '../contexts/AuthContext';
import { searchSimilarRecipes, type SimilarRecipe } from './useRecipeChat';
import { familyCounts, matchKind } from '../lib/search';
import { IMPORT_ERROR_MESSAGE, PHOTO_SOURCE, importHost, normalizeImportUrl, type ImportDraft, type ImportDraftRecipe, type ImportedIngredient } from '../lib/linkImport';
import type { ImageAttachment } from '../lib/imageAttachments';
import { withTimeout } from '../lib/utils';
import type { Recipe } from '../types/recipe';

/** What the review screen lets the user change before saving (RL-252). */
export type ImportEdits = { title: string; ingredients: ImportedIngredient[] };
/** Where a save goes: the recipe, or the editor or the branch composer (RL-252). */
export type ImportDest = 'recipe' | 'edit' | 'vary';

/** The dedup check is a nicety: past this the preview shows without the family notice. */
const DEDUP_TIMEOUT_MS = 4000;

/** The family of a `same` match, described by its original. */
export type ImportFamily = {
  rootId: string;
  title: string;
  emoji: string;
  /** The original's creator, told about a branch saved into the family; 'local' when unknown. */
  rootUid: string;
  /** Who made the original, for a UserPill. Null for a device-only original. */
  author: SimilarRecipe['author'];
  versions: number;
};

export type ImportPreview = {
  recipe: ImportDraftRecipe;
  /** The page read, or PHOTO_SOURCE for a photo import (RL-251). */
  url: string;
  /** The site, or "Photo". */
  host: string;
  uncertainCount: number;
  family: ImportFamily | null;
};

/**
 * The family of the first `same` match, or null. Offered only when the original itself is
 * on the device or in the published window, so the notice and the branch name a real root.
 */
async function findFamily(title: string, uid: string | undefined): Promise<ImportFamily | null> {
  const { matches, cloud } = await searchSimilarRecipes(title, uid, readPublishedWindow);
  const match = matches.find((m) => m.rootId && matchKind(title, m) === 'same');
  if (!match?.rootId) return null;
  const rootId = match.rootId;
  const rows = [...(await getRecipeTree(rootId)), ...(cloud ?? [])];
  const root = rows.find((r) => r.id === rootId);
  if (!root) return null;
  const rootUid = root.createdBy?.uid ?? 'local';
  return {
    rootId,
    title: root.title,
    emoji: root.emoji,
    rootUid,
    author: rootUid !== 'local' ? { uid: rootUid, name: root.createdBy?.displayName ?? null } : null,
    versions: Math.max(1, familyCounts(rows, rootId).versions),
  };
}

/**
 * "Add from a link" (RL-186) and "Snap a page" (RL-251): read a page or photos into a preview, check the library for the
 * same dish, and save it as a new original or as a branch of that family's original.
 * Saving uses the chat's cloud-first sequence, so a failed publish writes nothing.
 */
export function useImportRecipe() {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const readingRef = useRef(false);
  const savingRef = useRef(false);
  // The record last sent to the cloud, per choice. A retry reuses its id, so a publish
  // that timed out but landed is merged instead of becoming a second recipe (RL-082).
  const builtRef = useRef<{ preview: ImportPreview; asBranch: boolean; recipe: Recipe } | null>(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  /** Reads a draft into a preview; the photo and link reads differ only in the draft they fetch. */
  const readDraft = useCallback(
    async (fetchDraft: () => Promise<ImportDraft>, url: string, host: string) => {
      readingRef.current = true;
      setIsReading(true);
      setReadError(null);
      setPreview(null);
      try {
        const draft = await fetchDraft();
        if (!draft.recipe) {
          setReadError(draft.error ?? IMPORT_ERROR_MESSAGE);
          return;
        }
        const title = draft.recipe.title;
        const family = await withTimeout(
          findFamily(title, user?.uid).catch(() => null),
          DEDUP_TIMEOUT_MS,
          null
        );
        setPreview({ recipe: draft.recipe, url, host, uncertainCount: draft.uncertainCount, family });
      } finally {
        readingRef.current = false;
        setIsReading(false);
      }
    },
    [user?.uid]
  );

  const read = useCallback(
    async (input: string) => {
      if (readingRef.current || savingRef.current) return;
      setSaveError(null);
      const url = normalizeImportUrl(input);
      if (!url) {
        setReadError(IMPORT_ERROR_MESSAGE);
        return;
      }
      await readDraft(() => importRecipeFromUrl(url), url, importHost(url));
    },
    [readDraft]
  );

  /** Snap a page (RL-251): the photos go to Gemini in this one request and nowhere else. */
  const readPhotos = useCallback(
    async (photos: ImageAttachment[]) => {
      if (readingRef.current || savingRef.current || !photos.length) return;
      setSaveError(null);
      await readDraft(() => importRecipeFromPhotos(photos), PHOTO_SOURCE, 'Photo');
    },
    [readDraft]
  );

  /** Saves the preview, as a branch of the family's original when `asBranch`. */
  const save = useCallback(
    async (asBranch: boolean, edits?: ImportEdits, dest: ImportDest = 'recipe') => {
      if (!preview || !user || savingRef.current) return;
      const rootId = asBranch ? preview.family?.rootId : null;
      if (asBranch && !rootId) return;
      savingRef.current = true;
      setIsSaving(true);
      setSaveError(null);
      try {
        const createdBy = { uid: user.uid, displayName: user.displayName ?? null };
        // `uncertain` only drives the review; the null amount is what stays editable.
        const { importedFrom: _from, ingredients, ...rest } = preview.recipe;
        const fromPhoto = preview.url === PHOTO_SOURCE;
        const generated = {
          ...rest,
          title: edits?.title.trim() || rest.title,
          ingredients: (edits?.ingredients ?? ingredients).map(({ uncertain: _u, ...i }) => i),
        };
        let recipe: Recipe = {
          // A branch hangs off the family's original: parentId and rootId both the root, depth 1.
          ...buildRecipe(
            generated,
            fromPhoto ? 'Imported from a photo' : `Imported from ${preview.host}`,
            [],
            rootId ?? null,
            rootId ?? null,
            rootId ? 0 : -1,
            createdBy
          ),
          // PHOTO_SOURCE for a photo import (RL-263), else the page read.
          importedFrom: preview.url,
          importedVia: createdBy,
        };
        // A retry reuses the earlier id (edits since then still apply), so a publish that landed is merged.
        const built = builtRef.current;
        if (built && built.preview === preview && built.asBranch === asBranch) {
          recipe = { ...recipe, id: built.recipe.id, rootId: rootId ?? built.recipe.id, createdAt: built.recipe.createdAt };
        }
        builtRef.current = { preview, asBranch, recipe };

        const family = asBranch ? preview.family : null;
        const failure = await publishThenCache(recipe, () => {
          // As the chat's branch save: the original's author is told, never yourself.
          if (family && family.rootUid !== 'local' && family.rootUid !== user.uid) {
            notifyBranched({
              branch: recipe,
              parent: { title: family.title, emoji: family.emoji, createdBy: { uid: family.rootUid } },
              from: createdBy,
            });
          }
        });
        if (failure) {
          savingRef.current = false;
          setIsSaving(false);
          setSaveError(failure.message);
          return;
        }
        trackRecipeCreated(recipe.id, asBranch);
        if (dest === 'recipe') navigate(`/recipe/${recipe.id}`, { state: { saved: 'cloud', note: null } });
        else navigate(`/recipe/${recipe.id}/${dest}`);
        // Stays locked after success, as the chat does: the page is navigating away.
      } catch (err) {
        savingRef.current = false;
        setIsSaving(false);
        console.error('Recipe save failed', err);
        reportError(err, 'save-recipe');
        setSaveError("Couldn't save the recipe. Please try again.");
      }
    },
    [preview, user, navigate]
  );

  /** Drops the preview and errors, when the link is edited after a read. */
  const reset = useCallback(() => {
    if (readingRef.current || savingRef.current) return;
    setPreview(null);
    setReadError(null);
    setSaveError(null);
  }, []);

  return { preview, isReading, isSaving, readError, saveError, read, readPhotos, save, reset };
}
