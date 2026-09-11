/**
 * Query-count budgets for productivity reads (NFR-PROD-001).
 * Ceilings live in docs/testing/productivity-budgets.json.
 * Count is payload-independent; these hit the integration database, not vitae_perf.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import request from 'supertest';
import { PRODUCTIVITY_API_FLAG } from '@vitae/core';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';

const budgets = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../../../../../docs/testing/productivity-budgets.json'),
    'utf8',
  ),
) as { tasksQueryCount: number; analyticsQueryCount: number };

const FLAG = PRODUCTIVITY_API_FLAG;
const originalFlag = process.env[FLAG];

async function withQueryCount<T>(fn: () => Promise<T>): Promise<{ result: T; count: number }> {
  let count = 0;
  const origClient = pg.Client.prototype.query;
  const origPool = pg.Pool.prototype.query;
  const bump = () => {
    count += 1;
  };
  pg.Client.prototype.query = function (this: pg.Client, ...args: unknown[]) {
    bump();
    return Reflect.apply(origClient, this, args);
  } as typeof origClient;
  pg.Pool.prototype.query = function (this: pg.Pool, ...args: unknown[]) {
    bump();
    return Reflect.apply(origPool, this, args);
  } as typeof origPool;
  try {
    const result = await fn();
    return { result, count };
  } finally {
    pg.Client.prototype.query = origClient;
    pg.Pool.prototype.query = origPool;
  }
}

beforeAll(() => {
  process.env[FLAG] = 'true';
});

afterAll(() => {
  if (originalFlag === undefined) delete process.env[FLAG];
  else process.env[FLAG] = originalFlag;
});

describe('productivity API query budgets', () => {
  it('GET /tasks stays inside the documented query count', async () => {
    const { app, token } = await getAuthedApp();
    const { result, count } = await withQueryCount(() =>
      request(app).get('/api/v1/productivity/tasks').set(authHeader(token)),
    );
    expect(result.status).toBe(200);
    expect(count, `GET /tasks issued ${count} queries (spy must see the live client)`).toBeGreaterThan(0);
    expect(count, `GET /tasks issued ${count} queries`).toBeLessThanOrEqual(budgets.tasksQueryCount);
  });

  it('GET /analytics?window=30 stays inside the documented query count', async () => {
    const { app, token } = await getAuthedApp();
    const { result, count } = await withQueryCount(() =>
      request(app).get('/api/v1/productivity/analytics?window=30').set(authHeader(token)),
    );
    expect(result.status).toBe(200);
    expect(count, `GET /analytics issued ${count} queries (spy must see the live client)`).toBeGreaterThan(0);
    expect(count, `GET /analytics issued ${count} queries`).toBeLessThanOrEqual(budgets.analyticsQueryCount);
  });
});
