import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Recipe } from '../../types/recipe';
import { layoutTimeline } from '../../lib/timelineLayout';
import { diffRecipes, summariseChanges } from '../../lib/recipeDiff';
import { timeAgo } from '../../lib/utils';
import { useBranchEntry } from '../../hooks/useBranchEntry';
import { Button } from '../ui/Button';

interface TimelineViewProps {
  recipes: Recipe[];
  currentId?: string;
}

// Geometry in px. Lanes are 44 apart; a label baseline sits LABEL_RISE above its lane, which keeps
// the label box (12px text) clear of its own stops (ring reaches 12) and of the lane above.
export const LANE = 44;
export const TOP = 32;
export const LABEL_RISE = 18;
export const LABEL_DX = 10;
export const CHAR_W = 6.5;
const BOTTOM = 28;
const BEND = 16;
const LINE_W = 6;
const HIT = 44;

const laneY = (lane: number) => TOP + lane * LANE;
const colour = (token: string) => `var(--color-${token})`;

export function TimelineView({ recipes, currentId }: TimelineViewProps) {
  const navigate = useNavigate();
  const { branch, signUp } = useBranchEntry();
  const layout = useMemo(() => layoutTimeline(recipes), [recipes]);
  const byId = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const stopById = useMemo(() => new Map(layout.stops.map((s) => [s.id, s])), [layout]);
  const scroller = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // A label may run only as far as the next other-line start or stop on its lane, so two labels
  // on a reused lane cannot print over each other. Too little room renders nothing; the stop
  // names and the sheet eyebrow still carry the full label.
  const labels = layout.lines.map((line) => {
    const first = stopById.get(line.stopIds[0])!;
    const x = first.x + LABEL_DX;
    const limit = Math.min(
      Infinity,
      ...layout.stops.filter((s) => s.lane === line.lane && s.line !== line.index && s.x > first.x).map((s) => s.x - 12)
    );
    const room = Math.floor((limit - x) / CHAR_W);
    const text = line.label.length <= room ? line.label : room > 3 ? `${line.label.slice(0, room - 3).trimEnd()}...` : '';
    return { line, text, x, y: laneY(line.lane) - LABEL_RISE };
  });
  const width = Math.ceil(Math.max(layout.width, ...labels.map((l) => l.x + l.text.length * CHAR_W + 16)));
  const height = laneY(Math.max(layout.laneCount - 1, 0)) + BOTTOM;

  // Centre the current stop on open. Setting scrollLeft clamps itself, so a family that fits is not
  // scrolled, and it never moves the page vertically the way scrollIntoView can.
  const currentX = currentId ? stopById.get(currentId)?.x : undefined;
  const centred = useRef(false);
  useEffect(() => {
    const el = scroller.current;
    if (centred.current || !el || currentX === undefined) return;
    centred.current = true;
    el.scrollLeft = currentX - el.clientWidth / 2;
  }, [currentX]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (selectedId && !dialog.open) dialog.showModal();
    if (!selectedId && dialog.open) dialog.close();
  }, [selectedId]);

  const selected = selectedId ? byId.get(selectedId) : undefined;
  const selStop = selectedId ? stopById.get(selectedId) : undefined;
  const selLine = selStop ? layout.lines[selStop.line] : undefined;
  const parent = selected?.parentId ? byId.get(selected.parentId) : undefined;
  const tags = selected && parent ? summariseChanges(diffRecipes(parent, selected), 3) : [];

  const go = (path: string) => {
    // Navigating away unmounts the dialog, so there is no opener to hand focus back to.
    opener.current = null;
    dialogRef.current?.close();
    navigate(path);
  };

  return (
    <>
      <div
        ref={scroller}
        role="region"
        aria-label="Version timeline, scrolls sideways"
        tabIndex={0}
        className="overflow-x-auto rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
      >
        <div className="relative" style={{ width, height }}>
          {/* Paint order: lines, then stops, then label text with a surface halo. */}
          <svg width={width} height={height} aria-hidden="true" className="block">
            {layout.lines.map((line) => {
              const y = laneY(line.lane);
              const first = stopById.get(line.stopIds[0])!;
              const last = stopById.get(line.stopIds[line.stopIds.length - 1])!;
              let d = `M ${first.x} ${y} H ${last.x}`;
              const from = line.branchFromId ? stopById.get(line.branchFromId) : undefined;
              if (from) {
                const fy = laneY(from.lane);
                const dir = y > fy ? 1 : -1;
                const r = Math.min(BEND, Math.abs(y - fy) / 2);
                d = `M ${from.x} ${fy} V ${y - dir * r} Q ${from.x} ${y} ${from.x + r} ${y} H ${last.x}`;
              }
              return (
                <path
                  key={line.index}
                  d={d}
                  fill="none"
                  stroke={colour(line.colour)}
                  strokeWidth={LINE_W}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  data-line={line.index}
                />
              );
            })}
            {layout.stops.map((s) => {
              const y = laneY(s.lane);
              const cur = s.id === currentId;
              return (
                <g key={s.id}>
                  {cur && <circle cx={s.x} cy={y} r={11} fill="none" stroke="var(--color-accent)" strokeWidth={2} />}
                  <circle
                    cx={s.x}
                    cy={y}
                    r={5.5}
                    strokeWidth={3}
                    data-stop={s.id}
                    fill={cur ? 'var(--color-accent)' : 'var(--color-surface)'}
                    stroke={cur ? 'var(--color-accent)' : colour(layout.lines[s.line].colour)}
                  />
                </g>
              );
            })}
            {labels.map(({ line, text, x, y }) => (
              <text
                key={line.index}
                x={x}
                y={y}
                data-label={line.index}
                fontSize={12}
                fill="var(--color-text-secondary)"
                stroke="var(--color-surface)"
                strokeWidth={3}
                paintOrder="stroke"
              >
                {text}
              </text>
            ))}
          </svg>
          {layout.stops.map((s) => {
            const r = byId.get(s.id)!;
            const line = layout.lines[s.line];
            const name = `${r.title}, ${line.label}, stop ${s.stopNumber}${s.id === currentId ? ', current version' : ''}`;
            return (
              <button
                key={s.id}
                type="button"
                aria-label={name}
                onClick={(e) => {
                  opener.current = e.currentTarget;
                  setSelectedId(s.id);
                }}
                className="absolute z-10 rounded-full focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary-600"
                style={{ left: s.x - HIT / 2, top: laneY(s.lane) - HIT / 2, width: HIT, height: HIT }}
              />
            );
          })}
        </div>
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={() => {
          setSelectedId(null);
          opener.current?.focus();
        }}
        // The dialog itself has no padding, so a click whose target is the dialog is a backdrop tap.
        onClick={(e) => e.target === e.currentTarget && dialogRef.current?.close()}
        className="fixed inset-x-0 bottom-0 top-auto m-0 mx-auto w-full max-w-lg max-h-[85dvh] overflow-y-auto overscroll-contain p-0 bg-surface text-text-primary rounded-t-card rounded-b-none shadow-lg backdrop:bg-black/50"
      >
        {selected && selLine && selStop && (
          <div className="px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-neutral-400" aria-hidden="true" />
            <p className="text-h6 uppercase tracking-[0.08em] text-text-tertiary break-words">{`${selLine.label} · stop ${selStop.stopNumber}`}</p>
            <h2 id={titleId} className="font-heading text-[25px] leading-tight text-text-primary mt-1 break-words">
              {selected.title}
            </h2>
            <p className="text-sm text-text-secondary mt-1 break-words">
              {`"${selected.prompt || 'Variation'}" · ${selected.createdBy.displayName || 'Anonymous'}${selected.createdAt ? ` · ${timeAgo(selected.createdAt)}` : ''}`}
            </p>
            {tags.length > 0 && (
              <ul role="list" aria-label="What changed" className="flex flex-wrap gap-2 mt-3">
                {tags.map((t) => (
                  <li
                    key={t}
                    className={`text-xs leading-4 rounded-full px-2.5 py-1 break-words max-w-full ${
                      t.startsWith('~') ? 'bg-accent-2-100 text-accent-2-800' : 'bg-primary-50 text-primary-700'
                    }`}
                  >
                    {t}
                  </li>
                ))}
              </ul>
            )}
            {selected.depth > 0 && (
              <Button variant="ghost" fullWidth className="mt-3 outline-primary-600!" onClick={() => go(`/recipe/${selected.id}/changes`)}>
                See what changed
              </Button>
            )}
            <div className="flex gap-3 mt-5">
              <Button variant="secondary" fullWidth className="border-border-strong!" onClick={() => go(`/recipe/${selected.id}`)}>
                Open
              </Button>
              <Button fullWidth onClick={() => branch(`/recipe/${selected.id}/vary`)}>
                Branch here
              </Button>
            </div>
          </div>
        )}
      </dialog>
      {signUp}
    </>
  );
}
