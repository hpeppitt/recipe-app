import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useRecipe } from '../hooks/useRecipe';
import { diffRecipes, type IngredientChange, type StepChange, type TextSpan } from '../lib/recipeDiff';
import { formatAmount } from '../lib/amount';
import { formatUnit } from '../lib/units';
import { cn, formatTime } from '../lib/utils';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { Skeleton } from '../components/ui/Skeleton';
import { SavedToast } from '../components/recipe/SavedToast';
import type { Ingredient, Recipe } from '../types/recipe';
import { ChevronLeft, CloudOff, RotateCw } from '../components/ui/icons';

const MODES = [
  { value: 'changes', label: 'Changes only' },
  { value: 'side', label: 'Side by side' },
] as const;
type Mode = (typeof MODES)[number]['value'];

type Kind = 'changed' | 'added' | 'removed';

// Text on these tints is text-primary or text-secondary (8.1:1 or better). The
// symbol is real text and the sr-only prefix names the change, so colour is never
// the only signal.
const KINDS: Record<Kind, { symbol: string; label: string; tint: string }> = {
  changed: { symbol: '~', label: 'Changed:', tint: 'bg-primary-50' },
  added: { symbol: '+', label: 'Added:', tint: 'bg-accent-2-100' },
  removed: { symbol: '-', label: 'Removed:', tint: 'bg-neutral-200' },
};

// The edge on the secondary button has to survive the plain-join cn, hence the important modifier.
const SECONDARY_EDGE = 'border-border-strong!';

function qty(i: Ingredient): string {
  if (i.amount == null) return '';
  const unit = formatUnit(i.unit, i.amount);
  return `${formatAmount(i.amount)}${unit ? ` ${unit}` : ''}`;
}

const full = (i: Ingredient) => [qty(i), i.name].filter(Boolean).join(' ');

function Struck({ children }: { children: ReactNode }) {
  return (
    <del className="line-through text-text-tertiary">
      <span className="sr-only">was </span>
      {children}
    </del>
  );
}

/** One change cell. With no kind it is an unchanged line with no tint or symbol. */
function Cell({ kind, children }: { kind?: Kind; children: ReactNode }) {
  const k = kind ? KINDS[kind] : null;
  return (
    <div
      className={cn(
        'flex min-w-0 gap-2 rounded-xl px-3 py-2 text-sm text-text-primary break-words',
        k?.tint
      )}
    >
      {k && (
        <span aria-hidden="true" className="w-3 shrink-0 font-semibold no-underline">
          {k.symbol}
        </span>
      )}
      <span className="min-w-0 flex-1 break-words">
        {k && <span className="sr-only">{k.label} </span>}
        {/* Strike the text only, never the symbol or the screen-reader prefix. */}
        <span className={cn(kind === 'removed' && 'line-through text-text-secondary')}>{children}</span>
      </span>
    </div>
  );
}

function changedIngredient(before: Ingredient, after: Ingredient): ReactNode {
  if (before.name === after.name) {
    return (
      <>
        <Struck>{qty(before) || 'some'}</Struck> {qty(after) || 'some'} {after.name}
      </>
    );
  }
  return (
    <>
      <Struck>{full(before)}</Struck> {full(after)}
    </>
  );
}

function StepText({ spans, side }: { spans: TextSpan[]; side: 'both' | 'before' | 'after' }) {
  return (
    <>
      {spans
        .filter((s) => side === 'both' || s.type === 'same' || s.type === (side === 'before' ? 'delete' : 'insert'))
        .map((s, i) => (
          <span key={i}>
            {i > 0 && ' '}
            {s.type === 'delete' ? (
              <del className="line-through text-text-tertiary">
                <span className="sr-only">removed </span>
                {s.text}
              </del>
            ) : s.type === 'insert' ? (
              <ins className="rounded-sm bg-accent-2-200 px-0.5 font-semibold no-underline">
                <span className="sr-only">added </span>
                {s.text}
              </ins>
            ) : (
              s.text
            )}
          </span>
        ))}
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-heading text-h3 text-text-primary">{title}</h2>
      {children}
    </section>
  );
}

function IngredientsList({ rows, mode }: { rows: IngredientChange[]; mode: Mode }) {
  if (mode === 'changes') {
    return (
      <ul className="space-y-1.5">
        {rows.map((c, i) =>
          c.type === 'unchanged' ? null : (
            <li key={i}>
              <Cell kind={c.type}>{c.type === 'changed' ? changedIngredient(c.before, c.after) : full(c.ingredient)}</Cell>
            </li>
          )
        )}
      </ul>
    );
  }
  return (
    <ul className="space-y-1.5">
      {rows.map((c, i) => (
        <li key={i} className="grid grid-cols-2 gap-2">
          {c.type === 'unchanged' ? (
            <>
              <Cell>{full(c.ingredient)}</Cell>
              <Cell>{full(c.ingredient)}</Cell>
            </>
          ) : c.type === 'changed' ? (
            <>
              <Cell kind="changed">{full(c.before)}</Cell>
              <Cell kind="changed">{full(c.after)}</Cell>
            </>
          ) : c.type === 'added' ? (
            <>
              <div aria-hidden="true" />
              <Cell kind="added">{full(c.ingredient)}</Cell>
            </>
          ) : (
            <>
              <Cell kind="removed">{full(c.ingredient)}</Cell>
              <div aria-hidden="true" />
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

function MethodList({ rows, mode }: { rows: StepChange[]; mode: Mode }) {
  if (mode === 'changes') {
    return (
      <ul className="space-y-1.5">
        {rows.map((s, i) =>
          s.type === 'unchanged' ? null : (
            <li key={i}>
              <Cell kind={s.type}>
                {s.type === 'changed' ? <StepText spans={s.spans} side="both" /> : s.step.text}
              </Cell>
            </li>
          )
        )}
      </ul>
    );
  }
  return (
    <ul className="space-y-1.5">
      {rows.map((s, i) => (
        <li key={i} className="grid grid-cols-2 gap-2">
          {s.type === 'unchanged' ? (
            <>
              <Cell>{s.step.text}</Cell>
              <Cell>{s.step.text}</Cell>
            </>
          ) : s.type === 'changed' ? (
            <>
              <Cell kind="changed">
                <StepText spans={s.spans} side="before" />
              </Cell>
              <Cell kind="changed">
                <StepText spans={s.spans} side="after" />
              </Cell>
            </>
          ) : s.type === 'added' ? (
            <>
              <div aria-hidden="true" />
              <Cell kind="added">{s.step.text}</Cell>
            </>
          ) : (
            <>
              <Cell kind="removed">{s.step.text}</Cell>
              <div aria-hidden="true" />
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

function RecipePill({ recipe, label, accent }: { recipe: Recipe; label: string; accent?: boolean }) {
  return (
    <Link
      to={`/recipe/${recipe.id}`}
      aria-label={`${label}: ${recipe.title}`}
      className={cn(
        'flex min-h-11 min-w-0 flex-1 items-center gap-1.5 rounded-2xl px-3 py-1.5 text-sm font-medium break-words',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500',
        accent ? 'bg-primary-50 text-primary-700' : 'bg-neutral-100 text-neutral-800'
      )}
    >
      <span aria-hidden="true">{recipe.emoji}</span>
      <span className="min-w-0 break-words">{recipe.title}</span>
    </Link>
  );
}

export function RecipeChangesPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<Mode>('changes');
  // Set by the save flow (RL-181); same toast and timing as the recipe page.
  const savedState = location.state as { saved?: 'cloud' | 'local'; note?: string | null } | null;
  const savedOutcome = savedState?.saved;
  const [showSavedToast, setShowSavedToast] = useState(!!savedOutcome);
  useEffect(() => {
    if (!showSavedToast) return;
    const timer = setTimeout(() => setShowSavedToast(false), savedOutcome === 'local' ? 8000 : 3000);
    return () => clearTimeout(timer);
  }, [showSavedToast, savedOutcome]);

  const vs = searchParams.get('vs') || undefined;
  const cur = useRecipe(id);
  const otherId = vs ?? cur.recipe?.parentId ?? undefined;
  const other = useRecipe(otherId);

  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate(`/recipe/${id}`));
  const header = (
    <header className="px-4 pt-3">
      <button
        onClick={goBack}
        className="-ml-2 w-11 h-11 flex items-center justify-center rounded-full border border-border-strong text-text-primary hover:bg-surface-tertiary transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
        aria-label="Go back"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
    </header>
  );
  const shell = (body: ReactNode) => (
    <div className="max-w-lg mx-auto min-h-dvh bg-surface">
      {header}
      <div className="px-4">{body}</div>
      {showSavedToast && savedOutcome && <SavedToast outcome={savedOutcome} note={savedState?.note} />}
    </div>
  );

  // Both lookups count as loading, so the page never decides on one recipe while the other is in flight.
  if (cur.isLoading || (otherId !== undefined && other.isLoading)) {
    return shell(
      <div role="status" aria-label="Loading comparison" className="space-y-4 py-4">
        <Skeleton className="h-10" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    );
  }

  if (cur.cloudError || other.cloudError) {
    return shell(
      <div role="alert">
        <EmptyState
          tone="error"
          icon={<CloudOff />}
          title="Could not load this comparison"
          description="Check your connection and try again."
          action={
            <Button
              variant="secondary"
              className={SECONDARY_EDGE}
              onClick={() => {
                cur.retry();
                other.retry();
              }}
            >
              <RotateCw className="mr-2 size-4" />
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  const recipe = cur.recipe;
  if (!recipe) {
    return shell(<EmptyState icon="🔍" title="Recipe not found" description="It may have been deleted, or the link may be wrong." />);
  }

  if (otherId === undefined || otherId === recipe.id) {
    return shell(
      <EmptyState
        icon="🌱"
        title="This is the original"
        description="There is nothing before it to compare with."
        action={
          <Button variant="secondary" className={SECONDARY_EDGE} onClick={() => navigate(`/recipe/${recipe.id}`)}>
            Back to recipe
          </Button>
        }
      />
    );
  }

  const compared = other.recipe;
  if (!compared) {
    return shell(
      <EmptyState
        icon="🔍"
        title="Recipe not found"
        description="It may have been deleted, or the link may be wrong."
        action={
          <Button variant="secondary" className={SECONDARY_EDGE} onClick={() => navigate(`/recipe/${recipe.id}`)}>
            Back to recipe
          </Button>
        }
      />
    );
  }

  const diff = diffRecipes(compared, recipe);
  const author = recipe.createdBy?.displayName || 'Someone';
  const prompt = recipe.prompt?.trim();
  const deltas = [
    diff.totalTime.delta !== 0 &&
      `Total time ${formatTime(diff.totalTime.after)}, was ${formatTime(diff.totalTime.before)}`,
    diff.servings.delta !== 0 && `Serves ${diff.servings.after}, was ${diff.servings.before}`,
  ].filter(Boolean);
  const hasIngredients = diff.ingredients.some((c) => mode === 'side' || c.type !== 'unchanged');
  const hasSteps = diff.steps.some((s) => mode === 'side' || s.type !== 'unchanged');

  return (
    <div className="max-w-lg mx-auto min-h-dvh flex flex-col bg-surface">
      {header}
      <main className="flex-1 space-y-4 px-4 pt-3 pb-6">
        <h1 className="font-heading text-[30px] leading-tight text-text-primary">What changed</h1>
        <div className="flex items-center gap-2">
          <RecipePill recipe={compared} label="Compared version" />
          <span aria-hidden="true" className="shrink-0 text-text-secondary">
            →
          </span>
          <RecipePill recipe={recipe} label="This version" accent />
        </div>
        {prompt && (
          <p className="rounded-card rounded-bl-lg bg-accent-2-100 p-[13px] text-sm text-accent-2-800 break-words">
            {`${author} asked: "${prompt}"`}
          </p>
        )}
        <SegmentedControl label="Comparison" options={MODES} value={mode} onChange={setMode} />
        {mode === 'side' && !diff.identical && (
          // Real text so a screen reader hears which column is which. The cells keep their own
          // Changed/Added/Removed prefix; with these headers the columns stay clear.
          <div className="grid grid-cols-2 gap-2 px-3 text-xs font-semibold text-text-secondary">
            <p className="truncate">{compared.title}</p>
            <p className="truncate">{recipe.title}</p>
          </div>
        )}
        {deltas.length > 0 && <p className="text-sm font-medium text-text-primary">{deltas.join(' · ')}</p>}

        {diff.identical ? (
          <p className="py-6 text-center text-sm text-text-secondary">No changes to the ingredients or method.</p>
        ) : (
          <>
            {hasIngredients && (
              <Section title="Ingredients">
                <IngredientsList rows={diff.ingredients} mode={mode} />
              </Section>
            )}
            {hasSteps && (
              <Section title="Method">
                <MethodList rows={diff.steps} mode={mode} />
              </Section>
            )}
          </>
        )}
      </main>

      {/* Outside AppShell, so no BottomNav to clear. In flow after main, so it never covers the last row. */}
      <div className="sticky bottom-0 z-30 bg-surface border-t border-border shadow-lg px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" className={cn('min-w-0', SECONDARY_EDGE)} onClick={() => navigate(`/recipe/${compared.id}`)}>
            {vs ? 'Cook that one' : 'Cook parent'}
          </Button>
          <Button className="min-w-0" onClick={() => navigate(`/recipe/${recipe.id}`)}>
            Cook this one
          </Button>
        </div>
      </div>
      {showSavedToast && savedOutcome && <SavedToast outcome={savedOutcome} note={savedState?.note} />}
    </div>
  );
}
