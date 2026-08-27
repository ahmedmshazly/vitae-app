/**
 * Dossiers (FR-DOS-001, FR-DOS-002): a selection is stored against one person,
 * compiled into a document whose sections come out in grammar order, and
 * closed by an appendix that carries each cited record's source, confidence
 * and revision trail.
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 100));
});

interface Ctx {
  app: Awaited<ReturnType<typeof getAuthedApp>>['app'];
  token: string;
}

// Props per type rather than an empty object for all of them: a role has a
// required employment_type, so `props: {}` is a 422 rather than a bare record,
// and a helper that hid that behind `.expect(201)` reported five failures whose
// message named the dossier route that had not been reached yet.
const REQUIRED_PROPS: Record<string, Record<string, unknown>> = {
  role: { employment_type: 'full_time' },
};

async function node(ctx: Ctx, type: string, title: string): Promise<string> {
  const created = await request(ctx.app)
    .post('/api/v1/nodes')
    .set(authHeader(ctx.token))
    .send({ type, title, props: REQUIRED_PROPS[type] ?? {} })
    .expect(201);
  return created.body.node.id as string;
}

/** A minimally complete promotion packet: both required sections satisfied. */
async function completeSelection(ctx: Ctx, stamp: number) {
  const subject = await node(ctx, 'person', `Dossier subject ${stamp}`);
  const role = await node(ctx, 'role', `Dossier role ${stamp}`);
  const project = await node(ctx, 'project', `Dossier project ${stamp}`);
  const second = await node(ctx, 'project', `Dossier second project ${stamp}`);
  return {
    subject,
    role,
    project,
    body: {
      subject_node: subject,
      audience: 'promotion_review',
      title: `Promotion packet ${stamp}`,
      sections: [
        {
          grammar_id: 'impact',
          claims: [
            { id: 'i1', text: 'Cut latency across the fleet.', cites: [{ kind: 'node', id: project }] },
            { id: 'i2', text: 'Shipped the benchmark.', cites: [{ kind: 'node', id: second }] },
          ],
        },
        {
          grammar_id: 'scope',
          claims: [{ id: 's1', text: 'Owned the serving path.', cites: [{ kind: 'node', id: role }] }],
        },
      ],
    },
  };
}

describe('dossiers route', () => {
  it('publishes the section grammar so the browser does not carry its own copy', async () => {
    const { app, token } = await getAuthedApp();
    const res = await request(app).get('/api/v1/dossiers/audiences').set(authHeader(token)).expect(200);
    const names = res.body.audiences.map((entry: { audience: string }) => entry.audience);
    expect(names).toEqual(['promotion_review', 'petition_exhibits', 'background_history']);
    const exhibits = res.body.audiences.find(
      (entry: { audience: string }) => entry.audience === 'petition_exhibits',
    );
    // The rule that makes an exhibit list numberable travels with the grammar.
    expect(exhibits.sections[0].maxCitationsPerClaim).toBe(1);
  });

  it('refuses a subject that is not a person', async () => {
    const ctx = await getAuthedApp();
    const org = await node(ctx, 'organization', `Dossier org ${Date.now()}`);
    const res = await request(ctx.app)
      .post('/api/v1/dossiers')
      .set(authHeader(ctx.token))
      .send({ subject_node: org, audience: 'promotion_review', title: 'Wrong subject', sections: [] })
      .expect(422);
    expect(res.body.error.message).toContain('one person');
  });

  it('stores a selection and compiles it in grammar order with its appendix', async () => {
    const ctx = await getAuthedApp();
    const stamp = Date.now();
    const { subject, project, body } = await completeSelection(ctx, stamp);
    // A second write to the project, so its trail has more than a create in it.
    await request(ctx.app)
      .patch(`/api/v1/nodes/${project}`)
      .set(authHeader(ctx.token))
      .send({ title: `Dossier project ${stamp} renamed` })
      .expect(200);

    const created = await request(ctx.app)
      .post('/api/v1/dossiers')
      .set(authHeader(ctx.token))
      .send(body)
      .expect(201);
    const id = created.body.dossier.id as string;

    const compiled = await request(ctx.app)
      .get(`/api/v1/dossiers/${id}/compile`)
      .set(authHeader(ctx.token))
      .expect(200);

    expect(compiled.body.subject.id).toBe(subject);
    // Stored impact-first; the grammar declares scope first, and the grammar wins.
    expect(compiled.body.sections.map((s: { grammar_id: string }) => s.grammar_id)).toEqual([
      'scope',
      'impact',
    ]);
    expect(compiled.body.violations).toEqual([]);
    expect(compiled.body.blocking).toBe(false);

    const cited = compiled.body.appendix.find((r: { id: string }) => r.id === project);
    expect(cited.presence).toBe('live');
    expect(cited.label).toBe(`Dossier project ${stamp} renamed`);
    expect(cited.source).toBe('manual');
    expect(cited.revisions.map((r: { op: string }) => r.op)).toEqual(['create', 'update']);
  });

  it('names what is missing rather than refusing to compile a half-built packet', async () => {
    const ctx = await getAuthedApp();
    const stamp = Date.now();
    const { body } = await completeSelection(ctx, stamp);
    const created = await request(ctx.app)
      .post('/api/v1/dossiers')
      .set(authHeader(ctx.token))
      // Impact alone: scope is required and absent.
      .send({ ...body, sections: [body.sections[0]] })
      .expect(201);

    const compiled = await request(ctx.app)
      .get(`/api/v1/dossiers/${created.body.dossier.id}/compile`)
      .set(authHeader(ctx.token))
      .expect(200);
    expect(compiled.body.blocking).toBe(true);
    expect(compiled.body.violations.map((v: { rule: string }) => v.rule)).toContain(
      'missing_required_section',
    );
    // The half that is already right is still returned, which is the point.
    expect(compiled.body.sections).toHaveLength(1);
  });

  it('reports a cited record that was deleted, and still compiles', async () => {
    const ctx = await getAuthedApp();
    const stamp = Date.now();
    const { role, body } = await completeSelection(ctx, stamp);
    const created = await request(ctx.app)
      .post('/api/v1/dossiers')
      .set(authHeader(ctx.token))
      .send(body)
      .expect(201);
    await request(ctx.app).delete(`/api/v1/nodes/${role}`).set(authHeader(ctx.token)).expect(200);

    const compiled = await request(ctx.app)
      .get(`/api/v1/dossiers/${created.body.dossier.id}/compile`)
      .set(authHeader(ctx.token))
      .expect(200);
    expect(compiled.body.appendix.find((r: { id: string }) => r.id === role).presence).toBe('deleted');
    expect(compiled.body.violations.map((v: { rule: string }) => v.rule)).toEqual(['citation_missing']);
    // A withdrawn record is a fact the appendix prints, not a broken document.
    expect(compiled.body.blocking).toBe(false);
  });

  it('tells a record that never existed apart from one that was withdrawn', async () => {
    // Against the real repository, not a stub. The third presence value only
    // arrives if getNode answers null for an id nothing ever carried; if it
    // threw instead, the whole compile would 500 and the appendix would never
    // get to say "never existed", which is the distinction the format turns on.
    const ctx = await getAuthedApp();
    const stamp = Date.now();
    const { body } = await completeSelection(ctx, stamp);
    const created = await request(ctx.app)
      .post('/api/v1/dossiers')
      .set(authHeader(ctx.token))
      .send({
        ...body,
        sections: [
          ...body.sections,
          {
            grammar_id: 'leadership',
            claims: [
              {
                id: 'l1',
                text: 'Rests on a record id nothing has ever carried.',
                cites: [{ kind: 'node', id: `no-such-record-${stamp}` }],
              },
            ],
          },
        ],
      })
      .expect(201);

    const compiled = await request(ctx.app)
      .get(`/api/v1/dossiers/${created.body.dossier.id}/compile`)
      .set(authHeader(ctx.token))
      .expect(200);
    const ghost = compiled.body.appendix.find(
      (r: { id: string }) => r.id === `no-such-record-${stamp}`,
    );
    expect(ghost.presence).toBe('unknown');
    expect(ghost.label).toBeNull();
    expect(ghost.revisions).toEqual([]);
  });

  it('guards a concurrent edit, and drops the compiled keys when the selection moves', async () => {
    const ctx = await getAuthedApp();
    const stamp = Date.now();
    const { body } = await completeSelection(ctx, stamp);
    const created = await request(ctx.app)
      .post('/api/v1/dossiers')
      .set(authHeader(ctx.token))
      .send(body)
      .expect(201);
    const id = created.body.dossier.id as string;
    expect(created.body.dossier.rev).toBe(1);

    const updated = await request(ctx.app)
      .patch(`/api/v1/dossiers/${id}`)
      .set(authHeader(ctx.token))
      .send({ title: 'Renamed packet', expected_rev: 1 })
      .expect(200);
    expect(updated.body.dossier.rev).toBe(2);
    expect(updated.body.dossier.title).toBe('Renamed packet');

    await request(ctx.app)
      .patch(`/api/v1/dossiers/${id}`)
      .set(authHeader(ctx.token))
      .send({ title: 'Third writer', expected_rev: 1 })
      .expect(409);
  });

  it('hides a deleted dossier from the list and from a direct read', async () => {
    const ctx = await getAuthedApp();
    const stamp = Date.now();
    const { subject, body } = await completeSelection(ctx, stamp);
    const created = await request(ctx.app)
      .post('/api/v1/dossiers')
      .set(authHeader(ctx.token))
      .send(body)
      .expect(201);
    const id = created.body.dossier.id as string;

    const listed = await request(ctx.app)
      .get(`/api/v1/dossiers?subjectNode=${subject}`)
      .set(authHeader(ctx.token))
      .expect(200);
    expect(listed.body.dossiers.map((d: { id: string }) => d.id)).toContain(id);

    await request(ctx.app).delete(`/api/v1/dossiers/${id}`).set(authHeader(ctx.token)).expect(200);
    await request(ctx.app).get(`/api/v1/dossiers/${id}`).set(authHeader(ctx.token)).expect(404);
    const after = await request(ctx.app)
      .get(`/api/v1/dossiers?subjectNode=${subject}`)
      .set(authHeader(ctx.token))
      .expect(200);
    expect(after.body.dossiers.map((d: { id: string }) => d.id)).not.toContain(id);
  });
});
