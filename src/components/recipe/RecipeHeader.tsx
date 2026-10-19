import { useId, useRef, useState, type ReactNode } from 'react';
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
  onSuggest: () => void;
  /** In the wide-screen pane (RL-116): the pane pads the page, and sizes follow the pane's width, not the viewport. */
  inPane?: boolean;
}

function SheetRow({ icon, label, onClick, disabled, danger }: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-11 w-full items-center gap-[14px] px-1 py-3 text-left text-[16px] disabled:opacity-50 ${
        danger ? 'text-accent-700' : 'text-text-primary'
      }`}
    >
      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-surface-secondary">
        {icon}
      </span>
      <span className="min-w-0 break-words">{label}</span>
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
            <h1 className={`mt-[14px] break-words font-heading text-[32px] ${titleSize} leading-[1.04]`}>{recipe.title}</h1>
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
              <h1 className={`min-w-0 flex-1 break-words font-heading text-[34px] ${titleSize} leading-[1.04]`}>{recipe.title}</h1>
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
            <SheetRow danger label="Delete" icon={<X className="h-[18px] w-[18px]" />} onClick={act(props.onDelete)} />
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
            <span className="absolute -right-3 -top-3 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary-600 px-1 text-[10px] font-bold text-white">
              {pendingCount > 99 ? '99+' : pendingCount}
            </span>
          )}
        </span>
      }
    />
  );
}
