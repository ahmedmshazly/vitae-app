/**
 * Explore mounts: graph path, timeline review, atlas map trips.
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 100));
});

describe('explore routes', () => {
  it('finds a shortest graph path between linked nodes', async () => {
    const { app, token } = await getAuthedApp();
    const stamp = Date.now();
    const a = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send({ type: 'person', title: `Path A ${stamp}`, props: {} })
      .expect(201);
    const b = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send({ type: 'person', title: `Path B ${stamp}`, props: {} })
      .expect(201);
    const org = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send({ type: 'organization', title: `Path Org ${stamp}`, props: {} })
      .expect(201);

    const aId = a.body.node.id as string;
    const bId = b.body.node.id as string;
    const orgId = org.body.node.id as string;

    await request(app)
      .post('/api/v1/edges')
      .set(authHeader(token))
      .send({ type: 'KNOWS', src: aId, dst: bId, props: {} })
      .expect(201);
    await request(app)
      .post('/api/v1/edges')
      .set(authHeader(token))
      .send({ type: 'MEMBER_OF', src: bId, dst: orgId, props: {} })
      .expect(201);

    const path = await request(app)
      .get(`/api/v1/graph/path?from=${aId}&to=${orgId}`)
      .set(authHeader(token))
      .expect(200);
    expect(path.body.found).toBe(true);
    expect(path.body.hops.map((h: { nodeId: string }) => h.nodeId)).toEqual([aId, bId, orgId]);

    const miss = await request(app)
      .get(`/api/v1/graph/path?from=${aId}&to=missing-node`)
      .set(authHeader(token))
      .expect(200);
    expect(miss.body.found).toBe(false);
  });

  it('discovers deterministic communities, bridge records, and isolated records from the whole workspace', async () => {
    const { app, token } = await getAuthedApp();
    const stamp = Date.now();
    const create = async (title: string) => {
      const result = await request(app)
        .post('/api/v1/nodes')
        .set(authHeader(token))
        .send({ type: 'project', title: `${title} ${stamp}`, props: {} })
        .expect(201);
      return result.body.node.id as string;
    };
    const a = await create('Community A');
    const a2 = await create('Community A two');
    const a3 = await create('Community A three');
    const bridge = await create('Community bridge');
    const b = await create('Community B');
    const b2 = await create('Community B two');
    const b3 = await create('Community B three');
    const isolate = await create('Community isolate');
    for (const [src, dst] of [
      [a, a2], [a2, a3], [a3, a],
      [b, b2], [b2, b3], [b3, b],
      [a, bridge], [bridge, b], [a, bridge],
    ] as const) {
      await request(app)
        .post('/api/v1/edges')
        .set(authHeader(token))
        .send({ type: 'RELATES_TO', src, dst, props: {} })
        .expect(201);
    }

    const first = await request(app).get('/api/v1/graph/discovery').set(authHeader(token)).expect(200);
    const second = await request(app).get('/api/v1/graph/discovery').set(authHeader(token)).expect(200);
    expect(first.body.communities.map((item: { id: string }) => item.id)).toEqual(
      second.body.communities.map((item: { id: string }) => item.id),
    );
    expect(first.body.totals.records).toBeGreaterThanOrEqual(4);
    expect(first.body.totals.isolatedRecords).toBeGreaterThanOrEqual(1);
    expect(first.body.disconnected.some((item: { records: Array<{ id: string }> }) => item.records.some((record) => record.id === isolate))).toBe(true);

    expect([...first.body.bridges].every((item: { connectedCommunityCount: number; crossCommunityNeighborCount: number }, index: number, list: Array<{ connectedCommunityCount: number; crossCommunityNeighborCount: number }>) => {
      const next = list[index + 1];
      return !next || item.connectedCommunityCount > next.connectedCommunityCount || (item.connectedCommunityCount === next.connectedCommunityCount && item.crossCommunityNeighborCount >= next.crossCommunityNeighborCount);
    })).toBe(true);
    const community = first.body.communities.find((item: { representatives: Array<{ id: string }> }) => item.representatives.some((record) => record.id === a));
    expect(community).toBeTruthy();
    const detail = await request(app)
      .get(`/api/v1/graph/discovery/community/${community.id}?limit=1`)
      .set(authHeader(token))
      .expect(200);
    expect(detail.body.members).toHaveLength(1);
    expect(detail.body.totalMembers).toBeGreaterThanOrEqual(1);
  });

  it('returns a timeline review digest for a brushed range', async () => {
    const { app, token } = await getAuthedApp();
    const stamp = Date.now();
    await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send({
        type: 'trip',
        title: `Review Trip Split ${stamp}`,
        props: {},
        start_date: '2024-05-01',
        end_date: '2024-05-10',
      })
      .expect(201);

    const review = await request(app)
      .get('/api/v1/timeline/review?from=2024-01-01&to=2024-12-31')
      .set(authHeader(token))
      .expect(200);
    expect(review.body.from).toBe('2024-01-01');
    expect(Array.isArray(review.body.sections)).toBe(true);
    expect(review.body.summary.trips).toBeGreaterThanOrEqual(1);
  });

  it('returns atlas trips with VISITED stops for the map', async () => {
    const { app, token } = await getAuthedApp();
    const stamp = Date.now();
    const berlin = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send({ type: 'location', title: `Berlin Split ${stamp}`, props: { kind: 'city', lat: 52.52, lng: 13.41 } })
      .expect(201);
    const munich = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send({ type: 'location', title: `Munich Split ${stamp}`, props: { kind: 'city', lat: 48.14, lng: 11.58 } })
      .expect(201);
    const trip = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send({
        type: 'trip',
        title: `Atlas Trip Split ${stamp}`,
        props: { purpose: 'conference' },
        start_date: '2024-06-01',
        end_date: '2024-06-10',
      })
      .expect(201);
    const tripId = trip.body.node.id as string;
    await request(app)
      .post('/api/v1/edges')
      .set(authHeader(token))
      .send({ type: 'VISITED', src: tripId, dst: berlin.body.node.id, props: { nights: 3 } })
      .expect(201);
    await request(app)
      .post('/api/v1/edges')
      .set(authHeader(token))
      .send({ type: 'VISITED', src: tripId, dst: munich.body.node.id, props: { nights: 2 } })
      .expect(201);

    const map = await request(app).get('/api/v1/map').set(authHeader(token)).expect(200);
    const found = map.body.trips.find((t: { id: string }) => t.id === tripId);
    expect(found?.stops.length).toBe(2);

    const filtered = await request(app)
      .get('/api/v1/map?from=2023-01-01&to=2023-12-31')
      .set(authHeader(token))
      .expect(200);
    expect(filtered.body.trips.some((t: { id: string }) => t.id === tripId)).toBe(false);
  });
});
