/**
 * Auth context. Two ways in, both ending at the API's owner check:
 *  - Production: Google sign-in via the Firebase Web SDK; every API request
 *    carries the ID token as a Bearer header (see setAuthTokenProvider).
 *  - Local dev: the "Developer sign-in" path calls the API's dev-login
 *    endpoint, which sets an httpOnly session cookie.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, setAuthTokenProvider } from './api.js';
import {
  currentIdToken,
  firebaseSignOut,
  googleSignInAvailable,
  signInWithGoogle,
  watchFirebaseUser,
} from './firebase.js';
import { isLocalDeveloperRuntime } from './runtime.js';

export interface User {
  email: string;
  via: 'google' | 'dev';
}

interface AuthState {
  user: User | null;
  loading: boolean;
  devLoginEnabled: boolean;
  googleEnabled: boolean;
  signInDev: () => Promise<void>;
  signInGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [devLoginEnabled, setDevLoginEnabled] = useState(false);

  async function refresh(): Promise<User | null> {
    try {
      const me = await api.get<{ user: User | null; devLoginEnabled: boolean }>('/auth/me');
      setUser(me.user);
      setDevLoginEnabled(me.devLoginEnabled);
      return me.user;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setUser(null);
      // Unauthenticated: only local dev builds may offer the dev shortcut.
      setDevLoginEnabled(isLocalDeveloperRuntime);
      return null;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!googleSignInAvailable) {
      void refresh();
      return;
    }
    // Bearer mode: every API call reads the current Firebase ID token, and a
    // session change (sign-in, sign-out, token restore on reload) re-asks the
    // API who we are.
    setAuthTokenProvider(currentIdToken);
    // Dev builds reach Firebase through the Auth emulator, whose first
    // onAuthStateChanged can lag by seconds. Until it fires nothing has asked
    // the API who we are, so `devLoginEnabled` is false and the sign-in screen
    // renders no developer button, which is what made the e2e sign-in helper
    // flake. Ask immediately as well; the listener still corrects the answer.
    // Production keeps waiting for Firebase alone, so a restored Google session
    // never flashes as signed-out.
    if (isLocalDeveloperRuntime) void refresh();
    return watchFirebaseUser(() => void refresh());
  }, []);

  async function signInDev() {
    await api.post('/auth/dev-login');
    await refresh();
  }

  async function signInGoogle() {
    await signInWithGoogle();
    try {
      const me = await api.get<{ user: User | null; devLoginEnabled: boolean }>('/auth/me');
      setUser(me.user);
      setDevLoginEnabled(me.devLoginEnabled);
      if (!me.user) {
        await firebaseSignOut();
        throw new Error('This Google account is not authorized for this system.');
      }
    } catch (err) {
      await firebaseSignOut().catch(() => {});
      if (err instanceof Error && err.message.includes('not authorized')) throw err;
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        throw new Error('This Google account is not authorized for this system.');
      }
      throw new Error(
        err instanceof ApiError
          ? `Sign-in failed (${err.status}). The API may be degraded, try again shortly.`
          : 'Sign-in failed. Check your connection and try again.',
      );
    }
  }

  async function signOut() {
    await firebaseSignOut();
    await api.post('/auth/logout').catch(() => {});
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, devLoginEnabled, googleEnabled: googleSignInAvailable, signInDev, signInGoogle, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
