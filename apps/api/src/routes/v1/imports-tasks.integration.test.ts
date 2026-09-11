/**
 * Task-file imports through the existing staged pipeline (review, identity,
 * revision pin, rollback, share-safe export). Productivity flags stay off.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { authHeader, getAuthedApp } from '../../__tests__/helpers/app.js';

const FILE = 'task9-import.json';
const PARENT_KEY = 'tasks_json:task:t9-parent';
const CHILD_KEY = 'tasks_json:task:t9-child';
const PROJECT_KEY = 'project:tasks_json:t9-admin';
const SECRET_KEY = 'tasks_json:task:t9-secret';
const SECRET_TITLE = 'Task9 secret medical renewal';

function tasksDoc(over: {
  parentDue?: string;
  parentTitle?: string;
  includeSecret?: boolean;
  includeChild?: boolean;
}): string {
  const tasks: Array<Record<string, unknown>> = [
    {
      id: 't9-parent',
      title: over.parentTitle ?? 'Task9 renew passport',
      status: 'next',
      due: over.parentDue ?? '2026-09-11',
      priority: 'p1',
      project_id: 't9-admin',
    },
  ];
  if (over.includeChild !== false) {
    tasks.push({
      id: 't9-child',
      title: 'Task9 call the embassy',
      parent_id: 't9-parent',
      project_id: 't9-admin',
    });
  }
  if (over.includeSecret) {
    tasks.push({
      id: 't9-secret',
      title: SECRET_TITLE,
      sensitive: true,
      status: 'inbox',
    });
  }
  return JSON.stringify({
    format: 'vitae.tasks',
    version: 1,
    projects: [{ id: 't9-admin', title: 'Task9 Admin' }],
    tasks,
  });
}

const TODOIST = [
  'TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE,DURATION,DURATION_UNIT,DEADLINE,DEADLINE_LANG',
  'task,Task9 todoist milk,Bring photos,1,1,,,,16 Apr 2026,en,UTC,30,minute,18 Apr 2026,en',
].join('\n');

interface StagedRow {
  id: string;
  entity: string;
  title: string;
  decision: 'accept' | 'skip';
  payload: Record<string, unknown>;
  proposal: {
    identity_key: string;
    target_node_id: string;
    target_rev: number;
    fields: Array<{ key: string; from: unknown; to: unknown }>;
    accepted: string[];
  } | null;
}

let app: Express;
let token: string;

async function stage(kind: string, content: string, filename = FILE) {
  const res = await request(app)
    .post('/api/v1/imports')
    .set(authHeader(token))
    .send({ kind, filename, content });
  return res;
}

async function commitBatch(batchId: string) {
  const res = await request(app)
    .post(`/api/v1/imports/${batchId}/commit`)
    .set(authHeader(token))
    .expect(200);
  return res.body as { created: number; updated: number; unchanged: number; skipped: number; failed: number };
}

async function setRow(
  batchId: string,
  rowId: string,
  body: { decision?: 'accept' | 'skip'; fields?: string[] },
) {
  await request(app)
    .patch(`/api/v1/imports/${batchId}/rows/${rowId}`)
    .set(authHeader(token))
    .send(body)
    .expect(200);
}

async function node(id: string) {
  const res = await request(app).get(`/api/v1/nodes/${id}`).set(authHeader(token)).expect(200);
  return res.body.node as {
    id: string;
    title: string;
    type: string;
    deleted_at?: string | null;
    sensitivity?: string;
    props: Record<string, unknown>;
    notes_md?: string;
  };
}

async function liveByKey(key: string) {
  const { repository } = await import('../../db/repository.js');
  return (await repository.allLiveNodes()).find((n) => (n.identity_keys ?? []).includes(key));
}

async function purgeFixture(): Promise<void> {
  const { repository } = await import('../../db/repository.js');
  const keys = new Set([
    PARENT_KEY,
    CHILD_KEY,
    PROJECT_KEY,
    SECRET_KEY,
    'tasks_json:task:t9-rollback',
    'tasks_json:task:t9-late-child',
    'tasks_json:task:t9-orphan',
  ]);
  const nodes = await repository.allLiveNodes();
  const mine = nodes.filter(
    (n) =>
      (n.identity_keys ?? []).some((k) => keys.has(k)) ||
      n.title.startsWith('Task9 ') ||
      n.title === SECRET_TITLE,
  );
  const edges = await repository.allLiveEdges();
  await repository.purgeEdges(
    edges.filter((e) => mine.some((n) => n.id === e.src || n.id === e.dst)).map((e) => e.id),
  );
  await repository.purgeNodes(mine.map((n) => n.id));
  const batches = await repository.docList<{ id: string; filename?: string }>('imports');
  await repository.docDeleteMany(
    'imports',
    batches.filter((b) => b.filename === FILE || b.filename === 'task9-todoist.csv').map((b) => b.id),
  );
}

describe('task-file imports', () => {
  beforeAll(async () => {
    ({ app, token } = await getAuthedApp());
    await purgeFixture();
  }, 60_000);

  afterAll(async () => {
    await purgeFixture();
  }, 60_000);

  it('returns 422 INVALID_IMPORT_CONTENT for malformed JSON', async () => {
    const res = await stage('tasks_json', '{');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_IMPORT_CONTENT');
  });

  it('stages and commits with productivity flags off, and links project to child', async () => {
    expect(process.env.VITAE_PRODUCTIVITY_ENABLED).not.toBe('true');
    expect(process.env.VITE_PUBLIC_PRODUCTIVITY_ENABLED).not.toBe('true');

    const staged = await stage('tasks_json', tasksDoc({}));
    expect(staged.status).toBe(201);
    const rows = staged.body.rows as StagedRow[];
    expect(rows.some((r) => r.entity === 'project' && r.title === 'Task9 Admin')).toBe(true);
    expect(rows.some((r) => r.entity === 'task' && r.title === 'Task9 renew passport')).toBe(true);
    expect(rows.some((r) => r.entity === 'task' && r.title === 'Task9 call the embassy')).toBe(true);

    const result = await commitBatch(staged.body.batch.id as string);
    expect(result.failed).toBe(0);
    expect(result.created).toBeGreaterThanOrEqual(3);

    const parent = await liveByKey(PARENT_KEY);
    const child = await liveByKey(CHILD_KEY);
    const project = await liveByKey(PROJECT_KEY);
    expect(parent?.props).toMatchObject({ status: 'next', due: '2026-09-11', priority: 'p1' });
    expect(parent?.props.project_id).toBe(project?.id);
    expect(child).toBeTruthy();

    const { repository } = await import('../../db/repository.js');
    const edges = await repository.allLiveEdges();
    expect(
      edges.some((e) => e.type === 'ABOUT' && e.src === parent?.id && e.dst === project?.id),
    ).toBe(true);
    expect(
      edges.some((e) => e.type === 'RELATES_TO' && e.src === child?.id && e.dst === parent?.id),
    ).toBe(true);
  }, 90_000);

  it('converges on re-import instead of creating a second node', async () => {
    const staged = await stage('tasks_json', tasksDoc({}));
    expect(staged.status).toBe(201);
    const parentRow = (staged.body.rows as StagedRow[]).find((r) => r.title === 'Task9 renew passport')!;
    expect(parentRow.proposal).toMatchObject({ identity_key: PARENT_KEY, fields: [] });
    const result = await commitBatch(staged.body.batch.id as string);
    expect(result.updated).toBe(0);
    expect(result.unchanged).toBeGreaterThanOrEqual(1);
    const { repository } = await import('../../db/repository.js');
    const copies = (await repository.allLiveNodes()).filter((n) =>
      (n.identity_keys ?? []).includes(PARENT_KEY),
    );
    expect(copies).toHaveLength(1);
  }, 90_000);

  it('supports partial acceptance', async () => {
    const staged = await stage(
      'tasks_json',
      JSON.stringify({
        format: 'vitae.tasks',
        version: 1,
        projects: [{ id: 't9-admin', title: 'Task9 Admin' }],
        tasks: [
          {
            id: 't9-parent',
            title: 'Task9 renew passport',
            status: 'next',
            due: '2026-10-01',
            priority: 'p1',
            project_id: 't9-admin',
          },
          { id: 't9-skipped', title: 'Task9 skip this extra', status: 'inbox' },
        ],
      }),
    );
    const rows = staged.body.rows as StagedRow[];
    const parent = rows.find((r) => r.title === 'Task9 renew passport')!;
    const extra = rows.find((r) => r.title === 'Task9 skip this extra')!;
    expect(parent.proposal?.fields.some((f) => f.key === 'props.due')).toBe(true);
    await setRow(staged.body.batch.id as string, parent.id, { decision: 'accept' });
    await setRow(staged.body.batch.id as string, extra.id, { decision: 'skip' });
    const result = await commitBatch(staged.body.batch.id as string);
    expect(result.updated).toBe(1);
    expect(result.skipped).toBeGreaterThanOrEqual(1);
    const live = await liveByKey(PARENT_KEY);
    expect(live?.props.due).toBe('2026-10-01');
    expect(await liveByKey('tasks_json:task:t9-skipped')).toBeUndefined();
  }, 90_000);

  it('refuses a commit that would clobber a node edited after staging', async () => {
    const staged = await stage('tasks_json', tasksDoc({ parentDue: '2026-11-02' }));
    const parent = (staged.body.rows as StagedRow[]).find((r) => r.title === 'Task9 renew passport')!;
    const targetId = parent.proposal!.target_node_id;
    await request(app)
      .patch(`/api/v1/nodes/${targetId}`)
      .set(authHeader(token))
      .send({ notes_md: 'edited after staging' })
      .expect(200);
    await setRow(staged.body.batch.id as string, parent.id, { decision: 'accept' });
    const result = await commitBatch(staged.body.batch.id as string);
    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect(result.updated).toBe(0);
    const live = await node(targetId);
    expect(live.notes_md).toBe('edited after staging');
    expect(live.props.due).toBe('2026-10-01');
  }, 90_000);

  it('rolls back accepted field updates and soft-deletes created tasks', async () => {
    const createDoc = JSON.stringify({
      format: 'vitae.tasks',
      version: 1,
      projects: [],
      tasks: [{ id: 't9-rollback', title: 'Task9 rollback only', status: 'inbox', due: '2026-09-01' }],
    });
    const created = await stage('tasks_json', createDoc);
    expect(created.status).toBe(201);
    await commitBatch(created.body.batch.id as string);
    const before = await liveByKey('tasks_json:task:t9-rollback');
    expect(before?.props.due).toBe('2026-09-01');

    const updateDoc = JSON.stringify({
      format: 'vitae.tasks',
      version: 1,
      projects: [],
      tasks: [{ id: 't9-rollback', title: 'Task9 rollback only', status: 'inbox', due: '2026-12-01' }],
    });
    const updated = await stage('tasks_json', updateDoc);
    const row = (updated.body.rows as StagedRow[])[0]!;
    await setRow(updated.body.batch.id as string, row.id, { decision: 'accept' });
    await commitBatch(updated.body.batch.id as string);
    expect((await liveByKey('tasks_json:task:t9-rollback'))?.props.due).toBe('2026-12-01');

    const rolledUpdate = await request(app)
      .post(`/api/v1/imports/${updated.body.batch.id}/rollback`)
      .set(authHeader(token))
      .expect(200);
    expect(rolledUpdate.body.restored).toBe(1);
    expect((await liveByKey('tasks_json:task:t9-rollback'))?.props.due).toBe('2026-09-01');

    const rolledCreate = await request(app)
      .post(`/api/v1/imports/${created.body.batch.id}/rollback`)
      .set(authHeader(token))
      .expect(200);
    expect(rolledCreate.body.removed).toBeGreaterThanOrEqual(1);
    expect(await liveByKey('tasks_json:task:t9-rollback')).toBeUndefined();
  }, 90_000);

  it('keeps a sensitive task out of share-safe export', async () => {
    const staged = await stage('tasks_json', tasksDoc({ includeSecret: true, includeChild: false }));
    expect(staged.status).toBe(201);
    const secretRow = (staged.body.rows as StagedRow[]).find((r) => r.title === SECRET_TITLE)!;
    if (secretRow.proposal) await setRow(staged.body.batch.id as string, secretRow.id, { decision: 'accept' });
    await commitBatch(staged.body.batch.id as string);
    const secret = await liveByKey(SECRET_KEY);
    expect(secret?.sensitivity).toBe('sensitive');

    const { exportEntries } = await import('../../services/export.js');
    const gen = exportEntries({ includeSensitive: false });
    let nodesFile = '';
    let next = await gen.next();
    while (!next.done) {
      if (next.value.name === 'nodes.jsonl' && typeof next.value.content === 'string') {
        nodesFile = next.value.content;
      }
      next = await gen.next();
    }
    expect(nodesFile).not.toContain(SECRET_TITLE);
    expect(nodesFile).not.toContain(SECRET_KEY);
  }, 90_000);

  it('links a new child to a parent and project already in the workspace', async () => {
    if (!(await liveByKey(PARENT_KEY)) || !(await liveByKey(PROJECT_KEY))) {
      const seed = await stage('tasks_json', tasksDoc({ includeChild: false }));
      expect(seed.status).toBe(201);
      await commitBatch(seed.body.batch.id as string);
    }
    const staged = await stage(
      'tasks_json',
      JSON.stringify({
        format: 'vitae.tasks',
        version: 1,
        projects: [],
        tasks: [
          {
            id: 't9-late-child',
            title: 'Task9 late child',
            parent_id: 't9-parent',
            project_id: 't9-admin',
          },
        ],
      }),
    );
    expect(staged.status).toBe(201);
    const result = await commitBatch(staged.body.batch.id as string);
    expect(result.failed).toBe(0);
    const child = await liveByKey('tasks_json:task:t9-late-child');
    const parent = await liveByKey(PARENT_KEY);
    const project = await liveByKey(PROJECT_KEY);
    expect(child?.props.project_id).toBe(project?.id);
    const { repository } = await import('../../db/repository.js');
    const edges = await repository.allLiveEdges();
    expect(edges.some((e) => e.type === 'ABOUT' && e.src === child?.id && e.dst === project?.id)).toBe(true);
    expect(
      edges.some((e) => e.type === 'RELATES_TO' && e.src === child?.id && e.dst === parent?.id),
    ).toBe(true);
  }, 90_000);

  it('proposes and writes project_id when a later file attaches an existing task', async () => {
    const orphanDoc = JSON.stringify({
      format: 'vitae.tasks',
      version: 1,
      projects: [],
      tasks: [{ id: 't9-orphan', title: 'Task9 orphan', status: 'next' }],
    });
    const created = await stage('tasks_json', orphanDoc);
    expect(created.status).toBe(201);
    await commitBatch(created.body.batch.id as string);
    expect((await liveByKey('tasks_json:task:t9-orphan'))?.props.project_id).toBeUndefined();

    if (!(await liveByKey(PROJECT_KEY))) {
      const seed = await stage('tasks_json', tasksDoc({ includeChild: false }));
      expect(seed.status).toBe(201);
      await commitBatch(seed.body.batch.id as string);
    }

    const attached = await stage(
      'tasks_json',
      JSON.stringify({
        format: 'vitae.tasks',
        version: 1,
        projects: [{ id: 't9-admin', title: 'Task9 Admin' }],
        tasks: [{ id: 't9-orphan', title: 'Task9 orphan', status: 'next', project_id: 't9-admin' }],
      }),
    );
    expect(attached.status).toBe(201);
    const row = (attached.body.rows as StagedRow[]).find((r) => r.title === 'Task9 orphan')!;
    expect(row.proposal?.fields.some((f) => f.key === 'props.project_id')).toBe(true);
    await setRow(attached.body.batch.id as string, row.id, { decision: 'accept' });
    const result = await commitBatch(attached.body.batch.id as string);
    expect(result.failed).toBe(0);
    expect(result.updated).toBe(1);
    const live = await liveByKey('tasks_json:task:t9-orphan');
    const project = await liveByKey(PROJECT_KEY);
    expect(live?.props.project_id).toBe(project?.id);
  }, 90_000);

  it('stages Todoist fixture rows as tasks for review', async () => {
    const res = await stage('todoist', TODOIST, 'task9-todoist.csv');
    expect(res.status).toBe(201);
    const rows = res.body.rows as StagedRow[];
    expect(rows.some((r) => r.entity === 'task' && r.title === 'Task9 todoist milk')).toBe(true);
  }, 60_000);
});
