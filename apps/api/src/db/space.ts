/**
 * Data spaces: "real" (the owner's graph) vs "demo" (a self-contained sample
 * dataset). The active space is carried per-request via AsyncLocalStorage and
 * resolved lazily by repository accessors, so every request routes to the
 * matching Postgres data space when the client sends `x-vitae-space: demo`.
 * Scripts (seeds, tests) opt in with runInSpace()
 * or the VITAE_SPACE env var.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

export type Space = 'real' | 'demo';

const als = new AsyncLocalStorage<{ space: Space }>();

const envDefault = (): Space => (process.env.VITAE_SPACE === 'demo' ? 'demo' : 'real');

export function currentSpace(): Space {
  return als.getStore()?.space ?? envDefault();
}

export function runInSpace<T>(space: Space, fn: () => T): T {
  return als.run({ space }, fn);
}

/** Express middleware: pin the request's space from the `x-vitae-space` header. */
export function spaceMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const space: Space = req.header('x-vitae-space') === 'demo' ? 'demo' : 'real';
  als.run({ space }, next);
}
