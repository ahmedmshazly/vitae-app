/**
 * Query-count budgets for productivity reads (NFR-PROD-001).
 * Ceilings live in docs/testing/productivity-budgets.json.
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
  const orig = pg.Client.prototype.query;
  pg.Client.prototype.query = function (this: pg.Client, ...args: unknown[]) {
    count += 1;
    return Reflect.apply(orig, this, args);
  } as typeof orig;
  try {
    const result = await fn();
    return { result, count };
  } finally {
    pg.Client.prototype.query = orig;
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
    expect(count, `GET /tasks issued ${count} queries`).toBeLessThanOrEqual(budgets.tasksQueryCount);
  });

  it('GET /analytics?window=30 stays inside the documented query count', async () => {
    const { app, token } = await getAuthedApp();
    const { result, count } = await withQueryCount(() =>
      request(app).get('/api/v1/productivity/analytics?window=30').set(authHeader(token)),
    );
    expect(result.status).toBe(200);
    expect(count, `GET /analytics issued ${count} queries`).toBeLessThanOrEqual(budgets.analyticsQueryCount);
  });
});
