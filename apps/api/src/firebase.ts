/**
 * Firebase Admin initialization: AUTH ONLY (ADR 0005).
 *
 * The data plane is Postgres; Firebase stayed for sign-in because
 * `verifyIdToken` is free, unmetered, and was never the constraint that forced
 * the migration. When FIREBASE_AUTH_EMULATOR_HOST is set (local dev) the Admin
 * SDK targets the local Auth emulator and needs no service-account key.
 */
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { env } from './env.js';

let app: App;
if (getApps().length === 0) {
  const useEmulators = env.usingEmulators;
  app = initializeApp({
    projectId: env.FIREBASE_PROJECT_ID,
    // In production a service account would be provided via GOOGLE_APPLICATION_CREDENTIALS
    // or an explicit cert(); against emulators, credentials are irrelevant.
    ...(useEmulators || !process.env.GOOGLE_APPLICATION_CREDENTIALS
      ? {}
      : { credential: cert(JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS)) }),
  });
} else {
  app = getApps()[0]!;
}

export const auth: Auth = getAuth(app);

/**
 * Verifier for a second, trusted Firebase project (the companion app's).
 *
 * Verification needs no credentials for that project, an ID token is signed by
 * Google's shared secure-token keys, and the Admin SDK checks `aud`/`iss`
 * against the app's configured projectId. So this is a named app with nothing
 * but a project id, not hand-rolled JWT parsing.
 */
const TRUSTED_APP_NAME = 'trusted-issuer';
export const trustedAuth: Auth | null = env.TRUSTED_FIREBASE_PROJECT_ID
  ? getAuth(
      getApps().find((a) => a.name === TRUSTED_APP_NAME) ??
        initializeApp({ projectId: env.TRUSTED_FIREBASE_PROJECT_ID }, TRUSTED_APP_NAME),
    )
  : null;

export { app };
