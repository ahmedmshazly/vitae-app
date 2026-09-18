/**
 * Gemini connection: presence-not-value on GET, write-only POST, env aliases.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';

const GEMINI_ENV_KEYS = [
  'GEMINI_API_KEY',
  'GEMENI_API_KEY',
  'GEMINI_PROJECT',
  'GEMENI_PROJECT',
] as const;

describe('settings Gemini connection', () => {
  let dir: string;
  const prevDir = process.env.VITAE_SECRETS_DIR;
  const prevGemini = Object.fromEntries(GEMINI_ENV_KEYS.map((key) => [key, process.env[key]]));

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'vitae-gemini-secrets-'));
    process.env.VITAE_SECRETS_DIR = dir;
    // Boot first: createApp loads `.env` and would otherwise put GEMENI_* back.
    await getAuthedApp();
    for (const key of GEMINI_ENV_KEYS) delete process.env[key];
  });

  afterEach(() => {
    if (prevDir === undefined) delete process.env.VITAE_SECRETS_DIR;
    else process.env.VITAE_SECRETS_DIR = prevDir;
    for (const key of GEMINI_ENV_KEYS) {
      const value = prevGemini[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it('reports an unconfigured Gemini connection without a key field', async () => {
    const { app, token } = await getAuthedApp();
    const res = await request(app).get('/api/v1/settings').set(authHeader(token)).expect(200);
    expect(res.body.gemini).toEqual({ configured: false, project: null, source: 'none' });
    expect(JSON.stringify(res.body)).not.toMatch(/api[_-]?key/i);
  });

  it('stores a key server-side and returns only presence plus project', async () => {
    const { app, token } = await getAuthedApp();
    const saved = await request(app)
      .post('/api/v1/settings/gemini')
      .set(authHeader(token))
      .send({ apiKey: ' AIza-test-file-key ', project: 'gen-lang-client-test' })
      .expect(200);
    expect(saved.body).toEqual({
      ok: true,
      configured: true,
      project: 'gen-lang-client-test',
    });
    expect(JSON.stringify(saved.body)).not.toContain('AIza-test-file-key');

    const settings = await request(app).get('/api/v1/settings').set(authHeader(token)).expect(200);
    expect(settings.body.gemini).toEqual({
      configured: true,
      project: 'gen-lang-client-test',
      source: 'file',
    });
    expect(JSON.stringify(settings.body)).not.toContain('AIza-test-file-key');
  });

  it('reads GEMENI_* from the environment and refuses a competing write', async () => {
    process.env.GEMENI_API_KEY = 'env-alias-key';
    process.env.GEMENI_PROJECT = 'env-alias-project';
    const { app, token } = await getAuthedApp();

    const settings = await request(app).get('/api/v1/settings').set(authHeader(token)).expect(200);
    expect(settings.body.gemini).toEqual({
      configured: true,
      project: 'env-alias-project',
      source: 'env',
    });
    expect(JSON.stringify(settings.body)).not.toContain('env-alias-key');

    const refused = await request(app)
      .post('/api/v1/settings/gemini')
      .set(authHeader(token))
      .send({ apiKey: 'other-key', project: 'other-project' })
      .expect(409);
    expect(refused.body.error?.code).toBe('SECRET_READ_ONLY');

    const disconnect = await request(app)
      .delete('/api/v1/settings/gemini')
      .set(authHeader(token))
      .expect(409);
    expect(disconnect.body.error?.code).toBe('SECRET_READ_ONLY');
  });

  it('disconnects a file-backed key and keeps no project metadata', async () => {
    const { app, token } = await getAuthedApp();
    await request(app)
      .post('/api/v1/settings/gemini')
      .set(authHeader(token))
      .send({ apiKey: 'file-key', project: 'file-project' })
      .expect(200);

    await request(app).delete('/api/v1/settings/gemini').set(authHeader(token)).expect(200);

    const settings = await request(app).get('/api/v1/settings').set(authHeader(token)).expect(200);
    expect(settings.body.gemini).toEqual({ configured: false, project: null, source: 'none' });
  });
});
