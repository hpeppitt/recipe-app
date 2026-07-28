interface TagListProps {
  tags: string[];
}

/**
 * A recipe's tags.
 *
 * Extracted because this markup existed in three identical copies — the detail
 * view, the chat preview card and the shared page. UX-30 had to patch dark-mode
 * colours in all three, and its own finding text listed only two of them, which
 * is exactly the cost of the duplication: a change that looks complete but is not.
 *
 * Owns the wrapper as well as the pills, so the flex container and gap cannot
 * drift between call sites either. Renders nothing when there are no tags, so
 * callers do not each repeat a length check.
 */
export function TagList({ tags }: TagListProps) {
  if (tags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300 text-xs"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}
