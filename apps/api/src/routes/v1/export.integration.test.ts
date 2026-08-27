/**
 * Export route contracts: manifest identity, sensitive filtering, CSV formula guard.
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 100));
});

describe('export routes', () => {
  it('neutralizes spreadsheet formulas in saved-view CSV (FR-021)', async () => {
    const { app, token } = await getAuthedApp();
    const marker = `CsvProbe${Date.now()}`;
    await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send({ type: 'idea', title: `=cmd|' /c calc'!A1 ${marker}`, props: { status: 'spark' } })
      .expect(201);

    const view = await request(app)
      .post('/api/v1/views')
      .set(authHeader(token))
      .send({ name: `probe-${marker}`, query: marker })
      .expect(201);

    const csv = await request(app)
      .get(`/api/v1/export/views/${view.body.view.id}.csv`)
      .set(authHeader(token))
      .expect(200);

    expect(csv.text).toContain("'=cmd");
    expect(csv.text).not.toMatch(/,=cmd/);
  });

  it('exports every collection with identity, and filters sensitive records (FR-001/FR-012)', async () => {
    const { app, token } = await getAuthedApp();
    const { repository } = await import('../../db/repository.js');
    await repository.docTruncate('attachments');
    const marker = `Sensitive${Date.now()}`;
    const secret = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send({ type: 'person', title: marker, sensitivity: 'sensitive', props: {} })
      .expect(201);
    const secretId = secret.body.node.id;

    const manifest = await request(app).get('/api/v1/export/manifest').set(authHeader(token)).expect(200);

    for (const key of [
      'nodes',
      'edges',
      'revisions',
      'atoms',
      'targets',
      'resumes',
      'letters',
      'reminders',
      'saved_views',
      'merges',
      'imports',
    ]) {
      expect(manifest.body.manifest.counts, key).toHaveProperty(key);
    }
    expect(manifest.body.manifest.schema_version).toMatch(/^3\./);
    expect(manifest.body.manifest.includes_sensitive).toBe(false);

    const zip = await request(app)
      .post('/api/v1/export')
      .set(authHeader(token))
      .send({})
      .buffer()
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect((zip.body as Buffer).length).toBeGreaterThan(0);

    const withSensitive = await request(app)
      .get('/api/v1/export/manifest?includeSensitive=true')
      .set(authHeader(token))
      .expect(200);
    expect(withSensitive.body.manifest.counts.nodes).toBeGreaterThanOrEqual(manifest.body.manifest.counts.nodes);

    await request(app).delete(`/api/v1/nodes/${secretId}`).set(authHeader(token)).expect(200);
  }, 90_000);
});
