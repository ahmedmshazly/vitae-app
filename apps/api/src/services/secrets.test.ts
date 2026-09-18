/**
 * Secret store: file backend round-trip, env precedence, writable-when-env guard.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const GEMINI_ENV_KEYS = [
  'GEMINI_API_KEY',
  'GEMENI_API_KEY',
  'GEMINI_PROJECT',
  'GEMENI_PROJECT',
] as const;

describe('secrets store', () => {
  let dir: string;
  const prevDir = process.env.VITAE_SECRETS_DIR;
  const prevPat = process.env.GITHUB_PAT;
  const prevGemini = Object.fromEntries(GEMINI_ENV_KEYS.map((key) => [key, process.env[key]]));

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vitae-secrets-'));
    process.env.VITAE_SECRETS_DIR = dir;
    delete process.env.GITHUB_PAT;
    for (const key of GEMINI_ENV_KEYS) delete process.env[key];
  });

  afterEach(() => {
    if (prevDir === undefined) delete process.env.VITAE_SECRETS_DIR;
    else process.env.VITAE_SECRETS_DIR = prevDir;
    if (prevPat === undefined) delete process.env.GITHUB_PAT;
    else process.env.GITHUB_PAT = prevPat;
    for (const key of GEMINI_ENV_KEYS) {
      const value = prevGemini[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips a file-backed github_pat', async () => {
    const { setSecret, getSecret, deleteSecret, secretSource } = await import('./secrets.js');
    expect(secretSource('github_pat')).toBe('none');
    setSecret('github_pat', ' ghp_test_token_value ');
    expect(secretSource('github_pat')).toBe('file');
    expect(getSecret('github_pat')).toBe('ghp_test_token_value');
    deleteSecret('github_pat');
    expect(secretSource('github_pat')).toBe('none');
    expect(getSecret('github_pat')).toBeNull();
  });

  it('prefers the env backend over a file and refuses setSecret when env is set', async () => {
    const { setSecret, getSecret, secretSource, SecretStoreError } = await import('./secrets.js');
    setSecret('github_pat', 'file-value');
    process.env.GITHUB_PAT = 'env-value';
    expect(secretSource('github_pat')).toBe('env');
    expect(getSecret('github_pat')).toBe('env-value');
    expect(() => setSecret('github_pat', 'other')).toThrow(SecretStoreError);
  });

  it('round-trips a file-backed gemini_api_key', async () => {
    const { setSecret, getSecret, deleteSecret, secretSource } = await import('./secrets.js');
    expect(secretSource('gemini_api_key')).toBe('none');
    setSecret('gemini_api_key', ' AIza-test-gemini-key ');
    expect(secretSource('gemini_api_key')).toBe('file');
    expect(getSecret('gemini_api_key')).toBe('AIza-test-gemini-key');
    deleteSecret('gemini_api_key');
    expect(secretSource('gemini_api_key')).toBe('none');
    expect(getSecret('gemini_api_key')).toBeNull();
  });

  it('treats GEMENI_API_KEY as an env alias for gemini_api_key', async () => {
    const { getSecret, secretSource, setSecret, SecretStoreError } = await import('./secrets.js');
    process.env.GEMENI_API_KEY = 'env-alias-value';
    expect(secretSource('gemini_api_key')).toBe('env');
    expect(getSecret('gemini_api_key')).toBe('env-alias-value');
    expect(() => setSecret('gemini_api_key', 'other')).toThrow(SecretStoreError);
  });

  it('prefers GEMINI_API_KEY over the GEMENI_API_KEY alias', async () => {
    const { getSecret, secretSource } = await import('./secrets.js');
    process.env.GEMENI_API_KEY = 'misspelled-value';
    process.env.GEMINI_API_KEY = 'canonical-value';
    expect(secretSource('gemini_api_key')).toBe('env');
    expect(getSecret('gemini_api_key')).toBe('canonical-value');
  });
});
