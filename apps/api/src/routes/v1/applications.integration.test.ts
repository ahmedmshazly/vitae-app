import { applicationDetailResponseSchema, applicationListResponseSchema } from '@vitae/core';
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';

afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 100));
});

describe('application routes', () => {
  it('builds a pipeline summary and dossier from existing nodes and edges', async () => {
    const { app, token } = await getAuthedApp();
    const auth = authHeader(token);
    const suffix = `${Date.now()}`;
    const createNode = async (body: Record<string, unknown>) =>
      (await request(app).post('/api/v1/nodes').set(auth).send(body).expect(201)).body.node as {
        id: string;
      };
    const createEdge = async (body: Record<string, unknown>) =>
      request(app).post('/api/v1/edges').set(auth).send(body).expect(201);

    const organization = await createNode({
      type: 'organization',
      title: `Northstar ${suffix}`,
      props: {},
    });
    const referrer = await createNode({
      type: 'person',
      title: `Amina ${suffix}`,
      props: {},
    });
    const posting = await createNode({
      type: 'job_posting',
      title: `Staff Engineer posting ${suffix}`,
      props: {
        company: `Northstar ${suffix}`,
        role_title: 'Staff Engineer',
        location: 'Cairo',
        location_mode: 'hybrid',
        employment_type: 'full_time',
        source: 'referral',
      },
    });
    const application = await createNode({
      type: 'application',
      title: `Staff Engineer @ Northstar ${suffix}`,
      props: {
        role_title: 'Staff Engineer',
        status: 'interview',
        applied_on: '2026-08-01',
        next_step: 'Architecture interview',
        next_step_date: '2020-08-25',
        channel: 'referral',
      },
    });
    const interview = await createNode({
      type: 'interview',
      title: `Architecture interview ${suffix}`,
      props: {
        round: 'Architecture',
        stage_no: 2,
        format: 'video',
        scheduled_at: '2030-08-25T10:00:00.000Z',
        outcome: 'scheduled',
      },
    });
    // This starts before the 10:00Z interview even though its local-clock text
    // sorts after it. The projection must compare instants, not ISO strings.
    const offsetInterview = await createNode({
      type: 'interview',
      title: `Timezone interview ${suffix}`,
      props: {
        round: 'Hiring manager',
        stage_no: 3,
        format: 'video',
        scheduled_at: '2030-08-25T09:00:00.000+02:00',
        outcome: 'scheduled',
      },
    });
    const cancelledInterview = await createNode({
      type: 'interview',
      title: `Cancelled interview ${suffix}`,
      props: {
        round: 'Recruiter',
        stage_no: 1,
        format: 'phone',
        scheduled_at: '2030-08-25T06:00:00.000Z',
        outcome: 'cancelled',
      },
    });

    await createEdge({ type: 'APPLIED_TO', src: application.id, dst: organization.id });
    await createEdge({ type: 'REFERRED_BY', src: application.id, dst: referrer.id });
    await createEdge({ type: 'RELATES_TO', src: application.id, dst: posting.id });
    await createEdge({ type: 'INTERVIEW_FOR', src: interview.id, dst: application.id });
    await createEdge({ type: 'INTERVIEW_FOR', src: offsetInterview.id, dst: application.id });
    await createEdge({ type: 'INTERVIEW_FOR', src: cancelledInterview.id, dst: application.id });
    await createEdge({ type: 'WITH', src: interview.id, dst: referrer.id });

    const list = await request(app).get('/api/v1/applications').set(auth).expect(200);
    const parsedList = applicationListResponseSchema.parse(list.body);
    const listed = parsedList.applications.find((item) => item.id === application.id);
    expect(listed).toMatchObject({
      role_title: 'Staff Engineer',
      status: 'interview',
      organization: { id: organization.id, title: `Northstar ${suffix}` },
      referred_by: { id: referrer.id },
      interview_count: 3,
      attention: { kind: 'overdue', source: 'next_step' },
    });
    expect(listed?.next_interview?.id).toBe(offsetInterview.id);

    const detail = await request(app)
      .get(`/api/v1/applications/${application.id}`)
      .set(auth)
      .expect(200);
    const parsedDetail = applicationDetailResponseSchema.parse(detail.body).application;
    expect(parsedDetail.posting?.id).toBe(posting.id);
    expect(parsedDetail.interviews.find((item) => item.id === interview.id)).toMatchObject({
      id: interview.id,
      interviewers: [{ id: referrer.id, title: `Amina ${suffix}` }],
    });
  });

  it('rejects invalid filters and returns a truthful missing dossier', async () => {
    const { app, token } = await getAuthedApp();
    const auth = authHeader(token);
    await request(app).get('/api/v1/applications?status=maybe').set(auth).expect(422);
    await request(app)
      .get('/api/v1/applications/00000000-0000-4000-8000-000000000000')
      .set(auth)
      .expect(404);
  });
});

/**
 * The write path (FR-CAR-003). Applications used to be creatable and editable
 * only through the generic node API, which validates the status enum and
 * nothing else, so a record could jump from draft straight to accepted and no
 * server ever said otherwise.
 */
describe('application write endpoints', () => {
  const create = async (
    props: Record<string, unknown> = {},
    body: Record<string, unknown> = {},
  ) => {
    const { app, token } = await getAuthedApp();
    const res = await request(app)
      .post('/api/v1/applications')
      .set(authHeader(token))
      .send({
        title: `Guard fixture ${Date.now()}-${Math.random()}`,
        props: { role_title: 'Staff Engineer', status: 'applied', ...props },
        ...body,
      })
      .expect(201);
    return applicationDetailResponseSchema.parse(res.body).application;
  };

  it('creates an application and answers with the dossier the next GET would give', async () => {
    const { app, token } = await getAuthedApp();
    const created = await create({ deadline: '2026-09-01' });
    expect(created.status).toBe('applied');
    expect(created.role_title).toBe('Staff Engineer');

    const fetched = await request(app)
      .get(`/api/v1/applications/${created.id}`)
      .set(authHeader(token))
      .expect(200);
    expect(applicationDetailResponseSchema.parse(fetched.body).application).toEqual(created);
  });

  it('names the role title as the record title when the caller states it only once', async () => {
    const { app, token } = await getAuthedApp();
    const res = await request(app)
      .post('/api/v1/applications')
      .set(authHeader(token))
      .send({ props: { role_title: 'Principal Engineer', status: 'draft' } })
      .expect(201);
    expect(applicationDetailResponseSchema.parse(res.body).application.title).toBe(
      'Principal Engineer',
    );
  });

  it('records an application that was already closed when it was entered', async () => {
    // Logging a rejection you received last month is a fact, not a transition.
    const created = await create({ status: 'rejected' });
    expect(created.status).toBe('rejected');
  });

  it('refuses a create whose props the schema cannot accept, naming the field', async () => {
    const { app, token } = await getAuthedApp();
    const res = await request(app)
      .post('/api/v1/applications')
      .set(authHeader(token))
      .send({ title: 'No status', props: { role_title: 'Staff Engineer' } })
      .expect(422);
    expect(
      (res.body.error.details as Array<{ path: string }>).some((d) => d.path === 'props.status'),
    ).toBe(true);
  });

  it('merges an edit onto stored props instead of replacing them', async () => {
    const { app, token } = await getAuthedApp();
    const created = await create({ deadline: '2026-09-01', salary_range: '$180k' });
    const patched = await request(app)
      .patch(`/api/v1/applications/${created.id}`)
      .set(authHeader(token))
      .send({ props: { next_step: 'Architecture interview' } })
      .expect(200);
    const application = applicationDetailResponseSchema.parse(patched.body).application;
    expect(application.next_step).toBe('Architecture interview');
    // The generic patch replaces props wholesale, which is how an edit that
    // named one field used to erase the four it did not.
    expect(application.role_title).toBe('Staff Engineer');
    expect(application.salary_range).toBe('$180k');
    expect(application.deadline).toBe('2026-09-01');
  });

  it('clears a field when the caller sends it as null', async () => {
    const { app, token } = await getAuthedApp();
    const created = await create({ deadline: '2026-09-01' });
    const patched = await request(app)
      .patch(`/api/v1/applications/${created.id}`)
      .set(authHeader(token))
      .send({ props: { deadline: null } })
      .expect(200);
    expect(applicationDetailResponseSchema.parse(patched.body).application.deadline).toBeNull();
  });

  it('puts a status moved by an edit through the same machine', async () => {
    const { app, token } = await getAuthedApp();
    const created = await create({ status: 'interview' });
    const res = await request(app)
      .patch(`/api/v1/applications/${created.id}`)
      .set(authHeader(token))
      .send({ props: { status: 'applied' } })
      .expect(422);
    expect(res.body.error.code).toBe('ILLEGAL_TRANSITION');
    expect(res.body.error.message).toContain('An application at interview cannot move back');
  });

  it('records a forward move and reports both ends of what it recorded', async () => {
    const { app, token } = await getAuthedApp();
    const created = await create({ status: 'applied' });
    const res = await request(app)
      .post(`/api/v1/applications/${created.id}/status`)
      .set(authHeader(token))
      .send({ status: 'interview' })
      .expect(200);
    expect(res.body.transition).toEqual({
      from: 'applied',
      to: 'interview',
      correction: false,
      recorded: true,
    });
    expect(applicationDetailResponseSchema.parse(res.body).application.status).toBe('interview');
  });

  it('refuses to reopen a closed application, and the error alone explains why', async () => {
    const { app, token } = await getAuthedApp();
    const created = await create({ status: 'rejected' });
    const res = await request(app)
      .post(`/api/v1/applications/${created.id}/status`)
      .set(authHeader(token))
      .send({ status: 'screening' })
      .expect(422);
    expect(res.body.error.code).toBe('ILLEGAL_TRANSITION');
    expect(res.body.error.message).toBe(
      'An application that was rejected cannot move to screening. An outcome closes the record. If rejected was recorded by mistake, correct the status instead of moving it.',
    );
  });

  it('lets a correction undo a status that was set wrongly in the first place', async () => {
    const { app, token } = await getAuthedApp();
    const created = await create({ status: 'applied' });
    await request(app)
      .post(`/api/v1/applications/${created.id}/status`)
      .set(authHeader(token))
      .send({ status: 'rejected' })
      .expect(200);

    const corrected = await request(app)
      .post(`/api/v1/applications/${created.id}/status`)
      .set(authHeader(token))
      .send({ status: 'screening', correction: true })
      .expect(200);
    expect(corrected.body.transition).toMatchObject({
      from: 'rejected',
      to: 'screening',
      correction: true,
      recorded: true,
    });
    expect(applicationDetailResponseSchema.parse(corrected.body).application.status).toBe(
      'screening',
    );
  });

  it('leaves a correction distinguishable from a move in the history it writes', async () => {
    const { app, token } = await getAuthedApp();
    const created = await create({ status: 'applied' });
    await request(app)
      .post(`/api/v1/applications/${created.id}/status`)
      .set(authHeader(token))
      .send({ status: 'rejected' })
      .expect(200);
    await request(app)
      .post(`/api/v1/applications/${created.id}/status`)
      .set(authHeader(token))
      .send({ status: 'offer', correction: true })
      .expect(200);

    const history = await request(app)
      .get(`/api/v1/nodes/${created.id}/revisions`)
      .set(authHeader(token))
      .expect(200);
    const revisions = history.body.revisions as Array<{
      source: string;
      diff?: Record<string, { from: unknown; to: unknown }>;
    }>;
    const move = revisions.find((r) => r.diff?.['props.status']?.to === 'rejected');
    const correction = revisions.find((r) => r.diff?.['props.status']?.to === 'offer');
    // Both changed the same field. Only the second says it was a mistake being
    // fixed, and a history that could not tell them apart would be claiming the
    // application had really passed through rejected.
    expect(move?.source).toBe('manual');
    expect(correction?.source).toBe('correction');
    expect(correction?.diff?.['props.status']?.from).toBe('rejected');
  });

  it('writes nothing when a status is resubmitted as itself', async () => {
    const { app, token } = await getAuthedApp();
    const created = await create({ status: 'interview' });
    const before = await request(app)
      .get(`/api/v1/nodes/${created.id}/revisions`)
      .set(authHeader(token))
      .expect(200);

    const res = await request(app)
      .post(`/api/v1/applications/${created.id}/status`)
      .set(authHeader(token))
      .send({ status: 'interview' })
      .expect(200);
    expect(res.body.transition).toMatchObject({ recorded: false });

    const after = await request(app)
      .get(`/api/v1/nodes/${created.id}/revisions`)
      .set(authHeader(token))
      .expect(200);
    expect(after.body.revisions).toHaveLength(before.body.revisions.length);
  });

  it('refuses a status the enum does not hold, before it ever reaches the machine', async () => {
    const { app, token } = await getAuthedApp();
    const created = await create();
    await request(app)
      .post(`/api/v1/applications/${created.id}/status`)
      .set(authHeader(token))
      .send({ status: 'ghosted' })
      .expect(422);
  });

  it('will not write through an id that is not an application', async () => {
    const { app, token } = await getAuthedApp();
    const person = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send({ type: 'person', title: `Not an application ${Date.now()}`, props: {} })
      .expect(201);
    const id = person.body.node.id as string;
    await request(app)
      .post(`/api/v1/applications/${id}/status`)
      .set(authHeader(token))
      .send({ status: 'applied' })
      .expect(404);
    await request(app)
      .patch(`/api/v1/applications/${id}`)
      .set(authHeader(token))
      .send({ title: 'Renamed' })
      .expect(404);
  });
});
