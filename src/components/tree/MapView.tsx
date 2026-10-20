import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { carriedListOrigin } from '../../lib/paneMode';
import type { Recipe } from '../../types/recipe';
import { ancestorChain, buildTree } from '../../lib/tree';
import { layoutRadial, type RadialLayout } from '../../lib/radialLayout';
import { Button } from '../ui/Button';
import { Maximize } from '../ui/icons';

interface MapViewProps {
  recipes: Recipe[];
  currentId?: string;
  /** Replaces navigating to a recipe's page (the family panel closes itself first). */
  onOpen?: (id: string) => void;
  onShowTimeline: () => void;
}

export const BIG_FAMILY = 20;
const NODE_R = 20;
const HIT = 44;
const SCALE_FULL = 2;
// Inline scale is capped so a small family is not a giant disc.
const SCALE_MAX = 1.5;
// At 288px (a 320px phone) a generation-4 node is 17.6px (40 * 288 / 656) and its emoji under 9px,
// the least readable; generation 3 is 22px. So four generations below the root is the depth cutoff.
export const BIG_DEPTH = 4;

interface CanvasProps {
  layout: RadialLayout;
  byId: Map<string, Recipe>;
  pathIds: Set<string>;
  currentId?: string;
  selectedId: string;
  onSelect: (id: string) => void;
  px?: number;
}

// Paint order: rings, edges (path last, so dashes never cross it), node discs, emoji. The HTML buttons sit on top (z-10) and
// give each node a 44px target; they are in generation order so on a crowded ring the deeper node
// is the one on top where two targets overlap.
function MapCanvas({ layout, byId, pathIds, currentId, selectedId, onSelect, px }: CanvasProps) {
  const { size } = layout;
  const c = size / 2;
  const at = new Map(layout.nodes.map((n) => [n.id, n]));
  const edges = [...layout.edges].sort((a, b) => Number(pathIds.has(a.to)) - Number(pathIds.has(b.to)));
  return (
    <div className="relative mx-auto" style={px ? { width: px } : { width: '100%', maxWidth: size * SCALE_MAX }}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="block w-full h-auto">
        {layout.rings.map((r) => (
          <circle key={r} cx={c} cy={c} r={r} fill="none" stroke="var(--color-neutral-400)" strokeWidth={1.5} strokeDasharray="4 6" />
        ))}
        {edges.map((e) => {
          const a = at.get(e.from)!;
          const b = at.get(e.to)!;
          const onPath = pathIds.has(e.to) && pathIds.has(e.from);
          return (
            <line
              key={e.to}
              x1={c + a.x}
              y1={c + a.y}
              x2={c + b.x}
              y2={c + b.y}
              strokeLinecap="round"
              stroke={onPath ? 'var(--color-primary-500)' : 'var(--color-neutral-400)'}
              strokeWidth={onPath ? 5 : 3}
              data-path={onPath ? 'true' : 'false'}
            />
          );
        })}
        {layout.nodes.map((n) => {
          const isRoot = n.generation === 0;
          const onPath = pathIds.has(n.id);
          return (
            <g key={n.id} data-node={n.id}>
              {n.id === currentId && <circle cx={c + n.x} cy={c + n.y} r={NODE_R + 6} fill="none" stroke="var(--color-primary-500)" strokeWidth={3} />}
              {n.id === selectedId && n.id !== currentId && (
                <circle cx={c + n.x} cy={c + n.y} r={NODE_R + 6} fill="none" stroke="var(--color-text-primary)" strokeWidth={2} />
              )}
              <circle
                cx={c + n.x}
                cy={c + n.y}
                r={NODE_R}
                fill={isRoot ? 'var(--color-text-primary)' : 'var(--color-surface-secondary)'}
                stroke={onPath ? 'var(--color-primary-500)' : 'var(--color-border-strong)'}
                strokeWidth={2}
              />
            </g>
          );
        })}
        {layout.nodes.map((n) => (
          <text key={n.id} x={c + n.x} y={c + n.y} textAnchor="middle" dominantBaseline="central" fontSize={20}>
            {byId.get(n.id)?.emoji}
          </text>
        ))}
      </svg>
      {layout.nodes.map((n) => {
        const r = byId.get(n.id)!;
        // The name uses the title, never the emoji.
        const name = `${r.title}, generation ${n.generation}${n.id === currentId ? ', current version' : ''}`;
        return (
          <button
            key={n.id}
            type="button"
            aria-label={name}
            aria-pressed={n.id === selectedId}
            onClick={() => onSelect(n.id)}
            className="absolute z-10 rounded-full focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary-600"
            style={{
              left: `calc(${((c + n.x) / size) * 100}% - ${HIT / 2}px)`,
              top: `calc(${((c + n.y) / size) * 100}% - ${HIT / 2}px)`,
              width: HIT,
              height: HIT,
            }}
          />
        );
      })}
    </div>
  );
}

function Card({ recipe, generation, onOpen }: { recipe: Recipe; generation: number; onOpen: () => void }) {
  const author = recipe.createdBy.displayName || 'Anonymous';
  return (
    <div aria-live="polite" className="bg-surface-secondary rounded-card shadow-md p-[13px] min-w-0">
      <p className="text-h6 uppercase tracking-[0.08em] text-text-tertiary break-words">
        {generation === 0 ? `The original · by ${author}` : `Generation ${generation} · by ${author}`}
      </p>
      <h2 className="font-heading text-[20px] leading-tight text-text-primary mt-1 break-words">{recipe.title}</h2>
      <Button fullWidth className="mt-3" onClick={onOpen}>
        Open
      </Button>
    </div>
  );
}

export function MapView({ recipes, currentId, onShowTimeline, onOpen }: MapViewProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const tree = useMemo(() => buildTree(recipes), [recipes]);
  const layout = useMemo(() => (tree ? layoutRadial(tree) : null), [tree]);
  const byId = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const pathIds = useMemo(
    () => new Set(currentId && byId.has(currentId) ? [...ancestorChain(recipes, currentId).map((r) => r.id), currentId] : []),
    [recipes, byId, currentId]
  );
  const rootId = tree?.recipe.id ?? '';
  const [picked, setPicked] = useState<string | null>(null);
  const selectedId = picked && byId.has(picked) ? picked : currentId && byId.has(currentId) ? currentId : rootId;
  const [full, setFull] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const sel = layout?.nodes.find((n) => n.id === selectedId);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!full || !dialog) return;
    if (!dialog.open) dialog.showModal();
    // Centre the selected node. Assigning scrollLeft/Top clamps itself and never moves the page.
    const el = scroller.current;
    if (el && layout && sel) {
      el.scrollLeft = (layout.size / 2 + sel.x) * SCALE_FULL - el.clientWidth / 2;
      el.scrollTop = (layout.size / 2 + sel.y) * SCALE_FULL - el.clientHeight / 2;
    }
    // Only on open: later selections must not re-centre under the user's finger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full]);

  if (!layout || !tree) return null;
  const selected = byId.get(selectedId);
  const generation = sel?.generation ?? 0;
  const canvas = { layout, byId, pathIds, currentId, selectedId, onSelect: setPicked };

  const go = (path: string) => {
    // Navigating away unmounts the dialog, so there is no expand button to hand focus back to.
    opener.current = null;
    dialogRef.current?.close();
    navigate(path, { state: carriedListOrigin(location.state) });
  };

  return (
    <div className="space-y-4">
      {(layout.nodes.length > BIG_FAMILY || layout.rings.length >= BIG_DEPTH) && (
        <div className="bg-surface-secondary rounded-card p-[13px] space-y-3">
          <p className="text-sm text-text-secondary">This family is big for the map. The timeline reads better.</p>
          <Button variant="secondary" className="border-border-strong!" onClick={onShowTimeline}>
            Show timeline
          </Button>
        </div>
      )}
      <div className="relative">
        <button
          ref={opener}
          type="button"
          aria-label="Full screen map"
          onClick={() => setFull(true)}
          className="absolute right-0 top-0 z-20 w-11 h-11 flex items-center justify-center rounded-full bg-surface border border-border-strong text-text-primary hover:bg-surface-tertiary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
        >
          <Maximize className="w-5 h-5" />
        </button>
        <MapCanvas {...canvas} />
      </div>
      {selected && <Card recipe={selected} generation={generation} onOpen={() => (onOpen ? onOpen(selected.id) : go(`/recipe/${selected.id}`))} />}

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={() => {
          setFull(false);
          opener.current?.focus();
        }}
        className="fixed inset-0 m-0 h-dvh w-full max-h-none max-w-none p-0 bg-surface text-text-primary backdrop:bg-black/50"
      >
        {full && (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-3 px-4 py-2">
              <h2 id={titleId} className="font-heading text-xl text-text-primary">
                Version map
              </h2>
              <Button variant="secondary" className="border-border-strong!" onClick={() => dialogRef.current?.close()}>
                Close map
              </Button>
            </div>
            <div
              ref={scroller}
              role="region"
              aria-label="Version map, scrolls in both directions"
              tabIndex={0}
              className="flex-1 min-h-0 overflow-auto overscroll-contain focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-600"
            >
              <MapCanvas {...canvas} px={layout.size * SCALE_FULL} />
            </div>
            {selected && (
              <div className="px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <Card recipe={selected} generation={generation} onOpen={() => (onOpen ? onOpen(selected.id) : go(`/recipe/${selected.id}`))} />
              </div>
            )}
          </div>
        )}
      </dialog>
    </div>
  );
}
