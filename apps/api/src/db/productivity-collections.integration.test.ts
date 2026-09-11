/**
 * Productivity persistence: migration 012, repository audit, export/restore,
 * retention, and the four Task-3 edges in the demo seed.
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { FileMigrationProvider, Migrator } from 'kysely/migration';
import pg, { Client } from 'pg';
import { readFileSync } from 'node:fs';
import { EDGE_TYPES } from '@vitae/core';
import { closeDb, db } from './pg.js';
import {
  GuardedCollectionError,
  repository,
  RevisionConflictError,
} from './repository.js';
import { TABLES } from './schema.js';
import { runInWorkspace } from './space.js';
import { TRASH_RETENTION_DAYS, purgeExpiredTrash } from '../services/retention.js';

const ADMIN_URL = process.env.VITAE_TEST_ADMIN_URL ?? 'postgresql://vitae:vitae@127.0.0.1:5433/postgres';
const MIGRATION_FOLDER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const TEST_WORKSPACES = ['ws-prod-a', 'ws-prod-b'] as const;

beforeAll(async () => {
  try {
    await sql`SELECT 1`.execute(db);
  } catch (error) {
    throw new Error(
      'Postgres is not reachable, so the productivity collection suite cannot run. ' +
        `Start it with \`docker compose up -d postgres\`. Cause: ${(error as Error).message}`,
    );
  }
});

afterEach(async () => {
  await sql.raw(`TRUNCATE ${TABLES.join(', ')} CASCADE`).execute(db);
  await db.deleteFrom('workspaces').where('id', 'in', [...TEST_WORKSPACES]).execute();
});

afterAll(closeDb);

async function seedTask(
  title = `task-${Date.now()}`,
  extra: { sensitivity?: 'normal' | 'sensitive' } = {},
) {
  return repository.createNode({
    type: 'task',
    title,
    props: { status: 'next' },
    source: 'manual',
    ...extra,
  });
}

function iso(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

async function ensureWorkspace(id: string): Promise<void> {
  await db
    .insertInto('workspaces')
    .values({ id, kind: 'personal', state: 'active', owner_user_id: null })
    .onConflict((oc) => oc.column('id').doNothing())
    .execute();
}

describe('demo seed catalogue lockstep', () => {
  it('seeds DEPENDS_ON, SERVES_GOAL, WAITING_ON, and FOR', () => {
    const src = readFileSync(new URL('../scripts/seed-demo.ts', import.meta.url), 'utf8');
    for (const type of ['DEPENDS_ON', 'SERVES_GOAL', 'WAITING_ON', 'FOR'] as const) {
      expect(EDGE_TYPES).toContain(type);
      expect(src, type).toContain(`type: '${type}'`);
    }
    const missing = EDGE_TYPES.filter((type) => !src.includes(`type: '${type}'`) && !src.includes(`type: "${type}"`));
    expect(missing, `seed-demo must mention every EDGE_TYPES member: ${missing.join(', ')}`).toEqual([]);
  });
});

describe('012-productivity-collections migration', () => {
  it('applies up, down, then up on an empty database', async () => {
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    const name = `vitae_test_mig_012_${Date.now()}`;
    await admin.query(`CREATE DATABASE "${name}"`);
    const url = new URL(ADMIN_URL);
    url.pathname = `/${name}`;
    const pool = new pg.Pool({ connectionString: url.toString() });
    const isolated = new Kysely({ dialect: new PostgresDialect({ pool }) });
    const migrator = new Migrator({
      db: isolated,
      provider: new FileMigrationProvider({ fs, path, migrationFolder: MIGRATION_FOLDER }),
    });
    try {
      const up1 = await migrator.migrateToLatest();
      expect(up1.error).toBeUndefined();
      expect(await tableExists(isolated, 'time_entries')).toBe(true);
      expect(await tableExists(isolated, 'automation_rules')).toBe(true);
      expect(await tableExists(isolated, 'productivity_receipts')).toBe(true);
      expect(await columnExists(isolated, 'revisions', 'at')).toBe(true);
      expect(await indexExists(isolated, 'revisions_workspace_at')).toBe(true);
      expect(await indexExists(isolated, 'revisions_workspace_kind_at')).toBe(true);

      const down = await migrator.migrateDown();
      expect(down.error).toBeUndefined();
      expect(await tableExists(isolated, 'time_entries')).toBe(false);
      expect(await tableExists(isolated, 'automation_rules')).toBe(false);
      expect(await tableExists(isolated, 'productivity_receipts')).toBe(false);
      expect(await columnExists(isolated, 'revisions', 'at')).toBe(false);
      expect(await indexExists(isolated, 'revisions_workspace_at')).toBe(false);

      const up2 = await migrator.migrateToLatest();
      expect(up2.error).toBeUndefined();
      expect(await tableExists(isolated, 'time_entries')).toBe(true);
      expect(await columnExists(isolated, 'revisions', 'at')).toBe(true);
    } finally {
      await isolated.destroy();
      await admin.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [name],
      );
      await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
      await admin.end();
    }
  }, 60_000);

  it('applies up on a fixture that already has nodes, tasks, and revisions', async () => {
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    const name = `vitae_test_mig_012_prod_${Date.now()}`;
    await admin.query(`CREATE DATABASE "${name}"`);
    const url = new URL(ADMIN_URL);
    url.pathname = `/${name}`;
    const pool = new pg.Pool({ connectionString: url.toString() });
    const isolated = new Kysely({ dialect: new PostgresDialect({ pool }) });
    const migrator = new Migrator({
      db: isolated,
      provider: new FileMigrationProvider({ fs, path, migrationFolder: MIGRATION_FOLDER }),
    });
    try {
      const to011 = await migrator.migrateTo('011-dossiers');
      expect(to011.error).toBeUndefined();
      const now = '2026-01-15T12:00:00.000Z';
      await sql`
        INSERT INTO nodes (space, workspace_id, id, data)
        VALUES (
          'real',
          'workspace-legacy-real',
          'task-existing',
          ${JSON.stringify({
            id: 'task-existing',
            type: 'task',
            title: 'Existing production task',
            props: { status: 'next' },
            notes_md: '',
            date_precision: 'day',
            pinned: false,
            sensitivity: 'normal',
            source: 'manual',
            confidence: 1,
            captured_at: now,
            created_at: now,
            updated_at: now,
            archived_at: null,
            deleted_at: null,
            merged_into: null,
            rev: 1,
          })}::jsonb
        )
      `.execute(isolated);
      await sql`
        INSERT INTO revisions (space, workspace_id, id, data)
        VALUES (
          'real',
          'workspace-legacy-real',
          'rev-existing',
          ${JSON.stringify({
            id: 'rev-existing',
            subject_kind: 'node',
            subject_id: 'task-existing',
            rev: 1,
            op: 'create',
            at: now,
            actor: 'owner',
            source: 'manual',
          })}::jsonb
        )
      `.execute(isolated);

      const up = await migrator.migrateToLatest();
      expect(up.error).toBeUndefined();
      const node = await sql<{ id: string }>`
        SELECT id FROM nodes WHERE id = 'task-existing'
      `.execute(isolated);
      expect(node.rows.map((r) => r.id)).toEqual(['task-existing']);
      expect(await tableExists(isolated, 'time_entries')).toBe(true);
      const at = await sql<{ at: string | null }>`
        SELECT at FROM revisions WHERE id = 'rev-existing'
      `.execute(isolated);
      expect(at.rows[0]?.at).toBe(now);
    } finally {
      await isolated.destroy();
      await admin.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [name],
      );
      await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
      await admin.end();
    }
  }, 60_000);
});

describe('productivity repository', () => {
  it('isolates rows by workspace', async () => {
    await ensureWorkspace('ws-prod-a');
    await ensureWorkspace('ws-prod-b');
    const inA = await runInWorkspace('ws-prod-a', async () => {
      const task = await seedTask('workspace-a-task');
      const entry = await repository.createTimeEntry({
        id: 'shared-entry-id',
        task_id: task.id,
        started_at: iso(),
      });
      return { taskId: task.id, entryId: entry.id };
    });

    const visibleInB = await runInWorkspace('ws-prod-b', async () => {
      const sameId = await repository.getTimeEntry('shared-entry-id', { includeDeleted: true });
      const listed = await repository.listTimeEntriesByTask(inA.taskId);
      return { sameId, listed };
    });
    expect(visibleInB.sameId).toBeNull();
    expect(visibleInB.listed).toEqual([]);

    const visibleInA = await runInWorkspace('ws-prod-a', () =>
      repository.getTimeEntry('shared-entry-id'),
    );
    expect(visibleInA?.id).toBe(inA.entryId);
  });

  it('rejects duplicate (workspace_id, id) and duplicate operation_id', async () => {
    const task = await seedTask();
    await repository.createTimeEntry({
      id: 'te-dup',
      task_id: task.id,
      started_at: iso(),
    });
    await expect(
      repository.createTimeEntry({
        id: 'te-dup',
        task_id: task.id,
        started_at: iso(1_000),
      }),
    ).rejects.toThrow(/unique|duplicate/i);

    await repository.putProductivityReceipt({
      id: 'rc-1',
      operation_id: 'op-dup',
      command_type: 'add_time_entry',
      result: { ok: true },
    });
    await expect(
      repository.putProductivityReceipt({
        id: 'rc-2',
        operation_id: 'op-dup',
        command_type: 'add_time_entry',
        result: { ok: false },
      }),
    ).rejects.toThrow(/unique|duplicate/i);
  });

  it('rolls a failed write back so neither the row nor its revision remains', async () => {
    const task = await seedTask();
    await expect(
      repository.transaction(async (tx) => {
        await repository.stageTimeEntry(tx, { id: 'te-rollback', task_id: task.id, started_at: iso() });
        throw new Error('forced rollback');
      }),
    ).rejects.toThrow('forced rollback');
    expect(await repository.getTimeEntry('te-rollback', { includeDeleted: true })).toBeNull();
    expect(await repository.revisionsFor('te-rollback')).toEqual([]);
  });

  it('writes a revision on create and another on update, atomically incrementing rev', async () => {
    const task = await seedTask();
    const created = await repository.createTimeEntry({
      id: 'te-rev',
      task_id: task.id,
      started_at: iso(),
      note: 'first',
    });
    expect(created.rev).toBe(1);
    const afterCreate = await repository.revisionsFor('te-rev');
    expect(afterCreate).toHaveLength(1);
    expect(afterCreate[0]).toMatchObject({ subject_kind: 'time_entry', subject_id: 'te-rev', rev: 1, op: 'create' });

    const updated = await repository.updateTimeEntry('te-rev', { note: 'second' });
    expect(updated.rev).toBe(2);
    expect(updated.note).toBe('second');
    const afterUpdate = await repository.revisionsFor('te-rev');
    expect(afterUpdate).toHaveLength(2);
    expect(afterUpdate[1]).toMatchObject({ subject_kind: 'time_entry', rev: 2, op: 'update' });

    const rule = await repository.createAutomationRule({
      id: 'rule-rev',
      name: 'Bump priority',
      enabled: true,
      condition: { kind: 'predicate', field: 'status', operator: 'eq', value: 'doing' },
      actions: [{ field: 'priority', value: 'p1' }],
    });
    expect(rule.rev).toBe(1);
    const ruleRevs = await repository.revisionsFor('rule-rev');
    expect(ruleRevs[0]).toMatchObject({ subject_kind: 'automation_rule', rev: 1 });
    const ruleUpdated = await repository.updateAutomationRule('rule-rev', { enabled: false });
    expect(ruleUpdated.rev).toBe(2);
    expect(await repository.revisionsFor('rule-rev')).toHaveLength(2);
  });

  it('throws RevisionConflictError on expected_revision mismatch and does not write', async () => {
    const task = await seedTask();
    const entry = await repository.createTimeEntry({
      task_id: task.id,
      started_at: iso(),
      note: 'original',
    });
    await expect(
      repository.updateTimeEntry(entry.id, { note: 'stale' }, { expected_revision: 99 }),
    ).rejects.toBeInstanceOf(RevisionConflictError);
    const stored = await repository.getTimeEntry(entry.id);
    expect(stored?.rev).toBe(1);
    expect(stored?.note).toBe('original');
    expect(await repository.revisionsFor(entry.id)).toHaveLength(1);
  });

  it('rejects generic document writes to the three productivity tables', async () => {
    await expect(repository.docPut('time_entries', 'x', { id: 'x' })).rejects.toBeInstanceOf(
      GuardedCollectionError,
    );
    await expect(repository.docMerge('automation_rules', 'x', { name: 'nope' })).rejects.toBeInstanceOf(
      GuardedCollectionError,
    );
    await expect(
      repository.docBulkPut('productivity_receipts', [{ id: 'x', data: { id: 'x' } }]),
    ).rejects.toBeInstanceOf(GuardedCollectionError);
  });
});

describe('productivity export, restore, and retention', () => {
  it('exports the new files, matches restore checksums, and drops sensitive-linked time entries', async () => {
    const { buildExport } = await import('../services/export.js');
    const { restoreBundle } = await import('../services/restore.js');

    const safeTask = await seedTask('safe-task');
    const secretTask = await seedTask('secret-task', { sensitivity: 'sensitive' });
    const safeEntry = await repository.createTimeEntry({
      id: 'te-safe',
      task_id: safeTask.id,
      started_at: iso(),
      note: 'keep-me',
    });
    await repository.createTimeEntry({
      id: 'te-own-sensitive',
      task_id: safeTask.id,
      started_at: iso(-1_000),
      sensitive: true,
      note: 'own-flag',
    });
    await repository.createTimeEntry({
      id: 'te-linked-sensitive',
      task_id: secretTask.id,
      started_at: iso(-2_000),
      note: 'linked',
    });
    await repository.createAutomationRule({
      id: 'rule-export',
      name: 'Export rule',
      enabled: true,
      condition: {},
      actions: [],
    });
    await repository.putProductivityReceipt({
      id: 'rc-export',
      operation_id: 'op-export',
      command_type: 'add_time_entry',
      result: { entry_id: safeEntry.id },
    });

    const shareSafe = await buildExport({ includeSensitive: false });
    expect(shareSafe.files).toHaveProperty('time_entries.jsonl');
    expect(shareSafe.files).toHaveProperty('automation_rules.jsonl');
    expect(shareSafe.files).toHaveProperty('productivity_receipts.jsonl');
    expect(String(shareSafe.files['time_entries.jsonl'])).toContain('te-safe');
    expect(String(shareSafe.files['time_entries.jsonl'])).not.toContain('te-own-sensitive');
    expect(String(shareSafe.files['time_entries.jsonl'])).not.toContain('te-linked-sensitive');

    const complete = await buildExport({ includeSensitive: true });
    for (const file of ['time_entries.jsonl', 'automation_rules.jsonl', 'productivity_receipts.jsonl'] as const) {
      const actual = createHash('sha256').update(complete.files[file] as string).digest('hex');
      expect(complete.manifest.checksums[file]).toBe(actual);
    }
    expect(String(complete.files['time_entries.jsonl'])).toContain('te-own-sensitive');
    expect(String(complete.files['time_entries.jsonl'])).toContain('te-linked-sensitive');

    const restored = await restoreBundle(complete.files, { force: true });
    expect(restored.collections.time_entries).toBeGreaterThanOrEqual(3);
    expect(await repository.getTimeEntry('te-safe')).toMatchObject({ note: 'keep-me' });
    expect(await repository.getProductivityReceiptByOperationId('op-export')).toMatchObject({
      command_type: 'add_time_entry',
    });
  }, 60_000);

  it('soft-deletes and purges productivity rows the way other documents are purged', async () => {
    const task = await seedTask('purge-task');
    const aged = new Date(Date.now() - (TRASH_RETENTION_DAYS + 2) * 86_400_000).toISOString();
    const expired = await repository.createTimeEntry({
      id: 'te-expired',
      task_id: task.id,
      started_at: iso(),
    });
    await repository.updateTimeEntry(expired.id, { deleted_at: aged }, { op: 'delete' });

    const fresh = await repository.createTimeEntry({
      id: 'te-fresh',
      task_id: task.id,
      started_at: iso(-500),
    });
    await repository.updateTimeEntry(fresh.id, { deleted_at: iso() }, { op: 'delete' });

    const rule = await repository.createAutomationRule({
      id: 'rule-expired',
      name: 'Expired rule',
      enabled: false,
      condition: {},
      actions: [],
    });
    await repository.updateAutomationRule(rule.id, { deleted_at: aged }, { op: 'delete' });

    const hangingTask = await seedTask('hanging-task');
    await repository.createTimeEntry({
      id: 'te-with-purged-task',
      task_id: hangingTask.id,
      started_at: iso(),
    });
    await repository.updateNode(hangingTask.id, { deleted_at: aged }, { op: 'delete' });

    const summary = await purgeExpiredTrash();
    expect(summary.nodes).toBeGreaterThanOrEqual(1);
    expect(await repository.getTimeEntry('te-expired', { includeDeleted: true })).toBeNull();
    expect(await repository.getAutomationRule('rule-expired', { includeDeleted: true })).toBeNull();
    expect(await repository.getTimeEntry('te-with-purged-task', { includeDeleted: true })).toBeNull();
    expect(await repository.revisionsFor('te-expired')).toEqual([]);
    const kept = await repository.getTimeEntry('te-fresh', { includeDeleted: true });
    expect(kept?.deleted_at).toBeTruthy();
  });
});

async function tableExists(conn: Kysely<unknown>, name: string): Promise<boolean> {
  const result = await sql<{ exists: boolean }>`
    SELECT EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = ${name}
    ) AS exists
  `.execute(conn);
  return result.rows[0]?.exists === true;
}

async function columnExists(conn: Kysely<unknown>, table: string, column: string): Promise<boolean> {
  const result = await sql<{ exists: boolean }>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${column}
    ) AS exists
  `.execute(conn);
  return result.rows[0]?.exists === true;
}

async function indexExists(conn: Kysely<unknown>, name: string): Promise<boolean> {
  const result = await sql<{ exists: boolean }>`
    SELECT EXISTS (
      SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = ${name}
    ) AS exists
  `.execute(conn);
  return result.rows[0]?.exists === true;
}
