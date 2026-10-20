import { useEffect, useId, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Recipe } from '../../types/recipe';
import type { TreeNode } from '../../lib/tree';
import { carriedListOrigin } from '../../lib/paneMode';
import { useBranchEntry } from '../../hooks/useBranchEntry';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Spinner } from '../ui/Spinner';
import { EmptyState } from '../ui/EmptyState';
import { Button } from '../ui/Button';
import { GitBranchPlus, X } from '../ui/icons';
import { TreeView } from './TreeView';
import { TimelineView } from './TimelineView';
import { MapView } from './MapView';

const VIEWS = [
  { value: 'tree', label: 'Tree' },
  { value: 'timeline', label: 'Timeline' },
  { value: 'map', label: 'Map' },
] as const;
type ViewId = (typeof VIEWS)[number]['value'];

interface FamilyPanelProps {
  open: boolean;
  onClose: () => void;
  recipe: Recipe;
  recipes: Recipe[];
  tree: TreeNode | null;
  /** True while the family is loading. */
  isLoading?: boolean;
}

/** The wide-screen family pull-out (21b): a 420px modal dialog on the right with Tree, Timeline and Map. */
export function FamilyPanel({ open, onClose, recipe, recipes, tree, isLoading = false }: FamilyPanelProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pressedOnBackdrop = useRef(false);
  const openRef = useRef(open);
  const titleId = useId();
  const navigate = useNavigate();
  const location = useLocation();
  const { branch, signUp } = useBranchEntry();
  useEffect(() => {
    openRef.current = open;
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  // Body is mounted only while open, so the view returns to Tree each time the panel opens.
  return (
    <>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onCancel={(e) => {
          e.preventDefault();
          onClose();
        }}
        // Chrome can close a modal without a cancel event; let the parent sync.
        onClose={() => {
          if (openRef.current && dialogRef.current && !dialogRef.current.open) onClose();
        }}
        onPointerDown={(e) => {
          pressedOnBackdrop.current = e.target === e.currentTarget;
        }}
        onClick={(e) => {
          if (pressedOnBackdrop.current && e.target === e.currentTarget) onClose();
          pressedOnBackdrop.current = false;
        }}
        className="backdrop:bg-neutral-900/40 dark:backdrop:bg-black/60 bg-transparent p-0 m-0 ml-auto h-dvh max-h-none w-[420px] max-w-full overflow-visible"
      >
        {open && (
          <Body
            titleId={titleId}
            recipe={recipe}
            recipes={recipes}
            tree={tree}
            isLoading={isLoading}
            onClose={onClose}
            onOpenRecipe={(id) => {
              onClose();
              navigate(`/recipe/${id}`, { state: carriedListOrigin(location.state) });
            }}
            onBranch={() => {
              onClose();
              branch(recipe.id);
            }}
          />
        )}
      </dialog>
      {signUp}
    </>
  );
}

interface BodyProps {
  titleId: string;
  recipe: Recipe;
  recipes: Recipe[];
  tree: TreeNode | null;
  isLoading: boolean;
  onClose: () => void;
  onOpenRecipe: (id: string) => void;
  onBranch: () => void;
}

function Body({ titleId, recipe, recipes, tree, isLoading, onClose, onOpenRecipe, onBranch }: BodyProps) {
  const [view, setView] = useState<ViewId>('tree');
  const rootTitle = tree?.recipe.title ?? recipe.title;
  return (
    <div className="flex h-full flex-col gap-3.5 bg-surface-secondary pt-7 px-[22px] shadow-lg">
      <div className="flex items-center gap-2.5">
        <h2 id={titleId} className="flex-1 min-w-0 break-words font-heading text-[20px] leading-tight text-text-primary">
          {rootTitle} family
        </h2>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-primary hover:bg-surface-tertiary"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <SegmentedControl compact className="bg-surface" label="Family view" options={VIEWS} value={view} onChange={setView} />
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : !tree ? (
          <EmptyState compact tone="error" icon="🔍" title="Couldn't load the family" description="Close this and try again in a moment." />
        ) : view === 'timeline' ? (
          <TimelineView recipes={recipes} currentId={recipe.id} onOpen={onOpenRecipe} />
        ) : view === 'map' ? (
          <MapView recipes={recipes} currentId={recipe.id} onShowTimeline={() => setView('timeline')} onOpen={onOpenRecipe} />
        ) : (
          <TreeView tree={tree} currentId={recipe.id} onOpen={onOpenRecipe} />
        )}
      </div>
      <div className="mt-auto mb-6">
        <Button fullWidth className="h-[50px]" onClick={onBranch}>
          <GitBranchPlus className="mr-2 size-[18px]" />
          Branch from this one
        </Button>
      </div>
    </div>
  );
}
