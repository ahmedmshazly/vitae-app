import type { Request } from 'express';
import { Router } from 'express';
import { env } from '../../env.js';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { issueDevToken } from '../../middleware/auth.js';

export const authRouter: Router = Router();

/**
 * Is this request local? FR-015: developer sign-in is defence-in-depth, not a
 * single boolean, even with the flag on, it only answers callers on the
 * loopback interface, so a flag left on in any network-accessible environment
 * cannot hand an owner token to the internet.
 */
function isLoopback(req: Request): boolean {
  const ip = req.socket.remoteAddress ?? '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

/** Developer sign-in shortcut (SRS FR-SET-001, behind AUTH_ENABLE_DEV_LOGIN). */
authRouter.post(
  '/dev-login',
  asyncHandler(async (req, res) => {
    if (!env.AUTH_ENABLE_DEV_LOGIN) {
      throw new HttpError(403, 'DEV_LOGIN_DISABLED', 'Developer sign-in is disabled.');
    }
    if (!isLoopback(req)) {
      throw new HttpError(403, 'DEV_LOGIN_REMOTE', 'Developer sign-in only answers local requests.');
    }
    const token = issueDevToken();
    res.cookie('vitae_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000,
    });
    // The token is the session; it goes out as an httpOnly cookie. Echoing it in
    // the body would put an owner credential in JS reach and in every proxy log
    //, tests and the local web client read it from the cookie. The exception is
    // an emulator run, where supertest has no cookie jar.
    if (env.usingEmulators) {
      res.json({ token, user: { email: env.OWNER_EMAIL, via: 'dev' } });
      return;
    }
    res.json({ user: { email: env.OWNER_EMAIL, via: 'dev' } });
  }),
);

authRouter.post('/logout', (_req, res) => {
  res.clearCookie('vitae_session');
  res.json({ ok: true });
});

/**
 * Who am I (the gate has already verified the token).
 *
 * `self` is the `is_self` person node subject pickers use for "That's me".
 * Memoised per data space. Null when signed out or before self exists.
 */
authRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    let self: { id: string; title: string } | null = null;
    if (req.user) {
      try {
        const { getSelf } = await import('../../services/self.js');
        const node = await getSelf();
        if (node) self = { id: node.id, title: node.title };
      } catch {
        // Auth must not fail when the graph/db is degraded. The owner check
        // already passed; leave self null until the graph is up.
        self = null;
      }
    }
    res.json({ user: req.user ?? null, self, devLoginEnabled: env.AUTH_ENABLE_DEV_LOGIN });
  }),
);
