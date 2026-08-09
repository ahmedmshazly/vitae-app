/**
 * Authentication & authorization (SRS INT-1, FR-SET-001, T1).
 *
 * DEFAULT-DENY: every route is gated except those explicitly registered as
 * public (`/health`, `/api/v1/auth/*`). A request is authorized only if it
 * carries either (a) a valid Firebase ID token (Google sign-in) or (b) a valid
 * dev-login session JWT, AND the resolved email equals OWNER_EMAIL. Anyone else
 * gets a neutral 401, no hint that an allow-list exists.
 */
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { auth, trustedAuth } from '../firebase.js';
import { env } from '../env.js';
import { currentRequestId } from './request-context.js';

export interface AuthedUser {
  email: string;
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
  return jwt.sign({ email: env.OWNER_EMAIL, via: 'dev' }, env.SESSION_SECRET, {
    expiresIn: '24h',
  });
}

async function resolveUser(token: string): Promise<AuthedUser | null> {
  // 1. Try our own dev-login JWT (fast, no network).
  try {
    const payload = jwt.verify(token, env.SESSION_SECRET) as { email?: string; via?: string };
    if (payload.email) return { email: payload.email.toLowerCase(), via: 'dev' };
  } catch {
    /* not a dev token, fall through */
  }
  // 2. Try a Firebase ID token (Google sign-in).
  try {
    const decoded = await auth.verifyIdToken(token);
    if (decoded.email) return { email: decoded.email.toLowerCase(), via: 'google' };
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
  //    OWNER_EMAIL gate below is unchanged, this widens which identity
  //    provider can prove "me", never who "me" is.
  if (trustedAuth) {
    try {
      const decoded = await trustedAuth.verifyIdToken(token);
      if (
        decoded.email &&
        decoded.email_verified === true &&
        decoded.firebase?.sign_in_provider === 'google.com'
      ) {
        return { email: decoded.email.toLowerCase(), via: 'google' };
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
      if (user?.email === env.OWNER_EMAIL.toLowerCase()) req.user = user;
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
  if (!user || user.email !== env.OWNER_EMAIL.toLowerCase()) {
    // Neutral message, never reveal the allow-list (SRS T1).
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'This is a private system.', request_id } });
    return;
  }

  req.user = user;
  next();
}
