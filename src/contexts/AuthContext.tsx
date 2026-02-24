import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { AppUser } from '../types/recipe';
import type { User } from '../services/firebase';
import {
  isFirebaseConfigured,
  auth,
  onAuthStateChanged,
  signInAnonymously,
  sendEmailSignInLink,
  completeEmailSignIn,
  setDisplayName,
  signOut,
} from '../services/firebase';
import { generateDisplayName } from '../lib/identity';

interface AuthContextType {
  user: AppUser | null;
  isLoading: boolean;
  isConfigured: boolean;
  signInAnonymously: () => Promise<void>;
  sendEmailLink: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateDisplayName: (name: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function toAppUser(user: User): AppUser {
  return {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    isAnonymous: user.isAnonymous,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(isFirebaseConfigured);

  useEffect(() => {
    if (!isFirebaseConfigured) return;

    completeEmailSignIn().catch(() => {});

    return onAuthStateChanged((fbUser) => {
      setUser(fbUser ? toAppUser(fbUser) : null);
      setIsLoading(false);
    });
  }, []);

  const handleSignInAnonymously = async () => {
    const result = await signInAnonymously();
    // Auto-assign a fun display name for anonymous users
    if (result.user && !result.user.displayName) {
      const name = generateDisplayName(result.user.uid);
      await setDisplayName(name);
      setUser(toAppUser({ ...result.user, displayName: name } as User));
    }
  };

  const handleSendEmailLink = async (email: string) => {
    await sendEmailSignInLink(email);
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const handleUpdateDisplayName = async (name: string) => {
    await setDisplayName(name);
    if (auth?.currentUser) {
      setUser(toAppUser(auth.currentUser));
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isConfigured: isFirebaseConfigured,
        signInAnonymously: handleSignInAnonymously,
        sendEmailLink: handleSendEmailLink,
        signOut: handleSignOut,
        updateDisplayName: handleUpdateDisplayName,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
