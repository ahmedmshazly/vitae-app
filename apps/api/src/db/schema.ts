/**
 * Kysely's view of the Postgres schema (see migrations/001-initial-schema.ts).
 *
 * Hand-written rather than generated, deliberately: the API runs TypeScript
 * directly under tsx with no build step, so a codegen step would be the first
 * one, and there are 26 document tables of three columns each, which is cheaper to
 * write than to wire a generator for.
 *
 * Every generated column is `GeneratedAlways`, which makes it a type error to
 * insert or update one. That is the invariant the design depends on: `data` is
 * the only writable copy of a field, so the indexed column beside it can never
 * disagree with the document.
 */
import type { Generated, GeneratedAlways, Insertable, Selectable } from 'kysely';

/** The three columns every table shares. `data` is the whole record. */
export interface DocTable<T = Record<string, unknown>> {
  space: 'real' | 'demo';
  /**
   * Server-selected workspace partition. `space` remains during the staged
   * migration so self-hosted real/demo scripts retain their stable contract;
   * application reads and writes additionally scope by this value.
   */
  workspace_id: Generated<string>;
  id: string;
  data: T;
}

export interface UserTable {
  id: string;
  email: string;
  email_verified: boolean;
  provider: string;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface WorkspaceTable {
  id: string;
  kind: string;
  state: string;
  owner_user_id: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface WorkspaceMemberTable {
  workspace_id: string;
  user_id: string;
  role: string;
  created_at: Generated<string>;
}

export interface WorkspaceLifecycleTable {
  workspace_id: string;
  access_state: string;
  trial_ends_at: string | null;
  grace_ends_at: string | null;
  deletion_scheduled_at: string | null;
  updated_at: Generated<string>;
}

export interface BillingCustomerTable {
  workspace_id: string;
  provider: string;
  provider_customer_id: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface BillingSubscriptionTable {
  workspace_id: string;
  provider: string;
  provider_subscription_id: string | null;
  provider_status: string | null;
  billing_period: string | null;
  current_period_ends_at: string | null;
  provider_updated_at: string | null;
  cancel_at_period_end: boolean;
  raw: Record<string, unknown>;
  updated_at: Generated<string>;
}

export interface BillingEventTable {
  provider_event_id: string;
  provider: string;
  event_type: string;
  workspace_id: string | null;
  payload: Record<string, unknown>;
  received_at: Generated<string>;
  processed_at: string | null;
}

export interface WorkspaceLifecycleEventTable {
  id: string;
  workspace_id: string;
  kind: string;
  details: Record<string, unknown>;
  created_at: Generated<string>;
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
  at: GeneratedAlways<string | null>;
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
interface DossierTable extends DocTable {
  subject_node: GeneratedAlways<string | null>;
  audience: GeneratedAlways<string | null>;
  updated_at: GeneratedAlways<string | null>;
  deleted_at: GeneratedAlways<string | null>;
}
interface TimeEntryTable extends DocTable {
  task_id: GeneratedAlways<string | null>;
  started_at: GeneratedAlways<string | null>;
  ended_at: GeneratedAlways<string | null>;
  updated_at: GeneratedAlways<string | null>;
  deleted_at: GeneratedAlways<string | null>;
}
interface AutomationRuleTable extends DocTable {
  enabled: GeneratedAlways<boolean | null>;
  updated_at: GeneratedAlways<string | null>;
  deleted_at: GeneratedAlways<string | null>;
}
interface ProductivityReceiptTable extends DocTable {
  operation_id: GeneratedAlways<string | null>;
  command_type: GeneratedAlways<string | null>;
  created_at: GeneratedAlways<string | null>;
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
  knowledge_sources: DocTable;
  knowledge_runs: DocTable;
  source_records: DocTable;
  source_identities: DocTable;
  evidence_assertions: DocTable;
  reconciliation_decisions: DocTable;
  entity_redirects: DocTable;
  users: UserTable;
  workspaces: WorkspaceTable;
  workspace_members: WorkspaceMemberTable;
  workspace_lifecycles: WorkspaceLifecycleTable;
  billing_customers: BillingCustomerTable;
  billing_subscriptions: BillingSubscriptionTable;
  billing_events: BillingEventTable;
  workspace_lifecycle_events: WorkspaceLifecycleEventTable;
  nodes: NodeTable;
  edges: EdgeTable;
  revisions: RevisionTable;
  atoms: AtomTable;
  atom_variants: AtomVariantTable;
  atom_skills: AtomSkillTable;
  targets: TargetTable;
  resumes: ResumeTable;
  letters: LetterTable;
  dossiers: DossierTable;
  time_entries: TimeEntryTable;
  automation_rules: AutomationRuleTable;
  productivity_receipts: ProductivityReceiptTable;
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
  'knowledge_sources',
  'knowledge_runs',
  'source_records',
  'source_identities',
  'evidence_assertions',
  'reconciliation_decisions',
  'entity_redirects',
  'nodes',
  'edges',
  'revisions',
  'atoms',
  'atom_variants',
  'atom_skills',
  'targets',
  'resumes',
  'letters',
  'dossiers',
  'time_entries',
  'automation_rules',
  'productivity_receipts',
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

/** Control-plane tables deliberately stay out of legacy graph seed/truncate loops. */
export const CONTROL_TABLES = [
  'users',
  'workspaces',
  'workspace_members',
  'workspace_lifecycles',
  'billing_customers',
  'billing_subscriptions',
  'billing_events',
  'workspace_lifecycle_events',
] as const satisfies ReadonlyArray<keyof Database>;

export type TableName = keyof Database;
export type DocRow = Selectable<DocTable>;
export type DocInsert = Insertable<DocTable>;
