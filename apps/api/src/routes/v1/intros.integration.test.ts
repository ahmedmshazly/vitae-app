/**
 * Warm-intro targets and pathfinding into an organization.
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authHeader, ensureSelfPerson, getAuthedApp } from '../../__tests__/helpers/app.js';

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 100));
});

describe('intros routes', () => {
  it('requires orgId for path lookup', async () => {
    const { app, token } = await getAuthedApp();
    await request(app).get('/api/v1/intros/paths').set(authHeader(token)).expect(400);
  });

  it('lists targets and returns paths for an organization', async () => {
    const { app, token } = await getAuthedApp();
    await ensureSelfPerson(app, token);
    const org = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send({ type: 'organization', title: `Intro Org ${Date.now()}`, props: {} })
      .expect(201);
    const orgId = org.body.node.id as string;

    const targets = await request(app)
      .get('/api/v1/intros/targets')
      .set(authHeader(token))
      .expect(200);
    expect(Array.isArray(targets.body.targets)).toBe(true);
    expect(targets.body.targets.some((t: { id: string }) => t.id === orgId)).toBe(true);

    const paths = await request(app)
      .get(`/api/v1/intros/paths?orgId=${orgId}`)
      .set(authHeader(token))
      .expect(200);
    expect(Array.isArray(paths.body.paths)).toBe(true);
    expect(paths.body.org.id).toBe(orgId);
  });

  it('explains a peer-to-peer path with each recorded tie', async () => {
    const { app, token } = await getAuthedApp();
    const headers = authHeader(token);
    const suffix = Date.now();
    const selfId = await ensureSelfPerson(app, token);
    const linaTitle = `Intro Lina ${suffix}`;
    const karimTitle = `Intro Karim ${suffix}`;
    const orgTitle = `Intro Org ${suffix}`;

    const lina = await request(app)
      .post('/api/v1/nodes')
      .set(headers)
      .send({ type: 'person', title: linaTitle, props: {} })
      .expect(201);
    const karim = await request(app)
      .post('/api/v1/nodes')
      .set(headers)
      .send({ type: 'person', title: karimTitle, props: {} })
      .expect(201);
    const org = await request(app)
      .post('/api/v1/nodes')
      .set(headers)
      .send({ type: 'organization', title: orgTitle, props: {} })
      .expect(201);
    const role = await request(app)
      .post('/api/v1/nodes')
      .set(headers)
      .send({
        type: 'role',
        title: `Engineering manager ${suffix}`,
        props: { employment_type: 'full_time' },
        status: 'active',
      })
      .expect(201);

    const linaId = lina.body.node.id as string;
    const karimId = karim.body.node.id as string;
    const orgId = org.body.node.id as string;
    const roleId = role.body.node.id as string;

    await request(app)
      .post('/api/v1/edges')
      .set(headers)
      .send({
        type: 'KNOWS',
        src: linaId,
        dst: karimId,
        props: { relation: 'colleague', strength: 0.3 },
      })
      .expect(201);
    await request(app)
      .post('/api/v1/edges')
      .set(headers)
      .send({ type: 'HELD', src: karimId, dst: roleId, props: {} })
      .expect(201);
    await request(app)
      .post('/api/v1/edges')
      .set(headers)
      .send({ type: 'ROLE_AT', src: roleId, dst: orgId, props: {} })
      .expect(201);

    const paths = await request(app)
      .get(`/api/v1/intros/paths?orgId=${orgId}`)
      .set(headers)
      .expect(200);
    const chain = (
      paths.body.paths as Array<{
        hops: Array<{ nodeId: string; viaEdgeType?: string; viaStrength?: number }>;
        why: string;
        factors: string[];
      }>
    ).find(
      (path) =>
        path.hops.map((hop) => hop.nodeId).join('>') === `${selfId}>${linaId}>${karimId}>${orgId}`,
    );

    expect(chain).toBeDefined();
    if (!chain) throw new Error('expected the seeded peer-to-peer introduction path');
    expect(chain.why).toBe(
      `${linaTitle} → ${karimTitle} chains into ${orgTitle}; each hop dilutes the ask.`,
    );
    expect(chain.hops.slice(1)).toEqual([
      expect.objectContaining({ nodeId: linaId, viaEdgeType: 'knows', viaStrength: 0.18 }),
      expect.objectContaining({ nodeId: karimId, viaEdgeType: 'knows', viaStrength: 0.3 }),
      expect.objectContaining({ nodeId: orgId, viaEdgeType: 'works_at', viaStrength: 0.9 }),
    ]);
    expect(chain.factors).toEqual(['2 hops', 'Works there', 'Weak tie', 'Weak path']);
  });
});
