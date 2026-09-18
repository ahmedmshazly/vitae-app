/**
 * Boot matrix for VITAE_LOCAL_INSTALL. Hosted production refusals stay intact
 * when the flag is off.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadServerEnv, resetServerEnvCache } from '@vitae/config/env';

beforeEach(() => {
  resetServerEnvCache();
});

afterEach(() => {
  resetServerEnvCache();
});

function localSource(over: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'production',
    OWNER_EMAIL: 'owner@example.com',
    SESSION_SECRET: 'unique-session-secret-ok',
    FIREBASE_PROJECT_ID: 'vitae-personal',
    DATABASE_URL: 'postgresql://vitae:secret@postgres:5432/vitae',
    BUILDSVC_HMAC_SECRET: 'unique-hmac-secret-not-published',
    WEB_ORIGIN: 'http://127.0.0.1:8080,http://localhost:8080',
    AUTH_ENABLE_DEV_LOGIN: 'true',
    VITAE_LOCAL_INSTALL: 'true',
    VITAE_STORAGE_DIR: '/var/lib/vitae/objects',
    ...over,
  };
}

function hostedSource(over: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'production',
    OWNER_EMAIL: 'owner@example.com',
    SESSION_SECRET: 'unique-session-secret-ok',
    FIREBASE_PROJECT_ID: 'vitae-production',
    DATABASE_URL: 'postgresql://vitae:secret@db.example.internal:5432/vitae',
    BUILDSVC_HMAC_SECRET: 'unique-hmac-secret-not-published',
    WEB_ORIGIN: 'https://vitae.example.com',
    AUTH_ENABLE_DEV_LOGIN: 'false',
    ...over,
  };
}

describe('VITAE_LOCAL_INSTALL boot', () => {
  it('allows production on a loopback stack with a Compose database host', () => {
    const env = loadServerEnv(localSource());
    expect(env.VITAE_LOCAL_INSTALL).toBe(true);
    expect(env.AUTH_ENABLE_DEV_LOGIN).toBe(true);
    expect(env.VITAE_STORAGE_DIR).toBe('/var/lib/vitae/objects');
  });

  it('allows 127.0.0.1 as the database host when the flag is on', () => {
    const env = loadServerEnv(
      localSource({ DATABASE_URL: 'postgresql://vitae:secret@127.0.0.1:5432/vitae' }),
    );
    expect(env.VITAE_LOCAL_INSTALL).toBe(true);
  });

  it('refuses Cloud plus local install', () => {
    expect(() => loadServerEnv(localSource({ VITAE_CLOUD_ENABLED: 'true' }))).toThrow(
      /cannot be combined with VITAE_CLOUD_ENABLED/,
    );
  });

  it('refuses local install outside production', () => {
    expect(() => loadServerEnv(localSource({ NODE_ENV: 'development' }))).toThrow(
      /requires NODE_ENV=production/,
    );
  });

  it('refuses a non-loopback WEB_ORIGIN', () => {
    expect(() => loadServerEnv(localSource({ WEB_ORIGIN: 'https://vitae.example.com' }))).toThrow(
      /loopback WEB_ORIGIN/,
    );
  });

  it('refuses an RDS DATABASE_URL when the flag is on', () => {
    expect(() =>
      loadServerEnv(localSource({ DATABASE_URL: 'postgresql://vitae:secret@db.rds.amazonaws.com:5432/vitae' })),
    ).toThrow(/local DATABASE_URL host/);
  });

  it('refuses a published session secret even on a local install', () => {
    expect(() => loadServerEnv(localSource({ SESSION_SECRET: 'dev-only-session-secret' }))).toThrow(
      /development placeholder/,
    );
  });

  it('refuses local install without owner sign-in', () => {
    expect(() => loadServerEnv(localSource({ AUTH_ENABLE_DEV_LOGIN: 'false' }))).toThrow(
      /AUTH_ENABLE_DEV_LOGIN/,
    );
  });

  it('refuses local install without Cloudinary or a storage directory', () => {
    expect(() => loadServerEnv(localSource({ VITAE_STORAGE_DIR: undefined }))).toThrow(
      /VITAE_STORAGE_DIR/,
    );
  });
});

describe('hosted production boot without VITAE_LOCAL_INSTALL', () => {
  it('still refuses developer sign-in', () => {
    expect(() => loadServerEnv(hostedSource({ AUTH_ENABLE_DEV_LOGIN: 'true' }))).toThrow(
      /AUTH_ENABLE_DEV_LOGIN=true with NODE_ENV=production/,
    );
  });

  it('still refuses a localhost DATABASE_URL', () => {
    expect(() =>
      loadServerEnv(hostedSource({ DATABASE_URL: 'postgresql://vitae:vitae@127.0.0.1:5433/vitae' })),
    ).toThrow(/points at localhost in production/);
  });

  it('still boots against a remote database', () => {
    const env = loadServerEnv(hostedSource());
    expect(env.VITAE_LOCAL_INSTALL).toBe(false);
    expect(env.AUTH_ENABLE_DEV_LOGIN).toBe(false);
  });
});
