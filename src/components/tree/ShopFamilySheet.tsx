import { useEffect, useMemo, useRef, useState } from 'react';
import type { Recipe } from '../../types/recipe';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Minus, Plus, ShoppingBasket } from '../ui/icons';
import { diffRecipes, summariseChanges } from '../../lib/recipeDiff';
import { addRecipe, splitByPantry } from '../../lib/shopping';
import { pluralize } from '../../lib/utils';
import { getKitchenOnce, getOwnCooksInFamily } from '../../services/firestore';
import type { PantryItem } from '../../lib/kitchen';
import { resolveKitchenId } from '../../hooks/useKitchen';

/** The tree's readable limit; the current version always stays in. */
export const SHOP_FAMILY_MAX = 30;
const MAX_SERVINGS = 99;

interface ShopFamilySheetProps {
  open: boolean;
  onClose: () => void;
  recipes: Recipe[];
  currentId: string;
  uid: string;
  adding: boolean;
  /** A failed add; the sheet stays open and shows it. */
  error?: string | null;
  onAdd: (recipe: Recipe, servings: number) => void;
}

const STEP =
  'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-surface text-text-primary disabled:pointer-events-none disabled:opacity-40';

/** The 26b "Which <family> are you shopping for?" sheet (RL-219). Reads the pantry and the user's cooks once, on open. */
export function ShopFamilySheet({ open, onClose, ...rest }: ShopFamilySheetProps) {
  return (
    <Sheet open={open} onClose={onClose} labelledBy="shop-family-title">
      {open && <Body {...rest} />}
    </Sheet>
  );
}

function Body({ recipes, currentId, uid, adding, error, onAdd }: Omit<ShopFamilySheetProps, 'open' | 'onClose'>) {
  const [pantry, setPantry] = useState<PantryItem[] | null>(null);
  const [made, setMade] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState(currentId);
  const [override, setOverride] = useState<number | null>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  // showModal() (after this effect) would focus the first row; the selected one is the start point.
  useEffect(() => {
    const t = setTimeout(() => groupRef.current?.querySelector<HTMLInputElement>('input:checked')?.focus(), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    let live = true;
    // A failed read only loses the pantry count and the "you made this" tag; adding still works.
    // The household's pantry, not the own unused one after a join (RL-238).
    resolveKitchenId(uid).then(getKitchenOnce).then((k) => live && setPantry(k?.pantry ?? []), () => {});
    const root = recipes.find((r) => r.id === currentId)?.rootId;
    if (root) getOwnCooksInFamily(uid, root).then((c) => live && setMade(new Set(c.map((x) => x.recipeId))), () => {});
    return () => {
      live = false;
    };
    // Once per open: the body mounts on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(() => {
    const original = recipes.find((r) => r.parentId === null) ?? recipes[0];
    const sorted = [...recipes].sort((a, b) => a.createdAt - b.createdAt);
    // Over the limit: the original and the current version stay, then the oldest others fill up.
    const must = new Set([original.id, currentId]);
    const kept =
      sorted.length > SHOP_FAMILY_MAX
        ? [...sorted.filter((r) => must.has(r.id)), ...sorted.filter((r) => !must.has(r.id))]
            .slice(0, SHOP_FAMILY_MAX)
            .sort((a, b) => a.createdAt - b.createdAt)
        : sorted;
    return kept.map((r) => ({
      recipe: r,
      isOriginal: r.id === original.id,
      change: r.id === original.id ? '' : summariseChanges(diffRecipes(original, r), 2).join(', '),
    }));
  }, [recipes, currentId]);

  const chosen = rows.find((r) => r.recipe.id === picked)?.recipe ?? rows[0].recipe;
  const servings = override ?? chosen.servings;
  // Unknown until the pantry read lands, so no number is promised before then.
  const count = pantry ? splitByPantry(addRecipe([], chosen, servings), pantry).toBuy.length : null;
  const family = (recipes.find((r) => r.parentId === null) ?? recipes[0]).title.toLowerCase();

  return (
    <div className="flex flex-col gap-3.5">
      <h2 id="shop-family-title" className="font-heading text-[24px] leading-tight text-text-primary">
        {`Which ${family} are you shopping for?`}
      </h2>
      <div ref={groupRef} role="radiogroup" aria-labelledby="shop-family-title" className="flex max-h-[50dvh] flex-col gap-2 overflow-y-auto">
        {rows.map(({ recipe: r, isOriginal, change }) => {
          const on = r.id === chosen.id;
          const author = r.createdBy?.displayName ?? 'Someone';
          const sub = `${isOriginal ? `The original · ${author}` : author}${made.has(r.id) ? ' · you made this' : ''}`;
          return (
            <label
              key={r.id}
              className={`flex cursor-pointer items-center gap-3 rounded-[24px] px-3.5 py-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${on ? 'bg-accent-100 ring-2 ring-inset ring-accent' : 'bg-surface-secondary'}`}
            >
              <input
                type="radio"
                name="shop-family-version"
                className="sr-only"
                checked={on}
                onChange={() => {
                  setPicked(r.id);
                  setOverride(null);
                }}
              />
              <span
                aria-hidden
                className={`flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full ring-2 ring-inset ${on ? 'ring-accent' : 'ring-neutral-700'}`}
              >
                {on && <span className="h-[7px] w-[7px] rounded-full bg-accent" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 break-words text-[15px] font-bold text-text-primary">{r.title}</span>
                <span className="block break-words text-xs text-neutral-700">{sub}</span>
                {change && <span className="block break-words text-xs text-neutral-700 sm:hidden">{change}</span>}
              </span>
              {change && <span className="hidden max-w-[40%] break-words text-right text-xs text-neutral-700 sm:block">{change}</span>}
            </label>
          );
        })}
      </div>
      <div role="group" aria-labelledby="shop-makes" className="flex items-center gap-2 rounded-full bg-surface-secondary py-2 pl-[18px] pr-2">
        <span id="shop-makes" className="text-sm text-text-primary">Makes</span>
        <span className="flex-1" />
        <button type="button" className={STEP} aria-label="One fewer serving" disabled={servings <= 1} onClick={() => setOverride(servings - 1)}>
          <Minus className="h-4 w-4" />
        </button>
        <span aria-live="polite" className="min-w-24 text-center font-heading text-[18px] tabular-nums text-text-primary">
          {servings} {pluralize(servings, 'serving')}
        </span>
        <button type="button" className={STEP} aria-label="One more serving" disabled={servings >= MAX_SERVINGS} onClick={() => setOverride(servings + 1)}>
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {count === 0 && <p className="text-sm text-text-secondary">Everything is already in your pantry</p>}
      {error && (
        <p role="alert" className="text-sm font-medium text-danger-700">
          {error}
        </p>
      )}
      <Button fullWidth className="h-[52px]" disabled={adding || count === 0} onClick={() => onAdd(chosen, servings)}>
        <ShoppingBasket className="mr-2 size-5" />
        {count === null ? 'Add to the list' : `Add ${count} ${count === 1 ? 'thing' : 'things'} to the list`}
      </Button>
    </div>
  );
}
