import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';
import { repository } from '../../db/repository.js';

let app: Express;
let token: string;
const now = () => new Date().toISOString();

describe('/api/v1/knowledge', () => {
  beforeAll(async () => ({ app, token } = await getAuthedApp()));

  it('applies a supported missing fact, exposes its evidence, and protects later edits during rollback', async () => {
    const person = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send({
        type: 'person',
        title: `Knowledge fixture ${Date.now()}`,
        props: { emails: [`knowledge-${Date.now()}@example.com`] },
      })
      .expect(201);
    const subjectId = person.body.node.id as string;
    const sourceId = `source-${Date.now()}`;
    const runId = `run-${Date.now()}`;
    const recordId = `record-${Date.now()}`;
    await request(app)
      .post('/api/v1/knowledge/sources')
      .set(authHeader(token))
      .send({
        id: sourceId,
        system: 'gmail_sqlite',
        title: 'Fixture mailbox',
        imported_at: now(),
        coverage: { from: null, to: null, records: 1, complete: true, limitations: [] },
        metadata: {},
      })
      .expect(201);
    await request(app)
      .post('/api/v1/knowledge/runs')
      .set(authHeader(token))
      .send({
        id: runId,
        source_id: sourceId,
        status: 'review',
        started_at: now(),
        finished_at: null,
        checkpoint: null,
        coverage: { examined: 1, extracted: 1, skipped: 0, failed: 0, complete: true },
        limitations: [],
        error: null,
        options: {},
      })
      .expect(201);
    await request(app)
      .post('/api/v1/knowledge/records')
      .set(authHeader(token))
      .send({
        id: recordId,
        source_id: sourceId,
        run_id: runId,
        external_id: 'gmail-1',
        kind: 'message',
        title: 'Contact detail',
        occurred_at: '2026-01-02T10:00:00Z',
        learned_at: now(),
        thread_key: 'thread-1',
        category: 'human',
        direction: 'in',
        participant_addresses: ['person@example.com'],
        content_hash: '1234567890abcdef',
        locator: 'gmail:message:gmail-1',
        data: {},
      })
      .expect(201);
    const assertion = await request(app)
      .post('/api/v1/knowledge/assertions')
      .set(authHeader(token))
      .send({
        id: `assertion-${Date.now()}`,
        run_id: runId,
        subject_id: subjectId,
        subject_kind: 'node',
        field: 'props.city',
        value: 'Cairo',
        citation: {
          source_id: sourceId,
          record_id: recordId,
          external_id: 'gmail-1',
          locator: 'gmail:message:gmail-1',
          content_hash: '1234567890abcdef',
          excerpt: 'I am based in Cairo.',
        },
        basis: 'explicit',
        confidence: 0.98,
        status: 'proposed',
        observed_at: now(),
        valid_from: '2026-01-02',
        valid_to: null,
        reviewed_at: null,
        reason: 'Explicit statement',
      })
      .expect(201);

    const applied = await request(app)
      .post(`/api/v1/knowledge/assertions/${assertion.body.assertion.id}/decision`)
      .set(authHeader(token))
      .send({ choice: 'apply' })
      .expect(200);
    expect(applied.body.assertion.status).toBe('accepted');
    const detail = await request(app)
      .get(`/api/v1/nodes/${subjectId}`)
      .set(authHeader(token))
      .expect(200);
    expect(detail.body.node.props.city).toBe('Cairo');
    const evidence = await request(app)
      .get(`/api/v1/knowledge/entities/${subjectId}/evidence`)
      .set(authHeader(token))
      .expect(200);
    expect(evidence.body.assertions[0].citation.excerpt).toBe('I am based in Cairo.');
    const ledger = await request(app)
      .get(`/api/v1/knowledge/records?source_id=${sourceId}&limit=1`)
      .set(authHeader(token))
      .expect(200);
    expect(ledger.body).toMatchObject({ total: 1 });
    expect(ledger.body.records[0]).toMatchObject({ id: recordId, locator: 'gmail:message:gmail-1' });

    await request(app)
      .patch(`/api/v1/nodes/${subjectId}`)
      .set(authHeader(token))
      .send({ props: { ...detail.body.node.props, city: 'Giza' } })
      .expect(200);
    const rollback = await request(app)
      .post(`/api/v1/knowledge/runs/${runId}/rollback`)
      .set(authHeader(token))
      .expect(200);
    expect(rollback.body.restored).toBe(0);
    expect(rollback.body.refused[0].reason).toContain('later edit');
    const after = await request(app)
      .get(`/api/v1/nodes/${subjectId}`)
      .set(authHeader(token))
      .expect(200);
    expect(after.body.node.props.city).toBe('Giza');
  });

  it('keeps knowledge sources isolated by workspace data space', async () => {
    const real = await request(app).get('/api/v1/knowledge').set(authHeader(token)).expect(200);
    const demo = await request(app)
      .get('/api/v1/knowledge')
      .set(authHeader(token))
      .set('x-vitae-space', 'demo')
      .expect(200);
    expect(real.body.summary.sources).toBeGreaterThan(0);
    expect(demo.body.summary.sources).toBe(0);
  });

  it('creates a reviewed person candidate and rolls it back while unchanged', async () => {
    const unique = Date.now();
    const runId = `candidate-run-${unique}`;
    const assertion = await request(app)
      .post('/api/v1/knowledge/assertions')
      .set(authHeader(token))
      .send({
        id: `candidate-assertion-${unique}`,
        run_id: runId,
        subject_id: `candidate:nora-${unique}@example.com`,
        subject_kind: 'node',
        field: '$record',
        value: {
          identity_kind: 'person',
          type: 'person',
          title: 'Nora Candidate',
          props: { emails: [`nora-${unique}@example.com`] },
        },
        citation: {
          source_id: 'candidate-source',
          record_id: `candidate-record-${unique}`,
          external_id: `gmail-${unique}`,
          locator: `gmail:message:${unique}`,
          content_hash: '1234567890abcdef',
        },
        basis: 'explicit',
        confidence: 0.8,
        status: 'proposed',
        observed_at: now(),
        valid_from: null,
        valid_to: null,
        reviewed_at: null,
        reason: 'Explicit address with an uncertain new identity.',
      })
      .expect(201);
    const applied = await request(app)
      .post(`/api/v1/knowledge/assertions/${assertion.body.assertion.id}/decision`)
      .set(authHeader(token))
      .send({ choice: 'apply' })
      .expect(200);
    expect(applied.body.decision.kind).toBe('create_entity');
    const nodeId = applied.body.assertion.subject_id as string;
    expect((await repository.getNode(nodeId))?.identity_keys).toContain(
      `email:person:nora-${unique}@example.com`,
    );

    const rollback = await request(app)
      .post(`/api/v1/knowledge/runs/${runId}/rollback`)
      .set(authHeader(token))
      .expect(200);
    expect(rollback.body).toMatchObject({ restored: 1, refused: [] });
    expect(await repository.getNode(nodeId)).toBeNull();
  });
});
