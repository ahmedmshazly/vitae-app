/**
 * Atoms library: create, patch, duplicate, archive, and validation failures.
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 100));
});

async function ensureSelfId(app: Awaited<ReturnType<typeof getAuthedApp>>['app'], token: string) {
  const people = await request(app)
    .get('/api/v1/nodes?type=person&limit=1000')
    .set(authHeader(token))
    .expect(200);
  const existing = (
    people.body.nodes as Array<{ id: string; props?: { is_self?: boolean } }>
  ).find((p) => p.props?.is_self === true)?.id;
  if (existing) return existing;
  const created = await request(app)
    .post('/api/v1/nodes')
    .set(authHeader(token))
    .send({ type: 'person', title: `Atom Split Self ${Date.now()}`, props: { is_self: true } })
    .expect(201);
  return created.body.node.id as string;
}

describe('atoms routes', () => {
  it('creates, duplicates, and archives an atom', async () => {
    const { app, token } = await getAuthedApp();
    const selfId = await ensureSelfId(app, token);
    const role = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send({
        type: 'role',
        title: `Atom Split Role ${Date.now()}`,
        props: { employment_type: 'full_time' },
        subject: { node_id: selfId },
      })
      .expect(201);

    const created = await request(app)
      .post('/api/v1/atoms')
      .set(authHeader(token))
      .send({
        owner_node: role.body.node.id,
        kind: 'achievement',
        pinned: false,
        blocked: false,
        metrics: [],
        variants: [{ emphasis: 'technical', text: 'Split-suite atom about Python.', is_default: true }],
        skill_ids: [],
      })
      .expect(201);
    const atomId = created.body.id as string;

    const listed = await request(app).get('/api/v1/atoms').set(authHeader(token)).expect(200);
    expect(listed.body.atoms.some((a: { id: string }) => a.id === atomId)).toBe(true);

    const duplicate = await request(app)
      .post(`/api/v1/atoms/${atomId}/duplicate`)
      .set(authHeader(token))
      .expect(201);
    expect(duplicate.body.id).not.toBe(atomId);

    await request(app).delete(`/api/v1/atoms/${duplicate.body.id}`).set(authHeader(token)).expect(200);
    const archived = await request(app)
      .get('/api/v1/atoms?includeDeleted=true&state=archived')
      .set(authHeader(token))
      .expect(200);
    expect(
      archived.body.atoms.some(
        (atom: { id: string; deleted_at?: string }) => atom.id === duplicate.body.id && atom.deleted_at,
      ),
    ).toBe(true);
  });

  it('rejects an atom with a missing evidence node', async () => {
    const { app, token } = await getAuthedApp();
    const selfId = await ensureSelfId(app, token);
    const role = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send({
        type: 'role',
        title: `Atom Bad Evidence ${Date.now()}`,
        props: { employment_type: 'full_time' },
        subject: { node_id: selfId },
      })
      .expect(201);

    await request(app)
      .post('/api/v1/atoms')
      .set(authHeader(token))
      .send({
        owner_node: role.body.node.id,
        kind: 'achievement',
        evidence: [{ kind: 'node', node_id: 'missing-evidence-node' }],
        variants: [{ emphasis: 'technical', text: 'missing evidence', is_default: true }],
        skill_ids: [],
      })
      .expect(422);
  });
});
