/**
 * Full-fidelity export (SRS §5.6, FR-EXP-010). Produces a self-describing,
 * versioned bundle the system can be rebuilt from, the anti-lock-in guarantee:
 *   • JSONL for EVERY durable collection; each line is `{_doc_id, ...data}` so
 *     a restore can preserve document identity exactly (see services/restore.ts)
 *   • an Obsidian-compatible Markdown vault (one note per live node, wiki-links
 *     for edges), the dataset readable with zero software
 *   • a manifest with schema version, counts, and SHA-256 checksums
 *
 * `sensitive` records are excluded unless explicitly opted in (SRS FR-SET-007),
 * and the exclusion is transitive: edges touching a sensitive node, revisions
 * of any excluded record, atoms owned by one, and dependent variants / skills /
 * reminders / taggings / merges are all dropped with it.
 *
 * Entries are produced as an async stream, one collection (or vault note) at
 * a time, paged from Postgres and hashed incrementally, so a full export
 * never materializes the whole database in memory at once.
 */
import { createHash } from 'node:crypto';
import type { EdgeRecord, NodeRecord } from '@vitae/core';
import { repository } from '../db/repository.js';
import type { TableName } from '../db/schema.js';
import { storage } from './storage/cloudinary.js';

export const EXPORT_SCHEMA_VERSION = '3.0.0';

export interface ExportEntry {
  name: string;
  content: string | Buffer | AsyncIterable<string | Buffer>;
}

export interface ExportManifest {
  schema_version: string;
  generated_at: string;
  includes_sensitive: boolean;
  counts: Record<string, number>;
  checksums: Record<string, string>;
  blobs: Record<string, { bytes: number; mime: string; sha256: string; storage_key: string }>;
}

export interface ExportBundle {
  files: Record<string, string | Buffer>;
  manifest: ExportManifest;
}

/**
 * Every durable collection in the bundle, in restore order. `nodes`, `edges`,
 * `atoms`, and `revisions` get bespoke handling (sensitivity transitivity);
 * the rest are listed here with their sensitive-node reference field, if any.
 */
export const BUNDLE_COLLECTIONS: ReadonlyArray<{ file: string; table: TableName; optional?: boolean }> = [
  { file: 'nodes.jsonl', table: 'nodes' },
  { file: 'edges.jsonl', table: 'edges' },
  { file: 'atoms.jsonl', table: 'atoms' },
  { file: 'atom_variants.jsonl', table: 'atom_variants' },
  { file: 'atom_skills.jsonl', table: 'atom_skills' },
  { file: 'revisions.jsonl', table: 'revisions' },
  { file: 'targets.jsonl', table: 'targets' },
  { file: 'resumes.jsonl', table: 'resumes' },
  // Optional: added in migration 006 (FR-RES-020). Older backups omit this file.
  { file: 'letters.jsonl', table: 'letters', optional: true },
  // Optional: added in migration 011 (FR-DOS-001). Older backups omit this file.
  { file: 'dossiers.jsonl', table: 'dossiers', optional: true },
  // Optional: added in migration 012 (FR-PROD-003). Older backups omit these files.
  { file: 'time_entries.jsonl', table: 'time_entries', optional: true },
  { file: 'automation_rules.jsonl', table: 'automation_rules', optional: true },
  { file: 'productivity_receipts.jsonl', table: 'productivity_receipts', optional: true },
  { file: 'templates.jsonl', table: 'templates' },
  { file: 'reminders.jsonl', table: 'reminders' },
  { file: 'tags.jsonl', table: 'tags' },
  { file: 'taggings.jsonl', table: 'taggings' },
  { file: 'attachments.jsonl', table: 'attachments' },
  { file: 'merges.jsonl', table: 'merges' },
  { file: 'imports.jsonl', table: 'imports' },
  { file: 'saved_views.jsonl', table: 'saved_views' },
  { file: 'meta.jsonl', table: 'meta' },
  { file: 'habit_checks.jsonl', table: 'habit_checks' },
  { file: 'dedup_dismissals.jsonl', table: 'dedup_dismissals' },
  // Optional within schema 3.x so backups created before learned aliases remain
  // restorable without a schema-version break.
  { file: 'dedup_aliases.jsonl', table: 'dedup_aliases', optional: true },
];

/** Durable subcollections that need parent identity preserved separately. */
export const BUNDLE_SUBCOLLECTIONS = [
  { file: 'import_rows.jsonl', parentTable: 'imports' as const, subcollection: 'import_rows' as const },
  { file: 'import_raw_chunks.jsonl', parentTable: 'imports' as const, subcollection: 'import_raw_chunks' as const },
] as const;

const PAGE_SIZE = 500;

interface Paged {
  id: string;
  data: Record<string, unknown>;
}

/**
 * Walk a table id-ordered, a page at a time, so a full export never holds the
 * whole database in memory. Keyset (`id > last`), not OFFSET, the export reads
 * every row, and OFFSET would re-scan the prefix on each page.
 */
async function* pagedDocs(
  table: TableName,
  parent?: { column: string; id: string },
): AsyncGenerator<Paged[]> {
  let after: string | undefined;
  for (;;) {
    const page = await repository.docPage(table, {
      after,
      limit: PAGE_SIZE,
      parentColumn: parent?.column,
      parentId: parent?.id,
    });
    if (page.length === 0) return;
    yield page as Paged[];
    if (page.length < PAGE_SIZE) return;
    after = page[page.length - 1]!.id;
  }
}

type Row = Record<string, unknown>;

function yamlFrontmatter(node: NodeRecord): string {
  const lines = [
    '---',
    `id: ${node.id}`,
    `type: ${node.type}`,
    `title: ${JSON.stringify(node.title)}`,
    node.subtitle ? `subtitle: ${JSON.stringify(node.subtitle)}` : '',
    `source: ${node.source}`,
    `confidence: ${node.confidence}`,
    node.pinned ? 'pinned: true' : '',
    `created_at: ${node.created_at}`,
    '---',
  ].filter(Boolean);
  return lines.join('\n');
}

function safeSlug(node: NodeRecord): string {
  const base = node.title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'untitled';
  return `${node.type}/${base}-${node.id.slice(0, 8)}`;
}

/** Secrets must never travel in a data bundle, whatever the source doc holds. */
function scrubMetaRow(row: Row): Row {
  const github = row.github as Row | undefined;
  if (github && 'pat' in github) {
    const { pat: _pat, ...rest } = github;
    return { ...row, github: rest };
  }
  return row;
}

/**
 * Stream the export bundle entry by entry. The final entry is `manifest.json`;
 * the manifest is also the generator's return value.
 */
export async function* exportEntries(
  opts: { includeSensitive?: boolean } = {},
): AsyncGenerator<ExportEntry, ExportManifest, void> {
  const includeSensitive = opts.includeSensitive === true;
  const counts: Record<string, number> = {};
  const checksums: Record<string, string> = {};
  const blobs: ExportManifest['blobs'] = {};

  const jsonlFile = (
    file: string,
    colName: TableName,
    keep: (docId: string, row: Row) => boolean | Promise<boolean>,
    transform?: (row: Row) => Row,
    onKept?: (docId: string, row: Row) => void,
  ): ExportEntry => {
    const content = (async function* (): AsyncGenerator<string> {
      const hash = createHash('sha256');
      let count = 0;
      for await (const page of pagedDocs(colName)) {
        let chunk = '';
        for (const d of page) {
          const row = d.data as Row;
          if (!(await keep(d.id, row))) continue;
          onKept?.(d.id, row);
          chunk += JSON.stringify({ _doc_id: d.id, ...(transform ? transform(row) : row) }) + '\n';
          count += 1;
        }
        hash.update(chunk);
        if (chunk) yield chunk;
      }
      counts[file.replace(/\.jsonl$/, '')] = count;
      checksums[file] = hash.digest('hex');
    })();
    return { name: file, content };
  };

  const subcollectionFile = (
    file: string,
    subcollection: 'import_rows' | 'import_raw_chunks',
    keepParent: (parentId: string, row: Row) => boolean | Promise<boolean>,
  ): ExportEntry => {
    const content = (async function* (): AsyncGenerator<string> {
      const hash = createHash('sha256');
      let count = 0;
      for await (const parents of pagedDocs('imports')) {
        for (const parent of parents) {
          const parentId = parent.id;
          if (!(await keepParent(parentId, parent.data as Row))) continue;
          for await (const page of pagedDocs(subcollection, { column: 'import_id', id: parentId })) {
            let chunk = '';
            for (const doc of page) {
              chunk += JSON.stringify({ _parent_id: parentId, _doc_id: doc.id, ...doc.data }) + '\n';
              count += 1;
            }
            hash.update(chunk);
            if (chunk) yield chunk;
          }
        }
      }
      counts[file.replace(/\.jsonl$/, '')] = count;
      checksums[file] = hash.digest('hex');
    })();
    return { name: file, content };
  };

  // FR-009: policy checks re-read referenced records instead of retaining
  // collection-sized ID/adjacency maps. This trades reads for bounded memory.
  const nodeIsSensitive = async (id: unknown): Promise<boolean> => {
    if (includeSensitive || typeof id !== 'string' || !id) return false;
    const node = await repository.getNode(id, { includeDeleted: true });
    return node?.sensitivity === 'sensitive';
  };
  const atomIsSensitive = async (id: unknown): Promise<boolean> => {
    if (includeSensitive || typeof id !== 'string' || !id) return false;
    const atom = await repository.docGet<Row>('atoms', id);
    return atom ? nodeIsSensitive(atom.owner_node) : false;
  };
  const edgeIsSensitive = async (row: Row): Promise<boolean> =>
    (await nodeIsSensitive(row.src)) || (await nodeIsSensitive(row.dst));
  const timeEntryIsExcluded = async (row: Row): Promise<boolean> => {
    if (includeSensitive) return false;
    if (row.sensitive === true) return true;
    return nodeIsSensitive(row.task_id);
  };
  const ruleIsExcluded = (row: Row): boolean => !includeSensitive && row.sensitive === true;
  const refersToSensitive = (fields: string[]) => async (_id: string, row: Row) => {
    for (const field of fields) if (await nodeIsSensitive(row[field])) return false;
    return true;
  };
  const emptyFile = (file: string): ExportEntry => {
    counts[file.replace(/\.jsonl$/, '')] = 0;
    checksums[file] = createHash('sha256').digest('hex');
    return { name: file, content: '' };
  };

  yield jsonlFile('nodes.jsonl', 'nodes', (_id, row) => includeSensitive || row.sensitivity !== 'sensitive');
  yield jsonlFile('edges.jsonl', 'edges', async (_id, row) => !(await edgeIsSensitive(row)));
  yield jsonlFile('atoms.jsonl', 'atoms', async (_id, row) => !(await nodeIsSensitive(row.owner_node)));
  yield jsonlFile('atom_variants.jsonl', 'atom_variants', async (_id, row) => !(await atomIsSensitive(row.atom_id)));
  yield jsonlFile(
    'atom_skills.jsonl',
    'atom_skills',
    async (_id, row) => !(await atomIsSensitive(row.atom_id)) && !(await nodeIsSensitive(row.skill_id)),
  );
  yield jsonlFile('revisions.jsonl', 'revisions', async (_id, row) => {
    if (includeSensitive) return true;
    if (row.subject_kind === 'productivity_receipt') return false;
    if (await nodeIsSensitive(row.subject_id)) return false;
    const snapshot = (row.snapshot ?? {}) as Row;
    if (row.subject_kind === 'time_entry') {
      const entry =
        typeof row.subject_id === 'string'
          ? await repository.getTimeEntry(row.subject_id, { includeDeleted: true })
          : null;
      if (await timeEntryIsExcluded((entry ?? snapshot) as Row)) return false;
    }
    if (row.subject_kind === 'automation_rule') {
      const rule =
        typeof row.subject_id === 'string'
          ? await repository.getAutomationRule(row.subject_id, { includeDeleted: true })
          : null;
      if (ruleIsExcluded((rule ?? snapshot) as Row)) return false;
    }
    if (await edgeIsSensitive(snapshot)) return false;
    if (await nodeIsSensitive(snapshot.owner_node)) return false;
    return !(await atomIsSensitive(row.subject_id));
  });

  // Job/import/settings data is private by nature and has no node sensitivity
  // label. It belongs only in an explicit complete backup.
  yield includeSensitive ? jsonlFile('targets.jsonl', 'targets', () => true) : emptyFile('targets.jsonl');
  yield includeSensitive
    ? jsonlFile('resumes.jsonl', 'resumes', () => true)
    : emptyFile('resumes.jsonl');
  yield includeSensitive
    ? jsonlFile('letters.jsonl', 'letters', () => true)
    : emptyFile('letters.jsonl');
  // A dossier is a selection of evidence about one person, assembled for a
  // named reader. It carries no node sensitivity label of its own and it can
  // cite records that do, so it goes the way targets and letters go: only into
  // an explicit complete backup.
  yield includeSensitive
    ? jsonlFile('dossiers.jsonl', 'dossiers', () => true)
    : emptyFile('dossiers.jsonl');
  // A time entry inherits sensitivity from its task and may also mark itself.
  yield jsonlFile('time_entries.jsonl', 'time_entries', async (_id, row) => !(await timeEntryIsExcluded(row)));
  yield jsonlFile('automation_rules.jsonl', 'automation_rules', (_id, row) => !ruleIsExcluded(row));
  // Receipts carry command `result` payloads with no sensitivity label, so they
  // go the way imports go: only into an explicit complete backup.
  yield includeSensitive
    ? jsonlFile('productivity_receipts.jsonl', 'productivity_receipts', () => true)
    : emptyFile('productivity_receipts.jsonl');
  yield jsonlFile('templates.jsonl', 'templates', () => true);
  yield jsonlFile('reminders.jsonl', 'reminders', refersToSensitive(['subject_id']));
  yield jsonlFile('tags.jsonl', 'tags', async (tagId) => {
    if (includeSensitive) return true;
    const taggings = await repository.docQuery<Row>('taggings', { tag_id: tagId });
    for (const tagging of taggings) {
      if (!(await nodeIsSensitive(tagging.subject_id))) return true;
    }
    return false;
  });
  yield jsonlFile('taggings.jsonl', 'taggings', refersToSensitive(['subject_id']));
  yield includeSensitive
    ? jsonlFile('attachments.jsonl', 'attachments', () => true)
    : emptyFile('attachments.jsonl');
  yield jsonlFile('merges.jsonl', 'merges', refersToSensitive(['keep_id', 'drop_id']));
  yield includeSensitive ? jsonlFile('imports.jsonl', 'imports', () => true) : emptyFile('imports.jsonl');
  yield includeSensitive
    ? subcollectionFile('import_rows.jsonl', 'import_rows', () => true)
    : emptyFile('import_rows.jsonl');
  yield includeSensitive
    ? subcollectionFile('import_raw_chunks.jsonl', 'import_raw_chunks', () => true)
    : emptyFile('import_raw_chunks.jsonl');
  yield includeSensitive
    ? jsonlFile('saved_views.jsonl', 'saved_views', () => true)
    : emptyFile('saved_views.jsonl');
  yield includeSensitive
    ? jsonlFile(
      'meta.jsonl',
      'meta',
      (docId) => !['search_generation', 'export_status', 'dedup_scan'].includes(docId),
      scrubMetaRow,
    )
    : emptyFile('meta.jsonl');
  yield jsonlFile('habit_checks.jsonl', 'habit_checks', refersToSensitive(['habit_id']));
  yield jsonlFile('dedup_dismissals.jsonl', 'dedup_dismissals', refersToSensitive(['a', 'b']));
  yield jsonlFile('dedup_aliases.jsonl', 'dedup_aliases', refersToSensitive(['canonical_id']));

  // Complete backups include attachment bytes, one bounded object at a time.
  if (includeSensitive) {
    let blobCount = 0;
    for await (const page of pagedDocs('attachments')) {
      for (const doc of page) {
        const attachment = doc.data as Row;
        const key = String(attachment.storage_key ?? '');
        const sha = String(attachment.sha256 ?? '');
        const mime = String(attachment.mime ?? 'application/octet-stream');
        if (!key || !sha) {
          throw new Error(`attachment ${doc.id} lacks storage_key/sha256 and cannot be backed up safely`);
        }
        if (blobs[sha]) continue;
        const name = `blobs/${sha}`;
        blobs[sha] = {
          bytes: Number(attachment.bytes ?? 0),
          mime,
          sha256: sha,
          storage_key: key,
        };
        const content = (async function* (): AsyncGenerator<Buffer> {
          const hash = createHash('sha256');
          let bytes = 0;
          const stream = await storage.downloadStream(key, mime);
          for await (const raw of stream) {
            const chunk = Buffer.from(raw);
            bytes += chunk.length;
            hash.update(chunk);
            yield chunk;
          }
          const actual = hash.digest('hex');
          if (actual !== sha) throw new Error(`attachment ${doc.id} checksum mismatch`);
          const declared = Number(attachment.bytes ?? 0);
          if (declared > 0 && declared !== bytes) throw new Error(`attachment ${doc.id} byte count mismatch`);
          blobs[sha]!.bytes = bytes;
          checksums[name] = actual;
          counts.blobs = ++blobCount;
        })();
        yield { name, content };
      }
    }
    counts.blobs ??= 0;
  } else {
    counts.blobs = 0;
  }

  // Markdown vault is also bounded: query each node's outgoing relationships.
  for await (const page of pagedDocs('nodes')) {
    for (const doc of page) {
      const n = doc.data as unknown as NodeRecord;
      if (n.deleted_at || (!includeSensitive && n.sensitivity === 'sensitive')) continue;
      const outgoing = await repository.docQuery<EdgeRecord>('edges', { src: n.id });
      const rels: string[] = [];
      for (const edge of outgoing) {
        if (edge.deleted_at || (await nodeIsSensitive(edge.dst))) continue;
        const target = await repository.getNode(edge.dst);
        if (!target) continue;
        rels.push(`- ${edge.type} → [[${safeSlug(target)}]]`);
      }
      const body = [
        yamlFrontmatter(n),
        '',
        `# ${n.title}`,
        n.subtitle ? `*${n.subtitle}*` : '',
        '',
        n.notes_md || '',
        rels.length ? `\n## Connections\n${rels.join('\n')}` : '',
      ].join('\n');
      yield { name: `vault/${safeSlug(n)}.md`, content: body };
    }
  }

  const manifest: ExportManifest = {
    schema_version: EXPORT_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    includes_sensitive: includeSensitive,
    counts,
    checksums,
    blobs,
  };
  yield { name: 'manifest.json', content: JSON.stringify(manifest, null, 2) };
  return manifest;
}

/**
 * Drain the stream into an in-memory bundle. Used by the manifest preview,
 * restore tooling, and tests, the download route streams instead.
 */
export async function buildExport(opts: { includeSensitive?: boolean } = {}): Promise<ExportBundle> {
  const files: Record<string, string | Buffer> = {};
  const gen = exportEntries(opts);
  let next = await gen.next();
  while (!next.done) {
    if (typeof next.value.content === 'string' || Buffer.isBuffer(next.value.content)) {
      files[next.value.name] = next.value.content;
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of next.value.content) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const data = Buffer.concat(chunks);
      files[next.value.name] = next.value.name.endsWith('.jsonl') ? data.toString('utf8') : data;
    }
    next = await gen.next();
  }
  return { files, manifest: next.value };
}
