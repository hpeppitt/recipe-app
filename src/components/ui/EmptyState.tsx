interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  /**
   * Sized to sit inside a section rather than fill a page. Without this the
   * full-page treatment (6xl icon, 4rem of padding) dwarfs the list it belongs
   * to, which is why these spots had grown their own bare-paragraph styles.
   */
  compact?: boolean;
}

export function EmptyState({ icon = '📖', title, description, compact = false }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact ? 'py-6 px-4' : 'py-16 px-6'
      }`}
    >
      <span className={compact ? 'text-3xl mb-2' : 'text-6xl mb-4'}>{icon}</span>
      {/* A section-level empty state sits under an existing heading, so h2 would
          misreport the outline. Only the full-page variant is a real heading. */}
      {compact ? (
        <p className="text-sm font-medium text-text-secondary">{title}</p>
      ) : (
        <h2 className="text-lg font-semibold text-text-primary mb-1">{title}</h2>
      )}
      {description && (
        <p className={`text-sm text-text-secondary max-w-xs ${compact ? 'mt-1' : ''}`}>
          {description}
        </p>
      )}
    </div>
  );
}
