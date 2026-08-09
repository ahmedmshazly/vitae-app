/**
 * Secret store: file backend round-trip, env precedence, writable-when-env guard.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('secrets store', () => {
  let dir: string;
  const prevDir = process.env.VITAE_SECRETS_DIR;
  const prevPat = process.env.GITHUB_PAT;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vitae-secrets-'));
    process.env.VITAE_SECRETS_DIR = dir;
    delete process.env.GITHUB_PAT;
  });

  afterEach(() => {
    if (prevDir === undefined) delete process.env.VITAE_SECRETS_DIR;
    else process.env.VITAE_SECRETS_DIR = prevDir;
    if (prevPat === undefined) delete process.env.GITHUB_PAT;
    else process.env.GITHUB_PAT = prevPat;
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
});
