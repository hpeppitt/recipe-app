import { forwardRef, useEffect, useId, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useImportRecipe, type ImportPreview } from '../hooks/useImportRecipe';
import { canGenerate } from '../lib/generation';
import { formatTime, pluralize } from '../lib/utils';
import { IconButton } from '../components/ui/IconButton';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { UserPill } from '../components/ui/UserPill';
import { PageFallback } from '../components/ui/PageFallback';
import { Spinner } from '../components/ui/Spinner';
import { EmailLinkingForm } from '../components/auth/EmailLinkingForm';
import { Link as LinkIcon, Sparkles, X } from '../components/ui/icons';

const PreviewCard = forwardRef<HTMLHeadingElement, { preview: ImportPreview }>(function PreviewCard({ preview }, headingRef) {
  const { recipe, host, uncertainCount } = preview;
  const facts = [
    `${recipe.ingredients.length} ${pluralize(recipe.ingredients.length, 'ingredient')}`,
    `${recipe.instructions.length} ${pluralize(recipe.instructions.length, 'step')}`,
    recipe.totalTime > 0 ? formatTime(recipe.totalTime) : '',
  ].filter(Boolean);
  return (
    <section aria-label="Recipe preview" className="space-y-3 rounded-[30px] bg-surface-secondary p-4">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="flex size-14 flex-shrink-0 items-center justify-center rounded-full bg-surface text-3xl">
          {recipe.emoji}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <h2 ref={headingRef} tabIndex={-1} className="break-words font-heading text-xl text-text-primary focus:outline-none">{recipe.title}</h2>
          <p className="text-[13px] text-neutral-700">{facts.join(' · ')}</p>
          <span className="inline-block max-w-full truncate rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-text-secondary">{host}</span>
        </div>
      </div>
      {uncertainCount > 0 && (
        <p className="rounded-2xl bg-accent-100 px-3 py-2 text-[13px] text-text-primary">
          {uncertainCount === 1
            ? 'One amount was unclear. You can fix it after saving.'
            : `${uncertainCount} amounts were unclear. You can fix them after saving.`}
        </p>
      )}
    </section>
  );
});

/**
 * `/import`, "Add from a link" (RL-186): paste a recipe page, preview what was read,
 * and save it as a new original or, when the library already has the dish, as a
 * branch of that family. Gated like `/create`, since reading a page is a generation.
 */
export function ImportPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoading: authLoading, isConfigured } = useAuth();
  const { preview, isReading, isSaving, readError, saveError, read, save, reset } = useImportRecipe();
  const [url, setUrl] = useState('');
  // Which save was tapped, for its Saving label and to take focus back after a failure.
  const [choice, setChoice] = useState<'branch' | 'original' | null>(null);
  const errorId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Button does not forward refs, so the failed save's button is found by its choice.
  const actionsRef = useRef<HTMLDivElement>(null);

  // A new preview takes focus so keyboard and screen reader users land on what was read.
  useEffect(() => {
    if (preview) headingRef.current?.focus();
  }, [preview]);
  useEffect(() => {
    if (saveError && choice) actionsRef.current?.querySelector<HTMLButtonElement>(`[data-choice="${choice}"]`)?.focus();
  }, [saveError, choice]);
  const goBack = () => (location.key === 'default' ? navigate('/new') : navigate(-1));

  const header = (
    <header className="flex items-center gap-1 px-3 pt-3 pb-2">
      <IconButton variant="flat" label="Close" icon={<X className="size-5" />} onClick={goBack} />
      <h1 className="min-w-0 flex-1 break-words font-heading text-[22px] text-text-primary">Add from a link</h1>
    </header>
  );

  if (authLoading) return <PageFallback />;

  // Reading a page spends a generation, so the same gate as the chat (RL-186 context).
  if (!canGenerate({ isConfigured, user })) {
    return (
      <div className="min-h-dvh flex flex-col bg-surface">
        {header}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-lg min-w-0">
            <EmptyState
              icon={<Sparkles />}
              title="Sign up to add recipes from links"
              description="Recipe Lab reads a recipe page with AI and keeps it in one shared library. Add your email to bring in recipes and keep everything you make across devices."
              action={
                <div className="w-[calc(100vw-3rem)] max-w-sm min-w-0 space-y-4">
                  <EmailLinkingForm
                    tone="invite"
                    icon="✉️"
                    title="No password needed"
                    description="We'll email you a link. Tap it and you're in, on this device or any other."
                    submitLabel="Sign up"
                  />
                  <Button variant="secondary" fullWidth onClick={() => navigate('/')}>
                    Back to recipes
                  </Button>
                </div>
              }
            />
          </div>
        </main>
      </div>
    );
  }

  const family = preview?.family ?? null;
  const busy = isReading || isSaving;
  const onSave = (asBranch: boolean) => {
    if (isSaving) return;
    setChoice(asBranch ? 'branch' : 'original');
    void save(asBranch);
  };
  const saveLabel = (label: string, mine: boolean) =>
    isSaving && mine ? (
      <>
        <span aria-hidden="true"><Spinner size="sm" className="mr-2" /></span>
        Saving…
      </>
    ) : (
      <span className="truncate">{label}</span>
    );

  return (
    <div className="min-h-dvh flex flex-col bg-surface">
      {header}
      {/* Persistent, so the change from reading to read is announced. */}
      <p role="status" className="sr-only">
        {isReading
          ? 'Reading the page…'
          : preview
            ? `Read ${preview.recipe.title}, ${preview.recipe.ingredients.length} ${pluralize(preview.recipe.ingredients.length, 'ingredient')}`
            : ''}
      </p>
      <main className="flex-1 overflow-y-auto px-4 pb-6">
        <div className="mx-auto max-w-lg min-w-0 space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy) void read(url);
            }}
          >
            <div className="flex h-[52px] items-center gap-2 rounded-full bg-neutral-100 pl-4 pr-1.5 shadow-sm">
              <LinkIcon className="size-5 flex-shrink-0 text-text-tertiary" />
              <input
                type="text"
                inputMode="url"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                aria-label="Recipe link"
                aria-invalid={readError ? true : undefined}
                aria-describedby={readError ? errorId : undefined}
                placeholder="Paste a recipe link"
                value={url}
                // readOnly, not disabled, so the field keeps focus while it reads.
                readOnly={busy}
                aria-disabled={busy || undefined}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (preview) reset();
                }}
                onPaste={(e) => {
                  // Pasting into an empty field is the whole intent, so it reads straight away.
                  if (url || busy) return;
                  const pasted = e.clipboardData.getData('text');
                  if (!pasted.trim()) return;
                  e.preventDefault();
                  setUrl(pasted);
                  if (preview) reset();
                  void read(pasted);
                }}
                className="min-w-0 flex-1 bg-transparent text-base text-text-primary placeholder:text-text-tertiary focus:outline-none"
              />
              <Button type="submit" disabled={!url.trim()} aria-disabled={busy || undefined} className="rounded-full px-4 font-heading text-[13px]">
                Read it
              </Button>
            </div>
            {readError && (
              <p id={errorId} role="alert" className="mt-2 px-4 text-sm text-danger-700">
                {readError}
              </p>
            )}
          </form>

          {isReading && (
            <div aria-hidden="true" className="space-y-3 rounded-[30px] bg-surface-secondary p-4">
              <div className="flex items-center gap-3">
                <div className="skeleton-pulse size-14 flex-shrink-0 rounded-full bg-neutral-300" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton-pulse h-5 w-3/4 rounded-full bg-neutral-300" />
                  <div className="skeleton-pulse h-3 w-1/2 rounded-full bg-neutral-300" />
                </div>
              </div>
              <p className="flex items-center gap-1.5 text-[13px] text-accent-700">
                <Sparkles className="size-4" />
                Reading the page…
              </p>
            </div>
          )}

          {preview && (
            <>
              <PreviewCard ref={headingRef} preview={preview} />
              {family && (
                <section aria-label="Already in the library" className="space-y-2 rounded-[24px] bg-accent-2-100 p-4">
                  <p className="text-sm text-text-primary">
                    There's already a <strong>{family.title}</strong> family with {family.versions}{' '}
                    {pluralize(family.versions, 'version')}
                  </p>
                  {family.author && <UserPill uid={family.author.uid} name={family.author.name} truncate />}
                </section>
              )}
              {saveError && (
                <p role="alert" className="px-1 text-sm text-danger-700">
                  {saveError}
                </p>
              )}
              <div ref={actionsRef} className="flex flex-col gap-2" aria-busy={isSaving || undefined}>
                {family && (
                  <Button data-choice="branch" fullWidth size="lg" aria-disabled={isSaving || undefined} onClick={() => onSave(true)}>
                    {saveLabel(`Add to ${family.title} family`, choice === 'branch')}
                  </Button>
                )}
                <Button
                  data-choice="original"
                  fullWidth
                  size={family ? 'md' : 'lg'}
                  variant={family ? 'ghost' : 'primary'}
                  aria-disabled={isSaving || undefined}
                  onClick={() => onSave(false)}
                >
                  {saveLabel('Save as a new original', choice === 'original')}
                </Button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
