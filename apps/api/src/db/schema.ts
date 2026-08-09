/**
 * Kysely's view of the Postgres schema (see migrations/001-initial-schema.ts).
 *
 * Hand-written rather than generated, deliberately: the API runs TypeScript
 * directly under tsx with no build step, so a codegen step would be the first
 * one, and there are 23 tables of three columns each, which is cheaper to
 * write than to wire a generator for.
 *
 * Every generated column is `GeneratedAlways`, which makes it a type error to
 * insert or update one. That is the invariant the design depends on: `data` is
 * the only writable copy of a field, so the indexed column beside it can never
 * disagree with the document.
 */
import type { GeneratedAlways, Insertable, Selectable } from 'kysely';

/** The three columns every table shares. `data` is the whole record. */
export interface DocTable<T = Record<string, unknown>> {
  space: 'real' | 'demo';
  id: string;
  data: T;
}

export interface NodeTable extends DocTable {
  type: GeneratedAlways<string>;
  title: GeneratedAlways<string>;
  updated_at: GeneratedAlways<string | null>;
  deleted_at: GeneratedAlways<string | null>;
  archived_at: GeneratedAlways<string | null>;
  merged_into: GeneratedAlways<string | null>;
  sensitivity: GeneratedAlways<string | null>;
}

export interface EdgeTable extends DocTable {
  type: GeneratedAlways<string>;
  src: GeneratedAlways<string>;
  dst: GeneratedAlways<string>;
  updated_at: GeneratedAlways<string | null>;
  deleted_at: GeneratedAlways<string | null>;
}

export interface RevisionTable extends DocTable {
  subject_id: GeneratedAlways<string | null>;
  subject_kind: GeneratedAlways<string | null>;
  rev: GeneratedAlways<number | null>;
}

interface AtomTable extends DocTable {
  owner_node: GeneratedAlways<string | null>;
  source_ref: GeneratedAlways<string | null>;
  deleted_at: GeneratedAlways<string | null>;
}
interface AtomVariantTable extends DocTable {
  atom_id: GeneratedAlways<string | null>;
}
interface HabitCheckTable extends DocTable {
  habit_id: GeneratedAlways<string | null>;
}
interface DedupDismissalTable extends DocTable {
  a: GeneratedAlways<string | null>;
  b: GeneratedAlways<string | null>;
}
interface AtomSkillTable extends DocTable {
  atom_id: GeneratedAlways<string | null>;
  skill_id: GeneratedAlways<string | null>;
}
interface TargetTable extends DocTable {
  status: GeneratedAlways<string | null>;
  updated_at: GeneratedAlways<string | null>;
  deleted_at: GeneratedAlways<string | null>;
}
interface ResumeTable extends DocTable {
  target_id: GeneratedAlways<string | null>;
  template_key: GeneratedAlways<string | null>;
  status: GeneratedAlways<string | null>;
  created_at: GeneratedAlways<string | null>;
  deleted_at: GeneratedAlways<string | null>;
}
interface LetterTable extends DocTable {
  target_id: GeneratedAlways<string | null>;
  resume_id: GeneratedAlways<string | null>;
  status: GeneratedAlways<string | null>;
  updated_at: GeneratedAlways<string | null>;
  deleted_at: GeneratedAlways<string | null>;
}
interface ReminderTable extends DocTable {
  status: GeneratedAlways<string | null>;
  due_on: GeneratedAlways<string | null>;
  subject_id: GeneratedAlways<string | null>;
}
interface TagTable extends DocTable {
  name: GeneratedAlways<string | null>;
}
interface TaggingTable extends DocTable {
  tag_id: GeneratedAlways<string | null>;
  subject_id: GeneratedAlways<string | null>;
}
interface AttachmentTable extends DocTable {
  subject_id: GeneratedAlways<string | null>;
  gc_pending: GeneratedAlways<boolean | null>;
}
interface MergeTable extends DocTable {
  keep_id: GeneratedAlways<string | null>;
  drop_id: GeneratedAlways<string | null>;
}
interface DedupAliasTable extends DocTable {
  type: GeneratedAlways<string | null>;
}
interface ImportTable extends DocTable {
  status: GeneratedAlways<string | null>;
  created_at: GeneratedAlways<string | null>;
}
/** Former Firestore subcollections; the parent id is a real foreign key now. */
interface ImportChildTable extends DocTable {
  import_id: string;
}
interface MetaRunTable extends DocTable {
  meta_id: string;
  run_id: GeneratedAlways<string | null>;
}

export interface Database {
  nodes: NodeTable;
  edges: EdgeTable;
  revisions: RevisionTable;
  atoms: AtomTable;
  atom_variants: AtomVariantTable;
  atom_skills: AtomSkillTable;
  targets: TargetTable;
  resumes: ResumeTable;
  letters: LetterTable;
  templates: DocTable;
  reminders: ReminderTable;
  tags: TagTable;
  taggings: TaggingTable;
  attachments: AttachmentTable;
  merges: MergeTable;
  imports: ImportTable;
  import_rows: ImportChildTable;
  import_raw_chunks: ImportChildTable;
  saved_views: DocTable;
  meta: DocTable;
  meta_runs: MetaRunTable;
  habit_checks: HabitCheckTable;
  dedup_dismissals: DedupDismissalTable;
  dedup_aliases: DedupAliasTable;
}

/** Table names as a runtime list, used by the test truncation helper. */
export const TABLES = [
  'nodes',
  'edges',
  'revisions',
  'atoms',
  'atom_variants',
  'atom_skills',
  'targets',
  'resumes',
  'letters',
  'templates',
  'reminders',
  'tags',
  'taggings',
  'attachments',
  'merges',
  'imports',
  'import_rows',
  'import_raw_chunks',
  'saved_views',
  'meta',
  'meta_runs',
  'habit_checks',
  'dedup_dismissals',
  'dedup_aliases',
] as const satisfies ReadonlyArray<keyof Database>;

export type TableName = keyof Database;
export type DocRow = Selectable<DocTable>;
export type DocInsert = Insertable<DocTable>;
