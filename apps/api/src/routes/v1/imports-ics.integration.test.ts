/**
 * Calendar (ICS) re-import is longitudinal (FR-SYNC-001, FR-SYNC-002):
 * stage → identity match → proposal → commit → rollback, and refuse rollback
 * after a later hand-edit. Complements the vCard suite with a second importer.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';

const UID = 'longitudinal-ics-qa@vitae.test';
const KEY = `ics:event:${UID}`;

function calendar(summary: string, location: string): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    `UID:${UID}`,
    `SUMMARY:${summary}`,
    'DTSTART:20260711T090000Z',
    'DTEND:20260711T093000Z',
    `LOCATION:${location}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

interface StagedRow {
  id: string;
  title: string;
  decision: 'accept' | 'skip';
  proposal: {
    identity_key: string;
    target_node_id: string;
    fields: Array<{ key: string; from: unknown; to: unknown }>;
    accepted: string[];
  } | null;
}

let app: Express;
let token: string;

async function stageCal(content: string): Promise<{ batchId: string; rows: StagedRow[] }> {
  const res = await request(app)
    .post('/api/v1/imports')
    .set(authHeader(token))
    .send({ kind: 'calendar', filename: 'longitudinal.ics', content })
    .expect(201);
  return { batchId: res.body.batch.id as string, rows: res.body.rows as StagedRow[] };
}

async function commitBatch(batchId: string) {
  const res = await request(app)
    .post(`/api/v1/imports/${batchId}/commit`)
    .set(authHeader(token))
    .expect(200);
  return res.body as { created: number; updated: number; unchanged: number; skipped: number };
}

async function setRow(batchId: string, rowId: string, body: { decision?: 'accept' | 'skip'; fields?: string[] }) {
  await request(app)
    .patch(`/api/v1/imports/${batchId}/rows/${rowId}`)
    .set(authHeader(token))
    .send(body)
    .expect(200);
}

async function node(id: string) {
  const res = await request(app).get(`/api/v1/nodes/${id}`).set(authHeader(token)).expect(200);
  return res.body.node as { id: string; title: string; props: Record<string, unknown> };
}

async function purgeFixture(): Promise<void> {
  const { repository } = await import('../../db/repository.js');
  const nodes = await repository.allLiveNodes();
  const mine = nodes.filter((n) => (n.identity_keys ?? []).includes(KEY));
  const edges = await repository.allLiveEdges();
  await repository.purgeEdges(
    edges.filter((e) => mine.some((n) => n.id === e.src || n.id === e.dst)).map((e) => e.id),
  );
  await repository.purgeNodes(mine.map((n) => n.id));
  const batches = await repository.docList<{ id: string; filename?: string }>('imports');
  await repository.docDeleteMany(
    'imports',
    batches.filter((b) => b.filename === 'longitudinal.ics').map((b) => b.id),
  );
}

describe('ICS re-import is longitudinal', () => {
  beforeAll(async () => {
    ({ app, token } = await getAuthedApp());
    await purgeFixture();
  }, 60_000);

  afterAll(async () => {
    await purgeFixture();
  }, 60_000);

  it('creates on the first import and converges silently on the second', async () => {
    const first = await stageCal(calendar('Fixture standup', 'Cairo'));
    expect(first.rows).toHaveLength(1);
    expect(first.rows[0]!.proposal).toBeNull();
    expect(await commitBatch(first.batchId)).toMatchObject({ created: 1, updated: 0, unchanged: 0 });

    const second = await stageCal(calendar('Fixture standup', 'Cairo'));
    expect(second.rows[0]!.proposal).toMatchObject({ identity_key: KEY, fields: [] });
    expect(await commitBatch(second.batchId)).toMatchObject({ created: 0, updated: 0, unchanged: 1 });
  }, 90_000);

  it('offers a changed venue as a proposal, applies it, and rolls it back', async () => {
    const staged = await stageCal(calendar('Fixture standup', 'Nairobi'));
    const row = staged.rows[0]!;
    expect(row.proposal!.fields.some((f) => f.key === 'props.venue' && f.to === 'Nairobi')).toBe(true);
    expect(row.decision).toBe('skip');

    await setRow(staged.batchId, row.id, { decision: 'accept' });
    expect(await commitBatch(staged.batchId)).toMatchObject({ updated: 1 });
    const targetId = row.proposal!.target_node_id;
    expect((await node(targetId)).props.venue).toBe('Nairobi');

    const rolled = await request(app)
      .post(`/api/v1/imports/${staged.batchId}/rollback`)
      .set(authHeader(token))
      .expect(200);
    expect(rolled.body).toMatchObject({ restored: 1 });
    expect((await node(targetId)).props.venue).toBe('Cairo');
  }, 90_000);

  it('refuses to roll back a record edited since the import', async () => {
    const staged = await stageCal(calendar('Fixture standup', 'Lisbon'));
    const row = staged.rows[0]!;
    await setRow(staged.batchId, row.id, { decision: 'accept' });
    expect(await commitBatch(staged.batchId)).toMatchObject({ updated: 1 });

    await request(app)
      .patch(`/api/v1/nodes/${row.proposal!.target_node_id}`)
      .set(authHeader(token))
      .send({ notes_md: 'edited by hand after the calendar import' })
      .expect(200);

    const rolled = await request(app)
      .post(`/api/v1/imports/${staged.batchId}/rollback`)
      .set(authHeader(token))
      .expect(200);
    expect(rolled.body.restored).toBe(0);
    expect(rolled.body.refused).toHaveLength(1);
    expect(rolled.body.refused[0].reason).toContain('edited after the import');
  }, 90_000);
});
