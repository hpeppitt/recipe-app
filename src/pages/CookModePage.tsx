import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useRecipe } from '../hooks/useRecipe';
import { useRecipeCooks } from '../hooks/useCooks';
import { useCookedEntry } from '../hooks/useCookedEntry';
import { useWakeLock } from '../hooks/useWakeLock';
import { useUnitSystem } from '../hooks/useUnitSystem';
import { convertTemperatures } from '../lib/units';
import { scaleRecipe } from '../lib/scale';
import { IngredientList } from '../components/recipe/IngredientList';
import { PageFallback } from '../components/ui/PageFallback';
import { ChevronDown, X } from '../components/ui/icons';

/** Navigation state the recipe page passes: the servings shown there (RL-203). */
export interface CookModeState {
  servings: number;
}

const SWIPE_PX = 50;
/** Swipes starting this close to a screen edge belong to the system's back gesture. */
const EDGE_PX = 24;
const bigButton =
  'inline-flex h-14 flex-1 items-center justify-center rounded-full font-heading text-[16px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:opacity-45';

/**
 * Cook mode (RL-203): one method step at a time in large type, with the screen kept on.
 * Outside the shell so nothing competes with the step; Back and Close return to the recipe.
 */
export function CookModePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { recipe, source, isLoading } = useRecipe(id);
  const cooks = useRecipeCooks(recipe?.id);
  const recipePath = `/recipe/${id ?? ''}`;
  // Replace, not Back: Grow it into a branch pushes /vary straight after a save.
  const cooked = useCookedEntry(recipe ?? undefined, source === 'cloud', cooks.log, () =>
    navigate(recipePath, { replace: true, state: { cooked: true } })
  );
  const stateServings = (location.state as Partial<CookModeState> | null)?.servings;
  // Arrived from the recipe page, so Back is the way out; a direct visit has nothing behind it.
  const leave = () => (stateServings !== undefined ? navigate(-1) : navigate(recipePath, { replace: true }));
  const [step, setStep] = useState(0);
  const [showIngredients, setShowIngredients] = useState(false);
  const awake = useWakeLock(!!recipe);
  const { unitSystem } = useUnitSystem();
  const touch = useRef<{ x: number; y: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stepRegion = useRef<HTMLDivElement>(null);
  const focused = useRef(false);

  const instructions = useMemo(() => (Array.isArray(recipe?.instructions) ? recipe.instructions : []), [recipe]);
  const ingredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
  const servings = typeof stateServings === 'number' && stateServings > 0 ? stateServings : recipe?.servings ?? 0;
  const scaled = useMemo(
    () => (recipe ? scaleRecipe({ ...recipe, ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [] }, servings) : null),
    [recipe, servings]
  );

  const last = instructions.length - 1;
  const current = Math.min(step, Math.max(last, 0));
  const back = () => current > 0 && setStep(current - 1);
  // A new step starts at its top, and focus lands on the step once, when the page opens.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0;
  }, [current]);
  useEffect(() => {
    if (focused.current || !stepRegion.current) return;
    focused.current = true;
    stepRegion.current.focus();
  });
  const next = () => {
    if (current < last) setStep(current + 1);
    // Unpublished or local-only recipes cannot take a cook, so Done just returns.
    else if (cooked.canCook) cooked.open();
    else leave();
  };
  const move = (by: -1 | 1) => setStep((s) => Math.min(Math.max(Math.min(s, last) + by, 0), Math.max(last, 0)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Leave arrows alone inside fields and sheets (the cook sheet's vote uses them).
      if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey || e.shiftKey || (e.target as Element | null)?.closest?.('input, textarea, select, dialog, [role="dialog"]')) return;
      if (e.key === 'ArrowLeft') move(-1);
      else if (e.key === 'ArrowRight') move(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // move only reads `last`, which comes from the recipe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last]);

  if (isLoading) return <PageFallback />;

  const closeButton = (
    <button
      type="button"
      onClick={leave}
      aria-label="Close cook mode"
      className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-text-primary hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-primary-500"
    >
      <X className="h-5 w-5" />
    </button>
  );

  if (!recipe || instructions.length === 0) {
    return (
      <main className="min-h-dvh bg-surface px-4 pt-[calc(8px+env(safe-area-inset-top))]">
        {closeButton}
        <p className="p-6 text-center text-text-secondary">
          {recipe ? 'This recipe has no steps to show.' : 'Recipe not found.'}
        </p>
      </main>
    );
  }

  const inst = instructions[current];
  return (
    <main className="flex h-dvh flex-col bg-surface">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-4 pt-[calc(8px+env(safe-area-inset-top))]">
          {closeButton}
          <p className="text-[13px] text-neutral-700">
            Step {current + 1} of {instructions.length}
          </p>
        </div>
        <div aria-hidden="true" className="mx-4 mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-200">
          <div className="h-full rounded-full bg-accent" style={{ width: `${((current + 1) / instructions.length) * 100}%` }} />
        </div>

        <div
          ref={scroller}
          className="flex-1 overflow-y-auto"
          onTouchStart={(e) => {
            const t = e.touches[0];
            touch.current = t.clientX < EDGE_PX || t.clientX > window.innerWidth - EDGE_PX ? null : { x: t.clientX, y: t.clientY };
          }}
          onTouchEnd={(e) => {
            const start = touch.current;
            touch.current = null;
            if (!start) return;
            const t = e.changedTouches[0];
            const dx = t.clientX - start.x;
            if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(t.clientY - start.y)) return;
            move(dx < 0 ? 1 : -1);
          }}
        >
          <div ref={stepRegion} tabIndex={-1} aria-live="polite" className="p-6 outline-none">
            <p className="sr-only">
              Step {current + 1} of {instructions.length}
            </p>
            {inst.group && <p className="mb-2 text-[13px] font-semibold text-text-secondary">{inst.group}</p>}
            <p className="break-words text-[24px] leading-[1.4] text-text-primary">
              {convertTemperatures(inst.text ?? '', unitSystem)}
            </p>
          </div>

          {ingredients.length > 0 && scaled && (
            <div className="px-6 pb-6">
              <button
                type="button"
                onClick={() => setShowIngredients((v) => !v)}
                aria-expanded={showIngredients}
                aria-controls="cook-ingredients"
                className="flex min-h-11 items-center gap-2 font-heading text-[18px] text-text-primary"
              >
                Ingredients
                <ChevronDown className={`h-4 w-4 ${showIngredients ? 'rotate-180' : ''}`} />
              </button>
              {/* Kept mounted so ticks survive closing it; the list's own heading is for screen readers only. */}
              <div id="cook-ingredients" hidden={!showIngredients} className="[&_h3]:sr-only [&>div]:mt-0">
                <IngredientList
                  ingredients={scaled.ingredients}
                  checkable
                  scaled={servings !== recipe.servings && recipe.servings > 0}
                  headingAside={<span className="text-[13px] text-text-secondary">For {scaled.servings}</span>}
                />
              </div>
            </div>
          )}
        </div>

        <div className="px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))]">
          {!awake && <p className="mb-2 text-center text-[12px] text-text-secondary">Your screen may still dim.</p>}
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={back}
              // Not disabled, so focus is not dropped when the first step comes back.
              aria-disabled={current === 0}
              className={`${bigButton} aria-disabled:opacity-45 border border-border text-text-primary hover:bg-surface-secondary`}
            >
              Back
            </button>
            <button type="button" onClick={next} className={`${bigButton} bg-primary-600 text-on-accent hover:bg-primary-700`}>
              {current < last ? 'Next step' : 'Done'}
            </button>
          </div>
        </div>
      </div>
      {cooked.sheets}
    </main>
  );
}
