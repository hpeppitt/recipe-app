import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Recipe } from '../../types/recipe';
import { EmojiBlob } from '../ui/EmojiBlob';
import { IconButton } from '../ui/IconButton';
import { Sheet } from '../ui/Sheet';
import { ChevronLeft, Bookmark, BookmarkCheck, Ellipsis, Link, MessageCircle, Network, Pencil, X } from '../ui/icons';

interface RecipeHeaderProps {
  recipe: Recipe;
  /** The family root, once the lineage has loaded. Without it a branch shows no label. */
  familyRoot?: Recipe;
  onBack: () => void;
  /** False hides the heart (local-only mode: no account, nothing to favourite with). */
  showFavorite: boolean;
  isFavorite: boolean;
  onFavorite: () => void;
  pendingCount: number;
  isOwner: boolean;
  canSuggest: boolean;
  isSharing: boolean;
  shareDisabled: boolean;
  onShare: () => void;
  onDelete: () => void;
  /** An original with another cook's version in its family cannot be deleted (RL-159, decision RL-157 3b). */
  deleteBlocked?: boolean;
  /** True while the family is loading, when whether the original may be deleted is not known yet. */
  deleteDisabled?: boolean;
  onSuggest: () => void;
  /** In the wide-screen pane (RL-116): the pane pads the page, and sizes follow the pane's width, not the viewport. */
  inPane?: boolean;
}

function SheetRow({ icon, label, onClick, disabled, danger, note }: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** Shown under the label; the row looks disabled and does nothing, but stays focusable so the reason is read out. */
  note?: string;
}) {
  return (
    <button
      type="button"
      onClick={note ? undefined : onClick}
      disabled={disabled}
      aria-disabled={note ? true : undefined}
      className={`flex min-h-11 w-full items-center gap-[14px] px-1 py-3 text-left text-[16px] disabled:opacity-50 ${
        danger ? 'text-accent-700' : 'text-text-primary'
      }`}
    >
      {/* A blocked row dims its icon and label only, so the reason stays at full contrast. */}
      <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-surface-secondary${note ? ' opacity-50' : ''}`}>
        {icon}
      </span>
      <span className="min-w-0 break-words">
        <span className={note ? 'opacity-50' : undefined}>{label}</span>
        {note && <span className="block text-[13px] text-text-secondary">{note}</span>}
      </span>
    </button>
  );
}

/** Title block and controls for the recipe page: 2a for an original, 2b (emoji hero) for a branch. */
export function RecipeHeader(props: RecipeHeaderProps) {
  const { recipe, familyRoot, onBack, pendingCount } = props;
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const titleId = useId();
  const controlsRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  // True once the h1 has left the viewport; the compact bar shows then (RL-129).
  const [titleGone, setTitleGone] = useState(false);
  useEffect(() => {
    const el = titleRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setTitleGone(!entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, [recipe.id]);
  const isBranch = recipe.parentId != null;
  const variant = isBranch ? 'floating' : 'flat';
  // Wide sizes from lg alone; in the pane only once it is 36rem wide (at 1024px it is about 384px).
  const titleSize = props.inPane ? '@xl:text-[44px]' : 'lg:text-[44px]';
  const titlePad = props.inPane ? '' : 'px-[22px]';

  // Actions close the sheet first, then run; a dialog they open takes focus itself.
  const act = (fn: () => void) => () => {
    setMenuOpen(false);
    fn();
  };
  // Dismissing returns focus to the More button explicitly; the native return is not relied on.
  const dismissMenu = () => {
    setMenuOpen(false);
    controlsRef.current?.querySelector<HTMLButtonElement>('[data-more] button')?.focus();
  };

  const controls = (
    <div
      ref={controlsRef}
      className={
        isBranch
          ? 'absolute left-[14px] right-[14px] z-10 flex gap-2 top-[calc(12px+env(safe-area-inset-top))]'
          : `flex gap-0.5 pt-3 ${props.inPane ? '' : 'px-3'}`
      }
    >
      <IconButton variant={variant} label="Go back" onClick={onBack} icon={<ChevronLeft className="h-5 w-5" />} />
      <div className="flex-1" />
      <IconButton variant={variant} label="Version tree" href={`/recipe/${recipe.id}/tree`} icon={<Network className="h-5 w-5" />} />
      {props.showFavorite && (
        <IconButton
          variant={variant}
          label="Save"
          pressed={props.isFavorite}
          onClick={props.onFavorite}
          icon={
            props.isFavorite ? (
              <BookmarkCheck className={`${isBranch ? 'size-[19px]' : 'size-5'} text-accent`} />
            ) : (
              <Bookmark className={`${isBranch ? 'size-[19px]' : 'size-5'} text-text-primary`} />
            )
          }
        />
      )}
      <span data-more="" className="contents">
        <MoreButton variant={variant} pendingCount={pendingCount} onClick={() => setMenuOpen(true)} />
      </span>
    </div>
  );

  return (
    <>
    {/* The bar is aria-hidden, so its tabIndex -1 back button is out of the tab order and the a11y tree; the real Go back stays. */}
    {/* Zero height, so showing the bar moves nothing. Sticks to the page, or to the pane's own scroll (RL-129). */}
    {titleGone && (
      <div aria-hidden="true" className={`sticky top-0 z-20 h-0 ${props.inPane ? '-mx-4 @xl:-mx-12' : ''}`}>
        <div className="border-b border-border bg-surface shadow-sm motion-safe:animate-[bar-in_150ms_ease-out]">
          <div className="mx-auto flex max-w-lg items-center gap-1 px-[14px] pb-2 pt-[calc(8px+env(safe-area-inset-top))] lg:max-w-[720px]">
            <IconButton variant="flat" label="Go back" tabIndex={-1} onClick={onBack} icon={<ChevronLeft className="h-5 w-5" />} />
            <p className="min-w-0 flex-1 break-words text-[15px] font-bold text-text-primary">{recipe.title}</p>
          </div>
        </div>
      </div>
    )}
    <header className="mx-auto max-w-lg lg:max-w-[720px]">
      {isBranch ? (
        <>
          <div className="relative flex h-[230px] justify-center bg-accent-200">
            {controls}
            <EmojiBlob size={150} tint="bg-surface" className="mt-5">
              <span style={{ fontSize: 78 }}>{recipe.emoji}</span>
            </EmojiBlob>
          </div>
          <div className={titlePad}>
            <h1 ref={titleRef} title={recipe.title} data-recipe-title="" tabIndex={-1} className={`mt-[14px] line-clamp-2 -mb-[0.15em] break-words pb-[0.15em] font-heading text-[32px] ${titleSize} leading-[1.04]`}>{recipe.title}</h1>
            {familyRoot && (
              <p className="mt-1.5 break-words text-[16px] font-bold text-accent-2-700">
                {familyRoot.emoji} {familyRoot.title} variation
              </p>
            )}
          </div>
        </>
      ) : (
        <>
          {controls}
          <div className={`${titlePad} pt-2`}>
            <div className="mt-1 flex items-start gap-4">
              <h1 ref={titleRef} title={recipe.title} data-recipe-title="" tabIndex={-1} className={`min-w-0 flex-1 line-clamp-2 -mb-[0.15em] break-words pb-[0.15em] font-heading text-[34px] ${titleSize} leading-[1.04]`}>{recipe.title}</h1>
              {/* 96px when wide (RL-116); !important because the size is an inline style. */}
              <EmojiBlob
                size={76}
                emoji={recipe.emoji}
                className={props.inPane ? '@xl:!size-24 @xl:!text-[48px]' : 'lg:!size-24 lg:!text-[48px]'}
              />
            </div>
            <p className="mt-2.5 break-words text-[15px] text-text-secondary [text-wrap:pretty]">
              {recipe.description}
            </p>
            {recipe.relatedFamilyId && (
              <p className="mt-3">
                <span className="inline-flex rounded-full bg-accent-100 px-3 py-[5px] text-[13px] font-semibold leading-5 text-accent-800">
                  New original<span className="sr-only">, similar to an existing recipe family</span>
                </span>
              </p>
            )}
          </div>
        </>
      )}

      <Sheet open={menuOpen} onClose={dismissMenu} labelledBy={titleId}>
        <h2 id={titleId} className="sr-only">Recipe options</h2>
        <div className="flex flex-col">
          {props.isOwner && (
            <SheetRow label="Edit recipe" icon={<Pencil className="h-[18px] w-[18px]" />} onClick={act(() => navigate(`/recipe/${recipe.id}/edit`))} />
          )}
          {props.isOwner && (
            <SheetRow
              danger
              label={isBranch ? 'Delete version' : 'Delete'}
              note={!isBranch && props.deleteBlocked ? 'Other cooks have branches here, so the original stays.' : undefined}
              disabled={props.deleteDisabled}
              icon={<X className="h-[18px] w-[18px]" />}
              onClick={act(props.onDelete)}
            />
          )}
          {props.canSuggest && (
            <SheetRow label="Suggest a change" icon={<MessageCircle className="h-[18px] w-[18px]" />} onClick={act(props.onSuggest)} />
          )}
          <SheetRow label="See the family" icon={<Network className="h-[18px] w-[18px]" />} onClick={act(() => navigate(`/recipe/${recipe.id}/tree`))} />
          <SheetRow
            label={props.isSharing ? 'Preparing link...' : 'Copy share link'}
            icon={<Link className="h-[18px] w-[18px]" />}
            disabled={props.isSharing || props.shareDisabled}
            onClick={act(props.onShare)}
          />
        </div>
      </Sheet>
    </header>
    </>
  );
}

function MoreButton({ variant, pendingCount, onClick }: { variant: 'floating' | 'flat'; pendingCount: number; onClick: () => void }) {
  return (
    <IconButton
      variant={variant}
      onClick={onClick}
      label={pendingCount > 0 ? `More options, ${pendingCount} suggestions pending` : 'More options'}
      icon={
        <span className="relative flex">
          <Ellipsis className="h-5 w-5" />
          {pendingCount > 0 && (
            <span className="absolute -right-3 -top-3 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary-600 px-1 text-[10px] font-bold text-on-accent">
              {pendingCount > 99 ? '99+' : pendingCount}
            </span>
          )}
        </span>
      }
    />
  );
}
