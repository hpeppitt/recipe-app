interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
}

export function EmptyState({ icon = '📖', title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <span className="text-6xl mb-4">{icon}</span>
      <h2 className="text-lg font-semibold text-text-primary mb-1">{title}</h2>
      <p className="text-sm text-text-secondary max-w-xs">{description}</p>
    </div>
  );
}
