/**
 * Résumé route slice: compile shape, finalize → list, mark-sent gate (FR-011).
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 100));
});

describe('résumé routes', () => {
  it('compile responds with the honest shape, tolerating an offline buildsvc', async () => {
    const { app, token } = await getAuthedApp();
    const target = await request(app)
      .post('/api/v1/targets')
      .set(authHeader(token))
      .send({ role_title: 'Compile Shape Focused', jd_raw: 'Requirements\n- Python' })
      .expect(201);

    const res = await request(app)
      .post('/api/v1/resumes/compile')
      .set(authHeader(token))
      .send({ targetId: target.body.target.id, templateKey: 'cobalt' })
      .expect(200);

    expect(res.body).toHaveProperty('ok');
    expect(res.body).toHaveProperty('offline');
    expect(res.body).toHaveProperty('error');
    expect(res.body).toHaveProperty('logTail');
    expect(typeof res.body.tex).toBe('string');
    expect(res.body.tex).toContain('\\documentclass');
  });

  it('finalizes a draft and lists it, then refuses mark-sent (FR-011)', async () => {
    const { app, token } = await getAuthedApp();
    // Keywords nothing covers → gate fails → draft status.
    const target = await request(app)
      .post('/api/v1/targets')
      .set(authHeader(token))
      .send({ role_title: 'Gate Tester Focused', jd_raw: 'Requirements\n- Zqxwvtplk\n- Bqfjmzrld\n- Kwyjibonn' })
      .expect(201);

    const finalized = await request(app)
      .post('/api/v1/resumes/finalize')
      .set(authHeader(token))
      .send({ targetId: target.body.target.id })
      .expect(200);
    expect(finalized.body.gatePassed).toBe(false);
    expect(finalized.body.status).toBe('draft');
    const id = finalized.body.id as string;

    const list = await request(app).get('/api/v1/resumes').set(authHeader(token)).expect(200);
    expect(list.body.resumes.some((r: { id: string }) => r.id === id)).toBe(true);

    const detail = await request(app).get(`/api/v1/resumes/${id}`).set(authHeader(token)).expect(200);
    expect(detail.body.resume.id).toBe(id);

    const sent = await request(app)
      .post(`/api/v1/resumes/${id}/mark-sent`)
      .set(authHeader(token))
      .expect(409);
    expect(sent.body.error.code).toBe('NOT_FINAL');
  });
});
