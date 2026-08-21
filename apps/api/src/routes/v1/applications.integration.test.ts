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
