/**
 * The correspondence rollup (FR-COMM-002): a tie whose logged history was
 * once strong and has gone quiet appears as a reactivation candidate with
 * its peak, its present, and its factors; the brokers section tallies the
 * met_via labels the relationship edges carry.
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 100));
});

const DAY = 86_400_000;

/** The rollup is anchored on the is_self person; make sure one exists. */
async function ensureSelf(
  app: Parameters<typeof request>[0],
  token: string,
): Promise<string> {
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
    .send({ type: 'person', title: `Correspondence Self ${Date.now()}`, props: { is_self: true } })
    .expect(201);
  return created.body.node.id as string;
}

/** The relationship edge, created the way the logging overlay creates it. */
async function knowsEdge(
  app: Parameters<typeof request>[0],
  token: string,
  selfId: string,
  personId: string,
): Promise<string> {
  const created = await request(app)
    .post('/api/v1/edges')
    .set(authHeader(token))
    .send({ type: 'KNOWS', src: selfId, dst: personId, props: { closeness: 4 } })
    .expect(201);
  return created.body.edge.id as string;
}

describe('correspondence route', () => {
  it('surfaces a dormant-but-once-strong tie with its evidence', async () => {
    const { app, token } = await getAuthedApp();
    const title = `Dormant ally ${Date.now()}`;
    const created = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send({ type: 'person', title, props: {} })
      .expect(201);
    const personId = created.body.node.id as string;
    const selfId = await ensureSelf(app, token);
    await knowsEdge(app, token, selfId, personId);

    // Ten meetings, one per day, ending four hundred days ago: strong then,
    // long past the adaptive dormancy threshold now.
    for (let i = 0; i < 10; i += 1) {
      await request(app)
        .post('/api/v1/interactions')
        .set(authHeader(token))
        .send({
          personId,
          kind: 'meeting',
          summary: `Old meeting ${i}`,
          occurredAt: new Date(Date.now() - (400 + i) * DAY).toISOString(),
          idempotencyKey: `corr-${title}-${i}`,
        })
        .expect(201);
    }

    const res = await request(app).get('/api/v1/correspondence').set(authHeader(token)).expect(200);
    const candidate = res.body.candidates.find(
      (c: { person: { id: string } }) => c.person.id === personId,
    );
    expect(candidate, 'the quiet strong tie is a candidate').not.toBe(undefined);
    expect(candidate.peak_strength).toBeGreaterThan(candidate.current_strength);
    expect(candidate.days_since_last).toBeGreaterThan(300);
    expect(candidate.factors).toHaveProperty('closeness');
    expect(candidate.factors).toHaveProperty('intensity');
    expect(res.body.considered_dormant).toBeGreaterThanOrEqual(1);
  });

  it('tallies brokers from the met_via the edges carry', async () => {
    const { app, token } = await getAuthedApp();
    const title = `Brokered contact ${Date.now()}`;
    const created = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send({ type: 'person', title, props: {} })
      .expect(201);
    const personId = created.body.node.id as string;
    const selfId = await ensureSelf(app, token);
    const edgeId = await knowsEdge(app, token, selfId, personId);

    const broker = `Guild meetup ${Date.now()}`;
    // A patch replaces props wholesale (FR-CON-001), so send the merged set.
    await request(app)
      .patch(`/api/v1/edges/${edgeId}`)
      .set(authHeader(token))
      .send({ props: { closeness: 4, met_via: broker } })
      .expect(200);

    const res = await request(app).get('/api/v1/correspondence').set(authHeader(token)).expect(200);
    const tally = res.body.brokers.find((b: { via: string }) => b.via === broker);
    expect(tally).toEqual({ via: broker, count: 1 });
  });

  it('groups recorded introductions apart from met-via credits (FR-COMM-003)', async () => {
    const { app, token } = await getAuthedApp();
    const stamp = Date.now();
    const person = async (title: string) => {
      const created = await request(app)
        .post('/api/v1/nodes')
        .set(authHeader(token))
        .send({ type: 'person', title, props: {} })
        .expect(201);
      return created.body.node.id as string;
    };
    const selfId = await ensureSelf(app, token);
    const introducedId = await person(`Introduced contact ${stamp}`);
    const brokerId = await person(`Broker ${stamp}`);
    await knowsEdge(app, token, selfId, introducedId);

    const edge = await request(app)
      .post('/api/v1/edges')
      .set(authHeader(token))
      .send({
        type: 'INTRODUCED',
        src: selfId,
        dst: introducedId,
        props: { via: brokerId, occurred_on: '2026-05-01', context: 'guild thread' },
      })
      .expect(201);

    const res = await request(app).get('/api/v1/correspondence').set(authHeader(token)).expect(200);
    const recorded = res.body.introduced_brokers.find(
      (b: { person_id: string | null }) => b.person_id === brokerId,
    );
    expect(recorded, 'the broker is tallied from the INTRODUCED edge').not.toBe(undefined);
    expect(recorded.label).toBe(`Broker ${stamp}`);
    expect(recorded.edge_ids).toContain(edge.body.edge.id);
    // The free-text met-via group never absorbs the structured one.
    expect(res.body.brokers.some((b: { via: string }) => b.via === brokerId)).toBe(false);
  });

  it('ranks reciprocity imbalance from the same profile the person panel shows', async () => {
    const { app, token } = await getAuthedApp();
    const stamp = Date.now();
    const created = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send({ type: 'person', title: `One-sided ${stamp}`, props: {} })
      .expect(201);
    const personId = created.body.node.id as string;
    const selfId = await ensureSelf(app, token);
    await knowsEdge(app, token, selfId, personId);
    for (let i = 0; i < 5; i += 1) {
      await request(app)
        .post('/api/v1/interactions')
        .set(authHeader(token))
        .send({
          personId,
          kind: 'email',
          summary: `Unanswered nudge ${i}`,
          occurredAt: new Date(Date.now() - (30 - i) * DAY).toISOString(),
          initiatedBy: 'me',
          idempotencyKey: `imb-${stamp}-${i}`,
        })
        .expect(201);
    }

    const res = await request(app).get('/api/v1/correspondence').set(authHeader(token)).expect(200);
    const row = res.body.out_of_balance.find(
      (r: { person: { id: string } }) => r.person.id === personId,
    );
    expect(row, 'a fully one-sided tie ranks as out of balance').not.toBe(undefined);
    expect(row.ratio).toBe(1);
    expect(row.outbound).toBe(5);
    expect(row.inbound).toBe(0);
  });

  it('rejects an unauthenticated read', async () => {
    const { app } = await getAuthedApp();
    const res = await request(app).get('/api/v1/correspondence');
    expect(res.status).toBe(401);
  });
});
