/**
 * Identity-preserving restore of an export bundle (SRS G4, the other half of
 * the anti-lock-in guarantee; see services/export.ts).
 *
 * Unlike replaying `POST /nodes`, this writes every document back under its
 * original document ID, so edges, revisions, atoms, and every cross-reference
 * stay valid. It verifies the manifest checksums before writing and refuses to
 * write into a non-empty database unless explicitly forced.
 */
import { createHash } from 'node:crypto';
import { repository } from '../db/repository.js';
import { BUNDLE_COLLECTIONS, BUNDLE_SUBCOLLECTIONS, type ExportManifest } from './export.js';
import { storage } from './storage/cloudinary.js';

export interface RestoreSummary {
  collections: Record<string, number>;
  total: number;
}

export class RestoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RestoreError';
  }
}

const BATCH_SIZE = 400;

type BundleFile = string | Buffer;

function asText(content: BundleFile): string {
  return Buffer.isBuffer(content) ? content.toString('utf8') : content;
}

function parseJsonl(content: BundleFile): Array<Record<string, unknown>> {
  return asText(content)
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

/**
 * Restore a bundle (file name → content) into the current data space.
 * The bundle must contain `manifest.json`; JSONL checksums are verified
 * against it before anything is written.
 */
export async function restoreBundle(
  files: Record<string, BundleFile>,
  opts: { force?: boolean } = {},
): Promise<RestoreSummary> {
  const manifestRaw = files['manifest.json'];
  if (!manifestRaw) throw new RestoreError('bundle has no manifest.json');
  const manifest = JSON.parse(asText(manifestRaw)) as ExportManifest;
  const major = String(manifest.schema_version ?? '').split('.')[0];
  if (major !== '3') {
    throw new RestoreError(
      `unsupported bundle schema_version "${manifest.schema_version}", this restore understands 3.x. ` +
        'Older bundles do not guarantee complete subcollection/blob recovery; re-export from a running instance.',
    );
  }
  if (manifest.includes_sensitive !== true) {
    throw new RestoreError('share-safe exports are intentionally incomplete; restore requires a full sensitive backup');
  }

  const required = [
    ...BUNDLE_COLLECTIONS.filter((spec) => !spec.optional).map((spec) => spec.file),
    ...BUNDLE_SUBCOLLECTIONS.map((spec) => spec.file),
  ];
  for (const name of required) {
    if (files[name] === undefined) throw new RestoreError(`schema v3 bundle is missing required file ${name}`);
    if (!manifest.checksums?.[name]) throw new RestoreError(`manifest is missing checksum for ${name}`);
  }
  for (const [name, expected] of Object.entries(manifest.checksums ?? {})) {
    const content = files[name];
    if (content === undefined) throw new RestoreError(`bundle is missing ${name} listed in the manifest`);
    const actual = createHash('sha256').update(content).digest('hex');
    if (actual !== expected) throw new RestoreError(`checksum mismatch for ${name}, bundle is corrupt`);
  }
  for (const name of required) {
    const key = name.replace(/\.jsonl$/, '');
    const actual = parseJsonl(files[name]!).length;
    if (manifest.counts?.[key] !== actual) {
      throw new RestoreError(`${name}: manifest count ${manifest.counts?.[key] ?? 'missing'} does not match ${actual}`);
    }
  }

  // Optional collections are excluded from `required` so an older bundle still
  // restores, but they must still be parsed when present, or the force path
  // below asks for ids that were never read.
  const parsed = [
    ...BUNDLE_COLLECTIONS.map((spec) => spec.file),
    ...BUNDLE_SUBCOLLECTIONS.map((spec) => spec.file),
  ].filter((name) => files[name] !== undefined);
  const rows = Object.fromEntries(parsed.map((name) => [name, parseJsonl(files[name]!)]));
  const ids = (name: string): Set<string> =>
    new Set((rows[name] ?? []).map((row) => String(row._doc_id ?? row.id ?? '')));
  const nodeIds = ids('nodes.jsonl');
  const edgeIds = ids('edges.jsonl');
  const atomIds = ids('atoms.jsonl');
  const targetIds = ids('targets.jsonl');
  const tagIds = ids('tags.jsonl');
  const importIds = ids('imports.jsonl');
  const resumeIds = ids('resumes.jsonl');
  const letterIds = ids('letters.jsonl');
  const requireRef = (file: string, row: Record<string, unknown>, field: string, allowed: Set<string>): void => {
    const value = row[field];
    if (typeof value === 'string' && value && !allowed.has(value)) {
      throw new RestoreError(`${file}: ${field} references missing document ${value}`);
    }
  };
  const idsForSubjectKind = (kind: unknown): Set<string> => {
    if (kind === 'edge') return edgeIds;
    if (kind === 'atom') return atomIds;
    if (kind === 'resume') return resumeIds;
    if (kind === 'letter') return letterIds;
    return nodeIds;
  };
  for (const row of rows['edges.jsonl']!) {
    requireRef('edges.jsonl', row, 'src', nodeIds);
    requireRef('edges.jsonl', row, 'dst', nodeIds);
  }
  for (const row of rows['atoms.jsonl']!) requireRef('atoms.jsonl', row, 'owner_node', nodeIds);
  for (const row of rows['atom_variants.jsonl']!) requireRef('atom_variants.jsonl', row, 'atom_id', atomIds);
  for (const row of rows['atom_skills.jsonl']!) {
    requireRef('atom_skills.jsonl', row, 'atom_id', atomIds);
    requireRef('atom_skills.jsonl', row, 'skill_id', nodeIds);
  }
  for (const row of rows['taggings.jsonl']!) {
    requireRef('taggings.jsonl', row, 'tag_id', tagIds);
    requireRef('taggings.jsonl', row, 'subject_id', idsForSubjectKind(row.subject_kind));
  }
  for (const row of rows['reminders.jsonl']!) {
    requireRef('reminders.jsonl', row, 'subject_id', idsForSubjectKind(row.subject_kind));
  }
  // Résumé and letter PDFs live on those documents, not on graph nodes. Treating
  // every attachment as a node ref made a complete backup unrestorable the
  // moment storage started keeping those blobs (FR-001).
  for (const row of rows['attachments.jsonl']!) {
    requireRef('attachments.jsonl', row, 'subject_id', idsForSubjectKind(row.subject_kind));
  }
  for (const row of rows['habit_checks.jsonl']!) requireRef('habit_checks.jsonl', row, 'habit_id', nodeIds);
  for (const row of rows['merges.jsonl']!) {
    requireRef('merges.jsonl', row, 'keep_id', nodeIds);
    requireRef('merges.jsonl', row, 'drop_id', nodeIds);
  }
  for (const row of rows['resumes.jsonl']!) requireRef('resumes.jsonl', row, 'target_id', targetIds);
  if (rows['letters.jsonl']) {
    for (const row of rows['letters.jsonl']) {
      requireRef('letters.jsonl', row, 'target_id', targetIds);
      requireRef('letters.jsonl', row, 'resume_id', resumeIds);
    }
  }
  if (rows['dossiers.jsonl']) {
    // Only the subject is checked. The records a claim cites are checked when
    // the dossier is compiled, not when it is restored: a citation whose record
    // is gone is a fact the provenance appendix is built to report, and
    // refusing the whole restore over one would turn a readable dossier into a
    // failed disaster drill.
    for (const row of rows['dossiers.jsonl']) {
      requireRef('dossiers.jsonl', row, 'subject_node', nodeIds);
    }
  }
  for (const file of ['import_rows.jsonl', 'import_raw_chunks.jsonl']) {
    for (const row of rows[file]!) requireRef(file, row, '_parent_id', importIds);
  }

  const nonEmpty: string[] = [];
  for (const spec of BUNDLE_COLLECTIONS) {
    if ((await repository.docCount(spec.table)) > 0) nonEmpty.push(spec.table);
  }
  if (nonEmpty.length && !opts.force) {
    throw new RestoreError(`target database is not empty (${nonEmpty.join(', ')}), pass force for replacement`);
  }

  const restoredBlobKeys = new Map<string, string>();
  const preparedBlobs: Array<{ sha: string; blob: ExportManifest['blobs'][string]; bytes: Buffer }> = [];
  for (const [sha, blob] of Object.entries(manifest.blobs ?? {})) {
    const name = `blobs/${sha}`;
    const data = files[name];
    if (data === undefined) throw new RestoreError(`bundle is missing attachment blob ${name}`);
    const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data, 'binary');
    if (bytes.length !== blob.bytes) throw new RestoreError(`${name}: size mismatch`);
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== sha || blob.sha256 !== sha) throw new RestoreError(`${name}: checksum mismatch`);
    preparedBlobs.push({ sha, blob, bytes });
  }
  for (const { sha, blob, bytes } of preparedBlobs) {
    const stored = await storage.upload({
      data: bytes,
      filename: sha,
      mime: blob.mime,
      sha256: sha,
    });
    restoredBlobKeys.set(blob.storage_key, stored.key);
  }

  const collections: Record<string, number> = {};
  let total = 0;

  for (const spec of BUNDLE_COLLECTIONS) {
    const content = files[spec.file];
    if (content === undefined) continue; // absent collection: nothing to restore
    const collectionRows = parseJsonl(content);

    const toWrite = collectionRows.map((row) => {
      const { _doc_id, ...data } = row;
      const docId = typeof _doc_id === 'string' && _doc_id ? _doc_id : (data.id as string | undefined);
      if (!docId) throw new RestoreError(`${spec.file}: row without _doc_id or id cannot be restored`);
      if (spec.table === 'attachments' && typeof data.storage_key === 'string') {
        data.storage_key = restoredBlobKeys.get(data.storage_key) ?? data.storage_key;
      }
      return { id: docId, data };
    });
    await repository.docBulkPut(spec.table, toWrite);

    collections[spec.file.replace(/\.jsonl$/, '')] = collectionRows.length;
    total += collectionRows.length;
  }

  for (const spec of BUNDLE_SUBCOLLECTIONS) {
    const content = files[spec.file];
    if (content === undefined) continue;
    const rows = parseJsonl(content);
    const toWrite = rows.map((row) => {
      const { _parent_id, _doc_id, ...data } = row;
      if (typeof _parent_id !== 'string' || !_parent_id) {
        throw new RestoreError(`${spec.file}: row without _parent_id cannot be restored`);
      }
      if (typeof _doc_id !== 'string' || !_doc_id) {
        throw new RestoreError(`${spec.file}: row without _doc_id cannot be restored`);
      }
      // The former subcollection parent is a real foreign key now, so the write
      // fails loudly if the bundle's import rows outlive their import.
      return { id: _doc_id, data, extra: { import_id: _parent_id } };
    });
    await repository.docBulkPut(spec.subcollection, toWrite);
    collections[spec.file.replace(/\.jsonl$/, '')] = rows.length;
    total += rows.length;
  }

  // `force` is a non-destructive-upsert replacement: all bundle documents are
  // written first, then stale target documents are pruned. A failed restore can
  // be safely rerun and never starts by emptying the only copy of the database.
  if (opts.force) {
    for (const spec of BUNDLE_COLLECTIONS) {
      // An optional collection the bundle does not carry says nothing about
      // what the target should hold, a pre-aliases backup is not evidence that
      // the aliases must go. Skip it rather than prune to empty.
      if (files[spec.file] === undefined) continue;
      const keep = ids(spec.file);
      let after: string | undefined;
      for (;;) {
        const page = await repository.docPage<Record<string, unknown>>(spec.table, {
          after,
          limit: BATCH_SIZE,
        });
        if (page.length === 0) break;
        const stale: string[] = [];
        for (const doc of page) {
          if (keep.has(doc.id)) continue;
          if (spec.table === 'attachments') {
            const old = doc.data as { storage_key?: string; mime?: string };
            const keyStillUsed = [...restoredBlobKeys.values()].includes(old.storage_key ?? '');
            if (old.storage_key && !keyStillUsed) {
              try {
                await storage.delete(old.storage_key, old.mime);
              } catch (error) {
                await repository.docMerge('attachments', doc.id, {
                  gc_pending: true,
                  gc_error: String(error),
                });
                continue;
              }
            }
          }
          stale.push(doc.id);
        }
        // import_rows / import_raw_chunks go with their parent via ON DELETE
        // CASCADE, so imports needs no recursive delete of its own.
        await repository.docDeleteMany(spec.table, stale);
        after = page.at(-1)!.id;
        if (page.length < BATCH_SIZE) break;
      }
    }

    for (const spec of BUNDLE_SUBCOLLECTIONS) {
      const keep = new Set<string>();
      for (const row of rows[spec.file]!) keep.add(String(row._doc_id));
      for (const parentId of importIds) {
        const existing = await repository.docIdsWhereIn(spec.subcollection, 'import_id', [parentId]);
        await repository.docDeleteMany(spec.subcollection, existing.filter((id) => !keep.has(id)));
      }
    }
  }

  await repository.publishSearchInvalidation();
  return { collections, total };
}
