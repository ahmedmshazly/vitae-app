/**
 * The ledger (FR-PROV-002): the revision history read back as a feed. A
 * write appears newest-first with its verb, its changed fields, and a title
 * taken from its own snapshot, and the page cursor never repeats an entry.
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 100));
});

describe('ledger route', () => {
  it('shows a fresh write newest-first, labelled from its snapshot', async () => {
    const { app, token } = await getAuthedApp();
    const title = `Ledger probe ${Date.now()}`;
    const created = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send({ type: 'person', title, props: {} })
      .expect(201);
    const id = created.body.node.id as string;
    // A create's diff is its snapshot; an update is where "what changed"
    // means something, so make one and assert the fields it names.
    await request(app)
      .patch(`/api/v1/nodes/${id}`)
      .set(authHeader(token))
      .send({ title: `${title} renamed` })
      .expect(200);

    const feed = await request(app).get('/api/v1/ledger?limit=20').set(authHeader(token)).expect(200);
    const ours = feed.body.entries.filter((e: { subject_id: string }) => e.subject_id === id);
    expect(ours.length, 'both writes appear in the feed').toBeGreaterThanOrEqual(2);
    const update = ours.find((e: { op: string }) => e.op === 'update');
    expect(update.title).toBe(`${title} renamed`);
    expect(update.changed).toContain('title');
    const create = ours.find((e: { op: string }) => e.op === 'create');
    expect(create.title).toBe(title);
    // Newest first: the update outranks the create it followed.
    expect(feed.body.entries.indexOf(update)).toBeLessThan(feed.body.entries.indexOf(create));
  });

  it('pages by timestamp without repeating an entry', async () => {
    const { app, token } = await getAuthedApp();
    const first = await request(app).get('/api/v1/ledger?limit=1').set(authHeader(token)).expect(200);
    expect(first.body.entries.length).toBe(1);
    if (first.body.next_before) {
      const second = await request(app)
        .get(`/api/v1/ledger?limit=1&before=${encodeURIComponent(first.body.next_before)}`)
        .set(authHeader(token))
        .expect(200);
      const ids = new Set([first.body.entries[0].id, ...second.body.entries.map((e: { id: string }) => e.id)]);
      expect(ids.size).toBe(1 + second.body.entries.length);
    }
  });

  it('rejects an unauthenticated read', async () => {
    const { app } = await getAuthedApp();
    const res = await request(app).get('/api/v1/ledger');
    expect(res.status).toBe(401);
  });
});
