import { matchPath } from 'react-router-dom';

/** The lists that open a recipe beside themselves on a wide screen (RL-116). */
export type ListOrigin = '/' | '/saved';

/** Navigation state a list row sets, so the recipe route knows which list it came from. */
export interface ListOriginState {
  listOrigin: ListOrigin;
}

/** Tailwind's `lg`. Below it every route renders as it did before RL-116. */
export const WIDE_QUERY = '(min-width: 64rem)';

export interface PaneMode {
  /** The list route to keep rendered in the left pane. */
  listPath: ListOrigin;
  /** The recipe shown in the right pane. */
  recipeId: string;
}

export const listOriginState = (listOrigin: ListOrigin): ListOriginState => ({ listOrigin });

/**
 * Whether to show the list and the recipe side by side. Only `/recipe/:id` on a wide
 * screen, and only when navigation state names the list it was opened from: a direct
 * visit or reload carries no state, so it shows the recipe alone instead of guessing.
 */
export function paneMode(pathname: string, state: unknown, wide: boolean): PaneMode | null {
  if (!wide) return null;
  const id = matchPath('/recipe/:id', pathname)?.params.id;
  if (!id) return null;
  const origin = carriedListOrigin(state)?.listOrigin;
  if (!origin) return null;
  return { listPath: origin, recipeId: decode(id) };
}

/**
 * The list origin in the current navigation state, for a link from one recipe to another to
 * pass on, so the hop stays in the shell at every width (2026-10-20). Undefined without one.
 */
export function carriedListOrigin(state: unknown): ListOriginState | undefined {
  const origin = typeof state === 'object' && state !== null ? (state as Partial<ListOriginState>).listOrigin : undefined;
  return origin === '/' || origin === '/saved' ? listOriginState(origin) : undefined;
}

// matchPath leaves params encoded; the route's useParams decodes them, so match that.
function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
