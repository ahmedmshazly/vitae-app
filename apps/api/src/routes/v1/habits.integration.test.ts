/**
 * Habits library: create, list streaks, toggle checks.
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';

afterAll(async () => {
  await new Promise((r) => setTimeout(r, 100));
});

describe('habits routes', () => {
  it('returns 404 when toggling an unknown habit', async () => {
    const { app, token } = await getAuthedApp();
    await request(app)
      .post('/api/v1/habits/00000000-0000-4000-8000-000000000000/toggle')
      .set(authHeader(token))
      .send({})
      .expect(404);
  });

  it('creates a habit, lists streak fields, and toggles today', async () => {
    const { app, token } = await getAuthedApp();
    const title = `Habit Suite ${Date.now()}`;
    const created = await request(app)
      .post('/api/v1/habits')
      .set(authHeader(token))
      .send({ title, cadence: 'daily' })
      .expect(201);
    const habitId = created.body.habit.id as string;

    const listed = await request(app).get('/api/v1/habits').set(authHeader(token)).expect(200);
    const row = listed.body.habits.find((h: { id: string }) => h.id === habitId);
    expect(row).toMatchObject({ title, cadence: 'daily' });
    expect(typeof row.streak).toBe('number');
    expect(typeof row.checkedToday).toBe('boolean');

    const on = await request(app)
      .post(`/api/v1/habits/${habitId}/toggle`)
      .set(authHeader(token))
      .send({})
      .expect(200);
    expect(on.body.checked).toBe(true);

    const off = await request(app)
      .post(`/api/v1/habits/${habitId}/toggle`)
      .set(authHeader(token))
      .send({})
      .expect(200);
    expect(off.body.checked).toBe(false);
  });
});
