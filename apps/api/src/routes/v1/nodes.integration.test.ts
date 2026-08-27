/**
 * Route-focused nodes matrix (first split from the monolith integration suite).
 * Covers create/read, validation failure, and demo vs real space isolation.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { requireSessionToken } from '../../__tests__/helpers/app.js';
import { buildNodeCreate, resetIdSequence } from '@vitae/testkit';

let app: Express;
let token: string;

describe('POST/GET /api/v1/nodes', () => {
  beforeAll(async () => {
    process.env.AUTH_ENABLE_DEV_LOGIN = 'true';
    const { createApp } = await import('../../app.js');
    app = createApp();
    const res = await request(app).post('/api/v1/auth/dev-login');
    token = requireSessionToken(res);
  });

  beforeEach(() => {
    resetIdSequence(0);
  });

  afterAll(async () => {
    await new Promise((r) => setTimeout(r, 100));
  });

  it('rejects unauthenticated create', async () => {
    const res = await request(app).post('/api/v1/nodes').send({ type: 'person', title: 'X' });
    expect(res.status).toBe(401);
  });

  it('creates a person and returns it by id', async () => {
    const payload = buildNodeCreate({ type: 'person', title: 'Nodes Matrix Person' });
    const created = await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    expect(created.status).toBe(201);
    const id = created.body.node.id as string;

    const got = await request(app)
      .get(`/api/v1/nodes/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(got.status).toBe(200);
    expect(got.body.node.title).toBe('Nodes Matrix Person');
  });

  it('returns field errors for an invalid role create', async () => {
    const res = await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'role', title: 'Missing employment', props: {} });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  /**
   * The generic patch is the back door on the application status machine
   * (FR-CAR-003). It is also the patch the application form itself sends, so a
   * guard that ran only on the dedicated endpoints would be a guard nothing in
   * the product obeyed.
   */
  describe('the application status machine, through the generic patch', () => {
    const application = async (status: string): Promise<string> => {
      const res = await request(app)
        .post('/api/v1/nodes')
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'application',
          title: `Back door ${status} ${Date.now()}-${Math.random()}`,
          props: { role_title: 'Staff Engineer', status },
        })
        .expect(201);
      return res.body.node.id as string;
    };

    it('refuses a move it would refuse at the front door, with the same sentence', async () => {
      const id = await application('rejected');
      const res = await request(app)
        .patch(`/api/v1/nodes/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ props: { role_title: 'Staff Engineer', status: 'screening' } });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('ILLEGAL_TRANSITION');
      expect(res.body.error.message).toContain(
        'An application that was rejected cannot move to screening',
      );
    });

    it('lets a record be re-saved at the status it already holds', async () => {
      // Editing the deadline on a closed application resubmits the whole
      // record, status included. Refusing that would make a rejected
      // application uneditable forever.
      const id = await application('rejected');
      await request(app)
        .patch(`/api/v1/nodes/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ props: { role_title: 'Staff Engineer', status: 'rejected', deadline: '2026-09-01' } })
        .expect(200);
    });

    it('leaves a patch that never mentions props alone', async () => {
      const id = await application('rejected');
      await request(app)
        .patch(`/api/v1/nodes/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ notes_md: 'Debrief written up.' })
        .expect(200);
    });

    it('still records a move that skips a stage nobody held', async () => {
      // Not every role has a recruiter screen.
      const id = await application('applied');
      const res = await request(app)
        .patch(`/api/v1/nodes/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ props: { role_title: 'Staff Engineer', status: 'offer' } })
        .expect(200);
      expect(res.body.node.props.status).toBe('offer');
    });

    it('governs applications only, and no other type that carries a status', async () => {
      const posting = await request(app)
        .post('/api/v1/nodes')
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'job_posting',
          title: `Posting ${Date.now()}`,
          props: { company: 'Northstar', role_title: 'Staff Engineer', posting_status: 'closed' },
        })
        .expect(201);
      await request(app)
        .patch(`/api/v1/nodes/${posting.body.node.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          props: { company: 'Northstar', role_title: 'Staff Engineer', posting_status: 'watching' },
        })
        .expect(200);
    });
  });

  it('keeps demo-space nodes out of the real graph', async () => {
    const payload = buildNodeCreate({ type: 'person', title: `demo-only-${Date.now()}` });
    const create = await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${token}`)
      .set('x-vitae-space', 'demo')
      .send(payload);
    expect(create.status).toBe(201);
    const id = create.body.node.id as string;

    const realGet = await request(app)
      .get(`/api/v1/nodes/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(realGet.status).toBe(404);

    const demoGet = await request(app)
      .get(`/api/v1/nodes/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-vitae-space', 'demo');
    expect(demoGet.status).toBe(200);
    expect(demoGet.body.node.title).toBe(payload.title);
  });
});
