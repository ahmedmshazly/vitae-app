/**
 * Retention enforcement (FR-006). The Trash screen promises "restored in one
 * click for 30 days, then purged", this is the code that makes that true.
 *
 * Purging is a hard delete of the soft-deleted record and everything that only
 * exists to describe it (its revisions, reminders, taggings, attachments, and,
 * for nodes, the edges that touched them). Audit history for records that still
 * exist is untouched; the merge ledger keeps its pre-images so undo still works
 * inside its own 30-day window.
 *
 * Idempotent: running it twice purges nothing extra, so it is safe to schedule
 * (interval on boot, `pnpm --filter @vitae/api purge`, or an external cron).
 */
import { repository } from '../db/repository.js';
import type { TableName } from '../db/schema.js';
import { storage } from './storage/cloudinary.js';

export const TRASH_RETENTION_DAYS = 30;

export interface PurgeSummary {
  cutoff: string;
  nodes: number;
  edges: number;
  revisions: number;
  dependents: number;
  atoms: number;
  rawImports: number;
  blobs: number;
  blobFailures: number;
}

function cutoffIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/**
 * Dependent records of the ids being purged: (table, column) pairs to sweep.
 *
 * Firestore needed two layers of chunking here: `where in` took at most 30
 * values and a batch at most 500 deletes, so purging a handful of nodes fanned
 * out into dozens of round trips. Each of these is now one statement.
 */
const DEPENDENTS_OF_SUBJECT = [
  ['reminders', 'subject_id'],
  ['taggings', 'subject_id'],
] as const;

const DEPENDENTS_OF_NODE = [
  ['habit_checks', 'habit_id'],
  ['merges', 'keep_id'],
  ['merges', 'drop_id'],
  ['dedup_dismissals', 'a'],
  ['dedup_dismissals', 'b'],
] as const;

const DEPENDENTS_OF_ATOM = [
  ['atom_variants', 'atom_id'],
  ['atom_skills', 'atom_id'],
] as const;

/**
 * Hard-delete everything soft-deleted longer ago than the retention window.
 * `dryRun` reports what would go without deleting it.
 */
export async function purgeExpiredTrash(
  opts: { retentionDays?: number; dryRun?: boolean } = {},
): Promise<PurgeSummary> {
  const days = opts.retentionDays ?? TRASH_RETENTION_DAYS;
  const cutoff = cutoffIso(days);

  const [expiredNodes, expiredEdges, expiredAtoms, abandonedImports, pendingBlobGc] = await Promise.all([
    repository.nodesDeletedBefore(cutoff),
    repository.edgesDeletedBefore(cutoff),
    repository.docIdsOlderThan('atoms', 'deleted_at', cutoff),
    repository.docQuery<{ id: string; created_at?: string }>('imports', { status: 'staged' }),
    repository.docQuery<{ id: string; storage_key?: string; mime?: string }>('attachments', { gc_pending: true }),
  ]);

  const nodeIds = expiredNodes.map((n) => n.id);
  const edgeIds = new Set(expiredEdges.map((e) => e.id));

  // Edges attached to a purged node go with it, they can never be valid again.
  for (const nodeId of nodeIds) {
    for (const edge of await repository.edgesForNode(nodeId, { includeDeleted: true })) {
      edgeIds.add(edge.id);
    }
  }

  // Atoms owned by a purged node go too, on top of the ones already in trash.
  const atomIds = [
    ...new Set([...expiredAtoms, ...(await repository.docIdsWhereIn('atoms', 'owner_node', nodeIds))]),
  ];
  const subjectIds = [...nodeIds, ...edgeIds, ...atomIds];

  const staleImportIds = abandonedImports
    .filter((row) => String(row.created_at ?? '') < cutoff)
    .map((row) => row.id);

  // Collect the dependent ids up front so a dry run can report them honestly.
  const dependents: Array<{ table: TableName; ids: string[] }> = [];
  for (const [table, column] of DEPENDENTS_OF_SUBJECT) {
    dependents.push({ table, ids: await repository.docIdsWhereIn(table, column, subjectIds) });
  }
  for (const [table, column] of DEPENDENTS_OF_NODE) {
    dependents.push({ table, ids: await repository.docIdsWhereIn(table, column, nodeIds) });
  }
  for (const [table, column] of DEPENDENTS_OF_ATOM) {
    dependents.push({ table, ids: await repository.docIdsWhereIn(table, column, atomIds) });
  }

  const revisionIds = await repository.docIdsWhereIn('revisions', 'subject_id', subjectIds);
  const subjectAttachments = await repository.docIdsWhereIn('attachments', 'subject_id', subjectIds);
  const attachmentIds = [...new Set([...subjectAttachments, ...pendingBlobGc.map((a) => a.id)])];
  const dependentCount =
    dependents.reduce((n, d) => n + d.ids.length, 0) + attachmentIds.length + atomIds.length;

  const summary: PurgeSummary = {
    cutoff,
    nodes: nodeIds.length,
    edges: edgeIds.size,
    revisions: revisionIds.length,
    dependents: dependentCount,
    atoms: atomIds.length,
    rawImports: staleImportIds.length,
    blobs: 0,
    blobFailures: 0,
  };
  if (opts.dryRun) return summary;

  // External bytes first. Failed deletes retain their metadata so the next run
  // retries; metadata is therefore the durable GC outbox.
  const doomed = new Set(attachmentIds);
  const failedAttachments = new Set<string>();
  for (const id of attachmentIds) {
    const row = await repository.docGet<{ storage_key?: string; mime?: string }>('attachments', id);
    if (!row?.storage_key) continue;
    // A blob referenced by an attachment that is NOT being purged must survive.
    const sharers = await repository.docQuery<{ id: string }>('attachments', {
      storage_key: row.storage_key,
    });
    if (sharers.some((other) => other.id !== id && !doomed.has(other.id))) continue;
    try {
      await storage.delete(row.storage_key, row.mime);
      summary.blobs += 1;
    } catch (error) {
      summary.blobFailures += 1;
      failedAttachments.add(id);
      await repository.docMerge('attachments', id, {
        gc_pending: true,
        gc_last_attempt_at: new Date().toISOString(),
        gc_error: String(error),
      });
    }
  }

  // Dependents first: a crash mid-purge must never leave a live record whose
  // history was already deleted.
  await repository.docDeleteMany('revisions', revisionIds);
  for (const { table, ids } of dependents) await repository.docDeleteMany(table, ids);
  await repository.docDeleteMany('attachments', attachmentIds.filter((id) => !failedAttachments.has(id)));
  await repository.docDeleteMany('atoms', atomIds);
  await repository.purgeEdges([...edgeIds]);
  await repository.purgeNodes(nodeIds);
  // ON DELETE CASCADE removes import_rows and import_raw_chunks with the parent,
  // so recursiveDelete has no equivalent to write here.
  await repository.docDeleteMany('imports', staleImportIds);
  if (summary.nodes || summary.edges || summary.atoms) await repository.publishSearchInvalidation();

  return summary;
}
