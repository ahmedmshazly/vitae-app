/** Server-derived Cloud workspace context and entitlement enforcement. */
import type { NextFunction, Request, Response } from 'express';
import { cloudEnabled } from '../cloud/config.js';
import { runInWorkspace } from '../db/space.js';
import { HttpError } from './error.js';
import { resolveWorkspaceForUser, type WorkspaceAccess } from '../services/control-plane.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      workspace?: WorkspaceAccess;
    }
  }
}

function isAuthControlPath(req: Request): boolean {
  const fullPath = req.baseUrl + req.path;
  return fullPath === '/api/v1/auth/bootstrap' || fullPath === '/api/v1/auth/me' || fullPath === '/api/v1/auth/logout';
}

/**
 * The documentation corpus is a property of the installation, not of a tenant.
 *
 * Resolving a workspace for it would make reading the documentation depend on
 * having finished account setup, which has nothing to do with it: a signed-in
 * owner who had not bootstrapped would be told to finish setup before they
 * could read the page explaining how. The router has its own owner check, so
 * skipping workspace resolution here removes a coupling rather than a gate.
 */
function isInstanceDocsPath(req: Request): boolean {
  return (req.baseUrl + req.path).startsWith('/api/v1/docs');
}

/**
 * Resolve workspace after auth. The optional header chooses among memberships;
 * it cannot create a workspace context by itself and Cloud mode ignores the
 * legacy x-vitae-space header entirely.
 */
export function workspaceMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (!cloudEnabled() || !req.user || isAuthControlPath(req) || isInstanceDocsPath(req)) {
    next();
    return;
  }

  const requested = req.header('x-vitae-workspace')?.trim() || undefined;
  void resolveWorkspaceForUser(req.user.uid, requested)
    .then((workspace) => {
      if (!workspace) {
        next(
          new HttpError(
            requested ? 404 : 409,
            requested ? 'WORKSPACE_NOT_FOUND' : 'WORKSPACE_BOOTSTRAP_REQUIRED',
            requested ? 'Workspace not found.' : 'Finish account setup before using Vitae Cloud.',
          ),
        );
        return;
      }
      req.workspace = workspace;
      runInWorkspace(workspace.id, next);
    })
    .catch(next);
}

/**
 * Read-only lifecycle states are enforced before every legacy router. This is
 * intentionally method-based so a missed route annotation cannot leave graph
 * mutations writable. Exports, billing management, and logout remain usable.
 */
export function entitlementGate(req: Request, _res: Response, next: NextFunction): void {
  if (!cloudEnabled() || !req.workspace || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }
  const access = req.workspace.accessState;
  if (access !== 'read_only' && access !== 'deletion_pending') {
    next();
    return;
  }
  const fullPath = req.baseUrl + req.path;
  const allowed =
    fullPath === '/api/v1/export' ||
    fullPath.startsWith('/api/v1/billing') ||
    fullPath === '/api/v1/auth/logout';
  if (allowed) {
    next();
    return;
  }
  next(
    new HttpError(402, 'PAYMENT_REQUIRED', 'This workspace is read-only. Export your data or manage billing to continue.', {
      access_state: access,
      billing_action: 'manage_billing',
    }),
  );
}
