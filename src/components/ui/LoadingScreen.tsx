import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';

// Geometry and timings ported from the Organic loading-screen design (spec-v1 section 11).
const D = 7000;
const ease = (x: number) => 1 - Math.pow(1 - x, 3);
const back = (x: number) => {
  if (x <= 0) return 0;
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
};
const seg = (t: number, a: number, b: number) => Math.min(1, Math.max(0, (t - a) / (b - a)));
const v = (n: string) => `var(--color-${n})`;

const TRUNK = 'M150 318 C146 270 156 220 150 168';
const BRANCHES = [
  { d: 'M150 252 C 130 238, 112 224, 96 200', a: 0.34, w: 8 },
  { d: 'M151 228 C 172 214, 190 198, 206 176', a: 0.38, w: 8 },
  { d: 'M150 200 C 136 184, 124 168, 118 146', a: 0.42, w: 6 },
  { d: 'M151 194 C 165 178, 176 162, 182 140', a: 0.45, w: 6 },
];
const CANOPY: [number, number, number, string][] = [
  [100, 172, 40, 'accent-2-600'], [202, 166, 42, 'accent-2-600'], [80, 196, 26, 'accent-2-700'], [224, 190, 28, 'accent-2-700'],
  [150, 142, 54, 'accent-2-500'], [120, 120, 38, 'accent-2-400'], [182, 118, 38, 'accent-2-500'], [150, 98, 40, 'accent-2-400'],
];
const SPOTS = [[110, 152], [190, 142], [150, 122], [92, 186], [212, 182], [140, 172], [172, 96], [126, 104]];
const PANTRY = ['🍅', '🥕', '🧀', '🍋', '🥖', '🍄', '🥑', '🌶️'];
const SOIL = [[118, 314], [140, 306], [164, 310], [186, 315], [150, 316]];

const now = () => performance.now();
const caption = (t: number) =>
  t < 0.1 ? 'Turning the soil' : t < 0.34 ? 'Putting down roots' : t < 0.68 ? 'Branching out' : 'Ripening';

type Els = Record<string, Element | null>;

/** Writes one frame to the SVG through refs; `el` is ms into the cycle, `t` its 0..1 progress. */
function paint(r: Els, t: number, el: number, still: boolean) {
  const set = (k: string, attrs: Record<string, string | number>) => {
    const node = r[k];
    if (node) for (const a in attrs) node.setAttribute(a, String(attrs[a]));
  };
  const m = ease(seg(t, 0, 0.1));
  set('mound', { d: `M56 324 C 92 ${324 - 34 * m}, 208 ${324 - 34 * m}, 244 324 Z` });
  set('shadow', { rx: 120 * m });
  const sp = seg(t, 0.04, 0.1);
  SOIL.forEach(([, y], i) => set(`soil${i}`, { r: 2.4 * sp, cy: y + (1 - sp) * 14 }));
  const L = t < 0.22 ? 0.18 * ease(seg(t, 0.08, 0.22)) : 0.18 + 0.82 * ease(seg(t, 0.22, 0.5));
  set('trunk', { 'stroke-dashoffset': 1 - L, 'stroke-width': 4 + 12 * ease(seg(t, 0.2, 0.6)) });
  BRANCHES.forEach((b, i) => set(`branch${i}`, { 'stroke-dashoffset': 1 - ease(seg(t, b.a, b.a + 0.12)) }));
  set('leaves', { transform: `translate(150 168) scale(${back(seg(t, 0.12, 0.22)) * (1 - seg(t, 0.48, 0.58))})` });
  CANOPY.forEach(([, , rad], i) => set(`canopy${i}`, { r: rad * back(seg(t, 0.46 + i * 0.03, 0.6 + i * 0.03)) }));
  SPOTS.forEach(([x, y], i) => {
    const bob = still ? 0 : Math.sin(el / 600 + i) * 1.2 * seg(t, 0.9, 1);
    set(`fruit${i}`, { transform: `translate(${x} ${y + bob}) scale(${back(seg(t, 0.7 + i * 0.022, 0.78 + i * 0.022))})` });
  });
  set('sway', { transform: `rotate(${still ? 0 : Math.sin(el / 900) * 1.4 * seg(t, 0.5, 0.8)} 150 318)` });
}

function usePrefersReducedMotion() {
  const q = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => typeof matchMedia === 'function' && matchMedia(q).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(q);
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

interface LoadingScreenProps {
  variant: 'full' | 'inline';
  /** Accessible name; defaults to "Loading". */
  label?: string;
}

export function LoadingScreen({ variant, label = 'Loading' }: LoadingScreenProps) {
  const reduced = usePrefersReducedMotion();
  const els = useRef<Els>({});
  const reg = (k: string) => (n: Element | null) => {
    els.current[k] = n;
  };
  const captionRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const fadeRef = useRef<SVGGElement>(null);
  const inline = variant === 'inline';

  useLayoutEffect(() => {
    const text = (t: number) => {
      if (captionRef.current) captionRef.current.textContent = caption(t);
      if (barRef.current) barRef.current.style.width = `${Math.round(ease(t) * 100)}%`;
    };
    const start = now();
    const elapsed = () => (now() - start) % (D + 700);
    if (reduced) {
      paint(els.current, 1, 0, true);
      fadeRef.current?.setAttribute('opacity', '1');
      const tick = () => text(Math.min(1, elapsed() / D));
      tick();
      const id = setInterval(tick, 250);
      return () => clearInterval(id);
    }
    let raf = 0;
    const frame = () => {
      const el = elapsed();
      const t = Math.min(1, el / D);
      paint(els.current, t, el, false);
      fadeRef.current?.setAttribute('opacity', String(1 - seg(el, D, D + 450)));
      text(t);
      raf = requestAnimationFrame(frame);
    };
    frame();
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  return (
    <div
      role="status"
      aria-label={label}
      className={cn(
        'flex flex-col items-center',
        inline ? 'gap-4 py-4' : 'min-h-dvh justify-center gap-7 bg-surface'
      )}
    >
      <span className="sr-only">{label}</span>
      <svg
        aria-hidden="true"
        viewBox="0 0 300 380"
        className={inline ? 'h-[180px] w-auto' : 'w-[min(300px,80vw)] h-auto'}
      >
        <g ref={fadeRef}>
          <ellipse ref={reg('shadow')} cx="150" cy="324" ry="9" fill={v('neutral-300')} />
          <g ref={reg('sway')}>
            <path ref={reg('trunk')} d={TRUNK} pathLength="1" strokeDasharray="1" fill="none" stroke={v('accent-900')} strokeLinecap="round" />
            {BRANCHES.map((b, i) => (
              <path key={i} ref={reg(`branch${i}`)} d={b.d} pathLength="1" strokeDasharray="1" fill="none" stroke={v('accent-900')} strokeWidth={b.w} strokeLinecap="round" />
            ))}
            {CANOPY.map(([cx, cy, , c], i) => (
              <circle key={i} ref={reg(`canopy${i}`)} cx={cx} cy={cy} fill={v(c)} />
            ))}
            {PANTRY.map((e, i) => (
              <g key={i} ref={reg(`fruit${i}`)}>
                <text textAnchor="middle" dominantBaseline="central" fontSize="22">{e}</text>
              </g>
            ))}
            <g ref={reg('leaves')}>
              <ellipse cx="-9" cy="-3" rx="10" ry="4.5" transform="rotate(-28 -9 -3)" fill={v('accent-2-500')} />
              <ellipse cx="9" cy="-6" rx="10" ry="4.5" transform="rotate(28 9 -6)" fill={v('accent-2-400')} />
            </g>
          </g>
          <path ref={reg('mound')} fill={v('accent-700')} />
          {SOIL.map(([cx], i) => (
            <circle key={i} ref={reg(`soil${i}`)} cx={cx} fill={v('accent-800')} />
          ))}
        </g>
      </svg>
      <div className="flex flex-col items-center gap-3.5">
        <div
          ref={captionRef}
          aria-hidden="true"
          className={cn('font-heading text-text-primary', inline ? 'text-lg' : 'text-[22px]')}
        >
          Turning the soil
        </div>
        <div aria-hidden="true" className="h-2 w-40 overflow-hidden rounded-full bg-neutral-300">
          <div ref={barRef} className="h-full w-0 rounded-full bg-accent" />
        </div>
      </div>
    </div>
  );
}
