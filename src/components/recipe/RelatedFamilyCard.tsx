import { useState } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { carriedListOrigin, listOriginState, type ListOrigin } from '../../lib/paneMode';
import { useRelatedFamilies } from '../../hooks/useRelatedFamilies';
import { pluralize } from '../../lib/utils';
import { FAMILY_MOVE_OTHERS_MESSAGE, moveIntoFamily, type RelatedFamily } from '../../services/firestore';
import { moveFamilyCloudFirst } from '../../db/recipes';
import { FamilyMoveRefusedError, FamilyMoveTimeoutError } from '../../lib/errors';
import { reportError } from '../../services/telemetry';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { UserPill } from '../ui/UserPill';
import { ChevronRight, GitMerge, Link } from '../ui/icons';

/** Organic 7d. Renders nothing when there are no families. The caller passes the list origin to carry. */
export function RelatedFamilyCard({ families, origin }: { families: readonly RelatedFamily[]; origin?: ListOrigin }) {
  if (families.length === 0) return null;
  return (
    <section aria-label="Related family" className="flex flex-col gap-2.5 rounded-[28px] bg-accent-2-100 p-4 motion-safe:animate-[boot-in_0.4s_ease-out_both]">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-accent-2-800">
        <Link className="size-3.5" />
        Related family
      </div>
      <ul className="flex flex-col gap-2.5">
        {families.map((f) => {
          const title = f.title.trim() || 'Untitled recipe';
          const author = f.createdBy?.displayName?.trim() || 'Anonymous';
          const count = f.versions === undefined ? '' : `, ${f.versions} ${pluralize(f.versions, 'version')}`;
          return (
            <li key={f.id}>
              <RouterLink
                to={`/recipe/${f.id}`}
                aria-label={`${title}, by ${author}${count}`}
                state={origin ? listOriginState(origin) : undefined}
                className="flex min-h-11 items-center gap-3 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
              >
                <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-[22px] leading-none">
                  {f.emoji}
                </span>
                <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                  <span className="break-words font-bold text-text-primary">{title}</span>
                  <span className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-accent-2-800">
                    {f.createdBy?.uid && <UserPill uid={f.createdBy.uid} name={f.createdBy.displayName} wrap />}
                    {f.versions !== undefined && `${f.versions} ${pluralize(f.versions, 'version')}`}
                  </span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-accent-2-800" />
              </RouterLink>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** What the page passes when the viewer is the verified author of a new original (RL-164). */
export interface FamilyMoveProps {
  mover: { uid: string; displayName: string | null };
  /** Another cook has a version in this family: the move is refused (decision RL-161). */
  othersInFamily: boolean;
  /** Every version below the original, which moves with it. */
  branches: number;
  /** Called as the move starts, so the title can take focus when the recipe re-renders. */
  onStart: () => void;
  /** Called when it ends. `note` is for the page to show, as this line is gone after a move. */
  onDone: (moved: boolean, note?: string) => void;
}

function moveFailureMessage(err: unknown): string {
  if (err instanceof FamilyMoveRefusedError) return err.message;
  if (err instanceof FamilyMoveTimeoutError) return "Couldn't confirm the move yet. It may still finish.";
  if ((err as { code?: unknown } | null)?.code === 'permission-denied') return "One version can't be moved; it may be too large.";
  return "Couldn't move it. Nothing changed here; try again.";
}

/** Organic 7d: the Move line under the card, on the new original, for its author only. */
function FamilyMoveLine({ recipeId, family, move }: { recipeId: string; family: RelatedFamily; move: FamilyMoveProps }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const title = family.title.trim() || 'Untitled recipe';

  const handleMove = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    move.onStart();
    let result;
    try {
      result = await moveFamilyCloudFirst(recipeId, moveIntoFamily(move.mover.uid, move.mover.displayName, recipeId, family.id));
    } catch (err) {
      if (!(err instanceof FamilyMoveRefusedError)) reportError(err, 'family-move');
      setError(moveFailureMessage(err));
      setBusy(false);
      setConfirming(false);
      move.onDone(false);
      return;
    }
    if (!result.mirrored) reportError(new Error('Family move not mirrored on this device'), 'family-move-mirror');
    // The page re-renders this recipe in its new family, where this line no longer shows.
    move.onDone(true, result.leftBehind > 0 ? 'One branch by another cook stayed behind.' : undefined);
  };

  const withBranches = move.branches === 0 ? '' : `, with its ${move.branches} ${pluralize(move.branches, 'branch', 'branches')}`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2.5 rounded-3xl bg-surface-secondary px-4 py-3.5 text-[13px] text-text-secondary">
        <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-accent-2-800">
          <GitMerge className="size-4" />
        </span>
        {move.othersInFamily ? (
          <p className="min-w-0 break-words">{FAMILY_MOVE_OTHERS_MESSAGE}</p>
        ) : (
          <p className="min-w-0 break-words">
            Is this really a version of {title}?{' '}
            {/* Inline, so the sentence wraps; the vertical padding makes the hit area 44px without moving the line. */}
            <button
              type="button"
              onClick={() => {
                setError(null);
                setConfirming(true);
              }}
              disabled={busy}
              className="inline py-[13px] font-bold text-text-primary underline underline-offset-2 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
            >
              Move it into that family
            </button>
            . You stay the author.
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="min-w-0 break-words px-4 text-[13px] text-danger-700">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={confirming}
        title={`Move into ${title}?`}
        message={`It becomes a branch of ${title}${withBranches}. You stay the author.`}
        confirmLabel="Move"
        cancelLabel="Keep it"
        busy={busy}
        onConfirm={() => void handleMove()}
        onCancel={() => {
          if (!busy) setConfirming(false);
        }}
      />
    </div>
  );
}

/** The card with its one read; the recipe page's slot below the metadata pills. */
export function RelatedFamilies({ recipe, move }: { recipe: { id: string; depth: number; relatedFamilyId?: string | null }; move?: FamilyMoveProps }) {
  const families = useRelatedFamilies(recipe);
  const origin = carriedListOrigin(useLocation().state)?.listOrigin;
  const target = recipe.depth === 0 && recipe.relatedFamilyId ? families[0] : undefined;
  return (
    <>
      <RelatedFamilyCard families={families} origin={origin} />
      {move && target && <FamilyMoveLine key={recipe.id} recipeId={recipe.id} family={target} move={move} />}
    </>
  );
}
