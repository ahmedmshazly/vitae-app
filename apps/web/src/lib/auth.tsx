/**
 * Auth context.
 *
 * Self-hosted installs retain their owner-only gate. Cloud installs use the
 * same verified Google identity to bootstrap or resume one private workspace.
 * The browser never chooses a workspace by itself: it only renders the
 * server-derived membership returned by `/auth/me`.
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
  uid?: string;
  email: string;
  emailVerified?: boolean;
  via: 'google' | 'dev';
}

export interface WorkspaceAccess {
  id: string;
  role: 'owner' | 'member';
  accessState: 'trialing' | 'active' | 'past_due' | 'read_only' | 'deletion_pending';
  trialEndsAt: string | null;
  graceEndsAt: string | null;
  deletionScheduledAt: string | null;
}

interface MeResponse {
  user: User | null;
  workspace?: WorkspaceAccess | null;
  cloudEnabled?: boolean;
  devLoginEnabled: boolean;
}

interface BootstrapResponse {
  user: User;
  workspace: WorkspaceAccess;
}

interface AuthState {
  user: User | null;
  workspace: WorkspaceAccess | null;
  loading: boolean;
  /** Cloud launch is a server decision, never a public build guess. */
  cloudEnabled: boolean;
  /** A setup issue keeps the person at the door instead of opening a broken workspace. */
  accountError: string | null;
  devLoginEnabled: boolean;
  googleEnabled: boolean;
  signInDev: () => Promise<void>;
  signInGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [devLoginEnabled, setDevLoginEnabled] = useState(false);

  type RefreshResult = { user: User | null; accountError: string | null };

  function applyMe(me: MeResponse, setupError: string | null = null): RefreshResult {
    const isCloud = me.cloudEnabled === true;
    setUser(me.user);
    setWorkspace(me.workspace ?? null);
    setCloudEnabled(isCloud);
    setAccountError(setupError);
    setDevLoginEnabled(me.devLoginEnabled);
    return { user: me.user, accountError: setupError };
  }

  async function refresh(): Promise<RefreshResult> {
    try {
      let me = await api.get<MeResponse>('/auth/me');
      // A Cloud account is usable only after the server has created and
      // selected its private workspace. The operation is idempotent, making a
      // restored Google session and a just-completed sign-in behave identically.
      if (me.user && me.cloudEnabled && !me.workspace) {
        try {
          const bootstrap = await api.post<BootstrapResponse>('/auth/bootstrap');
          me = { ...me, user: bootstrap.user, workspace: bootstrap.workspace };
        } catch (error) {
          const message =
            error instanceof ApiError
              ? error.message
              : 'Your private workspace could not be prepared. Try again shortly.';
          return applyMe(me, message);
        }
      }
      return applyMe(me);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        setWorkspace(null);
        setAccountError(null);
      }
      // Unauthenticated: only local dev builds may offer the dev shortcut.
      setDevLoginEnabled(isLocalDeveloperRuntime);
      return { user: null, accountError: null };
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
    const outcome = await refresh();
    if (outcome.accountError) throw new Error(outcome.accountError);
  }

  async function signInGoogle() {
    await signInWithGoogle();
    try {
      const outcome = await refresh();
      if (!outcome.user) {
        await firebaseSignOut();
        throw new Error('This Google account is not authorized for this system.');
      }
      if (outcome.accountError) throw new Error(outcome.accountError);
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
    setWorkspace(null);
    setAccountError(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        workspace,
        loading,
        cloudEnabled,
        accountError,
        devLoginEnabled,
        googleEnabled: googleSignInAvailable,
        signInDev,
        signInGoogle,
        signOut,
      }}
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
