/**
 * Cover letters against a target (FR-RES-020).
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 100));
});

describe('letters routes', () => {
  it('stores a cover-letter draft against a target and rejects a missing target', async () => {
    const { app, token } = await getAuthedApp();
    const target = await request(app)
      .post('/api/v1/targets')
      .set(authHeader(token))
      .send({ role_title: 'Cover Letter Split', jd_raw: 'Requirements\n- Writing' })
      .expect(201);
    const role = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send({ type: 'role', title: `Letter Role ${Date.now()}`, props: { employment_type: 'full_time' } })
      .expect(201);
    const atom = await request(app)
      .post('/api/v1/atoms')
      .set(authHeader(token))
      .send({
        owner_node: role.body.node.id,
        kind: 'achievement',
        variants: [{ emphasis: 'technical', text: 'Shipped clear writing systems.', is_default: true }],
      })
      .expect(201);

    const created = await request(app)
      .post('/api/v1/letters')
      .set(authHeader(token))
      .send({
        target_id: target.body.target.id,
        blocks: [
          { kind: 'hook', text: 'I am excited about the role.' },
          { kind: 'body', atom_id: atom.body.id },
          { kind: 'closer', text: 'Looking forward to speaking.' },
        ],
      })
      .expect(201);
    expect(created.body.letter.status).toBe('draft');
    expect(created.body.letter.blocks).toHaveLength(3);

    const listed = await request(app)
      .get(`/api/v1/letters?targetId=${target.body.target.id}`)
      .set(authHeader(token))
      .expect(200);
    expect(listed.body.letters.some((row: { id: string }) => row.id === created.body.letter.id)).toBe(true);

    await request(app)
      .post('/api/v1/letters')
      .set(authHeader(token))
      .send({ target_id: 'missing-target', blocks: [{ kind: 'hook', text: 'nope' }] })
      .expect(422);
  });
});
