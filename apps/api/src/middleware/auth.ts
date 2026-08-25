/**
 * Authentication & authorization (SRS INT-1, FR-SET-001, NFR-SEC-001, T1).
 *
 * DEFAULT-DENY: every route is gated except those explicitly registered as
 * public (`/health`, `/api/v1/auth/*`). A request is authorized only if it
 * carries either (a) a verified Google Firebase ID token or (b) a valid local
 * dev-login session JWT. Self-hosted mode keeps the historical OWNER_EMAIL
 * allow-list; Cloud mode is explicitly opt-in and delegates tenancy to the
 * workspace middleware after this identity proof succeeds.
 */
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { auth, trustedAuth } from '../firebase.js';
import { env } from '../env.js';
import { currentRequestId } from './request-context.js';
import { cloudEnabled } from '../cloud/config.js';

export interface AuthedUser {
  /** Immutable Firebase UID (or deterministic dev identity), never an email key. */
  uid: string;
  email: string;
  emailVerified: boolean;
  via: 'google' | 'dev';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

const PUBLIC_PATHS = [
  /^\/health$/,
  /^\/api\/v1\/auth\/dev-login$/,
  /^\/api\/v1\/auth\/logout$/,
  /^\/api\/v1\/auth\/me$/,
];

export function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.some((re) => re.test(path));
}

/** Issue a dev-login session token (only when AUTH_ENABLE_DEV_LOGIN). */
export function issueDevToken(): string {
  return jwt.sign({ uid: `dev:${env.OWNER_EMAIL.toLowerCase()}`, email: env.OWNER_EMAIL, via: 'dev' }, env.SESSION_SECRET, {
    expiresIn: '24h',
  });
}

export async function resolveUser(token: string): Promise<AuthedUser | null> {
  // 1. Try our own dev-login JWT (fast, no network).
  try {
    const payload = jwt.verify(token, env.SESSION_SECRET) as { uid?: string; email?: string; via?: string };
    if (payload.email && payload.via === 'dev') {
      return {
        uid: payload.uid ?? `dev:${payload.email.toLowerCase()}`,
        email: payload.email.toLowerCase(),
        emailVerified: true,
        via: 'dev',
      };
    }
  } catch {
    /* not a dev token, fall through */
  }
  // 2. Try a Firebase ID token (Google sign-in).
  try {
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid ?? decoded.sub;
    if (
      decoded.email &&
      uid &&
      decoded.email_verified === true &&
      decoded.firebase?.sign_in_provider === 'google.com'
    ) {
      return {
        uid,
        email: decoded.email.toLowerCase(),
        emailVerified: true,
        via: 'google',
      };
    }
  } catch {
    /* invalid */
  }
  // 3. Try the trusted companion project (Aperture). A Firebase token is scoped
  //    to its issuing project, so the same human signed into the same Google
  //    account there presents a token this project cannot verify.
  //
  //    Held to a STRICTER bar than our own project: that project's sign-in
  //    methods are not ours to govern, so an unverified email or a non-Google
  //    provider could otherwise be used to assert the owner's address. The
  //    provider can prove an identity. Cloud mode subsequently resolves that
  //    identity to a workspace; self-host mode still applies OWNER_EMAIL.
  if (trustedAuth) {
    try {
      const decoded = await trustedAuth.verifyIdToken(token);
      const uid = decoded.uid ?? decoded.sub;
      if (
        decoded.email &&
        uid &&
        decoded.email_verified === true &&
        decoded.firebase?.sign_in_provider === 'google.com'
      ) {
        return {
          // Firebase UIDs are scoped to the issuing project. Prefix the
          // companion issuer so a coincidental UID can never alias a primary
          // Cloud account in the control plane.
          uid: `trusted:${uid}`,
          email: decoded.email.toLowerCase(),
          emailVerified: true,
          via: 'google',
        };
      }
    } catch {
      /* invalid */
    }
  }
  return null;
}

export async function authGate(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Inside a mounted middleware, req.path is stripped of the mount prefix
  // (e.g. "/api"); reconstruct the full path for the public-path check.
  const fullPath = req.baseUrl + req.path;
  if (fullPath === '/api/v1/auth/me') {
    const header = req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : req.cookies?.vitae_session;
    if (token) {
      const user = await resolveUser(token);
      if (user && (!cloudEnabled() ? user.email === env.OWNER_EMAIL.toLowerCase() : Boolean(user.uid))) req.user = user;
    }
    return next();
  }
  if (isPublicPath(fullPath)) return next();

  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.cookies?.vitae_session;
  const request_id = currentRequestId();
  if (!token) {
    res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sign-in required.', request_id } });
    return;
  }

  const user = await resolveUser(token);
  const allowed = cloudEnabled()
    ? Boolean(user?.uid && user.emailVerified && (user.via === 'google' || user.via === 'dev'))
    : user?.email === env.OWNER_EMAIL.toLowerCase();
  if (!user || !allowed) {
    // Neutral message, never reveal the allow-list (SRS T1).
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: cloudEnabled() ? 'A verified Google sign-in is required.' : 'This is a private system.',
        request_id,
      },
    });
    return;
  }

  req.user = user;
  next();
}
