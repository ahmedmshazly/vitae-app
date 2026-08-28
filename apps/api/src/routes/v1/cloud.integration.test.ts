/**
 * Hosted control-plane contract: verified enrollment, tenant scoping,
 * lifecycle enforcement, and raw Paddle webhook handling. Provider requests
 * are never made in this suite.
 */
import { createHmac } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { sql } from 'kysely';
import { buildNodeCreate } from '@vitae/testkit';
import { env } from '../../env.js';
import { db } from '../../db/pg.js';
import { CONTROL_TABLES, TABLES } from '../../db/schema.js';
import { LEGACY_WORKSPACE_ID, SYSTEM_DEMO_WORKSPACE_ID } from '../../cloud/config.js';
import { verifyPaddleWebhookSignature } from '../../cloud/paddle.js';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';

const originalCloud = process.env.VITAE_CLOUD_ENABLED;
const originalWebhookSecret = process.env.PADDLE_WEBHOOK_SECRET;

function devToken(uid: string, email: string): string {
  return jwt.sign({ uid, email, via: 'dev' }, env.SESSION_SECRET, { expiresIn: '1h' });
}

async function resetControlPlane(): Promise<void> {
  await sql.raw(`TRUNCATE ${[...TABLES, ...CONTROL_TABLES].join(', ')} CASCADE`).execute(db);
  await db
    .insertInto('workspaces')
    .values([
      { id: LEGACY_WORKSPACE_ID, kind: 'legacy', state: 'active', owner_user_id: null },
      { id: SYSTEM_DEMO_WORKSPACE_ID, kind: 'system', state: 'active', owner_user_id: null },
    ])
    .execute();
  await db
    .insertInto('workspace_lifecycles')
    .values([
      { workspace_id: LEGACY_WORKSPACE_ID, access_state: 'active', trial_ends_at: null, grace_ends_at: null, deletion_scheduled_at: null },
      { workspace_id: SYSTEM_DEMO_WORKSPACE_ID, access_state: 'read_only', trial_ends_at: null, grace_ends_at: null, deletion_scheduled_at: null },
    ])
    .execute();
}

function paddleSignature(body: Buffer, secret: string, timestamp: number): string {
  const signature = createHmac('sha256', secret).update(`${timestamp}:`).update(body).digest('hex');
  return `ts=${timestamp};h1=${signature}`;
}

beforeAll(() => {
  process.env.VITAE_CLOUD_ENABLED = 'true';
  process.env.AUTH_ENABLE_DEV_LOGIN = 'true';
});

beforeEach(resetControlPlane);

afterAll(async () => {
  if (originalCloud === undefined) delete process.env.VITAE_CLOUD_ENABLED;
  else process.env.VITAE_CLOUD_ENABLED = originalCloud;
  if (originalWebhookSecret === undefined) delete process.env.PADDLE_WEBHOOK_SECRET;
  else process.env.PADDLE_WEBHOOK_SECRET = originalWebhookSecret;
});

describe('Vitae Cloud control plane', () => {
  it('claims the legacy graph once and gives new people isolated trial workspaces', async () => {
    const { app, token: ownerToken } = await getAuthedApp();
    const owner = await request(app).post('/api/v1/auth/bootstrap').set(authHeader(ownerToken));
    expect(owner.status).toBe(201);
    expect(owner.body.claimedLegacy).toBe(true);
    expect(owner.body.workspace.id).toBe(LEGACY_WORKSPACE_ID);
    expect(owner.body.self).toMatchObject({ title: 'My profile' });

    const ownerNode = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(ownerToken))
      .set('x-vitae-space', 'demo')
      .send(buildNodeCreate({ type: 'person', title: 'Cloud owner record' }));
    expect(ownerNode.status).toBe(201);

    const customerToken = devToken('dev:customer-1', 'customer@example.com');
    const customer = await request(app).post('/api/v1/auth/bootstrap').set(authHeader(customerToken));
    expect(customer.status).toBe(201);
    expect(customer.body.claimedLegacy).toBe(false);
    expect(customer.body.workspace.accessState).toBe('trialing');
    expect(customer.body.workspace.id).not.toBe(LEGACY_WORKSPACE_ID);

    const hidden = await request(app)
      .get(`/api/v1/nodes/${ownerNode.body.node.id}`)
      .set(authHeader(customerToken));
    expect(hidden.status).toBe(404);

    const rejectedWorkspaceChoice = await request(app)
      .get('/api/v1/nodes')
      .set(authHeader(customerToken))
      .set('x-vitae-workspace', LEGACY_WORKSPACE_ID);
    expect(rejectedWorkspaceChoice.status).toBe(404);

    const demoHeaderIsIgnored = await request(app)
      .get(`/api/v1/nodes/${ownerNode.body.node.id}`)
      .set(authHeader(ownerToken))
      .set('x-vitae-space', 'demo');
    expect(demoHeaderIsIgnored.status).toBe(200);
    expect(demoHeaderIsIgnored.body.node.title).toBe('Cloud owner record');

    const repeat = await request(app).post('/api/v1/auth/bootstrap').set(authHeader(customerToken));
    expect(repeat.status).toBe(200);
    expect(repeat.body.created).toBe(false);
    expect(repeat.body.workspace.id).toBe(customer.body.workspace.id);
  });

  it('allows reads and exports after a lifecycle lock but rejects every ordinary mutation', async () => {
    const { app, token } = await getAuthedApp();
    await request(app).post('/api/v1/auth/bootstrap').set(authHeader(token)).expect(201);
    await db
      .updateTable('workspace_lifecycles')
      .set({ access_state: 'read_only' })
      .where('workspace_id', '=', LEGACY_WORKSPACE_ID)
      .execute();

    await request(app).get('/api/v1/nodes').set(authHeader(token)).expect(200);
    const blocked = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send(buildNodeCreate({ type: 'person', title: 'Must stay read only' }));
    expect(blocked.status).toBe(402);
    expect(blocked.body.error.code).toBe('PAYMENT_REQUIRED');
  });

  it('does not call a provider when the server-owned billing catalog is absent', async () => {
    const { app, token } = await getAuthedApp();
    await request(app).post('/api/v1/auth/bootstrap').set(authHeader(token)).expect(201);
    delete process.env.PADDLE_API_KEY;
    delete process.env.PADDLE_PRICE_CLOUD_MONTHLY;
    const checkout = await request(app)
      .post('/api/v1/billing/checkout')
      .set(authHeader(token))
      .send({ billingPeriod: 'monthly' });
    expect(checkout.status).toBe(503);
    expect(checkout.body.error.code).toBe('BILLING_UNAVAILABLE');
  });

  it('accepts a signed provider event once and ignores a stale later delivery', async () => {
    const { app, token } = await getAuthedApp();
    await request(app).post('/api/v1/auth/bootstrap').set(authHeader(token)).expect(201);
    const secret = 'paddle-test-secret';
    process.env.PADDLE_WEBHOOK_SECRET = secret;
    const timestamp = Math.floor(Date.now() / 1000);
    const current = Buffer.from(
      JSON.stringify({
        event_id: 'evt-current',
        event_type: 'subscription.updated',
        occurred_at: '2026-08-23T17:00:00.000Z',
        data: {
          id: 'sub-current',
          customer_id: 'cus-current',
          status: 'active',
          updated_at: '2026-08-23T17:00:00.000Z',
          custom_data: { workspace_id: LEGACY_WORKSPACE_ID, billing_period: 'monthly' },
        },
      }),
    );
    expect(verifyPaddleWebhookSignature(current, paddleSignature(current, secret, timestamp))).toBe(true);
    const delivered = await request(app)
      .post('/webhooks/paddle')
      .set('content-type', 'application/json')
      .set('paddle-signature', paddleSignature(current, secret, timestamp))
      .send(current.toString('utf8'));
    expect(delivered.status, JSON.stringify(delivered.body)).toBe(200);
    const replay = await request(app)
      .post('/webhooks/paddle')
      .set('content-type', 'application/json')
      .set('paddle-signature', paddleSignature(current, secret, timestamp))
      .send(current.toString('utf8'));
    expect(replay.status).toBe(200);
    expect(replay.body.duplicate).toBe(true);

    const stale = Buffer.from(
      JSON.stringify({
        event_id: 'evt-stale-cancel',
        event_type: 'subscription.updated',
        occurred_at: '2026-08-23T16:00:00.000Z',
        data: {
          id: 'sub-current',
          customer_id: 'cus-current',
          status: 'canceled',
          updated_at: '2026-08-23T16:00:00.000Z',
          custom_data: { workspace_id: LEGACY_WORKSPACE_ID, billing_period: 'monthly' },
        },
      }),
    );
    await request(app)
      .post('/webhooks/paddle')
      .set('content-type', 'application/json')
      .set('paddle-signature', paddleSignature(stale, secret, timestamp))
      .send(stale.toString('utf8'))
      .expect(200);

    const billing = await request(app).get('/api/v1/billing').set(authHeader(token)).expect(200);
    expect(billing.body.access.state).toBe('active');
    expect(billing.body.subscription.status).toBe('active');

    const malformed = await request(app)
      .post('/webhooks/paddle')
      .set('content-type', 'application/json')
      .set('paddle-signature', `ts=${timestamp};h1=${'z'.repeat(64)}`)
      .send(current.toString('utf8'));
    expect(malformed.status).toBe(401);
    expect(malformed.body.error.code).toBe('INVALID_WEBHOOK_SIGNATURE');
  });

  it('links a later cancel that omits custom_data to the stored customer id', async () => {
    const { app, token } = await getAuthedApp();
    await request(app).post('/api/v1/auth/bootstrap').set(authHeader(token)).expect(201);
    const secret = 'paddle-test-secret';
    process.env.PADDLE_WEBHOOK_SECRET = secret;
    const timestamp = Math.floor(Date.now() / 1000);
    const active = Buffer.from(
      JSON.stringify({
        event_id: 'evt-link-customer',
        event_type: 'subscription.updated',
        occurred_at: '2026-08-23T18:00:00.000Z',
        data: {
          id: 'sub-linked',
          customer_id: 'cus-linked',
          status: 'active',
          updated_at: '2026-08-23T18:00:00.000Z',
          custom_data: { workspace_id: LEGACY_WORKSPACE_ID, billing_period: 'monthly' },
        },
      }),
    );
    await request(app)
      .post('/webhooks/paddle')
      .set('content-type', 'application/json')
      .set('paddle-signature', paddleSignature(active, secret, timestamp))
      .send(active.toString('utf8'))
      .expect(200);

    const cancel = Buffer.from(
      JSON.stringify({
        event_id: 'evt-cancel-no-custom',
        event_type: 'subscription.updated',
        occurred_at: '2026-08-23T19:00:00.000Z',
        data: {
          id: 'sub-linked',
          customer_id: 'cus-linked',
          status: 'canceled',
          updated_at: '2026-08-23T19:00:00.000Z',
        },
      }),
    );
    const delivered = await request(app)
      .post('/webhooks/paddle')
      .set('content-type', 'application/json')
      .set('paddle-signature', paddleSignature(cancel, secret, timestamp))
      .send(cancel.toString('utf8'));
    expect(delivered.status).toBe(200);
    expect(delivered.body.linked).toBe(true);

    const billing = await request(app).get('/api/v1/billing').set(authHeader(token)).expect(200);
    expect(billing.body.access.state).toBe('read_only');
  });

  it("cannot read another workspace's dossiers, letters, or applications", async () => {
    const { app, token: ownerToken } = await getAuthedApp();
    await request(app).post('/api/v1/auth/bootstrap').set(authHeader(ownerToken)).expect(201);

    const subject = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(ownerToken))
      .send({ type: 'person', title: `Owner subject ${Date.now()}`, props: {} })
      .expect(201);
    const dossier = await request(app)
      .post('/api/v1/dossiers')
      .set(authHeader(ownerToken))
      .send({
        subject_node: subject.body.node.id,
        audience: 'promotion_review',
        title: 'Owner only',
        sections: [],
      })
      .expect(201);
    const target = await request(app)
      .post('/api/v1/targets')
      .set(authHeader(ownerToken))
      .send({ role_title: `Owner letter ${Date.now()}`, jd_raw: 'Requirements\n- Isolation' })
      .expect(201);
    const letter = await request(app)
      .post('/api/v1/letters')
      .set(authHeader(ownerToken))
      .send({
        target_id: target.body.target.id,
        blocks: [{ kind: 'hook', text: 'Secret letter.' }],
      })
      .expect(201);
    const application = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(ownerToken))
      .send({
        type: 'application',
        title: 'Owner application',
        props: { role_title: 'Owner application', status: 'draft' },
      })
      .expect(201);

    const customerToken = devToken('dev:customer-idor', 'idor@example.com');
    await request(app).post('/api/v1/auth/bootstrap').set(authHeader(customerToken)).expect(201);

    const hiddenDossier = await request(app)
      .get(`/api/v1/dossiers/${dossier.body.dossier.id}`)
      .set(authHeader(customerToken));
    expect(hiddenDossier.status).toBe(404);
    const patched = await request(app)
      .patch(`/api/v1/dossiers/${dossier.body.dossier.id}`)
      .set(authHeader(customerToken))
      .send({ title: 'stolen' });
    expect([404, 402]).toContain(patched.status);
    const hiddenLetter = await request(app)
      .get(`/api/v1/letters/${letter.body.letter.id}`)
      .set(authHeader(customerToken));
    expect(hiddenLetter.status).toBe(404);
    const hiddenApp = await request(app)
      .get(`/api/v1/nodes/${application.body.node.id}`)
      .set(authHeader(customerToken));
    expect(hiddenApp.status).toBe(404);
    const stolenWorkspace = await request(app)
      .get('/api/v1/nodes')
      .set(authHeader(customerToken))
      .set('x-vitae-workspace', LEGACY_WORKSPACE_ID);
    expect(stolenWorkspace.status).toBe(404);

    const stolenExport = await request(app)
      .get('/api/v1/export/manifest')
      .set(authHeader(customerToken))
      .set('x-vitae-workspace', LEGACY_WORKSPACE_ID);
    expect(stolenExport.status).toBe(404);

    const ownNodes = await request(app)
      .get('/api/v1/nodes?limit=200')
      .set(authHeader(customerToken))
      .expect(200);
    const titles = (ownNodes.body.nodes as Array<{ title: string }>).map((n) => n.title);
    expect(titles).not.toContain('Owner application');
    expect(titles).not.toContain('Owner only');
  });
});
