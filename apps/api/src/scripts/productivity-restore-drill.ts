/**
 * Isolated productivity backup/restore drill (FR-PROD-003).
 *
 *   DATABASE_URL=postgresql://vitae:vitae@127.0.0.1:5433/vitae_prod_drill \
 *     CONFIRM=YES \
 *     pnpm --filter @vitae/api exec tsx src/scripts/productivity-restore-drill.ts
 *
 * Never points at the everyday `vitae` database. Seeds a small fixture, exports
 * with includeSensitive, restores into a second throwaway database, and asserts
 * collections, task props, new edges, and receipts.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { assertDedicatedDatabaseUrl } from '../services/productivity/isolated-database.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const apiRoot = join(here, '../..');
const adminUrl = process.env.VITAE_PERF_ADMIN_URL ?? 'postgresql://vitae:vitae@127.0.0.1:5433/postgres';

function run(command: string, args: string[], env: NodeJS.ProcessEnv): void {
  const result = spawnSync(command, args, {
    cwd: apiRoot,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed (${result.status}):\n${output}`);
  }
  if (output.trim()) process.stdout.write(output.endsWith('\n') ? output : `${output}\n`);
}

function withDbName(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

function sqlIdent(name: string): string {
  return name.replace(/"/g, '');
}

async function ensureDatabase(name: string): Promise<void> {
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    const safe = sqlIdent(name);
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [safe]);
    if (!rowCount) await admin.query(`CREATE DATABASE "${safe}"`);
  } finally {
    await admin.end();
  }
}

async function recreateDatabase(name: string): Promise<void> {
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    const safe = sqlIdent(name);
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [safe],
    );
    await admin.query(`DROP DATABASE IF EXISTS "${safe}"`);
    await admin.query(`CREATE DATABASE "${safe}"`);
  } finally {
    await admin.end();
  }
}

async function countTable(url: string, table: string): Promise<number> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
    return rows[0]?.n ?? 0;
  } finally {
    await client.end();
  }
}

async function hasEdge(url: string, type: string): Promise<boolean> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM edges WHERE data->>'type' = $1`,
      [type],
    );
    return (rows[0]?.n ?? 0) > 0;
  } finally {
    await client.end();
  }
}

async function taskHasProps(url: string): Promise<boolean> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM nodes
       WHERE data->>'type' = 'task'
         AND (data->'props' ? 'due' OR data->'props' ? 'target' OR data->'props' ? 'importance')`,
    );
    return (rows[0]?.n ?? 0) > 0;
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const sourceUrl = process.env.DATABASE_URL;
  const sourceName = assertDedicatedDatabaseUrl(sourceUrl, {
    confirmEnv: 'CONFIRM',
    confirm: process.env.CONFIRM,
  });
  const targetName = process.env.VITAE_RESTORE_DRILL_TARGET ?? `${sourceName}_restore`;
  const targetUrl = process.env.VITAE_RESTORE_DRILL_TARGET_URL ?? withDbName(sourceUrl!, targetName);
  assertDedicatedDatabaseUrl(targetUrl, { confirm: 'YES', confirmEnv: 'CONFIRM' });

  console.log(`[drill] source=${sourceName} target=${targetName}`);
  await ensureDatabase(sourceName);

  run('pnpm', ['exec', 'tsx', 'src/scripts/migrate.ts'], { DATABASE_URL: sourceUrl });
  run(
    'pnpm',
    ['exec', 'tsx', 'src/scripts/seed-productivity-perf.ts', '--count=24'],
    {
      DATABASE_URL: sourceUrl,
      VITAE_PRODUCTIVITY_PERF_CONFIRM: 'YES',
    },
  );

  const work = mkdtempSync(join(tmpdir(), 'vitae-prod-drill-'));
  const zip = join(work, 'vitae-export.zip');
  const bundle = join(work, 'bundle');
  try {
    run('pnpm', ['exec', 'tsx', 'src/scripts/export-bundle.ts', `--out=${zip}`], {
      DATABASE_URL: sourceUrl,
    });
    run('unzip', ['-q', zip, '-d', bundle], {});

    await recreateDatabase(targetName);
    run('pnpm', ['exec', 'tsx', 'src/scripts/migrate.ts'], { DATABASE_URL: targetUrl });
    run('pnpm', ['exec', 'tsx', 'src/scripts/restore.ts', bundle, '--force'], {
      DATABASE_URL: targetUrl,
    });

    const checks = [
      ['time_entries', await countTable(targetUrl, 'time_entries')],
      ['automation_rules', await countTable(targetUrl, 'automation_rules')],
      ['productivity_receipts', await countTable(targetUrl, 'productivity_receipts')],
      ['nodes', await countTable(targetUrl, 'nodes')],
    ] as const;
    for (const [table, n] of checks) {
      if (n < 1) throw new Error(`restored ${table} count is ${n}, expected at least 1`);
      console.log(`[drill] ${table}=${n}`);
    }
    if (checks[2][1] < 1) throw new Error('productivity_receipts did not round-trip');
    for (const type of ['DEPENDS_ON', 'SERVES_GOAL', 'WAITING_ON', 'FOR']) {
      if (!(await hasEdge(targetUrl, type))) throw new Error(`missing restored edge ${type}`);
      console.log(`[drill] edge ${type}=ok`);
    }
    if (!(await taskHasProps(targetUrl))) throw new Error('restored tasks lost due/target/importance props');
    console.log('[drill] task props=ok');
    console.log('[drill] PASS');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('[drill] FAIL', err instanceof Error ? err.message : err);
  process.exit(1);
});
