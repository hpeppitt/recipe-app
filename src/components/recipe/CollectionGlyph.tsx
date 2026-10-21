import type { RecipeCollection } from '../../services/firestore';

/** The 52px 2x2 emoji square of a collection row; a dot stands for a recipe not on this device. */
export function CollectionGlyph({ collection, emoji }: { collection: RecipeCollection; emoji: Map<string, string> }) {
  return (
    <span aria-hidden="true" className="grid size-[52px] shrink-0 grid-cols-2 place-items-center rounded-[18px] bg-surface text-sm">
      {[0, 1, 2, 3].map((i) => {
        const id = collection.recipeIds[i];
        return id === undefined ? <span key={i} /> : <span key={i}>{emoji.get(id) ?? <span className="inline-block size-2.5 rounded-full bg-neutral-300" />}</span>;
      })}
    </span>
  );
}
