import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { SignUpDialog } from '../components/auth/SignUpDialog';
import { CookedSheet, type LogCook } from '../components/recipe/CookedSheet';
import { isFirebaseConfigured } from '../services/firebase';
import { getPublishedRecipe } from '../services/firestore';
import type { Recipe } from '../types/recipe';

const BODY = 'Your cook shows on the recipe with your name, so you need an account with an email.';
/** Long enough for the last tick to show before the sheet covers it. */
const OFFER_DELAY_MS = 400;

/**
 * The entry points to the "I made this" sheet (RL-198): the footer Cooked button (`open`) and
 * ticking every method step (`onAllTicked`, once per recipe visit, verified users only).
 * Anyone else who taps Cooked gets the sign-in sheet. Render `sheets` once, always mounted.
 * `canCook` is false in local-only mode and until the recipe is known to be published (a cook
 * needs the cloud copy). Pass `published` when the caller already read it from the cloud.
 * `log` is the page's `useRecipeCooks().log`; it refreshes the page's Made-by row.
 * `onSaved` runs once a cook is saved (cook mode returns to the recipe, RL-203).
 */
export function useCookedEntry(
  recipe: Pick<Recipe, 'id'> | undefined,
  published = false,
  log: LogCook,
  onSaved?: (cookId: string) => void
): { canCook: boolean; open: () => void; onAllTicked: (allDone: boolean) => void; sheets: ReactNode } {
  const { user, isConfigured } = useAuth();
  const [sheet, setSheet] = useState<'cook' | 'auth' | null>(null);
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const offeredFor = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const id = recipe?.id;
  useEffect(() => {
    if (!id || published || !isConfigured || !isFirebaseConfigured) return;
    let cancelled = false;
    getPublishedRecipe(id).then(
      (doc) => !cancelled && setPublishedId(doc ? id : null),
      () => !cancelled && setPublishedId(null)
    );
    return () => {
      cancelled = true;
    };
  }, [id, published, isConfigured]);
  const verified = !!user?.emailVerified;
  const enabled = isConfigured && isFirebaseConfigured && !!id && (published || publishedId === id);
  const open = () => setSheet(verified ? 'cook' : 'auth');
  // A pending offer dies with an untick, a recipe change or unmount.
  useEffect(() => () => clearTimeout(timer.current), [id]);
  const onAllTicked = (allDone: boolean) => {
    clearTimeout(timer.current);
    if (!allDone || !enabled || !verified || offeredFor.current === id) return;
    timer.current = setTimeout(() => {
      offeredFor.current = id ?? null;
      setSheet('cook');
    }, OFFER_DELAY_MS);
  };
  const sheets = recipe && (
    <>
      <CookedSheet open={sheet === 'cook'} recipe={recipe} onClose={() => setSheet(null)} log={log} onSaved={onSaved} />
      <SignUpDialog open={sheet === 'auth'} action={{ kind: 'cook' }} body={BODY} onClose={() => setSheet(null)} />
    </>
  );
  return { canCook: enabled, open, onAllTicked, sheets };
}
