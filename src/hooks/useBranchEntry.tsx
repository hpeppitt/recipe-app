import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { SignUpDialog } from '../components/auth/SignUpDialog';
import { canGenerate } from '../lib/generation';

const BODY =
  'Branches are new recipes written by AI, so they need an account with an email. Your branch is credited to you and the original stays as it is.';

/**
 * Every branch entry point goes through `branch(path)`: whoever cannot generate gets the 5a
 * sheet instead of the full-page gate on /vary. While auth loads it navigates, so the route's
 * own gate decides and a signed-in user never sees the sheet flash. Render `signUp` once.
 */
export function useBranchEntry(): { branch: (path: string) => void; signUp: ReactNode } {
  const navigate = useNavigate();
  const { user, isConfigured, isLoading } = useAuth();
  const [open, setOpen] = useState(false);
  const branch = (path: string) => {
    if (!isLoading && !canGenerate({ isConfigured, user })) setOpen(true);
    else navigate(path);
  };
  const signUp = <SignUpDialog open={open} action={{ kind: 'branch' }} body={BODY} onClose={() => setOpen(false)} />;
  return { branch, signUp };
}
