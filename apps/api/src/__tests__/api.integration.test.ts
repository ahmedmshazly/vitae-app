/**
 * API integration tests against Postgres (`vitae_test`). They exercise the
 * default-deny gate and the capture → search → revisions flow end-to-end.
 *
 * `vitest.global-setup.ts` provisions the test database and refuses to start
 * without Postgres. Auth still uses the Firebase Admin path with
 * `AUTH_ENABLE_DEV_LOGIN` for a local bearer token.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { requireSessionToken } from './helpers/app.js';

const d = describe;

let app: Express;
let token: string;

d('Vitae API (integration)', () => {
  beforeAll(async () => {
    process.env.AUTH_ENABLE_DEV_LOGIN = 'true';
    const { createApp } = await import('../app.js');
    app = createApp();
    const res = await request(app).post('/api/v1/auth/dev-login');
    token = requireSessionToken(res);
  });

  afterAll(async () => {
    // Give open pool clients a beat to settle before vitest tears the process down.
    await new Promise((r) => setTimeout(r, 200));
  });

  it('denies unauthenticated access (SRS T1)', async () => {
    await request(app).get('/api/v1/nodes').expect(401);
  });

  it('serves the public health probe', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.body.ok).toBe(true);
  });

  it('lists template gallery metadata and persists the default template', async () => {
    const listed = await request(app)
      .get('/api/v1/resumes/templates')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(listed.body.templates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'cobalt',
          description: expect.any(String),
          traits: expect.arrayContaining([expect.any(String)]),
          page_size: expect.any(String),
          accent_options: expect.arrayContaining(['#2563eb']),
        }),
        expect.objectContaining({
          key: 'argon',
          ats_strict: true,
          accent_options: ['#111827'],
        }),
      ]),
    );
    expect(listed.body.defaultKey).toBeTruthy();
    expect(listed.body.defaultAccent).toMatch(/^#/);

    await request(app)
      .patch('/api/v1/resumes/templates/default')
      .set('Authorization', `Bearer ${token}`)
      .send({ templateKey: 'onyx' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.defaultKey).toBe('onyx');
      });

    const after = await request(app)
      .get('/api/v1/resumes/templates')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(after.body.defaultKey).toBe('onyx');

    await request(app)
      .patch('/api/v1/resumes/templates/default')
      .set('Authorization', `Bearer ${token}`)
      .send({ templateKey: 'not-a-template' })
      .expect(422);

    await request(app)
      .patch('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ resumeDefaults: { accent: '#0f766e', templateKey: 'cobalt' } })
      .expect(200);

    const settings = await request(app)
      .get('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(settings.body.resumeDefaults).toMatchObject({
      templateKey: 'cobalt',
      accent: '#0f766e',
    });

    await request(app)
      .patch('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ resumeDefaults: { accent: '#ff00ff' } })
      .expect(422);
  });

  it('issues a dev-login token for the owner', () => {
    expect(token).toBeTruthy();
  });

  it('captures a person with the ⌘K grammar and writes revisions (J1)', async () => {
    const res = await request(app)
      .post('/api/v1/capture')
      .set('Authorization', `Bearer ${token}`)
      .send({ raw: 'p Test Person #ml ^fri > met at a meetup' })
      .expect(201);

    expect(res.body.primaryId).toBeTruthy();
    expect(res.body.created.nodes.length).toBeGreaterThanOrEqual(1);
    expect(res.body.created.reminders.length).toBe(1);

    // Revisions were written for the created node.
    const revs = await request(app)
      .get(`/api/v1/nodes/${res.body.primaryId}/revisions`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(revs.body.revisions[0].op).toBe('create');
  });

  it('resolves ^today in the timezone the request carries (FR-025)', async () => {
    // At any real instant, at least one of these two zones sits on a
    // different calendar date from the server host. Before the fix, capture
    // resolved ^today with the host clock while every read surface answered
    // "today" in the request timezone — so for a few hours every night a
    // captured task and its follow-up reminder landed one day in the future
    // and Today's queue rightly refused to show them. That is exactly how a
    // gate run that started at 02:40 host-local lost its Done rows.
    for (const tz of ['Etc/GMT-14', 'Etc/GMT+12']) {
      const expected = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
      const res = await request(app)
        .post('/api/v1/capture')
        .set('Authorization', `Bearer ${token}`)
        .set('x-vitae-tz', tz)
        .send({ raw: `t Timezone boundary ${tz} ^today` })
        .expect(201);

      const node = await request(app)
        .get(`/api/v1/nodes/${res.body.primaryId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(node.body.node.start_date, `^today from ${tz}`).toBe(expected);
    }
  });

  it('lists imported people without claiming the owner knows them', async () => {
    const title = `Imported Directory Person ${Date.now()}`;
    const created = await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'person', title, props: {}, source: 'import_aperture' })
      .expect(201);

    const detail = await request(app)
      .get(`/api/v1/nodes/${created.body.node.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      detail.body.edges.some((edge: { type: string }) => edge.type === 'KNOWS'),
      'an import must not manufacture a personal relationship',
    ).toBe(false);

    const people = await request(app)
      .get('/api/v1/people')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(people.body.people.some((person: { id: string }) => person.id === created.body.node.id)).toBe(true);

    const nodes = await request(app)
      .get('/api/v1/nodes?type=person&limit=1000')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const expectedCount = nodes.body.nodes.filter(
      (person: { props?: { is_self?: boolean } }) => person.props?.is_self !== true,
    ).length;
    const dashboard = await request(app)
      .get('/api/v1/dashboard')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(dashboard.body.counts.people).toBe(expectedCount);
  });

  it('soft-deletes and restores a node, recording ops (J8)', async () => {
    const created = await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'project', title: 'Deletable Project', props: {} })
      .expect(201);
    const id = created.body.node.id;

    await request(app).delete(`/api/v1/nodes/${id}`).set('Authorization', `Bearer ${token}`).expect(200);
    await request(app).get(`/api/v1/nodes/${id}`).set('Authorization', `Bearer ${token}`); // still fetchable (includeDeleted)
    await request(app).post(`/api/v1/nodes/${id}/restore`).set('Authorization', `Bearer ${token}`).expect(200);

    const revs = await request(app)
      .get(`/api/v1/nodes/${id}/revisions`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const ops = revs.body.revisions.map((r: { op: string }) => r.op);
    expect(ops).toContain('delete');
    expect(ops).toContain('restore');
  });

  it('creates a typed long-tail node and rejects bad props (FR-CAP-002)', async () => {
    const ok = await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'goal',
        title: 'Ship the makeover',
        props: { horizon: 'quarter', goal_status: 'active', key_results: [{ name: 'phases', current: 3, target: 9 }] },
      })
      .expect(201);
    expect(ok.body.node.props.horizon).toBe('quarter');

    const bad = await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'goal', title: 'x', props: { horizon: 'decade' } })
      .expect(422);
    expect(JSON.stringify(bad.body.error.details)).toContain('horizon');
  });

  it('validates PATCH payloads and strips system fields', async () => {
    const created = await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'media_item', title: 'Patchable', props: { media_kind: 'book', extra_key: 'kept' } })
      .expect(201);
    const id = created.body.node.id;

    // Valid patch updates props and preserves unknown keys (passthrough).
    const patched = await request(app)
      .patch(`/api/v1/nodes/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ props: { media_kind: 'book', rating: 5, extra_key: 'kept' }, deleted_at: '2020-01-01T00:00:00Z' })
      .expect(200);
    expect(patched.body.node.props.rating).toBe(5);
    expect(patched.body.node.props.extra_key).toBe('kept');
    expect(patched.body.node.deleted_at).toBeNull(); // system field stripped

    // Invalid props are rejected with field errors.
    await request(app)
      .patch(`/api/v1/nodes/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ props: { rating: 11 } })
      .expect(422);
  });

  it('soft-deletes an edge, writes a revision, and recomputes KNOWS strength', async () => {
    const a = await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'person', title: 'Edge Tester', props: {} })
      .expect(201);
    const b = await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'project', title: 'Edge Project', props: {} })
      .expect(201);

    const edge = await request(app)
      .post('/api/v1/edges')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'WORKED_ON', src: a.body.node.id, dst: b.body.node.id, props: { involvement: 'led' } })
      .expect(201);
    const edgeId = edge.body.edge.id;

    // GET, PATCH (validated), DELETE, restore.
    await request(app).get(`/api/v1/edges/${edgeId}`).set('Authorization', `Bearer ${token}`).expect(200);
    await request(app)
      .patch(`/api/v1/edges/${edgeId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ props: { involvement: 'not-a-level' } })
      .expect(422);
    const del = await request(app)
      .delete(`/api/v1/edges/${edgeId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(del.body.edge.deleted_at).toBeTruthy();
    await request(app).post(`/api/v1/edges/${edgeId}/restore`).set('Authorization', `Bearer ${token}`).expect(200);

    const node = await request(app)
      .get(`/api/v1/nodes/${a.body.node.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(node.body.edges.some((e: { id: string }) => e.id === edgeId)).toBe(true);
  });

  it('parses a JD into weighted keywords (résumé engine)', async () => {
    const res = await request(app)
      .post('/api/v1/targets')
      .set('Authorization', `Bearer ${token}`)
      .send({ role_title: 'ML Engineer', jd_raw: 'Requirements\n- Strong Python\n- Kubernetes' })
      .expect(201);
    expect(res.body.target.parsed.keywords.length).toBeGreaterThan(0);
  });

  it('serves the enriched Today aggregate (focus, setup, insights)', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.focus).toHaveProperty('tasks');
    expect(res.body.focus).toHaveProperty('goals');
    expect(Array.isArray(res.body.upcoming)).toBe(true);
    expect(res.body.setup).toHaveProperty('done');
    expect(res.body.setup.total).toBe(6);
    // Momentum is computed server-side and decomposes into weighted factors.
    expect(typeof res.body.insights.momentum.score).toBe('number');
    const weights = res.body.insights.momentum.factors.map((f: { weight: number }) => f.weight);
    expect(weights.reduce((a: number, b: number) => a + b, 0)).toBe(100);
    expect(res.body.insights.relationships).toHaveProperty('drifting');
    expect(res.body.insights.skills).toHaveProperty('covered');
  });

  it('suggests existing values for entry boxes (FR-CAP-003)', async () => {
    const marker = `Zsuggest${Date.now()}`;
    await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'skill', title: marker, props: { category: 'language', aliases: [`${marker}-alias`] } })
      .expect(201);

    const skills = await request(app)
      .get(`/api/v1/suggest/values?kind=skill&q=${marker.toLowerCase()}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(skills.body.values.some((v: { value: string }) => v.value === marker)).toBe(true);

    // Unknown kinds return an empty list rather than erroring.
    const bad = await request(app)
      .get('/api/v1/suggest/values?kind=nope')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(bad.body.values).toEqual([]);
  });

  // ── Résumé engine: targets list, drafts, manual selection, compile, spaces ──

  it('lists targets and round-trips a workspace draft', async () => {
    const created = await request(app)
      .post('/api/v1/targets')
      .set('Authorization', `Bearer ${token}`)
      .send({ role_title: 'Draft Tester', jd_raw: 'Requirements\n- Python\n- SQL' })
      .expect(201);
    const id = created.body.target.id;

    const draft = { mode: 'manual', templateKey: 'cobalt', include: ['x1', 'x2'], sectionsEnabled: { awards: false } };
    await request(app)
      .patch(`/api/v1/targets/${id}/draft`)
      .set('Authorization', `Bearer ${token}`)
      .send({ draft })
      .expect(200);

    const list = await request(app).get('/api/v1/targets').set('Authorization', `Bearer ${token}`).expect(200);
    const found = list.body.targets.find((t: { id: string }) => t.id === id);
    expect(found).toBeTruthy();
    expect(found.draft).toEqual(draft);
    expect(found.parsed.keywords.length).toBeGreaterThan(0);

    await request(app)
      .patch('/api/v1/targets/nope/draft')
      .set('Authorization', `Bearer ${token}`)
      .send({ draft })
      .expect(404);
  });

  it('updates target fields/status/keywords and soft-archives/restores', async () => {
    const created = await request(app)
      .post('/api/v1/targets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        role_title: 'Lifecycle Role',
        company: 'Acme',
        jd_raw: 'Requirements\n- Python\n- Kubernetes',
      })
      .expect(201);
    const id = created.body.target.id;
    expect(created.body.target.deleted_at).toBeNull();
    expect(created.body.target.rev).toBe(1);

    const patched = await request(app)
      .patch(`/api/v1/targets/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role_title: 'Senior Lifecycle Role', company: 'Beta Co', status: 'active' })
      .expect(200);
    expect(patched.body.target.role_title).toBe('Senior Lifecycle Role');
    expect(patched.body.target.company).toBe('Beta Co');
    expect(patched.body.target.status).toBe('active');
    expect(patched.body.target.rev).toBe(2);

    const keywords = [
      { term: 'Python', weight: 3, skill_id: null, sections: [], spans: [] },
      { term: 'Go', weight: 2, skill_id: null, sections: [], spans: [] },
    ];
    await request(app)
      .patch(`/api/v1/targets/${id}/keywords`)
      .set('Authorization', `Bearer ${token}`)
      .send({ parsed: { parser_version: 'manual', keywords } })
      .expect(200);

    await request(app)
      .patch(`/api/v1/targets/${id}/keywords`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        parsed: {
          parser_version: 'manual',
          keywords: [{ term: '   ', weight: 1, skill_id: null, sections: [], spans: [] }],
        },
      })
      .expect(422);

    await request(app).delete(`/api/v1/targets/${id}`).set('Authorization', `Bearer ${token}`).expect(200);

    const live = await request(app).get('/api/v1/targets').set('Authorization', `Bearer ${token}`).expect(200);
    expect(live.body.targets.some((t: { id: string }) => t.id === id)).toBe(false);

    const archived = await request(app)
      .get('/api/v1/targets?includeArchived=true')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const soft = archived.body.targets.find((t: { id: string }) => t.id === id);
    expect(soft?.deleted_at).toBeTruthy();
    expect(soft?.parsed.keywords.map((k: { term: string }) => k.term)).toEqual(['Python', 'Go']);

    await request(app)
      .post(`/api/v1/targets/${id}/restore`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const restored = await request(app).get('/api/v1/targets').set('Authorization', `Bearer ${token}`).expect(200);
    const again = restored.body.targets.find((t: { id: string }) => t.id === id);
    expect(again?.deleted_at).toBeNull();
    expect(again?.status).toBe('active');
  });

  it('manual tailor returns exactly the requested atoms in the requested order', async () => {
    // Two atoms owned by a role, picked in reverse order of recency.
    const role = await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'role', title: 'Manual Role', props: { employment_type: 'full_time' } })
      .expect(201);
    const mkAtom = async (text: string) => {
      const res = await request(app)
        .post('/api/v1/atoms')
        .set('Authorization', `Bearer ${token}`)
        .send({ owner_node: role.body.node.id, kind: 'achievement', metrics: [], pinned: false, blocked: false, variants: [{ emphasis: 'technical', text }] })
        .expect(201);
      return res.body.id as string;
    };
    const a1 = await mkAtom('Manual atom one about Python.');
    const a2 = await mkAtom('Manual atom two about SQL.');

    const target = await request(app)
      .post('/api/v1/targets')
      .set('Authorization', `Bearer ${token}`)
      .send({ role_title: 'Manual Mode', jd_raw: 'Requirements\n- Python\n- SQL' })
      .expect(201);

    const res = await request(app)
      .post('/api/v1/resumes/tailor')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetId: target.body.target.id, mode: 'manual', include: [a2, a1] })
      .expect(200);
    expect(res.body.selection.entries.map((e: { atomId: string }) => e.atomId)).toEqual([a2, a1]);
  });

  it('creates, edits, duplicates, and archives atoms in the library', async () => {
    const peopleNodes = await request(app)
      .get('/api/v1/nodes?type=person&limit=1000')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    let selfId = (
      peopleNodes.body.nodes as Array<{ id: string; props?: { is_self?: boolean } }>
    ).find((p) => p.props?.is_self === true)?.id;
    if (!selfId) {
      const createdSelf = await request(app)
        .post('/api/v1/nodes')
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'person', title: 'Atom Library Owner', props: { is_self: true } })
        .expect(201);
      selfId = createdSelf.body.node.id as string;
    }

    const role = await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'role',
        title: 'Atom Library Role',
        props: { employment_type: 'full_time' },
        subject: { node_id: selfId },
      })
      .expect(201);
    const skill = await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'skill', title: 'AtomLibraryPython', props: { category: 'language' } })
      .expect(201);

    const created = await request(app)
      .post('/api/v1/atoms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        owner_node: role.body.node.id,
        kind: 'achievement',
        pinned: false,
        blocked: false,
        metrics: [{ value: 38, unit: '%' }],
        evidence: [{ kind: 'url', url: 'https://example.com/atom-proof' }],
        variants: [
          { emphasis: 'technical', text: 'Cut latency by 38 percent with Python.', is_default: true },
          {
            emphasis: 'leadership',
            text: 'Led the team that cut latency by 38 percent.',
            is_default: false,
          },
        ],
        skill_ids: [skill.body.node.id],
      })
      .expect(201);
    const atomId = created.body.id as string;

    const listed = await request(app)
      .get('/api/v1/atoms')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(listed.body.owners.some((owner: { id: string }) => owner.id === role.body.node.id)).toBe(
      true,
    );
    const row = listed.body.atoms.find((atom: { id: string }) => atom.id === atomId);
    expect(row).toMatchObject({
      id: atomId,
      owner_node: role.body.node.id,
      evidence: [{ kind: 'url', url: 'https://example.com/atom-proof' }],
    });
    expect(row.variants).toHaveLength(2);
    expect(row.skill_ids).toContain(skill.body.node.id);

    await request(app)
      .patch(`/api/v1/atoms/${atomId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        owner_node: role.body.node.id,
        kind: 'achievement',
        pinned: true,
        blocked: false,
        metrics: [{ value: 40, unit: '%' }],
        evidence: [{ kind: 'url', url: 'https://example.com/atom-proof-v2' }],
        variants: [
          { emphasis: 'technical', text: 'Cut latency by 40 percent with Python.', is_default: true },
        ],
        skill_ids: [skill.body.node.id],
        expected_rev: row.rev,
      })
      .expect(200);

    await request(app)
      .patch(`/api/v1/atoms/${atomId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ pinned: true })
      .expect(200);

    const duplicate = await request(app)
      .post(`/api/v1/atoms/${atomId}/duplicate`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(duplicate.body.id).not.toBe(atomId);

    await request(app)
      .delete(`/api/v1/atoms/${duplicate.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const archived = await request(app)
      .get('/api/v1/atoms?includeDeleted=true&state=archived')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      archived.body.atoms.some(
        (atom: { id: string; deleted_at?: string }) =>
          atom.id === duplicate.body.id && atom.deleted_at,
      ),
    ).toBe(true);

    await request(app)
      .post(`/api/v1/atoms/${duplicate.body.id}/restore`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const repo = await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'link',
        title: 'Atom Evidence Link',
        props: { url: 'https://example.com/evidence-link' },
      })
      .expect(201);

    const withNodeEvidence = await request(app)
      .post('/api/v1/atoms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        owner_node: role.body.node.id,
        kind: 'achievement',
        pinned: false,
        blocked: false,
        metrics: [],
        evidence: [
          { kind: 'node', node_id: repo.body.node.id },
          { kind: 'url', url: 'https://example.com/with-repo' },
        ],
        variants: [
          {
            emphasis: 'technical',
            text: 'Shipped the evidence-linked latency fix.',
            is_default: true,
          },
        ],
        skill_ids: [],
      })
      .expect(201);

    const listedWithEvidence = await request(app)
      .get('/api/v1/atoms')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const evidenceRow = listedWithEvidence.body.atoms.find(
      (atom: { id: string }) => atom.id === withNodeEvidence.body.id,
    );
    expect(evidenceRow.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'node',
          node_id: repo.body.node.id,
          title: 'Atom Evidence Link',
          node_type: 'link',
        }),
        expect.objectContaining({ kind: 'url', url: 'https://example.com/with-repo' }),
      ]),
    );

    await request(app)
      .post('/api/v1/atoms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        owner_node: role.body.node.id,
        kind: 'achievement',
        evidence: [{ kind: 'node', node_id: 'missing-evidence-node' }],
        variants: [{ emphasis: 'technical', text: 'missing evidence', is_default: true }],
        skill_ids: [],
      })
      .expect(422);

    await request(app)
      .post('/api/v1/atoms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        owner_node: role.body.node.id,
        kind: 'achievement',
        variants: [
          { emphasis: 'technical', text: 'dup', is_default: true },
          { emphasis: 'technical', text: 'also dup', is_default: true },
        ],
        skill_ids: [],
      })
      .expect(422);
  });

  it('stores cover-letter drafts against a target (FR-RES-020)', async () => {
    const target = await request(app)
      .post('/api/v1/targets')
      .set('Authorization', `Bearer ${token}`)
      .send({ role_title: 'Cover Letter Role', jd_raw: 'Requirements\n- Writing\n- Clarity' })
      .expect(201);
    const role = await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'role', title: 'Letter Owner Role', props: { employment_type: 'full_time' } })
      .expect(201);
    const atom = await request(app)
      .post('/api/v1/atoms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        owner_node: role.body.node.id,
        kind: 'achievement',
        variants: [{ emphasis: 'technical', text: 'Shipped clear writing systems.', is_default: true }],
      })
      .expect(201);

    const created = await request(app)
      .post('/api/v1/letters')
      .set('Authorization', `Bearer ${token}`)
      .send({
        target_id: target.body.target.id,
        blocks: [
          { kind: 'hook', text: 'I am excited about the Cover Letter Role.' },
          { kind: 'body', atom_id: atom.body.id },
          { kind: 'closer', text: 'Looking forward to speaking.' },
        ],
      })
      .expect(201);
    expect(created.body.letter).toMatchObject({
      target_id: target.body.target.id,
      status: 'draft',
      tex_key: null,
      pdf_key: null,
    });
    expect(created.body.letter.blocks).toHaveLength(3);

    const listed = await request(app)
      .get(`/api/v1/letters?targetId=${target.body.target.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(listed.body.letters.some((row: { id: string }) => row.id === created.body.letter.id)).toBe(
      true,
    );

    await request(app)
      .patch(`/api/v1/letters/${created.body.letter.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'final', expected_rev: created.body.letter.rev })
      .expect(200);

    await request(app)
      .delete(`/api/v1/letters/${created.body.letter.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const archived = await request(app)
      .get('/api/v1/letters?includeDeleted=true')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      archived.body.letters.some(
        (row: { id: string; deleted_at?: string | null }) =>
          row.id === created.body.letter.id && row.deleted_at,
      ),
    ).toBe(true);

    await request(app)
      .post('/api/v1/letters')
      .set('Authorization', `Bearer ${token}`)
      .send({
        target_id: 'missing-target',
        blocks: [{ kind: 'hook', text: 'nope' }],
      })
      .expect(422);
  });

  it('applies per-atom wording and curated accent through tailor/compile/finalize', async () => {
    const peopleNodes = await request(app)
      .get('/api/v1/nodes?type=person&limit=1000')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    let selfId = (
      peopleNodes.body.nodes as Array<{ id: string; props?: { is_self?: boolean } }>
    ).find((p) => p.props?.is_self === true)?.id;
    if (!selfId) {
      const createdSelf = await request(app)
        .post('/api/v1/nodes')
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'person', title: 'Wording Owner', props: { is_self: true } })
        .expect(201);
      selfId = createdSelf.body.node.id as string;
    }

    const role = await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'role',
        title: 'Wording Role',
        props: { employment_type: 'full_time' },
        subject: { node_id: selfId },
      })
      .expect(201);
    const atom = await request(app)
      .post('/api/v1/atoms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        owner_node: role.body.node.id,
        kind: 'achievement',
        metrics: [],
        pinned: false,
        blocked: false,
        variants: [
          { emphasis: 'technical', text: 'TECHWORDINGVARIANT about Python.', is_default: true },
          { emphasis: 'leadership', text: 'LEADWORDINGVARIANT about Python.', is_default: false },
        ],
      })
      .expect(201);
    const atomId = atom.body.id as string;

    const target = await request(app)
      .post('/api/v1/targets')
      .set('Authorization', `Bearer ${token}`)
      .send({ role_title: 'Wording Accent', jd_raw: 'Requirements\n- Python' })
      .expect(201);
    const targetId = target.body.target.id as string;

    await request(app)
      .post('/api/v1/resumes/tailor')
      .set('Authorization', `Bearer ${token}`)
      .send({
        targetId,
        mode: 'manual',
        include: [atomId],
        preferredEmphasis: 'technical',
        variantByAtom: { [atomId]: 'not-a-real-emphasis' },
      })
      .expect(422);

    await request(app)
      .post('/api/v1/resumes/compile')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetId, mode: 'manual', include: [atomId], accent: '#ff00ff' })
      .expect(422);

    const tailored = await request(app)
      .post('/api/v1/resumes/tailor')
      .set('Authorization', `Bearer ${token}`)
      .send({
        targetId,
        mode: 'manual',
        include: [atomId],
        preferredEmphasis: 'technical',
        variantByAtom: { [atomId]: 'leadership' },
      })
      .expect(200);
    expect(tailored.body.selection.entries[0]).toMatchObject({
      atomId,
      emphasis: 'leadership',
      text: 'LEADWORDINGVARIANT about Python.',
    });

    const compiled = await request(app)
      .post('/api/v1/resumes/compile')
      .set('Authorization', `Bearer ${token}`)
      .send({
        targetId,
        templateKey: 'cobalt',
        mode: 'manual',
        include: [atomId],
        preferredEmphasis: 'technical',
        variantByAtom: { [atomId]: 'leadership' },
        accent: '#0f766e',
      })
      .expect(200);
    expect(compiled.body.tex).toContain('LEADWORDINGVARIANT');
    expect(compiled.body.tex).not.toContain('TECHWORDINGVARIANT');
    expect(compiled.body.tex).toContain('\\definecolor{accent}{HTML}{0F766E}');

    const finalized = await request(app)
      .post('/api/v1/resumes/finalize')
      .set('Authorization', `Bearer ${token}`)
      .send({
        targetId,
        templateKey: 'cobalt',
        mode: 'manual',
        include: [atomId],
        preferredEmphasis: 'technical',
        variantByAtom: { [atomId]: 'leadership' },
        accent: '#0f766e',
      })
      .expect(200);
    expect(finalized.body).toMatchObject({
      fitDecisions: expect.any(Array),
      needsManualTrim: expect.any(Boolean),
    });
    const outputs = await request(app).get('/api/v1/resumes').set('Authorization', `Bearer ${token}`).expect(200);
    const saved = outputs.body.resumes.find((resume: { id: string }) => resume.id === finalized.body.id);
    expect(saved.config).toMatchObject({
      accent: '#0f766e',
      emphasis: 'technical',
      variant_by_atom: { [atomId]: 'leadership' },
    });
    const detail = await request(app)
      .get(`/api/v1/resumes/${finalized.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(detail.body.resume).toMatchObject({
      fit_decisions: expect.any(Array),
      needs_manual_trim: expect.any(Boolean),
    });
  });

  it('lists, details, duplicates, archives, and restores résumé outputs', async () => {
    const role = await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'role', title: 'Outputs Role', props: { employment_type: 'full_time' } })
      .expect(201);
    const atom = await request(app)
      .post('/api/v1/atoms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        owner_node: role.body.node.id,
        kind: 'achievement',
        metrics: [],
        pinned: false,
        blocked: false,
        variants: [{ emphasis: 'technical', text: 'Built Python pipelines for Outputs studio.' }],
      })
      .expect(201);
    const target = await request(app)
      .post('/api/v1/targets')
      .set('Authorization', `Bearer ${token}`)
      .send({ role_title: 'Outputs Engineer', company: 'Studio Co', jd_raw: 'Requirements\n- Python' })
      .expect(201);

    const finalized = await request(app)
      .post('/api/v1/resumes/finalize')
      .set('Authorization', `Bearer ${token}`)
      .send({
        targetId: target.body.target.id,
        templateKey: 'cobalt',
        mode: 'manual',
        include: [atom.body.id],
        name: `Outputs Studio ${Date.now()}`,
      })
      .expect(200);
    const id = finalized.body.id as string;

    const list = await request(app).get('/api/v1/resumes').set('Authorization', `Bearer ${token}`).expect(200);
    const listed = list.body.resumes.find((resume: { id: string }) => resume.id === id);
    expect(listed).toBeTruthy();
    expect(listed.target?.role_title).toBe('Outputs Engineer');
    expect(listed.deleted_at).toBeNull();

    const detail = await request(app)
      .get(`/api/v1/resumes/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(detail.body.resume.id).toBe(id);
    expect(detail.body.resume.target?.company).toBe('Studio Co');

    await request(app)
      .post(`/api/v1/resumes/${id}/set-base`)
      .set('Authorization', `Bearer ${token}`)
      .expect(finalized.body.status === 'final' ? 200 : 409);

    const dup = await request(app)
      .post(`/api/v1/resumes/${id}/duplicate`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(dup.body.resume.name).toMatch(/copy$/);
    expect(dup.body.resume.status).toBe('draft');
    expect(dup.body.resume.artifact_ids).toEqual({});

    await request(app).delete(`/api/v1/resumes/${id}`).set('Authorization', `Bearer ${token}`).expect(200);
    const live = await request(app).get('/api/v1/resumes').set('Authorization', `Bearer ${token}`).expect(200);
    expect(live.body.resumes.some((resume: { id: string }) => resume.id === id)).toBe(false);

    const archived = await request(app)
      .get('/api/v1/resumes?includeDeleted=true')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(archived.body.resumes.find((resume: { id: string }) => resume.id === id)?.deleted_at).toBeTruthy();

    await request(app)
      .post(`/api/v1/resumes/${id}/restore`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const restored = await request(app).get('/api/v1/resumes').set('Authorization', `Bearer ${token}`).expect(200);
    expect(restored.body.resumes.some((resume: { id: string }) => resume.id === id)).toBe(true);

    // No Cloudinary artifacts in test env, signed download stays unavailable.
    await request(app)
      .get(`/api/v1/resumes/${id}/artifacts/pdf`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);

    // Re-export stamps artifact ids on the résumé. Attachment rows are skipped
    // in test (no Cloudinary) so later export/restore round-trips stay clean.
    const reexported = await request(app)
      .post(`/api/v1/resumes/${id}/reexport`)
      .set('Authorization', `Bearer ${token}`);
    if (reexported.status === 200) {
      expect(reexported.body.ok).toBe(true);
      expect(reexported.body.artifactIds?.pdf).toBeTruthy();
      expect(reexported.body.artifactIds?.tex).toBeTruthy();
      const after = await request(app)
        .get(`/api/v1/resumes/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(after.body.resume.artifact_ids?.pdf).toBe(reexported.body.artifactIds.pdf);
    } else {
      // Offline buildsvc: recovery cannot synthesize a PDF.
      expect([422, 503]).toContain(reexported.status);
    }

    const overview = await request(app)
      .get('/api/v1/resumes/overview')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(overview.body.counts).toHaveProperty('outputs');
  });

  it('assembles, filters, orders, and persists item-level document configuration', async () => {
    const marker = `DocumentConfig${Date.now()}`;

    // The résumé is single-subject: a record only reaches it when a subject edge
    // says it is the owner's. The graph holds other people's awards too, so an
    // award belonging to nobody is deliberately not "mine by default".
    const peopleNodes = await request(app)
      .get('/api/v1/nodes?type=person&limit=1000')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    let selfId = (
      peopleNodes.body.nodes as Array<{ id: string; props?: { is_self?: boolean } }>
    ).find((p) => p.props?.is_self === true)?.id;
    if (!selfId) {
      const createdSelf = await request(app)
        .post('/api/v1/nodes')
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'person', title: `${marker} Owner`, props: { is_self: true } })
        .expect(201);
      selfId = createdSelf.body.node.id as string;
    }

    const createAward = async (suffix: string, date: string) => {
      const response = await request(app)
        .post('/api/v1/nodes')
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'award',
          title: `${marker} ${suffix}`,
          props: { level: 'international', awarded_on: date, award_for: `Testing ${suffix}` },
          subject: { node_id: selfId },
        })
        .expect(201);
      return response.body.node.id as string;
    };
    const older = await createAward('Older', '2022-01-01');
    const newer = await createAward('Newer', '2025-01-01');
    const target = await request(app)
      .post('/api/v1/targets')
      .set('Authorization', `Bearer ${token}`)
      .send({ role_title: marker, jd_raw: 'Requirements\n- Python' })
      .expect(201);
    const targetId = target.body.target.id as string;

    const config = {
      itemOrder: { awards: [older, newer] },
      itemsDisabled: [newer],
      contactOrder: ['email', 'city'],
      contactDisabled: ['phone'],
      skillsDisabled: [],
      bulletOrder: {},
      bulletsDisabled: [],
    };
    const modelResponse = await request(app)
      .post('/api/v1/resumes/model')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetId, ...config })
      .expect(200);

    expect(modelResponse.body).toHaveProperty('pageEstimate');
    expect(modelResponse.body).toHaveProperty('selection');
    const awards = modelResponse.body.model.sections.find((section: { key: string }) => section.key === 'awards');
    const relevant = awards.lines.filter((line: { id: string }) => line.id === older || line.id === newer);
    expect(relevant.map((line: { id: string }) => line.id)).toEqual([older, newer]);
    expect(relevant.find((line: { id: string }) => line.id === newer).disabled).toBe(true);

    const compiled = await request(app)
      .post('/api/v1/resumes/compile')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetId, ...config })
      .expect(200);
    expect(compiled.body.tex).toContain(`${marker} Older`);
    expect(compiled.body.tex).not.toContain(`${marker} Newer`);

    const finalized = await request(app)
      .post('/api/v1/resumes/finalize')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetId, ...config })
      .expect(200);
    const outputs = await request(app).get('/api/v1/resumes').set('Authorization', `Bearer ${token}`).expect(200);
    const saved = outputs.body.resumes.find((resume: { id: string }) => resume.id === finalized.body.id);
    expect(saved.config.itemOrder).toEqual(config.itemOrder);
    expect(saved.config.itemsDisabled).toEqual(config.itemsDisabled);
    expect(saved.config.contactOrder).toEqual(config.contactOrder);
    expect(saved.config.contactDisabled).toEqual(config.contactDisabled);
  });

  it('compile responds with the honest shape (ok/error/logTail), tolerating an offline buildsvc', async () => {
    const target = await request(app)
      .post('/api/v1/targets')
      .set('Authorization', `Bearer ${token}`)
      .send({ role_title: 'Compile Shape', jd_raw: 'Requirements\n- Python' })
      .expect(201);

    const res = await request(app)
      .post('/api/v1/resumes/compile')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetId: target.body.target.id, templateKey: 'cobalt' })
      .expect(200);

    expect(res.body).toHaveProperty('ok');
    expect(res.body).toHaveProperty('offline');
    expect(res.body).toHaveProperty('error');
    expect(res.body).toHaveProperty('logTail');
    expect(typeof res.body.tex).toBe('string');
    expect(res.body.tex).toContain('\\documentclass');
    if (res.body.ok) {
      expect(res.body.pdfBase64).toBeTruthy();
      expect(res.body.coverage).toBeTruthy();
    } else {
      expect(res.body.pdfBase64).toBeNull();
    }
  });

  // ── Regression tests for the 2026-07-13 review findings ────────────────────

  it('rejects edges with missing endpoints or invalid endpoint types (FR-013)', async () => {
    const person = await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'person', title: 'Endpoint Person', props: {} })
      .expect(201);
    const org = await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'organization', title: 'Endpoint Org', props: {} })
      .expect(201);

    // Dangling endpoint → 422, not a corrupt edge.
    await request(app)
      .post('/api/v1/edges')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'KNOWS', src: person.body.node.id, dst: 'does-not-exist' })
      .expect(422);

    // Type-invalid: you KNOW people, not organizations.
    const bad = await request(app)
      .post('/api/v1/edges')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'KNOWS', src: person.body.node.id, dst: org.body.node.id })
      .expect(422);
    expect(JSON.stringify(bad.body.error)).toContain('KNOWS');

    // A soft-deleted endpoint is not a valid endpoint either.
    const doomed = await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'project', title: 'Doomed Project', props: {} })
      .expect(201);
    await request(app)
      .delete(`/api/v1/nodes/${doomed.body.node.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(app)
      .post('/api/v1/edges')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'WORKED_ON', src: person.body.node.id, dst: doomed.body.node.id })
      .expect(422);
  });

  it('logs an interaction with its edge and reminders atomically (FR-002)', async () => {
    const person = await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'person', title: 'Atomic Interaction Person', props: {} })
      .expect(201);
    const personId = person.body.node.id;

    const res = await request(app)
      .post('/api/v1/interactions')
      .set('Authorization', `Bearer ${token}`)
      .send({ personId, kind: 'coffee', note: 'Atomic coffee', followUpDate: '2026-08-01' })
      .expect(201);

    // Node, edge, and reminder all exist, and the edge actually points at the person.
    expect(res.body.edge.src).toBe(res.body.interaction.id);
    expect(res.body.edge.dst).toBe(personId);
    expect(res.body.reminders).toHaveLength(1);

    const node = await request(app)
      .get(`/api/v1/nodes/${res.body.interaction.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(node.body.edges.some((e: { id: string }) => e.id === res.body.edge.id)).toBe(true);

    // An unknown person creates NOTHING, not an orphan interaction node.
    await request(app)
      .post('/api/v1/interactions')
      .set('Authorization', `Bearer ${token}`)
      .send({ personId: 'no-such-person', kind: 'call', note: 'orphan probe' })
      .expect(422);
    const search = await request(app)
      .get('/api/v1/nodes?q=orphan probe')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(search.body.nodes.some((n: { title: string }) => n.title === 'orphan probe')).toBe(false);
  });

  it('refuses to mark a draft résumé as sent (FR-011)', async () => {
    // Keywords nothing in the graph can cover → coverage far below the 95% gate
    // → the output finalizes as a draft. (A real skill like "Python" would be
    // covered by atoms other tests created, and would pass the gate.)
    const target = await request(app)
      .post('/api/v1/targets')
      .set('Authorization', `Bearer ${token}`)
      .send({ role_title: 'Gate Tester', jd_raw: 'Requirements\n- Zqxwvtplk\n- Bqfjmzrld\n- Kwyjibonn' })
      .expect(201);

    const finalized = await request(app)
      .post('/api/v1/resumes/finalize')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetId: target.body.target.id })
      .expect(200);
    expect(finalized.body.gatePassed).toBe(false);
    expect(finalized.body.status).toBe('draft');

    const sent = await request(app)
      .post(`/api/v1/resumes/${finalized.body.id}/mark-sent`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
    expect(sent.body.error.code).toBe('NOT_FINAL');
  });

  it('neutralizes spreadsheet formulas in saved-view CSV (FR-021)', async () => {
    const marker = `CsvProbe${Date.now()}`;
    await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'idea', title: `=cmd|' /c calc'!A1 ${marker}`, props: { status: 'spark' } })
      .expect(201);

    const view = await request(app)
      .post('/api/v1/views')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `probe-${marker}`, query: marker })
      .expect(201);

    const csv = await request(app)
      .get(`/api/v1/export/views/${view.body.view.id}.csv`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // The dangerous cell is quoted AND prefixed with ' so Excel treats it as text.
    expect(csv.text).toContain("'=cmd");
    expect(csv.text).not.toMatch(/,=cmd/);
  });

  it('maps oversized and malformed bodies to 413/400, not 500 (FR-010)', async () => {
    // Malformed JSON → 400 with the standard envelope (was a generic 500).
    const bad = await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${token}`)
      .set('content-type', 'application/json')
      .send('{"type": "idea", ')
      .expect(400);
    expect(bad.body.error.code).toBe('MALFORMED_JSON');

    // A 4 MB import body is accepted by the 15 MB import parser (was rejected by
    // the 2 MB global parser before it ever reached the router).
    const padding = 'x'.repeat(2_500);
    const bigCsv = `Name,Email\n${Array.from(
      { length: 900 },
      (_, i) => `Person ${i} ${padding},person${i}@example.com`,
    ).join('\n')}`;
    expect(bigCsv.length).toBeGreaterThan(2 * 1024 * 1024);
    const staged = await request(app)
      .post('/api/v1/imports')
      .set('Authorization', `Bearer ${token}`)
      .send({ kind: 'contacts', filename: 'big.csv', content: bigCsv })
      .expect(201);
    expect(staged.body.batch.stats.rows).toBeGreaterThan(0);
    await request(app)
      .post(`/api/v1/imports/${staged.body.batch.id}/discard`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  }, 60_000);

  it('exports every collection with identity, and filters sensitive records transitively (FR-001/FR-012)', async () => {
    const marker = `Sensitive${Date.now()}`;
    const secret = await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'person', title: marker, sensitivity: 'sensitive', props: {} })
      .expect(201);
    const secretId = secret.body.node.id;

    const manifest = await request(app)
      .get('/api/v1/export/manifest')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Every durable collection is in the bundle, not just 4 of them.
    for (const key of ['nodes', 'edges', 'revisions', 'atoms', 'targets', 'resumes', 'letters', 'reminders', 'saved_views', 'merges', 'imports']) {
      expect(manifest.body.manifest.counts, key).toHaveProperty(key);
    }
    expect(manifest.body.manifest.schema_version).toMatch(/^3\./);
    expect(manifest.body.manifest.includes_sensitive).toBe(false);

    // Default export excludes the sensitive node AND its revisions.
    const zip = await request(app)
      .post('/api/v1/export')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .buffer()
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    const body = (zip.body as Buffer).toString('binary');
    // The ZIP is deflated, so assert on the manifest counts instead: the node is
    // excluded, which the revisions filter mirrors.
    expect(body.length).toBeGreaterThan(0);

    const withSensitive = await request(app)
      .get('/api/v1/export/manifest?includeSensitive=true')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    // The default manifest counts fewer nodes than one taken with the flag would.
    expect(withSensitive.body.manifest.counts.nodes).toBeGreaterThanOrEqual(
      manifest.body.manifest.counts.nodes,
    );

    await request(app).delete(`/api/v1/nodes/${secretId}`).set('Authorization', `Bearer ${token}`).expect(200);
    // Three full-database passes in one test, two manifests plus a complete
    // ZIP, and each one hashes every collection. That is inherently more
    // than the 20s default allows once the graph is real-sized, so the
    // budget is stated here rather than left to fail as a fake assertion.
  }, 90_000);

  it('isolates the demo space from the real graph (x-vitae-space)', async () => {
    const marker = `SpaceProbe${Date.now()}`;
    const demoNode = await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${token}`)
      .set('x-vitae-space', 'demo')
      .send({ type: 'idea', title: marker, props: { status: 'spark' } })
      .expect(201);

    // Visible in demo…
    const demoList = await request(app)
      .get('/api/v1/nodes?type=idea&limit=500')
      .set('Authorization', `Bearer ${token}`)
      .set('x-vitae-space', 'demo')
      .expect(200);
    expect(demoList.body.nodes.some((n: { title: string }) => n.title === marker)).toBe(true);

    // …absent from real.
    const realList = await request(app)
      .get('/api/v1/nodes?type=idea&limit=500')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(realList.body.nodes.some((n: { title: string }) => n.title === marker)).toBe(false);

    // Clean up the demo probe.
    await request(app)
      .delete(`/api/v1/nodes/${demoNode.body.node.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-vitae-space', 'demo')
      .expect(200);
  });

  it('refuses merge undo after a post-merge edit (FR-003)', async () => {
    const makePerson = async (title: string) =>
      request(app)
        .post('/api/v1/nodes')
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'person', title, props: {} })
        .expect(201);
    const keep = await makePerson(`Undo Keep ${Date.now()}`);
    const drop = await makePerson(`Undo Drop ${Date.now()}`);

    const merged = await request(app)
      .post('/api/v1/duplicates/merge')
      .set('Authorization', `Bearer ${token}`)
      .send({ keepId: keep.body.node.id, dropId: drop.body.node.id })
      .expect(200);

    await request(app)
      .patch(`/api/v1/nodes/${keep.body.node.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Edited after merge' })
      .expect(200);

    const conflict = await request(app)
      .post(`/api/v1/duplicates/merges/${merged.body.merge.id}/undo`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
    expect(conflict.body.error.code).toBe('MERGE_CONFLICT');

    const survivor = await request(app)
      .get(`/api/v1/nodes/${keep.body.node.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(survivor.body.node.title).toBe('Edited after merge');
  });

  it('undoes an untouched merge with rewired edges (FR-002/FR-003)', async () => {
    const create = async (type: string, title: string) =>
      request(app)
        .post('/api/v1/nodes')
        .set('Authorization', `Bearer ${token}`)
        .send({ type, title, props: {} })
        .expect(201);
    const keep = await create('person', `Clean Keep ${Date.now()}`);
    const drop = await create('person', `Clean Drop ${Date.now()}`);
    const project = await create('project', `Clean Project ${Date.now()}`);
    await request(app)
      .post('/api/v1/edges')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'WORKED_ON', src: drop.body.node.id, dst: project.body.node.id })
      .expect(201);

    const merged = await request(app)
      .post('/api/v1/duplicates/merge')
      .set('Authorization', `Bearer ${token}`)
      .send({ keepId: keep.body.node.id, dropId: drop.body.node.id })
      .expect(200);
    await request(app)
      .post(`/api/v1/duplicates/merges/${merged.body.merge.id}/undo`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const restored = await request(app)
      .get(`/api/v1/nodes/${drop.body.node.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(restored.body.node.deleted_at).toBeNull();
    expect(
      restored.body.edges.some(
        (edge: { type: string; src: string; dst: string }) =>
          edge.type === 'WORKED_ON' &&
          edge.src === drop.body.node.id &&
          edge.dst === project.body.node.id,
      ),
    ).toBe(true);
  });

  it('round-trips a complete backup with document identity and subcollections intact (FR-001)', async () => {
    const [{ buildExport, BUNDLE_COLLECTIONS }, { restoreBundle }, { repository }] = await Promise.all([
      import('../services/export.js'),
      import('../services/restore.js'),
      import('../db/repository.js'),
    ]);

    const before = await buildExport({ includeSensitive: true });
    expect(before.manifest.includes_sensitive).toBe(true);
    expect(before.files).toHaveProperty('import_rows.jsonl');
    expect(before.files).toHaveProperty('import_raw_chunks.jsonl');

    // Empty every table, giving restore the same blank target a disaster drill
    // would use. Import rows and raw chunks go with their parent via ON DELETE
    // CASCADE, so there is no recursive delete to write.
    for (const spec of BUNDLE_COLLECTIONS) {
      await repository.docTruncate(spec.table);
    }

    const restored = await restoreBundle(before.files);
    expect(restored.total).toBe(
      Object.values(before.manifest.counts).reduce((sum, count) => sum + count, 0),
    );

    const after = await buildExport({ includeSensitive: true });
    expect(after.manifest.counts).toEqual(before.manifest.counts);
    for (const name of Object.keys(before.manifest.checksums)) {
      expect(after.files[name], name).toEqual(before.files[name]);
    }
  }, 60_000);

  it('force-restores into a populated target, pruning only what the bundle omits (FR-001)', async () => {
    // The force path had no coverage at all: the round-trip above restores into
    // an emptied database, and the corruption case throws at checksum
    // validation before reaching the prune. So a real `--force` restore of a
    // real backup died on `rows[name].map is not a function`, optional
    // collections are excluded from the parsed set, but the prune asked every
    // collection for its ids.
    const [{ buildExport, BUNDLE_COLLECTIONS }, { restoreBundle }, { repository }] = await Promise.all([
      import('../services/export.js'),
      import('../services/restore.js'),
      import('../db/repository.js'),
    ]);

    const bundle = await buildExport({ includeSensitive: true });

    // Simulate a bundle predating learned aliases, which is the only reason
    // `optional` exists on dedup_aliases. A current export always emits the
    // file, even empty, so it has to be stripped (with its manifest entries)
    // to reach that path. (letters.jsonl is also optional for older backups,
    // but this assertion is specifically about alias survival.)
    const optional = BUNDLE_COLLECTIONS.find((spec) => spec.file === 'dedup_aliases.jsonl');
    expect(optional?.optional, 'dedup_aliases must remain an optional bundle collection').toBe(true);
    const files = { ...bundle.files };
    delete files[optional!.file];
    const manifest = JSON.parse(String(files['manifest.json'])) as {
      checksums: Record<string, string>;
      counts: Record<string, number>;
    };
    delete manifest.checksums[optional!.file];
    delete manifest.counts[optional!.file.replace(/\.jsonl$/, '')];
    files['manifest.json'] = JSON.stringify(manifest);

    await repository.docPut('dedup_aliases', 'alias-survives-restore', {
      id: 'alias-survives-restore',
      type: 'person',
      alias: 'kept',
      normalized: 'kept',
      canonical_id: 'whoever',
    });

    // A record the bundle DOES describe the absence of, which force should remove.
    await repository.docPut('saved_views', 'view-pruned-by-restore', {
      id: 'view-pruned-by-restore',
      name: 'stale',
      query: 'type:person',
    });

    const restored = await restoreBundle(files, { force: true });
    expect(restored.total).toBeGreaterThan(0);

    expect(
      await repository.docGet('saved_views', 'view-pruned-by-restore'),
      'a document the bundle omits is stale and should be pruned',
    ).toBeNull();
    expect(
      await repository.docGet('dedup_aliases', 'alias-survives-restore'),
      'an optional collection the bundle never carried must be left alone',
    ).not.toBeNull();
  }, 60_000);

  it('finds a shortest graph path between linked nodes', async () => {
    const stamp = Date.now();
    const a = await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'person', title: `Path A ${stamp}`, props: {} })
      .expect(201);
    const b = await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'person', title: `Path B ${stamp}`, props: {} })
      .expect(201);
    const org = await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'organization', title: `Path Org ${stamp}`, props: {} })
      .expect(201);

    const aId = a.body.node.id as string;
    const bId = b.body.node.id as string;
    const orgId = org.body.node.id as string;

    await request(app)
      .post('/api/v1/edges')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'KNOWS', src: aId, dst: bId, props: {} })
      .expect(201);
    await request(app)
      .post('/api/v1/edges')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'MEMBER_OF', src: bId, dst: orgId, props: {} })
      .expect(201);

    const path = await request(app)
      .get(`/api/v1/graph/path?from=${aId}&to=${orgId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(path.body.found).toBe(true);
    expect(path.body.hops.map((h: { nodeId: string }) => h.nodeId)).toEqual([aId, bId, orgId]);
    expect(path.body.edges).toHaveLength(2);
    expect(path.body.hops[1].viaEdgeType).toBe('KNOWS');
    expect(path.body.hops[2].viaEdgeType).toBe('MEMBER_OF');

    const miss = await request(app)
      .get(`/api/v1/graph/path?from=${aId}&to=missing-node`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(miss.body.found).toBe(false);
  });

  it('returns a timeline review digest for a brushed range', async () => {
    const stamp = Date.now();
    await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'trip',
        title: `Review Trip ${stamp}`,
        props: {},
        start_date: '2024-05-01',
        end_date: '2024-05-10',
      })
      .expect(201);

    const review = await request(app)
      .get('/api/v1/timeline/review?from=2024-01-01&to=2024-12-31')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(review.body.from).toBe('2024-01-01');
    expect(review.body.to).toBe('2024-12-31');
    expect(review.body.label).toBeTruthy();
    expect(Array.isArray(review.body.sections)).toBe(true);
    expect(review.body.summary.trips).toBeGreaterThanOrEqual(1);
    expect(review.body.sections.some((s: { key: string }) => s.key === 'trips')).toBe(true);
  });

  it('returns atlas trips with VISITED stops for the map', async () => {
    const stamp = Date.now();
    const berlin = await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'location', title: 'Berlin', props: { kind: 'city', lat: 52.52, lng: 13.41 } })
      .expect(201);
    const munich = await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'location', title: 'Munich', props: { kind: 'city', lat: 48.14, lng: 11.58 } })
      .expect(201);
    const trip = await request(app)
      .post('/api/v1/nodes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'trip',
        title: `Atlas Trip ${stamp}`,
        props: { purpose: 'conference' },
        start_date: '2024-06-01',
        end_date: '2024-06-10',
      })
      .expect(201);
    const tripId = trip.body.node.id as string;
    await request(app)
      .post('/api/v1/edges')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'VISITED', src: tripId, dst: berlin.body.node.id, props: { nights: 3 } })
      .expect(201);
    await request(app)
      .post('/api/v1/edges')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'VISITED', src: tripId, dst: munich.body.node.id, props: { nights: 2 } })
      .expect(201);

    const map = await request(app)
      .get('/api/v1/map')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Array.isArray(map.body.trips)).toBe(true);
    const found = map.body.trips.find((t: { id: string }) => t.id === tripId);
    expect(found).toBeTruthy();
    expect(found.stops.length).toBe(2);

    const filtered = await request(app)
      .get('/api/v1/map?from=2023-01-01&to=2023-12-31')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(filtered.body.trips.some((t: { id: string }) => t.id === tripId)).toBe(false);
  });

  it('validates restore corruption before force replacement writes (FR-001)', async () => {
    const [{ buildExport }, { restoreBundle, RestoreError }, { repository }] = await Promise.all([
      import('../services/export.js'),
      import('../services/restore.js'),
      import('../db/repository.js'),
    ]);
    const before = await buildExport({ includeSensitive: true });
    const nodeCount = await repository.docCount('nodes');
    const corrupt = { ...before.files, 'nodes.jsonl': `${String(before.files['nodes.jsonl'])}\n{}` };
    await expect(restoreBundle(corrupt, { force: true })).rejects.toBeInstanceOf(RestoreError);
    expect(await repository.docCount('nodes')).toBe(nodeCount);
  }, 60_000);
});
