/**
 * Reminder drawer: list, done, reopen, snooze.
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';
import { repository } from '../../db/repository.js';
import { isoDateIn, todayIso } from '../../db/timezone.js';
import { runInSpace } from '../../db/space.js';

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 100));
});

describe('reminders routes', () => {
  it('rejects unauthenticated access', async () => {
    const { app } = await getAuthedApp();
    const res = await request(app).get('/api/v1/reminders');
    expect(res.status).toBe(401);
  });

  it('lists a due reminder and cycles done, reopen, snooze', async () => {
    const { app, token } = await getAuthedApp();
    const person = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .send({ type: 'person', title: `Reminder Person ${Date.now()}`, props: {} })
      .expect(201);
    const personId = person.body.node.id as string;

    const logged = await request(app)
      .post('/api/v1/interactions')
      .set(authHeader(token))
      .send({
        personId,
        kind: 'coffee',
        note: 'Reminder suite follow-up',
        followUpDate: '2020-01-01',
      })
      .expect(201);
    const reminderId = logged.body.reminders[0] as string;

    const listed = await request(app).get('/api/v1/reminders').set(authHeader(token)).expect(200);
    expect(listed.body.reminders.some((r: { id: string }) => r.id === reminderId)).toBe(true);

    await request(app)
      .post(`/api/v1/reminders/${reminderId}/done`)
      .set(authHeader(token))
      .expect(200);
    const afterDone = await request(app).get('/api/v1/reminders').set(authHeader(token)).expect(200);
    expect(afterDone.body.reminders.some((r: { id: string }) => r.id === reminderId)).toBe(false);

    await request(app)
      .post(`/api/v1/reminders/${reminderId}/reopen`)
      .set(authHeader(token))
      .expect(200);

    const snoozed = await request(app)
      .post(`/api/v1/reminders/${reminderId}/snooze`)
      .set(authHeader(token))
      .send({ days: 3 })
      .expect(200);
    expect(typeof snoozed.body.snoozed_until).toBe('string');
  });

  it('hides a seven-day snooze until due, then resumes in the drawer and Today', async () => {
    const { app, token } = await getAuthedApp();
    const id = repository.allocateId();
    await repository.docPut('reminders', id, { id, status: 'open', due_on: todayIso(), note: 'Snooze recovery' });
    const snoozed = await request(app).post(`/api/v1/reminders/${id}/snooze`)
      .set(authHeader(token)).send({}).expect(200);
    expect(snoozed.body.snoozed_until).toBe(isoDateIn(7));
    for (const path of ['/reminders', '/reminders?due=all', '/dashboard']) {
      const result = await request(app).get(`/api/v1${path}`).set(authHeader(token)).expect(200);
      expect(result.body.reminders.some((reminder: { id: string }) => reminder.id === id)).toBe(false);
    }

    // Advance the fixture's snooze deadline without changing token expiry or
    // the process clock. Calendar-boundary behavior has a separate unit test.
    await repository.docMerge('reminders', id, { due_on: todayIso(), snoozed_until: todayIso() });
    for (const path of ['/reminders', '/reminders?due=all', '/dashboard']) {
      const result = await request(app).get(`/api/v1${path}`).set(authHeader(token)).expect(200);
      expect(result.body.reminders.find((reminder: { id: string }) => reminder.id === id))
        .toMatchObject({ id, status: 'open' });
    }
    await request(app).post(`/api/v1/reminders/${id}/done`).set(authHeader(token)).expect(200);
    const done = await request(app).get('/api/v1/reminders?due=all').set(authHeader(token)).expect(200);
    expect(done.body.reminders.some((reminder: { id: string }) => reminder.id === id)).toBe(false);
    await request(app).post(`/api/v1/reminders/${id}/reopen`).set(authHeader(token)).expect(200);
    expect(await repository.docGet('reminders', id)).toMatchObject({ status: 'open', snoozed_until: null });
  });

  it('keeps expired snoozes inside their data space', async () => {
    const { app, token } = await getAuthedApp();
    const id = repository.allocateId();
    await runInSpace('demo', () => repository.docPut('reminders', id, {
      id, status: 'snoozed', due_on: todayIso(), snoozed_until: todayIso(), note: 'Demo-only snooze',
    }));
    const real = await request(app).get('/api/v1/reminders').set(authHeader(token)).expect(200);
    expect(real.body.reminders.some((reminder: { id: string }) => reminder.id === id)).toBe(false);
    const demo = await request(app).get('/api/v1/reminders').set(authHeader(token)).set('x-vitae-space', 'demo').expect(200);
    expect(demo.body.reminders.some((reminder: { id: string }) => reminder.id === id)).toBe(true);
  });
});
