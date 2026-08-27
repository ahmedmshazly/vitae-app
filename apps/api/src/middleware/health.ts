/**
 * Liveness and readiness are different questions (FR-026).
 *
 *   /health, is the process up? Unconditional, cheap, never touches the
 *             database. Used by the platform to decide whether to restart us.
 *   /ready , should this instance receive traffic? Fails with 503 while we are
 *             booting or draining, and when the database is unreachable, so a
 *             load balancer stops routing to an instance whose dependencies are
 *             down instead of serving errors from it.
 *
 * The readiness probe is bounded and cached: a probe that hangs is a probe that
 * takes the instance down with it, and readiness is polled often.
 */
import type { Request, Response } from 'express';
import { ping } from '../db/pg.js';
import { env } from '../env.js';

let ready = false;

/** Flipped true once the server is listening, false when draining. */
export function setReady(value: boolean): void {
  ready = value;
}

/** Test-only: drop the readiness probe cache so the next /ready hits dependencies. */
export function resetReadinessCacheForTests(): void {
  cached = null;
  probeInFlight = null;
}

const PROBE_TIMEOUT_MS = 2_000;
const PROBE_CACHE_MS = 5_000;

let cached: { at: number; ok: boolean; detail: string } | null = null;
let probeInFlight: Promise<{ ok: boolean; detail: string }> | null = null;

async function databaseReachable(): Promise<{ ok: boolean; detail: string }> {
  const now = Date.now();
  if (cached && now - cached.at < PROBE_CACHE_MS) return { ok: cached.ok, detail: cached.detail };

  if (probeInFlight) return probeInFlight;
  const probe = ping()
    .then(() => ({ ok: true, detail: 'reachable' }))
    .catch(() => ({ ok: false, detail: 'unreachable' }));
  const timeout = new Promise<{ ok: boolean; detail: string }>((resolve) =>
    setTimeout(() => resolve({ ok: false, detail: `no response in ${PROBE_TIMEOUT_MS}ms` }), PROBE_TIMEOUT_MS).unref(),
  );

  probeInFlight = Promise.race([probe, timeout]).then((result) => {
    cached = { at: Date.now(), ...result };
    return result;
  }).finally(() => {
    probeInFlight = null;
  });
  return probeInFlight;
}

async function buildServiceReachable(): Promise<boolean> {
  if (env.NODE_ENV !== 'production') return true;
  try {
    const response = await fetch(`${env.BUILDSVC_URL}/healthz`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    return response.ok;
  } catch {
    return false;
  }
}

export function livenessHandler(_req: Request, res: Response): void {
  res.json({ ok: true, service: 'vitae-api' });
}

export async function readinessHandler(_req: Request, res: Response): Promise<void> {
  if (!ready) {
    res.status(503).json({ ok: false, reason: 'starting or draining' });
    return;
  }
  const [database, buildService] = await Promise.all([databaseReachable(), buildServiceReachable()]);
  if (!database.ok) {
    res.status(503).json({ ok: false, reason: 'database unreachable', detail: database.detail });
    return;
  }
  if (!buildService) {
    res.status(503).json({ ok: false, reason: 'build service unreachable' });
    return;
  }
  res.json({ ok: true, checks: { database: database.detail } });
}
