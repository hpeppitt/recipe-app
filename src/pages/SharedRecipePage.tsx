import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { decodeRecipeFromHash, type SharedRecipe } from '../lib/share';
import { MetadataPills } from '../components/recipe/MetadataPills';
import { IngredientList } from '../components/recipe/IngredientList';
import { InstructionList } from '../components/recipe/InstructionList';

export function SharedRecipePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [recipe, setRecipe] = useState<SharedRecipe | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const decoded = decodeRecipeFromHash(location.hash);
    if (decoded) {
      setRecipe(decoded);
    } else {
      setError(true);
    }
  }, [location.hash]);

  if (error) {
    return (
      <div className="min-h-dvh flex flex-col bg-surface">
        <header className="sticky top-0 z-30 bg-surface/80 backdrop-blur-md border-b border-border">
          <div className="flex items-center h-14 px-4 max-w-lg mx-auto">
            <h1 className="flex-1 text-lg font-semibold">Invalid Link</h1>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center space-y-3">
            <p className="text-4xl">🔗</p>
            <p className="text-text-secondary">This shared recipe link is invalid or corrupted.</p>
            <button
              onClick={() => navigate('/')}
              className="text-primary-600 text-sm font-medium"
            >
              Go to Recipe Lab
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!recipe) return null;

  return (
    <div className="min-h-dvh flex flex-col bg-surface">
      <header className="sticky top-0 z-30 bg-surface/80 backdrop-blur-md border-b border-border">
        <div className="flex items-center h-14 px-4 max-w-lg mx-auto">
          <h1 className="flex-1 text-lg font-semibold truncate">{recipe.title}</h1>
          <span className="ml-2 text-xs font-medium text-text-tertiary bg-surface-secondary rounded-full px-2.5 py-0.5">
            View only
          </span>
        </div>
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full">
        <div className="p-4 space-y-5">
          <div>
            <div className="flex items-start gap-3">
              <span className="text-4xl">{recipe.emoji}</span>
              <div>
                <h2 className="text-xl font-bold">{recipe.title}</h2>
                <p className="text-sm text-text-secondary mt-1">{recipe.description}</p>
              </div>
            </div>
          </div>

          <MetadataPills
            prepTime={recipe.prepTime}
            cookTime={recipe.cookTime}
            totalTime={recipe.totalTime}
            servings={recipe.servings}
            difficulty={recipe.difficulty}
          />

          <IngredientList ingredients={recipe.ingredients} />
          <InstructionList instructions={recipe.instructions} />

          {recipe.notes.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-semibold text-text-primary">Notes</h3>
              <ul className="space-y-1">
                {recipe.notes.map((note, i) => (
                  <li key={i} className="flex gap-2 text-sm text-text-secondary">
                    <span className="text-primary-500">💡</span>
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {recipe.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {recipe.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 text-xs"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </main>

      <div className="sticky bottom-0 p-4 bg-surface border-t border-border">
        <div className="max-w-lg mx-auto text-center">
          <p className="text-xs text-text-tertiary">
            Shared from <button onClick={() => navigate('/')} className="text-primary-600 font-medium">Recipe Lab</button>
          </p>
        </div>
      </div>
    </div>
  );
}
