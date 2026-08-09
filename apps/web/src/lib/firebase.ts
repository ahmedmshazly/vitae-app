/**
 * Firebase Web SDK bootstrap for Google sign-in (SRS INT-1, docs/DEPLOYMENT.md
 * §4). Active whenever a web config is inlined at build time
 * (VITE_FIREBASE_API_KEY). In a dev build the emulator flag additionally routes
 * auth at the local Auth emulator, whose own account chooser exercises the real
 * `via: 'google'` path without a Firebase project.
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  connectAuthEmulator,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { isLocalDeveloperRuntime } from './runtime.js';

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined;
const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined;
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined;

/**
 * Emulator wiring points auth at a loopback address, which is only ever correct
 * on the developer's own machine, in a deployed bundle it would aim every
 * visitor's sign-in at *their* 127.0.0.1. The build mode, not just the flag,
 * decides: `import.meta.env.DEV` is false in anything Vite builds for
 * production, so no environment variable can switch this on in a shipped SPA.
 */
const useEmulator =
  isLocalDeveloperRuntime &&
  (import.meta.env.VITE_FIREBASE_USE_EMULATOR as string | undefined) === 'true';
const emulatorHost =
  (import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST as string | undefined) ?? 'http://127.0.0.1:9099';
const usesDemoConfig =
  apiKey === 'demo-api-key' ||
  authDomain === 'vitae-local.firebaseapp.com' ||
  projectId === 'vitae-local';

/** Whether the build carries a usable Google sign-in configuration. */
export const googleSignInAvailable = Boolean(
  apiKey && authDomain && projectId && (useEmulator || !usesDemoConfig),
);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

function firebaseAuth(): Auth {
  if (!googleSignInAvailable) throw new Error('Google sign-in is not configured in this build.');
  if (!auth) {
    app = initializeApp({
      apiKey,
      authDomain,
      projectId,
    });
    auth = getAuth(app);
    // Emulator mode must be declared before any auth call goes out.
    if (useEmulator) connectAuthEmulator(auth, emulatorHost, { disableWarnings: true });
  }
  return auth;
}

/** Open the Google account chooser; resolves once Firebase holds the session. */
export async function signInWithGoogle(): Promise<void> {
  await signInWithPopup(firebaseAuth(), new GoogleAuthProvider());
}

/** Subscribe to Firebase session changes (no-op unsubscribe when not configured). */
export function watchFirebaseUser(cb: (user: User | null) => void): () => void {
  if (!googleSignInAvailable) return () => {};
  return onAuthStateChanged(firebaseAuth(), cb);
}

/** Current ID token for the API's Bearer check; null when signed out. */
export async function currentIdToken(): Promise<string | null> {
  const user = auth?.currentUser;
  return user ? user.getIdToken() : null;
}

export async function firebaseSignOut(): Promise<void> {
  if (auth) await signOut(auth);
}
