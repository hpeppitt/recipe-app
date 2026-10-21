import { useId, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useImportRecipe } from '../hooks/useImportRecipe';
import { canGenerate } from '../lib/generation';
import { pluralize } from '../lib/utils';
import { IconButton } from '../components/ui/IconButton';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { PageFallback } from '../components/ui/PageFallback';
import { EmailLinkingForm } from '../components/auth/EmailLinkingForm';
import { Camera, Link as LinkIcon, Sparkles, X } from '../components/ui/icons';
import { ImportReview } from '../components/recipe/ImportReview';
import { PhotoTray } from '../components/chat/PhotoTray';
import { usePhotoTray } from '../components/chat/usePhotoTray';
import { ACCEPTED_IMAGE_TYPES } from '../lib/imageAttachments';

/**
 * `/import`, "Add from a link" (RL-186): paste a recipe page, check what was read (RL-252),
 * and save it as a new original or, when the library already has the dish, as a
 * branch of that family. Gated like `/create`, since reading a page is a generation.
 * `/import?mode=photo` is "Snap a page" (RL-251): up to three photos instead of the
 * link, held in memory only, with the same preview and save.
 */
export function ImportPage() {
  const { search } = useLocation();
  // Keyed on the mode so a link preview or photos never carry over to the other mode (RL-250).
  return <ImportPageBody key={new URLSearchParams(search).get('mode') === 'photo' ? 'photo' : 'link'} />;
}

function ImportPageBody() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoading: authLoading, isConfigured } = useAuth();
  const { preview, isReading, isSaving, readError, saveError, read, readPhotos, save, reset } = useImportRecipe();
  const photoMode = new URLSearchParams(location.search).get('mode') === 'photo';
  const {
    photos,
    ready,
    preparing,
    full,
    error: photoError,
    errorSeq,
    fileRef,
    attachRef,
    trayRef,
    handlePick,
    removePhoto,
  } = usePhotoTray();
  const [url, setUrl] = useState('');
  const errorId = useId();
  const goBack = () => (location.key === 'default' ? navigate('/new') : navigate(-1));

  const header = (
    <header className="flex items-center gap-1 px-3 pt-3 pb-2">
      <IconButton variant="flat" label="Close" icon={<X className="size-5" />} onClick={goBack} />
      <h1 className="min-w-0 flex-1 break-words font-heading text-[22px] text-text-primary">{photoMode ? 'Snap a page' : 'Add from a link'}</h1>
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
              title={photoMode ? 'Sign up to add recipes from photos' : 'Sign up to add recipes from links'}
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

  const readingLabel = photoMode ? 'Reading the photos…' : 'Reading the page…';
  const busy = isReading || isSaving;

  return (
    <div className="min-h-dvh flex flex-col bg-surface">
      {header}
      {/* Persistent, so the change from reading to read is announced. */}
      <p role="status" className="sr-only">
        {isReading
          ? readingLabel
          : preview
            ? `Read ${preview.recipe.title}, ${preview.recipe.ingredients.length} ${pluralize(preview.recipe.ingredients.length, 'ingredient')}`
            : ''}
      </p>
      <main className="flex-1 overflow-y-auto px-4 pb-6">
        <div className="mx-auto max-w-lg min-w-0 space-y-4">
          {photoMode ? (
            <section aria-label="Photos of the recipe" className="space-y-3">
              <p className="text-sm text-text-secondary">Up to three photos of a cookbook page or a handwritten card.</p>
              <PhotoTray
                photos={photos}
                trayRef={trayRef}
                onRemove={(id) => {
                  if (busy) return;
                  removePhoto(id);
                  reset();
                }}
              />
              {(photoError || readError) && (
                <p key={errorSeq} role="alert" className="break-words px-1 text-sm text-danger-700">
                  {photoError ?? readError}
                </p>
              )}
              <input
                ref={fileRef}
                type="file"
                multiple
                accept={ACCEPTED_IMAGE_TYPES.join(',')}
                onChange={(e) => {
                  handlePick(e);
                  reset();
                }}
                className="hidden"
              />
              <div className="flex gap-2">
                <Button
                  ref={attachRef}
                  variant="secondary"
                  disabled={full || busy}
                  onClick={() => fileRef.current?.click()}
                  className="flex-1 gap-2"
                >
                  <Camera className="size-5" />
                  {photos.length ? 'Add another' : 'Add photos'}
                </Button>
                <Button
                  disabled={!ready.length || preparing}
                  aria-disabled={busy || undefined}
                  onClick={() => {
                    if (!busy) void readPhotos(ready);
                  }}
                  className="flex-1 font-heading"
                >
                  Read it
                </Button>
              </div>
            </section>
          ) : (
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
          )}

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
                {readingLabel}
              </p>
            </div>
          )}

          {preview && (
            <ImportReview
              preview={preview}
              isSaving={isSaving}
              saveError={saveError}
              onSave={(asBranch, edits, dest) => void save(asBranch, edits, dest)}
            />
          )}
        </div>
      </main>
    </div>
  );
}
