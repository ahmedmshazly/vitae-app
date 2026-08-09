/**
 * Reminder drawer: list, done, reopen, snooze.
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';

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
});
