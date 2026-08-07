import { Button } from '../ui/Button';

/**
 * Teaches the one idea the whole app is built on: changing a recipe makes a new
 * version rather than overwriting it.
 *
 * Nothing taught this before. The library welcome panel described it in prose,
 * which the people who most need it skip, and `Create Variation` sat on every
 * recipe with no hint that it produces a child rather than editing this one. A
 * user could get all the way through the app without discovering the feature it
 * exists for.
 *
 * The diagram is deliberately built from the same borders the real version tree
 * uses (`border-l-2 border-border`, `ml-3 pl-3`), so recognising it later on
 * `/recipe/:id/tree` is the point rather than a coincidence.
 *
 * @param onDismiss Records it as seen. There is no "remind me later": either the
 *   idea landed or it did not, and re-showing it is nagging.
 * @param onOpenTree Optional. Offered only when this recipe actually has
 *   variations, since sending someone to a tree with one node teaches nothing.
 */
export function TreeIntro({
  onDismiss,
  onOpenTree,
}: {
  onDismiss: () => void;
  onOpenTree?: () => void;
}) {
  return (
    <section
      aria-labelledby="tree-intro-heading"
      className="border border-primary-200 bg-primary-50/50 dark:border-primary-800 dark:bg-primary-950/40 rounded-2xl p-4 space-y-3"
    >
      <div>
        <h2
          id="tree-intro-heading"
          className="text-sm font-semibold text-text-primary"
        >
          Recipes here branch instead of being overwritten
        </h2>
        <p className="text-xs text-text-secondary mt-1">
          Ask for a change and you get a new version that remembers where it came
          from. The original stays exactly as it was, so you can cook either one, or
          compare them.
        </p>
      </div>

      {/* aria-hidden: the list below is decorative, and the paragraph above
          already carries the meaning for a screen reader. */}
      <div
        aria-hidden="true"
        className="text-xs bg-surface rounded-xl border border-border p-3"
      >
        <div className="flex items-center gap-2 text-text-primary">
          <span>🍞</span>
          <span className="font-medium">Banana bread</span>
        </div>
        <div className="ml-3 mt-2 space-y-2 border-l-2 border-border pl-3">
          <div className="flex items-center gap-2 text-text-secondary">
            <span>🥜</span>
            <span>with walnuts</span>
          </div>
          <div>
            <div className="flex items-center gap-2 text-text-secondary">
              <span>🍫</span>
              <span>less sugar</span>
            </div>
            {/* A grandchild, because the tree is not just one level deep and that
                is the part prose fails to convey. */}
            <div className="ml-3 mt-2 border-l-2 border-border pl-3">
              <div className="flex items-center gap-2 text-text-tertiary">
                <span>🍌</span>
                <span>less sugar, extra banana</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onDismiss}>
          Got it
        </Button>
        {onOpenTree && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              onDismiss();
              onOpenTree();
            }}
          >
            See this recipe's versions
          </Button>
        )}
      </div>
    </section>
  );
}
