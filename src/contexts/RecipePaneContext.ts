import { createContext } from 'react';

/**
 * The recipe open in the wide-screen right pane (RL-116), or null when there is no pane.
 * The shell routes render against the list's location in pane mode, so they cannot read
 * the recipe id from the URL; this carries it to AppShell and the list rows.
 */
export const RecipePaneContext = createContext<string | null>(null);
