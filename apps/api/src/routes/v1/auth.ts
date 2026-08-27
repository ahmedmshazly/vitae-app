import type { Request } from 'express';
import { Router } from 'express';
import { env } from '../../env.js';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { issueDevToken } from '../../middleware/auth.js';
import { cloudEnabled } from '../../cloud/config.js';
import { runInWorkspace } from '../../db/space.js';
import {
  IdentityConflictError,
  bootstrapPersonalWorkspace,
  ensureWorkspaceSelf,
  resolveWorkspaceForUser,
} from '../../services/control-plane.js';

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

function sessionCookie(): {
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  path: string;
  maxAge?: number;
} {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000,
  };
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
    res.cookie('vitae_session', token, sessionCookie());
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
  const cookie = sessionCookie();
  res.clearCookie('vitae_session', {
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    secure: cookie.secure,
    path: cookie.path,
  });
  res.json({ ok: true });
});

/**
 * Idempotent Cloud enrollment. Auth has already verified a Firebase UID; this
 * endpoint is deliberately not public even though `/me` is, because it creates
 * a private workspace and starts a trial.
 */
authRouter.post(
  '/bootstrap',
  asyncHandler(async (req, res) => {
    if (!cloudEnabled()) {
      throw new HttpError(409, 'SELF_HOSTED_MODE', 'Cloud account creation is not enabled for this installation.');
    }
    if (!req.user) throw new HttpError(401, 'UNAUTHENTICATED', 'Sign-in required.');
    try {
      const result = await bootstrapPersonalWorkspace(req.user);
      const self = await runInWorkspace(result.workspace.id, () => ensureWorkspaceSelf(req.user!));
      res.status(result.created ? 201 : 200).json({
        user: req.user,
        workspace: result.workspace,
        self,
        created: result.created,
        claimedLegacy: result.claimedLegacy,
      });
    } catch (error) {
      if (error instanceof IdentityConflictError) {
        throw new HttpError(409, 'IDENTITY_CONFLICT', 'This account cannot be enrolled automatically.');
      }
      throw error;
    }
  }),
);

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
    let workspace: Awaited<ReturnType<typeof resolveWorkspaceForUser>> = null;
    if (req.user) {
      try {
        if (cloudEnabled()) {
          workspace = await resolveWorkspaceForUser(req.user.uid);
          if (workspace) {
            const { getSelf } = await import('../../services/self.js');
            const node = await runInWorkspace(workspace.id, () => getSelf());
            if (node) self = { id: node.id, title: node.title };
          }
        } else {
          const { getSelf } = await import('../../services/self.js');
          const node = await getSelf();
          if (node) self = { id: node.id, title: node.title };
        }
      } catch {
        // Auth must not fail when the graph/db is degraded. The owner check
        // already passed; leave self null until the graph is up.
        self = null;
      }
    }
    res.json({
      user: req.user ?? null,
      workspace,
      self,
      cloudEnabled: cloudEnabled(),
      devLoginEnabled: env.AUTH_ENABLE_DEV_LOGIN,
    });
  }),
);
