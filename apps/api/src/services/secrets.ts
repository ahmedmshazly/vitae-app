/**
 * Secret store for third-party credentials (FR-004, Constitution IV).
 *
 * Vitae never stores a third-party credential as application data. The GitHub
 * PAT used to live in `meta/settings`, meaning any database dump, backup,
 * service-account leak, or export carried a reusable credential to someone
 * else's account. The database holds only non-secret sync metadata (last sync,
 * ETag) plus a reference saying *where* the secret lives.
 *
 * Two backends, resolved in order:
 *   1. environment, a value injected by the deployment's secret manager
 *      (Cloud Run + Secret Manager, Fly secrets, …). Read-only at runtime:
 *      rotation happens in the secret manager, not through the API.
 *   2. file: `VITAE_SECRETS_DIR` (default `.secrets/` at the repo root, which
 *      is git-ignored and chmod 0600). This is the local/self-hosted path and
 *      the only one the write endpoint can serve.
 */
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type SecretName = 'github_pat';

const ENV_VAR: Record<SecretName, string> = {
  github_pat: 'GITHUB_PAT',
};

export type SecretSource = 'env' | 'file' | 'none';

function secretsDir(): string {
  if (process.env.VITAE_SECRETS_DIR) return resolve(process.env.VITAE_SECRETS_DIR);
  // apps/api/src/services → repo root is four levels up.
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '../../../../.secrets');
}

function secretPath(name: SecretName): string {
  return join(secretsDir(), name);
}

export class SecretStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretStoreError';
  }
}

/** Where a secret would be read from, without reading it. */
export function secretSource(name: SecretName): SecretSource {
  if (process.env[ENV_VAR[name]]) return 'env';
  if (existsSync(secretPath(name))) return 'file';
  return 'none';
}

export function getSecret(name: SecretName): string | null {
  const fromEnv = process.env[ENV_VAR[name]];
  if (fromEnv) return fromEnv.trim();
  const path = secretPath(name);
  if (!existsSync(path)) return null;
  const value = readFileSync(path, 'utf8').trim();
  return value || null;
}

/**
 * Persist a secret. Only the file backend is writable: when the deployment
 * injects the value from a secret manager, rotation belongs there, and writing
 * a competing copy to disk would defeat the point.
 */
export function setSecret(name: SecretName, value: string): void {
  if (process.env[ENV_VAR[name]]) {
    throw new SecretStoreError(
      `${ENV_VAR[name]} is provided by the deployment's secret manager, rotate it there, not through the API.`,
    );
  }
  const dir = secretsDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = secretPath(name);
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  const fd = openSync(temp, 'wx', 0o600);
  try {
    writeFileSync(fd, `${value.trim()}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temp, path);
  chmodSync(path, 0o600);
  const dirFd = openSync(dir, 'r');
  try {
    fsyncSync(dirFd);
  } finally {
    closeSync(dirFd);
  }
}

export function deleteSecret(name: SecretName): void {
  const path = secretPath(name);
  if (existsSync(path)) rmSync(path);
}
