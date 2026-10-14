import { afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext, type AuthContextType } from '../contexts/AuthContext';
import type { AppUser } from '../types/recipe';

// No vitest globals, so testing-library's automatic cleanup is not registered.
afterEach(cleanup);

export const fakeUser: AppUser = {
  uid: 'test-user',
  displayName: 'Test Cook',
  email: 'cook@example.com',
  isAnonymous: false,
  emailVerified: true,
};

const noop = async () => {};

/**
 * Renders under MemoryRouter and a fake auth context, so tests never touch Firebase.
 * Pass `user: null` for signed out; `auth` overrides any other context field.
 */
export function renderWithProviders(
  ui: ReactElement,
  { user = fakeUser, route = '/', auth }: { user?: AppUser | null; route?: string; auth?: Partial<AuthContextType> } = {}
) {
  const value: AuthContextType = {
    user,
    isLoading: false,
    isConfigured: true,
    signInAnonymously: noop,
    sendEmailLink: noop,
    linkEmail: noop,
    signOut: noop,
    updateDisplayName: noop,
    linkState: { status: 'idle' },
    submitLinkEmail: noop,
    dismissLinkState: () => {},
    ...auth,
  };
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthContext.Provider value={value}>{ui}</AuthContext.Provider>
    </MemoryRouter>
  );
}
