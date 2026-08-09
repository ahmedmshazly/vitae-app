/**
 * Deterministic outreach draft + send (interaction + follow-up reminder).
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authHeader, createKnowsPerson, getAuthedApp } from '../../__tests__/helpers/app.js';

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 100));
});

describe('composer routes', () => {
  it('rejects a draft without personId', async () => {
    const { app, token } = await getAuthedApp();
    await request(app)
      .post('/api/v1/composer/draft')
      .set(authHeader(token))
      .send({ kind: 'reconnect', tone: 'warm' })
      .expect(400);
  });

  it('drafts and sends outreach with a follow-up reminder', async () => {
    const { app, token } = await getAuthedApp();
    const { personId } = await createKnowsPerson(app, token, `Composer Suite ${Date.now()}`);

    const draft = await request(app)
      .post('/api/v1/composer/draft')
      .set(authHeader(token))
      .send({ personId, kind: 'reconnect', tone: 'warm' })
      .expect(200);
    expect(typeof draft.body.body).toBe('string');
    expect(draft.body.body.length).toBeGreaterThan(0);

    const sent = await request(app)
      .post('/api/v1/composer/send')
      .set(authHeader(token))
      .send({ personId, kind: 'reconnect', channel: 'email', body: draft.body.body })
      .expect(201);
    expect(sent.body.interaction.id).toBeTruthy();
    expect(sent.body.reminderId).toBeTruthy();
  });
});
