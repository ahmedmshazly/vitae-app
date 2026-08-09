/**
 * Duplicates merge/undo (FR-002/FR-003).
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 100));
});

describe('duplicates merge/undo', () => {
  it('refuses merge undo after a post-merge edit (FR-003)', async () => {
    const { app, token } = await getAuthedApp();
    const makePerson = async (title: string) =>
      request(app)
        .post('/api/v1/nodes')
        .set(authHeader(token))
        .send({ type: 'person', title, props: {} })
        .expect(201);
    const keep = await makePerson(`Undo Keep ${Date.now()}`);
    const drop = await makePerson(`Undo Drop ${Date.now()}`);

    const merged = await request(app)
      .post('/api/v1/duplicates/merge')
      .set(authHeader(token))
      .send({ keepId: keep.body.node.id, dropId: drop.body.node.id })
      .expect(200);

    await request(app)
      .patch(`/api/v1/nodes/${keep.body.node.id}`)
      .set(authHeader(token))
      .send({ title: 'Edited after merge' })
      .expect(200);

    const conflict = await request(app)
      .post(`/api/v1/duplicates/merges/${merged.body.merge.id}/undo`)
      .set(authHeader(token))
      .expect(409);
    expect(conflict.body.error.code).toBe('MERGE_CONFLICT');
  });

  it('undoes an untouched merge with rewired edges (FR-002/FR-003)', async () => {
    const { app, token } = await getAuthedApp();
    const create = async (type: string, title: string) =>
      request(app)
        .post('/api/v1/nodes')
        .set(authHeader(token))
        .send({ type, title, props: {} })
        .expect(201);
    const keep = await create('person', `Clean Keep ${Date.now()}`);
    const drop = await create('person', `Clean Drop ${Date.now()}`);
    const project = await create('project', `Clean Project ${Date.now()}`);
    await request(app)
      .post('/api/v1/edges')
      .set(authHeader(token))
      .send({ type: 'WORKED_ON', src: drop.body.node.id, dst: project.body.node.id })
      .expect(201);

    const merged = await request(app)
      .post('/api/v1/duplicates/merge')
      .set(authHeader(token))
      .send({ keepId: keep.body.node.id, dropId: drop.body.node.id })
      .expect(200);
    await request(app)
      .post(`/api/v1/duplicates/merges/${merged.body.merge.id}/undo`)
      .set(authHeader(token))
      .expect(200);

    const restored = await request(app)
      .get(`/api/v1/nodes/${drop.body.node.id}`)
      .set(authHeader(token))
      .expect(200);
    expect(restored.body.node.deleted_at).toBeNull();
    expect(
      restored.body.edges.some(
        (edge: { type: string; src: string; dst: string }) =>
          edge.type === 'WORKED_ON' &&
          edge.src === drop.body.node.id &&
          edge.dst === project.body.node.id,
      ),
    ).toBe(true);
  });
});
