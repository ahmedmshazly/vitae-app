/**
 * Seed 10,000 task nodes into an isolated performance database (NFR-PROD-001).
 *
 *   DATABASE_URL=postgresql://vitae:vitae@127.0.0.1:5433/vitae_perf \
 *     VITAE_PRODUCTIVITY_PERF_CONFIRM=YES \
 *     pnpm seed:productivity-perf
 *
 * Refuses the default `vitae` and `vitae_test` databases. Creates the named
 * database if it is missing, migrates, truncates that database, then writes.
 */
import { validateNodeCreate } from '@vitae/core';
import '../env.js';
import { Client } from 'pg';
import { env } from '../env.js';
import { assertDedicatedDatabaseUrl } from '../services/productivity/isolated-database.js';

const DEFAULT_COUNT = 10_000;
const BATCH = 100;

function argValue(flag: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : undefined;
}

function taskCount(): number {
  const raw = argValue('--count') ?? process.env.VITAE_PRODUCTIVITY_PERF_COUNT;
  if (!raw) return DEFAULT_COUNT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 50_000) {
    throw new Error(`--count must be an integer from 1 to 50000, got ${raw}`);
  }
  return n;
}

const STATUSES = ['inbox', 'next', 'doing', 'waiting', 'done', 'dropped'] as const;
const PRIORITIES = ['p1', 'p2', 'p3', 'p4'] as const;
const IMPORTANCE = ['none', 'important', 'critical'] as const;

function dateOnly(offsetDays: number): string {
  const d = new Date(Date.UTC(2026, 8, 11));
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function ensureDatabase(name: string): Promise<void> {
  const adminUrl = process.env.VITAE_PERF_ADMIN_URL ?? 'postgresql://vitae:vitae@127.0.0.1:5433/postgres';
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (!rowCount) {
      await admin.query(`CREATE DATABASE "${name.replace(/"/g, '')}"`);
      console.log(`  created database ${name}`);
    }
  } finally {
    await admin.end();
  }
}

async function migrate(): Promise<void> {
  const { promises: fs } = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { FileMigrationProvider, Migrator } = await import('kysely/migration');
  const { db } = await import('../db/pg.js');
  const migrationFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), '../db/migrations');
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({ fs, path, migrationFolder }),
  });
  const { error } = await migrator.migrateToLatest();
  if (error) throw error;
}

async function main(): Promise<void> {
  const count = taskCount();
  const name = assertDedicatedDatabaseUrl(env.DATABASE_URL);
  console.log(`Seeding productivity performance workspace (${count} tasks) into ${name}...`);
  await ensureDatabase(name);
  await migrate();

  const { repository } = await import('../db/repository.js');
  const { TABLES } = await import('../db/schema.js');
  const { closeDb } = await import('../db/pg.js');

  for (const table of TABLES) await repository.docTruncate(table);
  console.log('  cleared dedicated collections');

  const person = await repository.createNode({
    type: 'person',
    title: 'Perf waiting target',
    props: { is_self: false },
    source: 'manual',
  });
  const goal = await repository.createNode({
    type: 'goal',
    title: 'Perf goal',
    props: { horizon: 'year', goal_status: 'active' },
    source: 'manual',
  });
  const project = await repository.createNode({
    type: 'project',
    title: 'Perf project',
    props: {},
    source: 'manual',
  });

  const ids: string[] = [];
  for (let start = 0; start < count; start += BATCH) {
    const end = Math.min(start + BATCH, count);
    await repository.transaction(async (tx) => {
      for (let i = start; i < end; i += 1) {
        const status = STATUSES[i % STATUSES.length];
        const props: Record<string, unknown> = {
          status,
          priority: PRIORITIES[i % PRIORITIES.length],
          importance: IMPORTANCE[i % IMPORTANCE.length],
        };
        if (i % 4 === 0) props.due = dateOnly((i % 40) - 20);
        if (i % 5 === 0) props.target = dateOnly((i % 30) - 10);
        if (i % 6 === 0) props.scheduled = dateOnly(i % 14);
        const parsed = validateNodeCreate({
          type: 'task',
          title: `Perf task ${String(i + 1).padStart(5, '0')}`,
          props,
          source: 'manual',
        });
        if (!parsed.ok) {
          throw new Error(parsed.errors.map((e) => `${e.path}: ${e.message}`).join('; '));
        }
        const node = await repository.stageNode(tx, parsed.value, { source: 'perf-seed' });
        ids.push(node.id);
      }
    });
    if ((start + BATCH) % 1000 === 0 || end === count) {
      console.log(`  tasks ${end}/${count}`);
    }
  }

  const first = ids[0];
  const second = ids[1];
  if (first && second) {
    await repository.createEdge({ type: 'DEPENDS_ON', src: first, dst: second, source: 'manual' });
    await repository.createEdge({ type: 'SERVES_GOAL', src: first, dst: goal.id, source: 'manual' });
    await repository.createEdge({ type: 'WAITING_ON', src: second, dst: person.id, source: 'manual' });
    await repository.createEdge({ type: 'FOR', src: first, dst: person.id, source: 'manual' });
    await repository.createEdge({ type: 'ABOUT', src: first, dst: project.id, source: 'manual' });
    const started = new Date(Date.UTC(2026, 8, 10, 12, 0, 0)).toISOString();
    await repository.createTimeEntry({
      task_id: first,
      started_at: started,
      ended_at: new Date(Date.UTC(2026, 8, 10, 13, 0, 0)).toISOString(),
      duration_sec: 3600,
      note: 'Perf seed block',
    });
    await repository.createAutomationRule({
      name: 'Perf flag doing',
      enabled: true,
      condition: { kind: 'predicate', field: 'status', operator: 'eq', value: 'doing' },
      actions: [{ field: 'priority', value: 'p1' }],
    });
    await repository.putProductivityReceipt({
      operation_id: 'perf-seed-receipt',
      command_type: 'create_task',
      result: { seeded: true, task_id: first },
    });
  }

  console.log(`  wrote ${ids.length} tasks plus fixture edges, time entry, rule, and receipt`);
  await closeDb();
}

main().catch((err) => {
  console.error('[seed:productivity-perf]', err instanceof Error ? err.message : err);
  process.exit(1);
});
