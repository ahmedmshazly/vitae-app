/**
 * Space isolation: ALS helpers and x-vitae-space header routing.
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildNodeCreate } from '@vitae/testkit';
import { authHeader, getAuthedApp } from '../__tests__/helpers/app.js';
import { currentSpace, runInSpace } from './space.js';

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 100));
});

describe('runInSpace / currentSpace', () => {
  it('defaults to real outside an ALS store', () => {
    expect(currentSpace()).toBe('real');
  });

  it('pins demo for the duration of the callback', () => {
    expect(
      runInSpace('demo', () => {
        expect(currentSpace()).toBe('demo');
        return currentSpace();
      }),
    ).toBe('demo');
    expect(currentSpace()).toBe('real');
  });
});

describe('x-vitae-space header', () => {
  it('keeps a demo-space create invisible in the real graph', async () => {
    const { app, token } = await getAuthedApp();
    const title = `space-suite-${Date.now()}`;
    const created = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .set('x-vitae-space', 'demo')
      .send(buildNodeCreate({ type: 'person', title }));
    expect(created.status).toBe(201);
    const id = created.body.node.id as string;

    const realGet = await request(app).get(`/api/v1/nodes/${id}`).set(authHeader(token));
    expect(realGet.status).toBe(404);

    const demoGet = await request(app)
      .get(`/api/v1/nodes/${id}`)
      .set(authHeader(token))
      .set('x-vitae-space', 'demo');
    expect(demoGet.status).toBe(200);
    expect(demoGet.body.node.title).toBe(title);
  });

  it('treats an unknown space header as real', async () => {
    const { app, token } = await getAuthedApp();
    const title = `space-real-default-${Date.now()}`;
    const created = await request(app)
      .post('/api/v1/nodes')
      .set(authHeader(token))
      .set('x-vitae-space', 'other')
      .send(buildNodeCreate({ type: 'person', title }));
    expect(created.status).toBe(201);
    const id = created.body.node.id as string;

    const realGet = await request(app).get(`/api/v1/nodes/${id}`).set(authHeader(token));
    expect(realGet.status).toBe(200);
  });
});
