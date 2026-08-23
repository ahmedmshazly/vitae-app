/**
 * Legacy data spaces: "real" (the owner's graph) vs "demo" (a self-contained
 * sample dataset). Hosted Cloud traffic uses a separate, server-derived
 * `workspaceId`; `space` survives so existing self-host scripts and fixtures
 * retain their stable contract while the database is migrated in place.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';
import { LEGACY_WORKSPACE_ID, SYSTEM_DEMO_WORKSPACE_ID, cloudEnabled } from '../cloud/config.js';

export type Space = 'real' | 'demo';

export interface WorkspaceContext {
  space: Space;
  workspaceId: string;
}

const als = new AsyncLocalStorage<WorkspaceContext>();

const envDefault = (): Space => (process.env.VITAE_SPACE === 'demo' ? 'demo' : 'real');

export function currentSpace(): Space {
  return als.getStore()?.space ?? envDefault();
}

/**
 * Always returns a durable partition, including for legacy scripts. New Cloud
 * request middleware supplies a verified member workspace; legacy code maps
 * the old binary space into its backfilled control-plane workspace.
 */
export function currentWorkspaceId(): string {
  const context = als.getStore();
  if (context) return context.workspaceId;
  return envDefault() === 'demo' ? SYSTEM_DEMO_WORKSPACE_ID : LEGACY_WORKSPACE_ID;
}

export function runInSpace<T>(space: Space, fn: () => T): T {
  return als.run(
    {
      space,
      workspaceId: space === 'demo' ? SYSTEM_DEMO_WORKSPACE_ID : LEGACY_WORKSPACE_ID,
    },
    fn,
  );
}

/** Run work inside a member-selected Cloud workspace. */
export function runInWorkspace<T>(workspaceId: string, fn: () => T): T {
  return als.run({ space: 'real', workspaceId }, fn);
}

/**
 * Self-host compatibility middleware. Cloud requests deliberately ignore this
 * browser-controlled header: workspaceMiddleware resolves their partition
 * only after authentication and membership verification.
 */
export function spaceMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (cloudEnabled()) {
    als.run({ space: 'real', workspaceId: LEGACY_WORKSPACE_ID }, next);
    return;
  }
  const space: Space = req.header('x-vitae-space') === 'demo' ? 'demo' : 'real';
  runInSpace(space, next);
}
