/**
 * User settings, a single document at meta/settings (SRS: single-user system).
 * Holds profile, ask-ranking weight overrides, and the skill alias table.
 *
 * FR-004: the GitHub PAT is NOT here. Postgres keeps only non-secret sync
 * metadata (`lastSyncAt`, `etag`) and a reference to where the credential
 * lives; the credential itself is in the secret store (services/secrets.ts).
 * A legacy PAT found in this document is migrated out and deleted on read, a
 * backup taken after that no longer carries a usable third-party credential.
 */
import { WHO_TO_CALL_WEIGHTS } from '@vitae/core';
import { repository } from '../db/repository.js';
import { nowIso } from '../db/util.js';
import { getSecret, secretSource, setSecret, type SecretSource } from './secrets.js';

export interface AskWeights {
  affiliation: number;
  topic: number;
  strength: number;
  geo: number;
  reciprocity: number;
  graph: number;
  pinned: number;
}

export interface SkillAlias {
  alias: string;
  canonical: string;
}

export interface SettingsDoc {
  profile: { name: string; headline: string; email: string; links: string[] };
  askWeights: AskWeights;
  skillAliases: SkillAlias[];
  resumeDefaults: { templateKey: string; accent: string; emphasis: string };
  /** Non-secret sync metadata only. The PAT lives in the secret store. */
  github: { lastSyncAt?: string | null; etag?: string | null; secret_ref?: SecretSource };
  updated_at?: string;
}

export const DEFAULT_SETTINGS: SettingsDoc = {
  profile: { name: '', headline: '', email: '', links: [] },
  askWeights: { ...WHO_TO_CALL_WEIGHTS },
  skillAliases: [
    { alias: 'k8s', canonical: 'Kubernetes' },
    { alias: 'RL', canonical: 'Reinforcement Learning' },
    { alias: 'pt', canonical: 'PyTorch' },
  ],
  resumeDefaults: { templateKey: 'cobalt', accent: '#2563eb', emphasis: 'technical' },
  github: { lastSyncAt: null, etag: null },
};

const DOC_ID = 'settings';

/**
 * A PAT written by an older build may still sit in Postgres. Move it into the
 * secret store and remove it from the document; if the store is not writable
 * (the deployment injects secrets from a manager), just remove it and let the
 * owner re-add it there, a stale copy in the database is the thing we cannot
 * keep (FR-004).
 */
async function migrateLegacyPat(pat: string): Promise<void> {
  if (secretSource('github_pat') === 'none') {
    setSecret('github_pat', pat);
    if (getSecret('github_pat') !== pat.trim()) {
      throw new Error('GitHub PAT migration verification failed; database copy was retained');
    }
  }
  await repository.transaction(async (tx) => {
    // Re-read inside the transaction: the check above and the delete below must
    // agree, or a concurrent write could drop a PAT that was never migrated.
    const doc = await repository.docGet<{ github?: { pat?: string } }>('meta', DOC_ID, tx);
    if (doc?.github?.pat !== pat) return;
    const { pat: _dropped, ...github } = doc.github;
    await repository.docPut(
      'meta',
      DOC_ID,
      { ...doc, github: { ...github, secret_migrated_at: nowIso() } },
      {},
      tx,
    );
  });
  console.warn('[settings] migrated and verified the legacy GitHub PAT outside the database');
}

export async function getSettings(): Promise<SettingsDoc> {
  const data = await repository.docGet<Partial<SettingsDoc> & { github?: { pat?: string } }>(
    'meta',
    DOC_ID,
  );
  if (!data) return structuredClone(DEFAULT_SETTINGS);

  const legacyPat = data.github?.pat;
  if (legacyPat) await migrateLegacyPat(legacyPat);

  const { pat: _pat, ...github } = data.github ?? {};
  return {
    profile: { ...DEFAULT_SETTINGS.profile, ...data.profile },
    askWeights: { ...DEFAULT_SETTINGS.askWeights, ...data.askWeights },
    skillAliases: data.skillAliases ?? DEFAULT_SETTINGS.skillAliases,
    resumeDefaults: { ...DEFAULT_SETTINGS.resumeDefaults, ...data.resumeDefaults },
    github: { ...DEFAULT_SETTINGS.github, ...github, secret_ref: secretSource('github_pat') },
    updated_at: data.updated_at,
  };
}

export async function patchSettings(patch: Partial<SettingsDoc>): Promise<SettingsDoc> {
  const current = await getSettings();
  const { secret_ref: _ref, ...github } = { ...current.github, ...patch.github };
  const next: SettingsDoc = {
    profile: { ...current.profile, ...patch.profile },
    askWeights: { ...current.askWeights, ...patch.askWeights },
    skillAliases: patch.skillAliases ?? current.skillAliases,
    resumeDefaults: { ...current.resumeDefaults, ...patch.resumeDefaults },
    github,
    updated_at: nowIso(),
  };
  await repository.docPut('meta', DOC_ID, next as unknown as Record<string, unknown>);
  return { ...next, github: { ...next.github, secret_ref: secretSource('github_pat') } };
}

/** The GitHub credential, read from the secret store, never from the database. */
export function githubToken(): string | null {
  return getSecret('github_pat');
}

/** Public shape, reports only whether a credential is configured, and where. */
export function publicSettings(s: SettingsDoc): Omit<SettingsDoc, 'github'> & {
  github: { configured: boolean; lastSyncAt: string | null; source: SecretSource };
} {
  const { github, ...rest } = s;
  const source = secretSource('github_pat');
  return {
    ...rest,
    github: { configured: source !== 'none', lastSyncAt: github.lastSyncAt ?? null, source },
  };
}
