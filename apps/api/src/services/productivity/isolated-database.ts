/**
 * Refuse the operator's everyday Postgres URL (NFR-PROD-001).
 *
 * The 10k performance seed and the productivity restore drill write, truncate,
 * and restore. Pointing either at `vitae` or `vitae_test` would destroy the
 * graph a developer actually uses, or the suite that shares `vitae_test`.
 */
export const DEFAULT_WORKSPACE_DATABASES = new Set(['vitae', 'vitae_test']);

export function databaseNameFromUrl(url: string): string {
  const parsed = new URL(url);
  return decodeURIComponent(parsed.pathname.replace(/^\//, '').replace(/\/$/, ''));
}

export function isDefaultWorkspaceDatabase(name: string): boolean {
  return DEFAULT_WORKSPACE_DATABASES.has(name);
}

export function assertDedicatedDatabaseUrl(
  url: string | undefined,
  opts: { confirm?: string; confirmEnv?: string } = {},
): string {
  if (!url || url.trim() === '') {
    throw new Error('DATABASE_URL is required and must name a dedicated database.');
  }
  let name: string;
  try {
    name = databaseNameFromUrl(url);
  } catch {
    throw new Error('DATABASE_URL is not a valid URL.');
  }
  if (!name) {
    throw new Error('DATABASE_URL has no database name.');
  }
  if (isDefaultWorkspaceDatabase(name)) {
    throw new Error(
      `Refusing to write the default workspace database "${name}". ` +
        'Point DATABASE_URL at a dedicated database (for example vitae_perf or vitae_prod_drill).',
    );
  }
  const confirmEnv = opts.confirmEnv ?? 'VITAE_PRODUCTIVITY_PERF_CONFIRM';
  const confirm = opts.confirm ?? process.env[confirmEnv];
  if (confirm !== 'YES') {
    throw new Error(`Refusing to continue without ${confirmEnv}=YES.`);
  }
  return name;
}
