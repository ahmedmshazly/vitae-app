/**
 * Readiness must report not-ready when Postgres is unreachable, without
 * crashing the process. Liveness stays up so the orchestrator can restart.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { getAuthedApp } from '../helpers/app.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  vi.restoreAllMocks();
  await new Promise((r) => setTimeout(r, 100));
});

describe('database unavailability', () => {
  it('keeps /health alive while /ready fails closed when ping fails', async () => {
    const { app } = await getAuthedApp();
    const health = await import('../../middleware/health.js');
    const pg = await import('../../db/pg.js');

    health.setReady(true);
    health.resetReadinessCacheForTests();
    vi.spyOn(pg, 'ping').mockRejectedValue(new Error('connection refused'));

    const live = await request(app).get('/health');
    expect(live.status).toBe(200);
    expect(live.body.ok).toBe(true);

    const ready = await request(app).get('/ready');
    expect(ready.status).toBe(503);
    expect(ready.body.ok).toBe(false);
    expect(ready.body.reason).toBe('database unreachable');
  });
});
