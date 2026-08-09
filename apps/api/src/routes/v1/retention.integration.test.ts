/**
 * Retention preview/purge (FR-006): aged trash is reportable and hard-deleted;
 * fresh soft-deletes stay recoverable.
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildNodeCreate } from '@vitae/testkit';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';
import { repository } from '../../db/repository.js';
import { TRASH_RETENTION_DAYS } from '../../services/retention.js';

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 100));
});

describe('GET/POST /api/v1/retention', () => {
  it('previews and purges a node past the retention window', async () => {
    const { app, token } = await getAuthedApp();
    const title = `purge-me-${Date.now()}`;
    const created = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send(buildNodeCreate({ type: 'person', title }));
    expect(created.status).toBe(201);
    const id = created.body.node.id as string;

    await request(app).delete(`/api/v1/nodes/${id}`).set(authHeader(token)).expect(200);

    // Age the soft-delete past the window via the document (generated column follows).
    const aged = new Date(Date.now() - (TRASH_RETENTION_DAYS + 2) * 86_400_000).toISOString();
    await repository.updateNode(id, { deleted_at: aged }, { op: 'update', source: 'test' });

    const preview = await request(app).get('/api/v1/retention/preview').set(authHeader(token));
    expect(preview.status).toBe(200);
    expect(preview.body.retentionDays).toBe(TRASH_RETENTION_DAYS);
    expect(preview.body.nodes).toBeGreaterThanOrEqual(1);

    const purge = await request(app).post('/api/v1/retention/purge').set(authHeader(token));
    expect(purge.status).toBe(200);
    expect(purge.body.nodes).toBeGreaterThanOrEqual(1);

    const gone = await request(app)
      .get(`/api/v1/nodes/${id}?includeDeleted=true`)
      .set(authHeader(token));
    expect(gone.status).toBe(404);
  });

  it('leaves a freshly deleted node out of the purge set', async () => {
    const { app, token } = await getAuthedApp();
    const title = `keep-me-${Date.now()}`;
    const created = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send(buildNodeCreate({ type: 'person', title }));
    expect(created.status).toBe(201);
    const id = created.body.node.id as string;

    await request(app).delete(`/api/v1/nodes/${id}`).set(authHeader(token)).expect(200);

    // Dry-run before purge: this id is not past the window.
    const before = await request(app).get('/api/v1/retention/preview').set(authHeader(token));
    expect(before.status).toBe(200);

    await request(app).post('/api/v1/retention/purge').set(authHeader(token)).expect(200);

    const still = await request(app)
      .get(`/api/v1/nodes/${id}?includeDeleted=true`)
      .set(authHeader(token));
    expect(still.status).toBe(200);
    expect(still.body.node.deleted_at).toBeTruthy();
  });
});
