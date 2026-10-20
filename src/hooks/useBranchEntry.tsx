import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { SignUpDialog } from '../components/auth/SignUpDialog';
import { canGenerate } from '../lib/generation';

const BODY =
  'Branches are new recipes written by AI, so they need an account with an email. Your branch is credited to you and the original stays as it is.';

/**
 * Every branch entry point goes through `branch(recipeId)`, which opens that recipe's /vary;
 * whoever cannot generate gets the 5a sheet, whose link remembers the branch (RL-135), instead of the full-page gate on /vary. While auth loads it navigates, so the route's
 * own gate decides and a signed-in user never sees the sheet flash. Render `signUp` once.
 */
export function useBranchEntry(): { branch: (recipeId: string) => void; signUp: ReactNode } {
  const navigate = useNavigate();
  const { user, isConfigured, isLoading } = useAuth();
  const [target, setTarget] = useState<string | null>(null);
  const branch = (recipeId: string) => {
    if (!isLoading && !canGenerate({ isConfigured, user })) setTarget(recipeId);
    else navigate(`/recipe/${recipeId}/vary`);
  };
  const signUp = (
    <SignUpDialog
      open={target !== null}
      action={{ kind: 'branch' }}
      body={BODY}
      onClose={() => setTarget(null)}
      pending={target === null ? undefined : { kind: 'branch', recipeId: target }}
    />
  );
  return { branch, signUp };
}
