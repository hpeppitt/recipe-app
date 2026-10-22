import { Link } from 'react-router-dom';
import { Refrigerator, ChevronRight } from '../ui/icons';

/** The green "What have you got?" card: opens Search with the pantry sheet (RL-169). Shared by Explore and Create. */
export function PantryCard({ className = '' }: { className?: string }) {
  return (
    <Link
      to="/search?sheet=pantry"
      className={`flex items-center gap-3.5 rounded-[30px] bg-accent-2-200 p-[18px] hover:bg-accent-2-300 active:bg-accent-2-300 text-accent-2-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 ${className}`}
    >
      <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface text-accent-2-700">
        <Refrigerator className="size-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-heading text-lg leading-tight">What have you got?</span>
        <span className="block text-[13px]">Find or write a recipe from your fridge.</span>
      </span>
      <ChevronRight className="size-5 shrink-0" />
    </Link>
  );
}
