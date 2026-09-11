/**
 * Productivity command API: flag, placement reads, validation, isolation,
 * concurrency, audit, and a smoke check that Task 4 collections still export.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { PRODUCTIVITY_API_FLAG, PRODUCTIVITY_COLLECTIONS } from '@vitae/core';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';
import { env } from '../../env.js';
import { db } from '../../db/pg.js';
import { LEGACY_WORKSPACE_ID } from '../../cloud/config.js';
import { BUNDLE_COLLECTIONS } from '../../services/export.js';
import { PRODUCTIVITY_NOT_FOUND_MESSAGE } from '../../services/productivity/commands.js';

const FLAG = PRODUCTIVITY_API_FLAG;
const originalFlag = process.env[FLAG];
const originalCloud = process.env.VITAE_CLOUD_ENABLED;

function enableProductivity(): void {
  process.env[FLAG] = 'true';
}

function disableProductivity(): void {
  delete process.env[FLAG];
}

function opId(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function envelope(type: string, payload: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return { version: 1 as const, operation_id: opId(type), type, payload, ...extra };
}

afterAll(async () => {
  if (originalFlag === undefined) delete process.env[FLAG];
  else process.env[FLAG] = originalFlag;
  if (originalCloud === undefined) delete process.env.VITAE_CLOUD_ENABLED;
  else process.env.VITAE_CLOUD_ENABLED = originalCloud;
  await new Promise((r) => setTimeout(r, 100));
});

describe('productivity routes (flag off)', () => {
  it('returns a neutral 404 for GET and POST when the flag is unset', async () => {
    disableProductivity();
    const { app, token } = await getAuthedApp();
    const listed = await request(app).get('/api/v1/productivity/tasks').set(authHeader(token));
    const posted = await request(app)
      .post('/api/v1/productivity/commands')
      .set(authHeader(token))
      .send(envelope('create_task', { title: 'Must not land' }));
    expect(listed.status).toBe(404);
    expect(posted.status).toBe(404);
    expect(listed.body.error).toMatchObject({ code: 'NOT_FOUND', message: PRODUCTIVITY_NOT_FOUND_MESSAGE });
    expect(posted.body.error).toMatchObject({ code: 'NOT_FOUND', message: PRODUCTIVITY_NOT_FOUND_MESSAGE });
  });
});

describe('productivity routes (flag on)', () => {
  beforeAll(() => {
    enableProductivity();
  });

  it('creates, lists, and details a task with a placement reason', async () => {
    const { app, token } = await getAuthedApp();
    const created = await request(app)
      .post('/api/v1/productivity/commands')
      .set(authHeader(token))
      .set('x-vitae-tz', 'Africa/Cairo')
      .send(
        envelope('create_task', {
          title: `Place me ${Date.now()}`,
          due: '2026-09-11',
          importance: 'important',
        }),
      )
      .expect(201);
    expect(created.body.replayed).toBe(false);
    const id = created.body.result.task.id as string;

    const listed = await request(app)
      .get('/api/v1/productivity/tasks')
      .set(authHeader(token))
      .set('x-vitae-tz', 'Africa/Cairo')
      .expect(200);
    const row = listed.body.tasks.find((task: { id: string }) => task.id === id);
    expect(row).toMatchObject({ id, title: expect.stringContaining('Place me'), status: 'inbox' });
    expect(row.placement?.reason).toEqual(expect.any(String));

    const detail = await request(app)
      .get(`/api/v1/productivity/tasks/${id}`)
      .set(authHeader(token))
      .set('x-vitae-tz', 'Africa/Cairo')
      .expect(200);
    expect(detail.body.task.placement.reason).toEqual(expect.any(String));
    expect(detail.body.task.id).toBe(id);
  });

  it('returns 422 on a bad command body', async () => {
    const { app, token } = await getAuthedApp();
    const res = await request(app)
      .post('/api/v1/productivity/commands')
      .set(authHeader(token))
      .send({ type: 'create_task', payload: { title: 'No envelope' } });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('returns a neutral 404 for a missing task, a bad wait target, and a foreign id', async () => {
    const { app, token } = await getAuthedApp();
    const missing = await request(app)
      .get('/api/v1/productivity/tasks/no-such-task')
      .set(authHeader(token));
    expect(missing.status).toBe(404);
    expect(missing.body.error).toMatchObject({ code: 'NOT_FOUND', message: PRODUCTIVITY_NOT_FOUND_MESSAGE });

    const created = await request(app)
      .post('/api/v1/productivity/commands')
      .set(authHeader(token))
      .send(envelope('create_task', { title: `Waiter ${Date.now()}` }))
      .expect(201);
    const taskId = created.body.result.task.id as string;
    const habit = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send({ type: 'habit', title: `Not a person ${Date.now()}`, props: { cadence: 'daily' } })
      .expect(201);

    const badTarget = await request(app)
      .post('/api/v1/productivity/commands')
      .set(authHeader(token))
      .send(
        envelope(
          'wait_on_task',
          { id: taskId, waiting_on_id: habit.body.node.id },
          { expected_revision: created.body.result.task.rev },
        ),
      );
    expect(badTarget.status).toBe(404);
    expect(badTarget.body.error).toMatchObject({ code: 'NOT_FOUND', message: PRODUCTIVITY_NOT_FOUND_MESSAGE });

    const otherWorkspace = await request(app)
      .get('/api/v1/productivity/tasks/workspace-b-never-here')
      .set(authHeader(token));
    expect(otherWorkspace.status).toBe(404);
    expect(otherWorkspace.body.error.message).toBe(PRODUCTIVITY_NOT_FOUND_MESSAGE);
  });

  it('rejects a stale expected_revision with 409 and leaves the stored title unchanged', async () => {
    const { app, token } = await getAuthedApp();
    const created = await request(app)
      .post('/api/v1/productivity/commands')
      .set(authHeader(token))
      .send(envelope('create_task', { title: 'Original title' }))
      .expect(201);
    const id = created.body.result.task.id as string;

    await request(app)
      .post('/api/v1/productivity/commands')
      .set(authHeader(token))
      .send(
        envelope(
          'update_task',
          { id, patch: { title: 'First writer' } },
          { expected_revision: created.body.result.task.rev },
        ),
      )
      .expect(201);

    const stale = await request(app)
      .post('/api/v1/productivity/commands')
      .set(authHeader(token))
      .send(envelope('update_task', { id, patch: { title: 'Stale writer' } }, { expected_revision: 1 }));
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('CONFLICT');

    const detail = await request(app).get(`/api/v1/productivity/tasks/${id}`).set(authHeader(token)).expect(200);
    expect(detail.body.task.title).toBe('First writer');
  });

  it('replays the same operation_id without a second node or receipt', async () => {
    const { app, token } = await getAuthedApp();
    const body = envelope('create_task', { title: `Replay ${Date.now()}` });
    const first = await request(app).post('/api/v1/productivity/commands').set(authHeader(token)).send(body).expect(201);
    const second = await request(app).post('/api/v1/productivity/commands').set(authHeader(token)).send(body).expect(200);
    expect(second.body.replayed).toBe(true);
    expect(second.body.result).toEqual(first.body.result);

    const id = first.body.result.task.id as string;
    const listed = await request(app).get('/api/v1/productivity/tasks').set(authHeader(token)).expect(200);
    expect(listed.body.tasks.filter((task: { id: string }) => task.id === id)).toHaveLength(1);

    const { repository } = await import('../../db/repository.js');
    const receipts = await repository.docQuery('productivity_receipts', { operation_id: body.operation_id });
    expect(receipts).toHaveLength(1);
  });

  it('lets only one concurrent complete win; the other is 409 or a replay', async () => {
    const { app, token } = await getAuthedApp();
    const created = await request(app)
      .post('/api/v1/productivity/commands')
      .set(authHeader(token))
      .send(envelope('create_task', { title: `Race ${Date.now()}` }))
      .expect(201);
    const id = created.body.result.task.id as string;
    const rev = created.body.result.task.rev as number;

    const a = envelope('complete_task', { id }, { expected_revision: rev });
    const b = envelope('complete_task', { id }, { expected_revision: rev });
    const [first, second] = await Promise.all([
      request(app).post('/api/v1/productivity/commands').set(authHeader(token)).send(a),
      request(app).post('/api/v1/productivity/commands').set(authHeader(token)).send(b),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toContain(201);
    expect(statuses.some((status) => status === 409 || status === 200)).toBe(true);

    const detail = await request(app).get(`/api/v1/productivity/tasks/${id}`).set(authHeader(token)).expect(200);
    expect(detail.body.task.status).toBe('done');
    expect(detail.body.task.rev).toBe(rev + 1);

    const revisions = await request(app).get(`/api/v1/nodes/${id}/revisions`).set(authHeader(token)).expect(200);
    const doneWrites = (revisions.body.revisions as Array<{ rev: number; snapshot?: { props?: { status?: string } } }>).filter(
      (row) => row.snapshot?.props?.status === 'done',
    );
    expect(doneWrites).toHaveLength(1);
  });

  it('writes neither status nor edge when wait_on_task points at a bad target', async () => {
    const { app, token } = await getAuthedApp();
    const created = await request(app)
      .post('/api/v1/productivity/commands')
      .set(authHeader(token))
      .send(envelope('create_task', { title: `Atomic wait ${Date.now()}` }))
      .expect(201);
    const id = created.body.result.task.id as string;
    const habit = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send({ type: 'habit', title: `Bad wait ${Date.now()}`, props: { cadence: 'daily' } })
      .expect(201);

    await request(app)
      .post('/api/v1/productivity/commands')
      .set(authHeader(token))
      .send(envelope('wait_on_task', { id, waiting_on_id: habit.body.node.id }, { expected_revision: 1 }))
      .expect(404);

    const detail = await request(app).get(`/api/v1/productivity/tasks/${id}`).set(authHeader(token)).expect(200);
    expect(detail.body.task.status).toBe('inbox');
    const node = await request(app).get(`/api/v1/nodes/${id}`).set(authHeader(token)).expect(200);
    expect((node.body.edges as Array<{ type: string }>).filter((edge) => edge.type === 'WAITING_ON')).toHaveLength(0);
  });

  it('writes a revision for each successful command', async () => {
    const { app, token } = await getAuthedApp();
    const created = await request(app)
      .post('/api/v1/productivity/commands')
      .set(authHeader(token))
      .send(envelope('create_task', { title: `Audited ${Date.now()}` }))
      .expect(201);
    const id = created.body.result.task.id as string;
    await request(app)
      .post('/api/v1/productivity/commands')
      .set(authHeader(token))
      .send(envelope('follow_up_task', { id, follow_up: '2026-09-20' }, { expected_revision: 1 }))
      .expect(201);
    const revisions = await request(app).get(`/api/v1/nodes/${id}/revisions`).set(authHeader(token)).expect(200);
    expect(revisions.body.revisions.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps Task 4 collections on export, restore, and retention paths', async () => {
    const { app, token } = await getAuthedApp();
    const created = await request(app)
      .post('/api/v1/productivity/commands')
      .set(authHeader(token))
      .send(envelope('create_task', { title: `Export smoke ${Date.now()}` }))
      .expect(201);
    const id = created.body.result.task.id as string;
    await request(app)
      .post('/api/v1/productivity/commands')
      .set(authHeader(token))
      .send(
        envelope('add_time_entry', {
          item_id: id,
          started_at: '2026-09-11T08:00:00.000Z',
          ended_at: '2026-09-11T09:00:00.000Z',
        }),
      )
      .expect(201);
    await request(app)
      .post('/api/v1/productivity/commands')
      .set(authHeader(token))
      .send(
        envelope('upsert_rule', {
          name: 'Smoke rule',
          statement: 'When a task is doing, raise priority.',
          enabled: true,
        }),
      )
      .expect(201);

    const manifest = await request(app)
      .get('/api/v1/export/manifest?includeSensitive=true')
      .set(authHeader(token))
      .expect(200);
    for (const name of PRODUCTIVITY_COLLECTIONS) {
      expect(manifest.body.manifest.counts, name).toHaveProperty(name);
      expect(BUNDLE_COLLECTIONS.some((entry) => entry.table === name)).toBe(true);
    }

    const { purgeExpiredTrash } = await import('../../services/retention.js');
    const summary = await purgeExpiredTrash({ dryRun: true, retentionDays: 30 });
    expect(summary).toHaveProperty('cutoff');
  });
});

describe('productivity entitlement and tenant isolation', () => {
  afterAll(async () => {
    process.env.VITAE_CLOUD_ENABLED = originalCloud ?? 'false';
    enableProductivity();
    await db
      .updateTable('workspace_lifecycles')
      .set({ access_state: 'active' })
      .where('workspace_id', '=', LEGACY_WORKSPACE_ID)
      .execute()
      .catch(() => undefined);
  });

  it('rejects a mutating command the same way POST /nodes is rejected when read-only', async () => {
    process.env.VITAE_CLOUD_ENABLED = 'true';
    enableProductivity();
    const { app, token } = await getAuthedApp();
    await request(app).post('/api/v1/auth/bootstrap').set(authHeader(token));

    await db
      .updateTable('workspace_lifecycles')
      .set({ access_state: 'active' })
      .where('workspace_id', '=', LEGACY_WORKSPACE_ID)
      .execute();

    const created = await request(app)
      .post('/api/v1/productivity/commands')
      .set(authHeader(token))
      .send(envelope('create_task', { title: `Lock me ${Date.now()}` }));
    expect([201, 200]).toContain(created.status);

    await db
      .updateTable('workspace_lifecycles')
      .set({ access_state: 'read_only' })
      .where('workspace_id', '=', LEGACY_WORKSPACE_ID)
      .execute();

    const blockedNode = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send({ type: 'idea', title: 'Must stay read only', props: { status: 'spark' } });
    const blockedCommand = await request(app)
      .post('/api/v1/productivity/commands')
      .set(authHeader(token))
      .send(envelope('create_task', { title: 'Must stay read only' }));
    expect(blockedNode.status).toBe(402);
    expect(blockedCommand.status).toBe(402);
    expect(blockedCommand.body.error.code).toBe(blockedNode.body.error.code);

    await db
      .updateTable('workspace_lifecycles')
      .set({ access_state: 'active' })
      .where('workspace_id', '=', LEGACY_WORKSPACE_ID)
      .execute();
    process.env.VITAE_CLOUD_ENABLED = originalCloud ?? 'false';
  });

  it('hides workspace A task from workspace B with the same 404', async () => {
    process.env.VITAE_CLOUD_ENABLED = 'true';
    enableProductivity();
    const { app, token: ownerToken } = await getAuthedApp();
    await request(app).post('/api/v1/auth/bootstrap').set(authHeader(ownerToken));
    await db
      .updateTable('workspace_lifecycles')
      .set({ access_state: 'active' })
      .where('workspace_id', '=', LEGACY_WORKSPACE_ID)
      .execute();

    const created = await request(app)
      .post('/api/v1/productivity/commands')
      .set(authHeader(ownerToken))
      .send(envelope('create_task', { title: `Tenant A ${Date.now()}` }));
    expect([201, 200]).toContain(created.status);
    const id = created.body.result.task.id as string;

    const customerToken = jwt.sign(
      { uid: 'dev:productivity-customer', email: 'productivity-customer@example.com', via: 'dev' },
      env.SESSION_SECRET,
      { expiresIn: '1h' },
    );
    await request(app).post('/api/v1/auth/bootstrap').set(authHeader(customerToken));
    const hidden = await request(app).get(`/api/v1/productivity/tasks/${id}`).set(authHeader(customerToken));
    expect(hidden.status).toBe(404);
    expect(hidden.body.error).toMatchObject({ code: 'NOT_FOUND', message: PRODUCTIVITY_NOT_FOUND_MESSAGE });

    process.env.VITAE_CLOUD_ENABLED = originalCloud ?? 'false';
  });
});
