import { createHash } from 'node:crypto';
import { realpathSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  entityIdentityKeys,
  extractGmailObservation,
  normalizedEmail,
  type EvidenceAssertion,
  type GmailMessageInput,
  type ImportRun,
  type NodeRecord,
  type SourceConnection,
  type SourceIdentity,
  type SourceRecord,
} from '@vitae/core';
import { repository } from '../db/repository.js';
import { decideAssertion } from './knowledge.js';

const COLUMN_ALIASES: Record<keyof GmailMessageInput, string[]> = {
  id: ['id', 'message_id', 'gmail_id'],
  thread_id: ['thread_id', 'threadid', 'conversation_id'],
  subject: ['subject'],
  sent_at: ['sent_at', 'date', 'internal_date', 'timestamp'],
  from: ['from_address', 'from', 'sender'],
  to: ['to_addresses', 'to', 'recipients'],
  cc: ['cc_addresses', 'cc'],
  bcc: ['bcc_addresses', 'bcc'],
  body_text: ['body_text', 'text', 'plain_text', 'body'],
  attachment_text: ['attachment_text', 'attachments_text'],
  labels: ['labels', 'label_ids'],
};
const q = (identifier: string): string => `"${identifier.replaceAll('"', '""')}"`;
const sha = (value: string): string => createHash('sha256').update(value).digest('hex');
const SHARED_MAILBOX_LOCAL =
  /^(?:admissions?|billing|careers?|contact|hello|help|info|office|recruit(?:er|ing)?|sales|support|team)$/i;

interface GmailSqliteSchema {
  table: string;
  columns: Partial<Record<keyof GmailMessageInput, string>>;
  normalized: boolean;
}

function detectSchema(sqlite: DatabaseSync): GmailSqliteSchema {
  const tables = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all() as Array<{ name: string }>;
  for (const table of ['messages', 'emails', 'gmail_messages', ...tables.map((row) => row.name)]) {
    if (!tables.some((row) => row.name === table)) continue;
    const available = new Set(
      (sqlite.prepare(`PRAGMA table_info(${q(table)})`).all() as Array<{ name: string }>).map(
        (row) => row.name,
      ),
    );
    const columns: Partial<Record<keyof GmailMessageInput, string>> = {};
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as Array<
      [keyof GmailMessageInput, string[]]
    >) {
      columns[field] = aliases.find((alias) => available.has(alias));
    }
    const normalized =
      table === 'messages' &&
      available.has('message_pk') &&
      available.has('message_key') &&
      tables.some((row) => row.name === 'participants');
    if (normalized) {
      return {
        table,
        normalized: true,
        columns: {
          id: 'message_key',
          thread_id: available.has('thread_id') ? 'thread_id' : undefined,
          subject: available.has('subject') ? 'subject' : undefined,
          sent_at: available.has('date_utc') ? 'date_utc' : undefined,
          from: available.has('from_address') ? 'from_address' : undefined,
          body_text: available.has('body_text') ? 'body_text' : undefined,
        },
      };
    }
    if (columns.id && (columns.from || columns.to) && (columns.body_text || columns.subject))
      return { table, columns, normalized: false };
  }
  throw new Error(
    'No supported message table found. Expected messages/emails with an id, participants, and subject or plain-text body.',
  );
}

function rowsFrom(
  sqlite: DatabaseSync,
  schema: GmailSqliteSchema,
  limit?: number,
): GmailMessageInput[] {
  if (schema.normalized) return normalizedRowsFrom(sqlite, limit);
  const select = (
    Object.entries(schema.columns) as Array<[keyof GmailMessageInput, string | undefined]>
  )
    .filter((entry): entry is [keyof GmailMessageInput, string] => Boolean(entry[1]))
    .map(([field, column]) => `${q(column)} AS ${q(field)}`)
    .join(', ');
  const sql = `SELECT ${select} FROM ${q(schema.table)} ORDER BY ${q(schema.columns.sent_at ?? schema.columns.id!)} ASC${limit ? ` LIMIT ${Math.max(1, Math.floor(limit))}` : ''}`;
  return sqlite
    .prepare(sql)
    .all()
    .map((row) =>
      Object.fromEntries(
        Object.entries(row as Record<string, unknown>).map(([key, value]) => [
          key,
          value == null ? null : String(value),
        ]),
      ),
    ) as unknown as GmailMessageInput[];
}

/** Query the normalized local Gmail archive without materializing stored files. */
function normalizedRowsFrom(sqlite: DatabaseSync, limit?: number): GmailMessageInput[] {
  const sql = `SELECT
    m.message_key AS id,
    m.thread_id AS thread_id,
    m.subject AS subject,
    m.date_utc AS sent_at,
    CASE
      WHEN m.from_address IS NULL THEN m.from_display
      WHEN m.from_display IS NULL OR trim(m.from_display) = '' THEN m.from_address
      ELSE m.from_display || ' <' || m.from_address || '>'
    END AS "from",
    (SELECT group_concat(CASE WHEN p.address IS NULL THEN p.display_name ELSE coalesce(p.display_name || ' <' || p.address || '>', p.address) END, ', ')
       FROM participants p WHERE p.message_pk = m.message_pk AND p.role = 'to') AS "to",
    (SELECT group_concat(CASE WHEN p.address IS NULL THEN p.display_name ELSE coalesce(p.display_name || ' <' || p.address || '>', p.address) END, ', ')
       FROM participants p WHERE p.message_pk = m.message_pk AND p.role = 'cc') AS cc,
    (SELECT group_concat(CASE WHEN p.address IS NULL THEN p.display_name ELSE coalesce(p.display_name || ' <' || p.address || '>', p.address) END, ', ')
       FROM participants p WHERE p.message_pk = m.message_pk AND p.role = 'bcc') AS bcc,
    m.body_text AS body_text,
    (SELECT substr(group_concat(substr(at.extracted_text, 1, 4000), char(10)), 1, 16000)
       FROM message_attachments ma JOIN attachment_text at ON at.attachment_pk = ma.attachment_pk
      WHERE ma.message_pk = m.message_pk AND at.extraction_status = 'ok') AS attachment_text,
    (SELECT group_concat(l.label, ',') FROM labels l WHERE l.message_pk = m.message_pk) AS labels
  FROM messages m
  ORDER BY coalesce(m.date_utc, m.message_key) ASC${limit ? ` LIMIT ${Math.max(1, Math.floor(limit))}` : ''}`;
  return sqlite.prepare(sql).all() as unknown as GmailMessageInput[];
}

function emailOwners(nodes: NodeRecord[]): Map<string, NodeRecord[]> {
  const owners = new Map<string, NodeRecord[]>();
  for (const node of nodes)
    if (node.type === 'person')
      for (const key of entityIdentityKeys(node)) {
        if (!key.startsWith('email:person:')) continue;
        const email = key.slice('email:person:'.length);
        owners.set(email, [...(owners.get(email) ?? []), node]);
      }
  return owners;
}

export async function importGmailSqlite(options: {
  path: string;
  selfAddresses: string[];
  limit?: number;
}): Promise<{
  source: SourceConnection;
  run: ImportRun;
  records: number;
  assertions: number;
  automaticallyApplied: number;
  pending: number;
  limitations: string[];
}> {
  const path = realpathSync(options.path);
  if (!statSync(path).isFile()) throw new Error('Gmail source location is not a file');
  const sqlite = new DatabaseSync(path, { readOnly: true, allowExtension: false });
  let messages: GmailMessageInput[];
  let schema: ReturnType<typeof detectSchema>;
  try {
    schema = detectSchema(sqlite);
    messages = rowsFrom(sqlite, schema, options.limit);
  } finally {
    sqlite.close();
  }
  const now = new Date().toISOString();
  const sourceId = `gmail-${sha(path).slice(0, 20)}`;
  const runId = repository.allocateId();
  const observations = messages.map((message) =>
    extractGmailObservation(message, options.selfAddresses, sha),
  );
  const dated = observations
    .map((o) => o.occurredAt)
    .filter((value): value is string => Boolean(value))
    .sort();
  const limitations = [...new Set(observations.flatMap((o) => o.limitations))];
  const source: SourceConnection = {
    id: sourceId,
    system: 'gmail_sqlite',
    title: 'Local Gmail knowledge source',
    location: path,
    imported_at: now,
    coverage: {
      from: dated[0] ?? null,
      to: dated.at(-1) ?? null,
      records: observations.length,
      complete: options.limit == null,
      limitations,
    },
    rules: {
      self_addresses: options.selfAddresses.map(normalizedEmail),
      excluded_addresses: [],
      excluded_domains: [],
      sensitive_categories: [],
    },
    metadata: { table: schema.table, columns: schema.columns },
  };
  const run: ImportRun = {
    id: runId,
    source_id: sourceId,
    status: 'reconciling',
    started_at: now,
    finished_at: null,
    checkpoint: null,
    coverage: {
      examined: observations.length,
      extracted: 0,
      skipped: 0,
      failed: 0,
      complete: options.limit == null,
    },
    limitations,
    error: null,
    options: { limit: options.limit ?? null },
  };
  await repository.docPut('knowledge_sources', source.id, source);
  await repository.docPut('knowledge_runs', run.id, run);

  const owners = emailOwners(await repository.allLiveNodes());
  const records: SourceRecord[] = [];
  const assertions: EvidenceAssertion[] = [];
  const identities: SourceIdentity[] = [];
  const stagedCandidateAddresses = new Set<string>();
  for (const observation of observations) {
    const recordId = `${sourceId}:${observation.id}:${observation.contentHash.slice(0, 16)}`;
    records.push({
      id: recordId,
      source_id: sourceId,
      run_id: runId,
      external_id: observation.id,
      kind: 'message',
      title: observation.title,
      occurred_at: observation.occurredAt,
      learned_at: now,
      thread_key: observation.threadKey,
      category: observation.category,
      direction: observation.direction,
      participant_addresses: observation.participants.map((p) => p.address),
      content_hash: observation.contentHash,
      locator: observation.locator,
      data: {
        participant_names: observation.participants
          .filter((p) => p.name)
          .map((p) => [p.address, p.name]),
        limitations: observation.limitations,
      },
    });
    if (observation.category === 'automated' || observation.category === 'bulk') continue;
    for (const participant of observation.participants.filter(
      (p) => !options.selfAddresses.map(normalizedEmail).includes(p.address),
    )) {
      const matches = owners.get(participant.address) ?? [];
      if (matches.length === 1) {
        const target = matches[0]!;
        const identityId = sha(`${sourceId}|email|${participant.address}|${target.id}`).slice(
          0,
          40,
        );
        identities.push({
          id: identityId,
          source_id: sourceId,
          entity_id: target.id,
          entity_kind: 'person',
          scheme: 'email',
          value: participant.address,
          normalized_value: participant.address,
          verified: true,
          is_self: false,
          created_at: now,
        });
        const value = {
          kind: 'communication',
          direction: observation.direction,
          occurred_at: observation.occurredAt,
          thread_key: observation.threadKey,
        };
        assertions.push({
          id: sha(`${recordId}|${target.id}|$record`).slice(0, 40),
          run_id: runId,
          subject_id: target.id,
          subject_kind: 'node',
          field: '$record',
          value,
          citation: {
            source_id: sourceId,
            record_id: recordId,
            external_id: observation.id,
            locator: observation.locator,
            content_hash: observation.contentHash,
          },
          basis: 'explicit',
          confidence: 1,
          status: 'accepted',
          observed_at: now,
          valid_from: observation.occurredAt,
          valid_to: null,
          reviewed_at: now,
          reviewed_by: 'system',
          reason: 'Address matched a canonical person identity.',
        });
      } else if (matches.length > 1 && !stagedCandidateAddresses.has(participant.address)) {
        stagedCandidateAddresses.add(participant.address);
        assertions.push({
          id: sha(`${sourceId}|ambiguous:${participant.address}|$record`).slice(0, 40),
          run_id: runId,
          subject_id: `candidate:${participant.address}`,
          subject_kind: 'node',
          field: '$record',
          value: { identity_kind: 'person', candidates: matches.map((match) => match.id) },
          citation: {
            source_id: sourceId,
            record_id: recordId,
            external_id: observation.id,
            locator: observation.locator,
            content_hash: observation.contentHash,
          },
          basis: 'explicit',
          confidence: 1,
          status: 'conflict',
          observed_at: now,
          valid_from: observation.occurredAt,
          valid_to: null,
          reviewed_at: null,
          reason: 'This address belongs to more than one canonical person record.',
        });
      } else if (
        matches.length === 0 &&
        participant.name &&
        !stagedCandidateAddresses.has(participant.address)
      ) {
        stagedCandidateAddresses.add(participant.address);
        assertions.push({
          id: sha(`${sourceId}|candidate:${participant.address}|$record`).slice(0, 40),
          run_id: runId,
          subject_id: `candidate:${participant.address}`,
          subject_kind: 'node',
          field: '$record',
          value: {
            identity_kind: SHARED_MAILBOX_LOCAL.test(participant.address.split('@')[0] ?? '')
              ? 'shared_mailbox'
              : 'person',
            type: 'person',
            title: participant.name,
            props: { emails: [participant.address] },
          },
          citation: {
            source_id: sourceId,
            record_id: recordId,
            external_id: observation.id,
            locator: observation.locator,
            content_hash: observation.contentHash,
          },
          basis: 'explicit',
          confidence: 0.8,
          status: 'proposed',
          observed_at: now,
          valid_from: observation.occurredAt,
          valid_to: null,
          reviewed_at: null,
          reason: 'The address is explicit, but creating a new person requires review.',
        });
      }
    }
    for (const fact of observation.facts) {
      const matches = owners.get(fact.address) ?? [];
      if (matches.length !== 1) continue;
      const target = matches[0]!;
      assertions.push({
        id: sha(`${recordId}|${target.id}|${fact.field}|${JSON.stringify(fact.value)}`).slice(
          0,
          40,
        ),
        run_id: runId,
        subject_id: target.id,
        subject_kind: 'node',
        field: fact.field,
        value: fact.value,
        citation: {
          source_id: sourceId,
          record_id: recordId,
          external_id: observation.id,
          locator: observation.locator,
          content_hash: observation.contentHash,
          excerpt: fact.excerpt,
        },
        basis: 'explicit',
        confidence: fact.confidence,
        status: 'proposed',
        observed_at: now,
        valid_from: observation.occurredAt,
        valid_to: null,
        reviewed_at: null,
        reason: 'Explicit first-person statement.',
      });
    }
  }
  await repository.docBulkPut(
    'source_records',
    records.map((data) => ({ id: data.id, data })),
  );
  await repository.docBulkPut(
    'source_identities',
    identities.map((data) => ({ id: data.id, data })),
  );
  await repository.docBulkPut(
    'evidence_assertions',
    assertions.map((data) => ({ id: data.id, data })),
  );
  let automaticallyApplied = 0;
  for (const assertion of assertions.filter(
    (a) =>
      a.status === 'proposed' &&
      !a.subject_id.startsWith('candidate:') &&
      a.basis === 'explicit' &&
      a.confidence >= 0.95,
  )) {
    const result = await decideAssertion(assertion.id, 'apply', 'system', true);
    if (result.assertion.status === 'accepted') automaticallyApplied += 1;
  }
  const finalAssertions = (
    await repository.docList<EvidenceAssertion>('evidence_assertions')
  ).filter((a) => a.run_id === runId);
  const pending = finalAssertions.filter(
    (a) => a.status === 'proposed' || a.status === 'conflict',
  ).length;
  const completed: ImportRun = {
    ...run,
    status: pending ? 'review' : 'applied',
    finished_at: new Date().toISOString(),
    coverage: {
      ...run.coverage,
      extracted: finalAssertions.length,
      skipped: observations.filter((o) => o.category === 'bulk' || o.category === 'automated')
        .length,
    },
  };
  await repository.docPut('knowledge_runs', run.id, completed);
  return {
    source,
    run: completed,
    records: records.length,
    assertions: finalAssertions.length,
    automaticallyApplied,
    pending,
    limitations,
  };
}
