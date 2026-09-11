/**
 * The nodes/edges/revisions repository (SRS §4.2, §4.4, §4.7), on Postgres.
 *
 * Every mutation is append-only-audited: it writes the record AND a `revisions`
 * row capturing the full snapshot + field diff + op + source. Deletes are soft
 * (30-day trash); edges to a deleted node are hidden by query filters rather
 * than removed, so restore is lossless. Multi-document writes go through
 * `transaction()` so imports, merges, and résumé finalize are atomic
 * (SRS NFR-REL-003).
 *
 * ## What changed moving off Firestore (ADR 0005)
 *
 * Firestore transactions were read-then-write: every `get` had to happen before
 * the first write, which is why the `stage*` methods exist as a separate
 * write-phase step. Postgres has no such rule, so that ordering constraint is
 * gone, the split is kept because callers compose it, not because it is
 * required. The `stage*` methods are now `async`: `tx.set` was synchronous, an
 * INSERT is not.
 *
 * This file is the only one permitted to know how records are stored. That is
 * the layering rule (route → service → repository), and on Firestore it had
 * eroded to 162 `repository.raw` uses across 32 files. The generic document
 * accessors at the bottom exist so the collections that are genuinely key-value
 * have a home here instead of reaching around the seam.
 */
import { sql, type Transaction } from 'kysely';
import {
  edgeEndpointsAllowed,
  type EdgeCreateInput,
  type EdgeRecord,
  type EdgeType,
  type NodeCreateInput,
  type NodeRecord,
  type RevisionOp,
  validateEdgeCreate,
  validateNodeCreate,
} from '@vitae/core';
import { db } from './pg.js';
import type { Database, TableName } from './schema.js';
import {
  automationRulePatchSchema,
  automationRuleWriteSchema,
  isRevisionGuardedTable,
  productivityReceiptWriteSchema,
  productivityTemplateWriteSchema,
  timeEntryPatchSchema,
  timeEntryWriteSchema,
  zodIssues,
  type AutomationRulePatch,
  type AutomationRuleRecord,
  type AutomationRuleWrite,
  type ProductivityReceiptRecord,
  type ProductivityReceiptWrite,
  type ProductivityTemplateRecord,
  type ProductivityTemplateWrite,
  type TimeEntryPatch,
  type TimeEntryRecord,
  type TimeEntryWrite,
} from './productivity-docs.js';
import { currentSpace, currentWorkspaceId } from './space.js';
import { bumpWriteGeneration } from './write-signal.js';
import { newId, nowIso, shallowDiff, stripUndefined } from './util.js';

/**
 * A transaction handle. Services compose staged writes through this instead of
 * a driver type, so the storage engine stays behind the seam.
 */
export type Tx = Transaction<Database>;

/** Either the pool or an open transaction, every read/write takes one. */
type Db = typeof db | Tx;

export class ValidationError extends Error {
  constructor(
    message: string,
    readonly errors: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = 'NotFoundError';
  }
}

export class RevisionConflictError extends Error {
  constructor(message = 'revision conflict') {
    super(message);
    this.name = 'RevisionConflictError';
  }
}

export class GuardedCollectionError extends Error {
  constructor(table: string) {
    super(
      `${table} cannot be written through generic document helpers; use the repository methods that write a revision`,
    );
    this.name = 'GuardedCollectionError';
  }
}

export type RevisionSubjectKind =
  | 'node'
  | 'edge'
  | 'atom'
  | 'target'
  | 'resume'
  | 'letter'
  | 'time_entry'
  | 'automation_rule'
  | 'productivity_receipt'
  | 'template';

function assertGenericDocWriteAllowed(table: TableName): void {
  if (isRevisionGuardedTable(table)) throw new GuardedCollectionError(table);
}

export interface WriteMeta {
  actor?: string;
  op?: RevisionOp;
  source?: string;
}

export type ProductivityWriteMeta = WriteMeta & { expected_revision?: number };

/** Filters for the generic document accessors: equality on generated columns. */
export type DocFilter = Record<string, string | number | boolean | null>;

export class Repository {
  /** The active data space, resolved per call so AsyncLocalStorage still governs it. */
  private get space(): 'real' | 'demo' {
    return currentSpace();
  }

  /** A server-derived partition; never read from a browser-controlled header. */
  private get workspaceId(): string {
    return currentWorkspaceId();
  }

  allocateId(): string {
    return newId();
  }

  // ── Nodes ──────────────────────────────────────────────────────────────────

  async createNode(input: unknown, meta: WriteMeta = {}, opts: { id?: string } = {}): Promise<NodeRecord> {
    const parsed = validateNodeCreate(input);
    if (!parsed.ok) throw new ValidationError('invalid node', parsed.errors);
    return this.transaction(async (tx) => {
      if (opts.id) {
        const existing = await this.getNode(opts.id, { includeDeleted: true }, tx);
        // Re-seeding a known id must not silently overwrite edits made since.
        if (existing) return existing;
      }
      return this.stageNode(tx, parsed.value, meta, opts);
    });
  }

  /** Stage a new node (record + revision) inside an existing transaction. */
  async stageNode(
    tx: Tx,
    value: NodeCreateInput,
    meta: WriteMeta = {},
    opts: { id?: string } = {},
  ): Promise<NodeRecord> {
    const id = opts.id ?? newId();
    const ts = nowIso();
    const record: NodeRecord = {
      ...value,
      id,
      captured_at: ts,
      created_at: ts,
      updated_at: ts,
      archived_at: null,
      deleted_at: null,
      merged_into: null,
      rev: 1,
    };
    await tx
      .insertInto('nodes')
      .values({ space: this.space, workspace_id: this.workspaceId, id, data: this.clean(record) })
      .execute();
    await this.writeRevision(tx, 'node', id, 1, meta.op ?? 'create', record, undefined, value.source, meta.actor);
    return record;
  }

  async getNode(
    id: string,
    opts: { includeDeleted?: boolean; forUpdate?: boolean } = {},
    conn: Db = db,
  ): Promise<NodeRecord | null> {
    let q = conn
      .selectFrom('nodes')
      .select('data')
      .where('space', '=', this.space)
      .where('workspace_id', '=', this.workspaceId)
      .where('id', '=', id);
    if (opts.forUpdate) q = q.forUpdate();
    const row = await q.executeTakeFirst();
    if (!row) return null;
    const node = row.data as NodeRecord;
    if (node.deleted_at && !opts.includeDeleted) return null;
    return node;
  }

  async updateNode(id: string, patch: Record<string, unknown>, meta: WriteMeta = {}): Promise<NodeRecord> {
    return this.transaction(async (tx) => {
      const before = await this.getNode(id, { includeDeleted: true }, tx);
      if (!before) throw new NotFoundError('node');
      return this.stageNodeUpdate(tx, before, patch, meta);
    });
  }

  /** Stage an update to a node read earlier in this transaction (rev bump + revision). */
  async stageNodeUpdate(
    tx: Tx,
    before: NodeRecord,
    patch: Record<string, unknown>,
    meta: WriteMeta = {},
  ): Promise<NodeRecord> {
    const merged: NodeRecord = {
      ...before,
      ...patch,
      // Immutable fields.
      id: before.id,
      type: before.type,
      created_at: before.created_at,
      captured_at: before.captured_at,
      updated_at: nowIso(),
      rev: before.rev + 1,
    };
    await tx
      .updateTable('nodes')
      .set({ data: this.clean(merged) })
      .where('space', '=', this.space)
      .where('workspace_id', '=', this.workspaceId)
      .where('id', '=', before.id)
      .execute();
    const diff = shallowDiff(before as never, merged as never);
    await this.writeRevision(tx, 'node', before.id, merged.rev, meta.op ?? 'update', merged, diff, meta.source ?? 'manual', meta.actor);
    return merged;
  }

  async softDeleteNode(id: string, meta: WriteMeta = {}): Promise<NodeRecord> {
    return this.updateNode(id, { deleted_at: nowIso() }, { ...meta, op: 'delete' });
  }

  async restoreNode(id: string, meta: WriteMeta = {}): Promise<NodeRecord> {
    return this.updateNode(id, { deleted_at: null }, { ...meta, op: 'restore' });
  }

  async archiveNode(id: string, archived: boolean, meta: WriteMeta = {}): Promise<NodeRecord> {
    return this.updateNode(
      id,
      { archived_at: archived ? nowIso() : null },
      { ...meta, op: archived ? 'archive' : 'restore' },
    );
  }

  /**
   * Up to `limit` live nodes, newest first.
   *
   * On Firestore this was a cursor walk with a scan ceiling, because the
   * deleted/archived filters could only run in-app *after* the limit, so one
   * page could return fewer rows than asked for with no way to tell that from
   * an exhausted collection. A WHERE clause removes the whole problem.
   */
  async listNodes(
    params: { type?: string; includeArchived?: boolean; includeDeleted?: boolean; limit?: number } = {},
  ): Promise<NodeRecord[]> {
    let q = db
      .selectFrom('nodes')
      .select('data')
      .where('space', '=', this.space)
      .where('workspace_id', '=', this.workspaceId);
    if (params.type) q = q.where('type', '=', params.type);
    if (!params.includeDeleted) q = q.where('deleted_at', 'is', null);
    if (!params.includeArchived) q = q.where('archived_at', 'is', null);
    const rows = await q.orderBy('updated_at', 'desc').limit(params.limit ?? 500).execute();
    return rows.map((r) => r.data as NodeRecord);
  }

  /**
   * The live node carrying an external identity key, if any.
   *
   * `data->'identity_keys' @> '"key"'` is served by the GIN index on that path,
   * the direct replacement for Firestore's `array-contains`. Merged records
   * resolve to their survivor so a re-import updates the kept node rather than
   * resurrecting the one that was merged away.
   */
  async findByIdentityKey(key: string): Promise<NodeRecord | null> {
    const rows = await db
      .selectFrom('nodes')
      .select('data')
      .where('space', '=', this.space)
      .where('workspace_id', '=', this.workspaceId)
      .where(sql<boolean>`data -> 'identity_keys' @> ${JSON.stringify([key.toLowerCase()])}::jsonb`)
      .limit(5)
      .execute();
    for (const row of rows) {
      const node = row.data as NodeRecord;
      if (node.deleted_at) continue;
      if (node.merged_into) return this.getNode(node.merged_into);
      return node;
    }
    return null;
  }

  /** All live nodes (for the search index and CRM computations). */
  async allLiveNodes(): Promise<NodeRecord[]> {
    const rows = await db
      .selectFrom('nodes')
      .select('data')
      .where('space', '=', this.space)
      .where('workspace_id', '=', this.workspaceId)
      .where('deleted_at', 'is', null)
      .execute();
    return rows.map((r) => r.data as NodeRecord);
  }

  async trash(): Promise<NodeRecord[]> {
    const rows = await db
      .selectFrom('nodes')
      .select('data')
      .where('space', '=', this.space)
      .where('workspace_id', '=', this.workspaceId)
      .where('deleted_at', 'is not', null)
      .execute();
    return rows.map((r) => r.data as NodeRecord);
  }

  /** Nodes whose soft-delete predates `cutoff`, the retention sweep. */
  async nodesDeletedBefore(cutoff: string): Promise<NodeRecord[]> {
    const rows = await db
      .selectFrom('nodes')
      .select('data')
      .where('space', '=', this.space)
      .where('workspace_id', '=', this.workspaceId)
      .where('deleted_at', '<', cutoff)
      .execute();
    return rows.map((r) => r.data as NodeRecord);
  }

  // ── Edges ──────────────────────────────────────────────────────────────────

  async createEdge(input: unknown, meta: WriteMeta = {}, opts: { id?: string } = {}): Promise<EdgeRecord> {
    const parsed = validateEdgeCreate(input);
    if (!parsed.ok) throw new ValidationError('invalid edge', parsed.errors);
    return this.transaction(async (tx) => {
      if (opts.id) {
        const existing = await this.getEdge(opts.id, { includeDeleted: true }, tx);
        if (existing) return existing;
      }
      await this.assertEdgeEndpoints(tx, parsed.value);
      return this.stageEdge(tx, parsed.value, meta, opts);
    });
  }

  /**
   * Referential + type-matrix invariants for a new edge (SRS §4.4): both
   * endpoints must exist, be live, and be of node types the shared endpoint
   * matrix allows for this edge type. `pending` declares node ids being created
   * in this same transaction (id → node type).
   */
  async assertEdgeEndpoints(
    tx: Tx,
    value: Pick<EdgeCreateInput, 'type' | 'src' | 'dst'>,
    pending: ReadonlyMap<string, string> = new Map(),
  ): Promise<void> {
    const errors: Array<{ path: string; message: string }> = [];
    const wanted = ([['src', value.src], ['dst', value.dst]] as const).filter(([, id]) => !pending.has(id));
    const types = new Map<string, string>(pending);

    if (wanted.length) {
      const rows = await tx
        .selectFrom('nodes')
        .select(['id', 'type', 'deleted_at'])
        .where('space', '=', this.space)
        .where('workspace_id', '=', this.workspaceId)
        .where('id', 'in', wanted.map(([, id]) => id))
        .execute();
      const found = new Map(rows.map((r) => [r.id, r]));
      for (const [field, id] of wanted) {
        const row = found.get(id);
        if (!row || row.deleted_at) {
          errors.push({ path: field, message: `${field} node ${id} does not exist or is deleted` });
        } else {
          types.set(id, row.type);
        }
      }
    }

    if (errors.length === 0) {
      const allowed = edgeEndpointsAllowed(
        value.type as EdgeType,
        types.get(value.src) ?? 'other',
        types.get(value.dst) ?? 'other',
      );
      if (!allowed.ok) errors.push({ path: 'type', message: allowed.message });
    }
    if (errors.length) throw new ValidationError('invalid edge', errors);
  }

  /** Stage a new edge (record + revision). Callers own `assertEdgeEndpoints`. */
  async stageEdge(
    tx: Tx,
    value: EdgeCreateInput,
    meta: WriteMeta = {},
    opts: { id?: string } = {},
  ): Promise<EdgeRecord> {
    const id = opts.id ?? newId();
    const ts = nowIso();
    const record: EdgeRecord = {
      ...value,
      id,
      captured_at: ts,
      created_at: ts,
      updated_at: ts,
      archived_at: null,
      deleted_at: null,
      rev: 1,
    };
    await tx
      .insertInto('edges')
      .values({ space: this.space, workspace_id: this.workspaceId, id, data: this.clean(record) })
      .execute();
    await this.writeRevision(tx, 'edge', id, 1, meta.op ?? 'create', record, undefined, value.source, meta.actor);
    return record;
  }

  parseEdgeCreate(input: unknown): EdgeCreateInput {
    const parsed = validateEdgeCreate(input);
    if (!parsed.ok) throw new ValidationError('invalid edge', parsed.errors);
    return parsed.value;
  }

  parseNodeCreate(input: unknown): NodeCreateInput {
    const parsed = validateNodeCreate(input);
    if (!parsed.ok) throw new ValidationError('invalid node', parsed.errors);
    return parsed.value;
  }

  async getEdge(
    id: string,
    opts: { includeDeleted?: boolean } = {},
    conn: Db = db,
  ): Promise<EdgeRecord | null> {
    const row = await conn
      .selectFrom('edges')
      .select('data')
      .where('space', '=', this.space)
      .where('workspace_id', '=', this.workspaceId)
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) return null;
    const edge = row.data as EdgeRecord;
    if (edge.deleted_at && !opts.includeDeleted) return null;
    return edge;
  }

  async updateEdge(id: string, patch: Record<string, unknown>, meta: WriteMeta = {}): Promise<EdgeRecord> {
    return this.transaction(async (tx) => {
      const before = await this.getEdge(id, { includeDeleted: true }, tx);
      if (!before) throw new NotFoundError('edge');
      return this.stageEdgeUpdate(tx, before, patch, meta);
    });
  }

  /**
   * Stage an update to an edge read earlier in this transaction. Unlike
   * updateEdge, src/dst may be patched, merges rewire edges onto the survivor.
   */
  async stageEdgeUpdate(
    tx: Tx,
    before: EdgeRecord,
    patch: Record<string, unknown>,
    meta: WriteMeta = {},
  ): Promise<EdgeRecord> {
    const merged: EdgeRecord = {
      ...before,
      ...patch,
      id: before.id,
      type: before.type,
      created_at: before.created_at,
      updated_at: nowIso(),
      rev: before.rev + 1,
    };
    await tx
      .updateTable('edges')
      .set({ data: this.clean(merged) })
      .where('space', '=', this.space)
      .where('workspace_id', '=', this.workspaceId)
      .where('id', '=', before.id)
      .execute();
    const diff = shallowDiff(before as never, merged as never);
    await this.writeRevision(tx, 'edge', before.id, merged.rev, meta.op ?? 'update', merged, diff, meta.source ?? 'manual', meta.actor);
    return merged;
  }

  async softDeleteEdge(id: string, meta: WriteMeta = {}): Promise<EdgeRecord> {
    return this.updateEdge(id, { deleted_at: nowIso() }, { ...meta, op: 'delete' });
  }

  async restoreEdge(id: string, meta: WriteMeta = {}): Promise<EdgeRecord> {
    return this.updateEdge(id, { deleted_at: null }, { ...meta, op: 'restore' });
  }

  /**
   * Edges touching a node, in either direction. Two queries merged in memory on
   * Firestore (it has no OR); one indexed disjunction here.
   */
  async edgesForNode(nodeId: string, opts: { includeDeleted?: boolean } = {}, conn: Db = db): Promise<EdgeRecord[]> {
    let q = conn
      .selectFrom('edges')
      .select('data')
      .where('space', '=', this.space)
      .where('workspace_id', '=', this.workspaceId)
      .where((eb) => eb.or([eb('src', '=', nodeId), eb('dst', '=', nodeId)]));
    if (!opts.includeDeleted) q = q.where('deleted_at', 'is', null);
    const rows = await q.execute();
    return rows.map((r) => r.data as EdgeRecord);
  }

  /** Transaction-scoped variant of edgesForNode. */
  async edgesForNodeTx(tx: Tx, nodeId: string, opts: { includeDeleted?: boolean } = {}): Promise<EdgeRecord[]> {
    return this.edgesForNode(nodeId, opts, tx);
  }

  async allLiveEdges(): Promise<EdgeRecord[]> {
    const rows = await db
      .selectFrom('edges')
      .select('data')
      .where('space', '=', this.space)
      .where('workspace_id', '=', this.workspaceId)
      .where('deleted_at', 'is', null)
      .execute();
    return rows.map((r) => r.data as EdgeRecord);
  }

  async edgesDeletedBefore(cutoff: string): Promise<EdgeRecord[]> {
    const rows = await db
      .selectFrom('edges')
      .select('data')
      .where('space', '=', this.space)
      .where('workspace_id', '=', this.workspaceId)
      .where('deleted_at', '<', cutoff)
      .execute();
    return rows.map((r) => r.data as EdgeRecord);
  }

  /** Hard-delete edges by id, the retention sweep, past the soft-delete window. */
  async purgeEdges(ids: readonly string[]): Promise<number> {
    if (!ids.length) return 0;
    const res = await db
      .deleteFrom('edges')
      .where('space', '=', this.space)
      .where('workspace_id', '=', this.workspaceId)
      .where('id', 'in', [...ids])
      .executeTakeFirst();
    return Number(res.numDeletedRows ?? 0);
  }

  async purgeNodes(ids: readonly string[]): Promise<number> {
    if (!ids.length) return 0;
    const res = await db
      .deleteFrom('nodes')
      .where('space', '=', this.space)
      .where('workspace_id', '=', this.workspaceId)
      .where('id', 'in', [...ids])
      .executeTakeFirst();
    return Number(res.numDeletedRows ?? 0);
  }

  // ── Counts ─────────────────────────────────────────────────────────────────

  /** Live node/edge counts (FR-005: /status is polled every minute). */
  async liveCounts(): Promise<{ nodes: number; edges: number }> {
    const [nodes, edges] = await Promise.all([
      db.selectFrom('nodes').select(db.fn.countAll<number>().as('n'))
        .where('space', '=', this.space)
        .where('workspace_id', '=', this.workspaceId)
        .where('deleted_at', 'is', null).executeTakeFirstOrThrow(),
      db.selectFrom('edges').select(db.fn.countAll<number>().as('n'))
        .where('space', '=', this.space)
        .where('workspace_id', '=', this.workspaceId)
        .where('deleted_at', 'is', null).executeTakeFirstOrThrow(),
    ]);
    return { nodes: Number(nodes.n), edges: Number(edges.n) };
  }

  /**
   * Live node counts per type (FR-104). One grouped query, where Firestore
   * needed one aggregation round trip per type.
   */
  async liveCountsByType(types: readonly string[]): Promise<{ counts: Record<string, number>; total: number }> {
    const rows = await db
      .selectFrom('nodes')
      .select(['type', db.fn.countAll<number>().as('n')])
      .where('space', '=', this.space)
      .where('workspace_id', '=', this.workspaceId)
      .where('deleted_at', 'is', null)
      .groupBy('type')
      .execute();

    const wanted = new Set(types);
    const counts: Record<string, number> = {};
    let total = 0;
    for (const row of rows) {
      const n = Number(row.n);
      total += n;
      if (wanted.has(row.type) && n > 0) counts[row.type] = n;
    }
    return { counts, total };
  }

  // ── Productivity collections ───────────────────────────────────────────────
  //
  // These three tables are revision-guarded: every mutation writes the row and
  // a revisions snapshot in the same transaction. Generic docPut/docMerge/
  // docBulkPut refuse the table names so a caller cannot skip that pair.

  async createTimeEntry(input: unknown, meta: WriteMeta = {}): Promise<TimeEntryRecord> {
    const parsed = timeEntryWriteSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError('invalid time entry', zodIssues(parsed.error.issues));
    return this.transaction((tx) => this.stageTimeEntry(tx, parsed.data, meta));
  }

  async stageTimeEntry(tx: Tx, value: TimeEntryWrite, meta: WriteMeta = {}): Promise<TimeEntryRecord> {
    const id = value.id ?? newId();
    const ts = nowIso();
    const record: TimeEntryRecord = {
      ...value,
      id,
      rev: 1,
      updated_at: ts,
    };
    await tx
      .insertInto('time_entries')
      .values({ space: this.space, workspace_id: this.workspaceId, id, data: this.clean(record) })
      .execute();
    await this.writeRevision(tx, 'time_entry', id, 1, meta.op ?? 'create', record, undefined, meta.source, meta.actor);
    return record;
  }

  async getTimeEntry(
    id: string,
    opts: { includeDeleted?: boolean } = {},
    conn: Db = db,
  ): Promise<TimeEntryRecord | null> {
    const row = await conn
      .selectFrom('time_entries')
      .select('data')
      .where('space', '=', this.space)
      .where('workspace_id', '=', this.workspaceId)
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) return null;
    const entry = row.data as TimeEntryRecord;
    if (entry.deleted_at && !opts.includeDeleted) return null;
    return entry;
  }

  async listTimeEntries(params: { taskId?: string } = {}): Promise<TimeEntryRecord[]> {
    let q = db
      .selectFrom('time_entries')
      .select('data')
      .where('space', '=', this.space)
      .where('workspace_id', '=', this.workspaceId)
      .where('deleted_at', 'is', null);
    if (params.taskId) q = q.where('task_id', '=', params.taskId);
    const rows = await q.orderBy('started_at', 'desc').execute();
    return rows.map((r) => r.data as TimeEntryRecord);
  }

  async listTimeEntriesByTask(taskId: string): Promise<TimeEntryRecord[]> {
    return this.listTimeEntries({ taskId });
  }

  async updateTimeEntry(
    id: string,
    patch: TimeEntryPatch,
    meta: ProductivityWriteMeta = {},
  ): Promise<TimeEntryRecord> {
    const parsed = timeEntryPatchSchema.safeParse(patch);
    if (!parsed.success) throw new ValidationError('invalid time entry', zodIssues(parsed.error.issues));
    return this.transaction(async (tx) => {
      const before = await this.getTimeEntry(id, { includeDeleted: true }, tx);
      if (!before) throw new NotFoundError('time entry');
      this.assertExpectedRevision(before.rev, meta.expected_revision);
      const merged: TimeEntryRecord = {
        ...before,
        ...parsed.data,
        id: before.id,
        rev: before.rev + 1,
        updated_at: nowIso(),
      };
      await tx
        .updateTable('time_entries')
        .set({ data: this.clean(merged) })
        .where('space', '=', this.space)
        .where('workspace_id', '=', this.workspaceId)
        .where('id', '=', before.id)
        .execute();
      const diff = shallowDiff(before as never, merged as never);
      await this.writeRevision(
        tx,
        'time_entry',
        before.id,
        merged.rev,
        meta.op ?? 'update',
        merged,
        diff,
        meta.source ?? 'manual',
        meta.actor,
      );
      return merged;
    });
  }

  async createAutomationRule(input: unknown, meta: WriteMeta = {}): Promise<AutomationRuleRecord> {
    const parsed = automationRuleWriteSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError('invalid automation rule', zodIssues(parsed.error.issues));
    return this.transaction((tx) => this.stageAutomationRule(tx, parsed.data, meta));
  }

  async stageAutomationRule(
    tx: Tx,
    value: AutomationRuleWrite,
    meta: WriteMeta = {},
  ): Promise<AutomationRuleRecord> {
    const id = value.id ?? newId();
    const ts = nowIso();
    const record: AutomationRuleRecord = {
      ...value,
      id,
      rev: 1,
      updated_at: ts,
    };
    await tx
      .insertInto('automation_rules')
      .values({ space: this.space, workspace_id: this.workspaceId, id, data: this.clean(record) })
      .execute();
    await this.writeRevision(
      tx,
      'automation_rule',
      id,
      1,
      meta.op ?? 'create',
      record,
      undefined,
      meta.source,
      meta.actor,
    );
    return record;
  }

  async getAutomationRule(
    id: string,
    opts: { includeDeleted?: boolean } = {},
    conn: Db = db,
  ): Promise<AutomationRuleRecord | null> {
    const row = await conn
      .selectFrom('automation_rules')
      .select('data')
      .where('space', '=', this.space)
      .where('workspace_id', '=', this.workspaceId)
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) return null;
    const rule = row.data as AutomationRuleRecord;
    if (rule.deleted_at && !opts.includeDeleted) return null;
    return rule;
  }

  async listAutomationRules(): Promise<AutomationRuleRecord[]> {
    const rows = await db
      .selectFrom('automation_rules')
      .select('data')
      .where('space', '=', this.space)
      .where('workspace_id', '=', this.workspaceId)
      .where('deleted_at', 'is', null)
      .orderBy('updated_at', 'desc')
      .execute();
    return rows.map((r) => r.data as AutomationRuleRecord);
  }

  async updateAutomationRule(
    id: string,
    patch: AutomationRulePatch,
    meta: ProductivityWriteMeta = {},
  ): Promise<AutomationRuleRecord> {
    return this.transaction(async (tx) => {
      const before = await this.getAutomationRule(id, { includeDeleted: true }, tx);
      if (!before) throw new NotFoundError('automation rule');
      return this.stageAutomationRuleUpdate(tx, before, patch, meta);
    });
  }

  async stageAutomationRuleUpdate(
    tx: Tx,
    before: AutomationRuleRecord,
    patch: AutomationRulePatch,
    meta: ProductivityWriteMeta = {},
  ): Promise<AutomationRuleRecord> {
    const parsed = automationRulePatchSchema.safeParse(patch);
    if (!parsed.success) throw new ValidationError('invalid automation rule', zodIssues(parsed.error.issues));
    this.assertExpectedRevision(before.rev, meta.expected_revision);
    const merged: AutomationRuleRecord = {
      ...before,
      ...parsed.data,
      id: before.id,
      rev: before.rev + 1,
      updated_at: nowIso(),
    };
    await tx
      .updateTable('automation_rules')
      .set({ data: this.clean(merged) })
      .where('space', '=', this.space)
      .where('workspace_id', '=', this.workspaceId)
      .where('id', '=', before.id)
      .execute();
    const diff = shallowDiff(before as never, merged as never);
    await this.writeRevision(
      tx,
      'automation_rule',
      before.id,
      merged.rev,
      meta.op ?? 'update',
      merged,
      diff,
      meta.source ?? 'manual',
      meta.actor,
    );
    return merged;
  }

  async putProductivityReceipt(input: unknown, meta: WriteMeta = {}): Promise<ProductivityReceiptRecord> {
    const parsed = productivityReceiptWriteSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError('invalid productivity receipt', zodIssues(parsed.error.issues));
    return this.transaction((tx) => this.stageProductivityReceipt(tx, parsed.data, meta));
  }

  async stageProductivityReceipt(
    tx: Tx,
    value: ProductivityReceiptWrite,
    meta: WriteMeta = {},
  ): Promise<ProductivityReceiptRecord> {
    const id = value.id ?? newId();
    const ts = nowIso();
    const record: ProductivityReceiptRecord = {
      ...value,
      id,
      result: value.result ?? {},
      rev: 1,
      created_at: ts,
    };
    await tx
      .insertInto('productivity_receipts')
      .values({ space: this.space, workspace_id: this.workspaceId, id, data: this.clean(record) })
      .execute();
    await this.writeRevision(
      tx,
      'productivity_receipt',
      id,
      1,
      meta.op ?? 'create',
      record,
      undefined,
      meta.source,
      meta.actor,
    );
    return record;
  }

  async getProductivityReceiptByOperationId(
    operationId: string,
    conn: Db = db,
    opts: { forUpdate?: boolean } = {},
  ): Promise<ProductivityReceiptRecord | null> {
    let q = conn
      .selectFrom('productivity_receipts')
      .select('data')
      .where('space', '=', this.space)
      .where('workspace_id', '=', this.workspaceId)
      .where('operation_id', '=', operationId);
    if (opts.forUpdate) q = q.forUpdate();
    const row = await q.executeTakeFirst();
    return row ? (row.data as ProductivityReceiptRecord) : null;
  }

  isProductivityTemplate(row: unknown): row is ProductivityTemplateRecord {
    return (
      typeof row === 'object' &&
      row !== null &&
      ((row as ProductivityTemplateRecord).kind === 'project' ||
        (row as ProductivityTemplateRecord).kind === 'item')
    );
  }

  async getProductivityTemplate(
    id: string,
    conn: Db = db,
    opts: { forUpdate?: boolean } = {},
  ): Promise<ProductivityTemplateRecord | null> {
    let q = conn
      .selectFrom('templates')
      .select('data')
      .where('space', '=', this.space)
      .where('workspace_id', '=', this.workspaceId)
      .where('id', '=', id);
    if (opts.forUpdate) q = q.forUpdate();
    const row = await q.executeTakeFirst();
    if (!row || !this.isProductivityTemplate(row.data)) return null;
    return row.data;
  }

  async listProductivityTemplates(): Promise<ProductivityTemplateRecord[]> {
    const rows = await this.docList<Record<string, unknown>>('templates');
    return rows.filter((row): row is ProductivityTemplateRecord => this.isProductivityTemplate(row));
  }

  async stageProductivityTemplate(
    tx: Tx,
    value: ProductivityTemplateWrite,
    meta: ProductivityWriteMeta = {},
  ): Promise<ProductivityTemplateRecord> {
    const parsed = productivityTemplateWriteSchema.safeParse(value);
    if (!parsed.success) throw new ValidationError('invalid template', zodIssues(parsed.error.issues));
    const id = parsed.data.id ?? newId();
    const existing = await this.getProductivityTemplate(id, tx, { forUpdate: true });
    if (existing) {
      this.assertExpectedRevision(existing.rev, meta.expected_revision);
      const merged: ProductivityTemplateRecord = {
        ...existing,
        ...parsed.data,
        id: existing.id,
        rev: existing.rev + 1,
        created_at: existing.created_at,
        updated_at: nowIso(),
      };
      await tx
        .updateTable('templates')
        .set({ data: this.clean(merged) })
        .where('space', '=', this.space)
        .where('workspace_id', '=', this.workspaceId)
        .where('id', '=', existing.id)
        .execute();
      await this.writeRevision(
        tx,
        'template',
        existing.id,
        merged.rev,
        meta.op ?? 'update',
        merged,
        shallowDiff(existing as never, merged as never),
        meta.source ?? 'manual',
        meta.actor,
      );
      return merged;
    }
    const ts = nowIso();
    const record: ProductivityTemplateRecord = {
      ...parsed.data,
      id,
      rev: 1,
      created_at: ts,
      updated_at: ts,
    };
    await tx
      .insertInto('templates')
      .values({ space: this.space, workspace_id: this.workspaceId, id, data: this.clean(record) })
      .execute();
    await this.writeRevision(tx, 'template', id, 1, meta.op ?? 'create', record, undefined, meta.source, meta.actor);
    return record;
  }

  assertExpectedRevision(stored: number, expected?: number): void {
    if (expected !== undefined && expected !== stored) {
      throw new RevisionConflictError(`expected revision ${expected}, found ${stored}`);
    }
  }

  // ── Revisions ──────────────────────────────────────────────────────────────

  private async writeRevision(
    tx: Tx,
    subjectKind: RevisionSubjectKind,
    subjectId: string,
    rev: number,
    op: RevisionOp,
    snapshot: unknown,
    diff: unknown,
    source: string | undefined,
    actor: string | undefined,
  ): Promise<void> {
    const id = newId();
    await tx
      .insertInto('revisions')
      .values({
        space: this.space,
        workspace_id: this.workspaceId,
        id,
        data: this.clean({
          id,
          subject_kind: subjectKind,
          subject_id: subjectId,
          rev,
          op,
          at: nowIso(),
          actor: actor ?? 'owner',
          source: source ?? 'manual',
          snapshot,
          diff,
        }),
      })
      .execute();
  }

  /**
   * Stage a revision for a record the repository does not own the write path
   * for (atoms, targets, resumes). Every durable mutation gets audit history (FR-002).
   */
  async stageRevision(
    tx: Tx,
    args: {
      kind: RevisionSubjectKind;
      id: string;
      rev: number;
      op: RevisionOp;
      snapshot: unknown;
      diff?: unknown;
      source?: string;
      actor?: string;
    },
  ): Promise<void> {
    await this.writeRevision(tx, args.kind, args.id, args.rev, args.op, args.snapshot, args.diff, args.source, args.actor);
  }

  /**
   * The ledger: the newest revisions across every record, one page at a time
   * (SRS FR-PROV-002). `before` pages by the ISO timestamp the previous page
   * ended on, with id as the tiebreak so a page boundary cannot drop or
   * repeat an entry written in the same millisecond.
   */
  async ledger(limit: number, before?: string): Promise<Array<Record<string, unknown>>> {
    let q = db
      .selectFrom('revisions')
      .select('data')
      .where('space', '=', this.space)
      .where('workspace_id', '=', this.workspaceId);
    if (before) q = q.where(sql<boolean>`data->>'at' < ${before}`);
    const rows = await q
      .orderBy(sql`data->>'at'`, 'desc')
      .orderBy('id', 'desc')
      .limit(limit)
      .execute();
    return rows.map((r) => r.data as Record<string, unknown>);
  }

  async revisionsFor(subjectId: string): Promise<Array<Record<string, unknown>>> {
    const rows = await db
      .selectFrom('revisions')
      .select('data')
      .where('space', '=', this.space)
      .where('workspace_id', '=', this.workspaceId)
      .where('subject_id', '=', subjectId)
      .orderBy('rev', 'asc')
      .execute();
    return rows.map((r) => r.data as Record<string, unknown>);
  }

  /**
   * The revision trails of many subjects at once, keyed by subject id.
   *
   * The batched form exists because provenance is asked for a whole exhibit
   * list rather than one record: a dossier appendix resolves the trail behind
   * every citation it prints, and forty citations through `revisionsFor` is
   * forty round trips to compile one document.
   *
   * Every id asked for is present in the result, holding an empty array when
   * nothing was retained for it. That is the difference between "this record
   * has no revisions" and "nobody asked about this record", and a caller
   * reading a missing key as the former would print an empty trail for a
   * subject it simply forgot to include.
   */
  async revisionsForMany(
    subjectIds: readonly string[],
  ): Promise<Map<string, Array<Record<string, unknown>>>> {
    const trails = new Map<string, Array<Record<string, unknown>>>();
    for (const id of subjectIds) trails.set(id, []);
    // `IN ()` is a syntax error in Postgres, so an empty ask never becomes a query.
    if (trails.size === 0) return trails;
    const rows = await db
      .selectFrom('revisions')
      .select(['subject_id', 'data'])
      .where('space', '=', this.space)
      .where('workspace_id', '=', this.workspaceId)
      .where('subject_id', 'in', [...trails.keys()])
      .orderBy('rev', 'asc')
      .execute();
    for (const row of rows) {
      // `subject_id` is a generated column and so nullable to the type layer,
      // though the WHERE above already excludes null.
      if (row.subject_id) trails.get(row.subject_id)?.push(row.data as Record<string, unknown>);
    }
    return trails;
  }

  /**
   * Revisions whose `at` falls in `[from, to]`, served by
   * `revisions_workspace_at` / `revisions_workspace_kind_at`.
   */
  async revisionsInWindow(params: {
    from: string;
    to: string;
    subjectKinds?: readonly RevisionSubjectKind[];
  }): Promise<Array<Record<string, unknown>>> {
    let q = db
      .selectFrom('revisions')
      .select('data')
      .where('space', '=', this.space)
      .where('workspace_id', '=', this.workspaceId)
      .where('at', '>=', params.from)
      .where('at', '<=', params.to);
    if (params.subjectKinds && params.subjectKinds.length > 0) {
      q = q.where('subject_kind', 'in', [...params.subjectKinds]);
    }
    const rows = await q.orderBy('at', 'asc').orderBy('rev', 'asc').execute();
    return rows.map((r) => r.data as Record<string, unknown>);
  }

  /** Rev-1 / create rows for subjects whose create instant may sit before the window. */
  async createRevisionsFor(subjectIds: readonly string[]): Promise<Array<Record<string, unknown>>> {
    if (subjectIds.length === 0) return [];
    const rows = await db
      .selectFrom('revisions')
      .select('data')
      .where('space', '=', this.space)
      .where('workspace_id', '=', this.workspaceId)
      .where('subject_id', 'in', [...subjectIds])
      .where('rev', '=', 1)
      .execute();
    return rows.map((r) => r.data as Record<string, unknown>);
  }

  // ── Transactions and invalidation ──────────────────────────────────────────

  async transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const result = await db.transaction().execute(fn);
    // Local read-model caches compare against this instead of guessing with a
    // timer, so a value written a moment ago is visible on the next read.
    bumpWriteGeneration();
    await this.publishSearchInvalidation().catch((error: unknown) => {
      console.error('[search] committed mutation but failed to publish invalidation:', error);
    });
    return result;
  }

  /**
   * Bump the cross-process search generation. `FieldValue.increment` becomes an
   * ordinary arithmetic UPDATE, which is atomic without any special support.
   */
  async publishSearchInvalidation(): Promise<void> {
    await db
      .insertInto('meta')
      .values({
        space: this.space,
        workspace_id: this.workspaceId,
        id: 'search_generation',
        data: { generation: 1, updated_at: nowIso() },
      })
      .onConflict((oc) =>
        oc.columns(['workspace_id', 'id']).doUpdateSet({
          data: sql`jsonb_build_object(
            'generation', COALESCE((meta.data->>'generation')::bigint, 0) + 1,
            'updated_at', ${nowIso()}::text
          )`,
        }),
      )
      .execute();
  }

  // ── Generic document access ────────────────────────────────────────────────
  //
  // The collections that are genuinely key-value (tags, saved views, habit
  // checks, dedup state, ...). These exist so services stop reaching around the
  // repository for them; the graph itself deliberately does not go through here.

  async docGet<T = Record<string, unknown>>(table: TableName, id: string, conn: Db = db): Promise<T | null> {
    const row = await conn
      .selectFrom(table)
      .select('data')
      .where('space', '=', this.space)
      .where('workspace_id', '=', this.workspaceId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? (row.data as T) : null;
  }

  async docPut(
    table: TableName,
    id: string,
    data: Record<string, unknown>,
    extra: Record<string, string> = {},
    conn: Db = db,
  ): Promise<void> {
    assertGenericDocWriteAllowed(table);
    await conn
      .insertInto(table)
      .values({ space: this.space, workspace_id: this.workspaceId, id, data: this.clean(data), ...extra } as never)
      .onConflict((oc) => oc.columns(['workspace_id', 'id']).doUpdateSet({ data: this.clean(data) } as never))
      .execute();
  }

  /**
   * Shallow merge into the stored document, creating it if absent.
   *
   * The create half is not optional. Every call site was written against
   * Firestore's `set(doc, {merge: true})`, which upserts, and a plain UPDATE
   * against a missing row succeeds while doing nothing, so the failure is
   * silent and arrives later somewhere else. It did: the duplicate scanner
   * claimed its lease this way, the `meta/dedup_scan` document was never
   * created, and the scan then died on a foreign key when it wrote its results.
   */
  async docMerge(
    table: TableName,
    id: string,
    patch: Record<string, unknown>,
    conn: Db = db,
  ): Promise<void> {
    assertGenericDocWriteAllowed(table);
    const clean = JSON.stringify(stripUndefined(patch));
    // Update-then-insert, not INSERT ... ON CONFLICT. Postgres validates the
    // proposed row's NOT NULL constraints *before* it resolves the conflict, so
    // an upsert against a child table (`import_rows`, `meta_runs`) fails on its
    // missing parent-id column even when the row is already there and only the
    // UPDATE branch would have run. Writing it as a CTE keeps both halves in one
    // statement, so nothing can slip between them.
    //
    // A missing row on a child table still fails loudly, on the NOT NULL, which
    // is right: there is no correct way to conjure an orphan.
    await sql`
      WITH updated AS (
        UPDATE ${sql.raw(table)}
           SET data = ${sql.raw(table)}.data || ${clean}::jsonb
         WHERE space = ${this.space} AND workspace_id = ${this.workspaceId} AND id = ${id}
        RETURNING 1
      )
      INSERT INTO ${sql.raw(table)} (space, workspace_id, id, data)
      SELECT ${this.space}, ${this.workspaceId}, ${id}, ${clean}::jsonb
       WHERE NOT EXISTS (SELECT 1 FROM updated)
    `.execute(conn);
  }

  async docDelete(table: TableName, id: string, conn: Db = db): Promise<void> {
    await conn
      .deleteFrom(table)
      .where('space', '=', this.space)
      .where('workspace_id', '=', this.workspaceId)
      .where('id', '=', id)
      .execute();
  }

  async docList<T = Record<string, unknown>>(table: TableName, conn: Db = db): Promise<T[]> {
    const rows = await conn
      .selectFrom(table)
      .select('data')
      .where('space', '=', this.space)
      .where('workspace_id', '=', this.workspaceId)
      .execute();
    return rows.map((r) => r.data as T);
  }

  async docQuery<T = Record<string, unknown>>(table: TableName, filters: DocFilter, conn: Db = db): Promise<T[]> {
    let q = conn
      .selectFrom(table)
      .select('data')
      .where('space', '=', this.space)
      .where('workspace_id', '=', this.workspaceId);
    for (const [col, value] of Object.entries(filters)) {
      q = value === null ? q.where(col as never, 'is', null) : q.where(col as never, '=', value as never);
    }
    const rows = await q.execute();
    return rows.map((r) => r.data as T);
  }

  async docCount(table: TableName, filters: DocFilter = {}): Promise<number> {
    let q = db
      .selectFrom(table)
      .select(db.fn.countAll<number>().as('n'))
      .where('space', '=', this.space)
      .where('workspace_id', '=', this.workspaceId);
    for (const [col, value] of Object.entries(filters)) {
      q = value === null ? q.where(col as never, 'is', null) : q.where(col as never, '=', value as never);
    }
    const row = await q.executeTakeFirstOrThrow();
    return Number(row.n);
  }

  /** Bulk upsert, restore and imports write thousands of rows at a time. */
  async docBulkPut(
    table: TableName,
    rows: ReadonlyArray<{ id: string; data: Record<string, unknown>; extra?: Record<string, string> }>,
    conn: Db = db,
  ): Promise<void> {
    assertGenericDocWriteAllowed(table);
    if (!rows.length) return;
    await this.writeDocumentRows(table, rows, conn);
  }

  /**
   * Restore-only bulk write. Revisions arrive as their own bundle file, so
   * this path must not synthesize new ones and must accept the guarded tables.
   */
  async restoreDocuments(
    table: TableName,
    rows: ReadonlyArray<{ id: string; data: Record<string, unknown>; extra?: Record<string, string> }>,
    conn: Db = db,
  ): Promise<void> {
    if (!rows.length) return;
    await this.writeDocumentRows(table, rows, conn);
  }

  private async writeDocumentRows(
    table: TableName,
    rows: ReadonlyArray<{ id: string; data: Record<string, unknown>; extra?: Record<string, string> }>,
    conn: Db = db,
  ): Promise<void> {
    // Chunked only to keep the parameter count under Postgres' 65535 limit.
    // not the 500-document ceiling Firestore batches had.
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await conn
        .insertInto(table)
        .values(
          rows.slice(i, i + CHUNK).map((r) => ({
            space: this.space,
            workspace_id: this.workspaceId,
            id: r.id,
            data: this.clean(r.data),
            ...r.extra,
          })) as never,
        )
        .onConflict((oc) => oc.columns(['workspace_id', 'id']).doUpdateSet({ data: sql`excluded.data` } as never))
        .execute();
    }
  }

  /** Remove every row of a table in the active space (restore --force). */
  async docTruncate(table: TableName): Promise<void> {
    await db
      .deleteFrom(table)
      .where('space', '=', this.space)
      .where('workspace_id', '=', this.workspaceId)
      .execute();
  }

  /**
   * Delete rows whose `column` matches any of `values`, returning the count.
   *
   * This is what the retention sweep is made of. On Firestore it needed two
   * layers of chunking: `where in` accepted at most 30 values, and a batch at
   * most 500 deletes, so purging one node fanned out into dozens of round
   * trips. `= ANY($1)` takes the whole list.
   */
  async docDeleteWhereIn(table: TableName, column: string, values: readonly string[]): Promise<number> {
    if (!values.length) return 0;
    const res = await db
      .deleteFrom(table)
      .where('space', '=', this.space)
      .where('workspace_id', '=', this.workspaceId)
      .where(column as never, 'in', [...values] as never)
      .executeTakeFirst();
    return Number(res.numDeletedRows ?? 0);
  }

  /** Ids of rows whose `column` matches any of `values`, the dry-run counterpart. */
  async docIdsWhereIn(table: TableName, column: string, values: readonly string[]): Promise<string[]> {
    if (!values.length) return [];
    const rows = await db
      .selectFrom(table)
      .select('id')
      .where('space', '=', this.space)
      .where('workspace_id', '=', this.workspaceId)
      .where(column as never, 'in', [...values] as never)
      .execute();
    return rows.map((r) => r.id);
  }

  /** Ids of rows in `table` whose `column` is older than `cutoff`. */
  async docIdsOlderThan(table: TableName, column: string, cutoff: string): Promise<string[]> {
    const rows = await db
      .selectFrom(table)
      .select('id')
      .where('space', '=', this.space)
      .where('workspace_id', '=', this.workspaceId)
      .where(column as never, '<', cutoff as never)
      .execute();
    return rows.map((r) => r.id);
  }

  /**
   * One page of documents ordered by id, for streaming exports.
   *
   * Keyset pagination (`id > last`) rather than OFFSET: the export walks the
   * whole table, and OFFSET re-scans everything before the cursor on each page,
   * which turns a full export into quadratic work.
   */
  async docPage<T = Record<string, unknown>>(
    table: TableName,
    opts: { after?: string; limit?: number; parentColumn?: string; parentId?: string } = {},
  ): Promise<Array<{ id: string; data: T; parentId?: string }>> {
    let q = db
      .selectFrom(table)
      .select(['id', 'data'])
      .where('space', '=', this.space)
      .where('workspace_id', '=', this.workspaceId)
      .orderBy('id', 'asc')
      .limit(opts.limit ?? 500);
    if (opts.after) q = q.where('id', '>', opts.after);
    if (opts.parentColumn && opts.parentId) {
      q = q.where(opts.parentColumn as never, '=', opts.parentId as never);
    }
    const rows = await q.execute();
    return rows.map((r) => ({ id: r.id, data: r.data as T }));
  }

  /** Delete rows by id, returning how many went. */
  async docDeleteMany(table: TableName, ids: readonly string[]): Promise<number> {
    if (!ids.length) return 0;
    const res = await db
      .deleteFrom(table)
      .where('space', '=', this.space)
      .where('workspace_id', '=', this.workspaceId)
      .where('id', 'in', [...ids])
      .executeTakeFirst();
    return Number(res.numDeletedRows ?? 0);
  }

  /** `undefined` is not a JSON value; drop those keys rather than store nulls. */
  private clean(record: unknown): Record<string, unknown> {
    return stripUndefined(record as Record<string, unknown>);
  }
}

export const repository = new Repository();
