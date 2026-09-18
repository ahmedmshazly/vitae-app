import {
  evidenceAssertionSchema,
  importRunSchema,
  normalizedEmail,
  reconcileField,
  reconciliationDecisionSchema,
  sourceConnectionSchema,
  sourceIdentitySchema,
  sourceRecordSchema,
  type EvidenceAssertion,
  type ImportRun,
  type KnowledgeSummary,
  type ReconciliationDecision,
  type SourceConnection,
  type SourceIdentity,
  type SourceRecord,
} from '@vitae/core';
import { repository, RevisionConflictError } from '../db/repository.js';

function pathGet(value: Record<string, unknown>, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (current, key) =>
        current && typeof current === 'object'
          ? (current as Record<string, unknown>)[key]
          : undefined,
      value,
    );
}

function nodePatch(
  field: string,
  value: unknown,
  props: Record<string, unknown>,
): Record<string, unknown> {
  if (!field.startsWith('props.')) return { [field]: value };
  const parts = field.slice(6).split('.');
  const next = structuredClone(props);
  let cursor = next;
  for (const key of parts.slice(0, -1)) {
    const child = cursor[key];
    cursor[key] =
      child && typeof child === 'object' && !Array.isArray(child)
        ? { ...(child as Record<string, unknown>) }
        : {};
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[parts.at(-1)!] = value;
  return { props: next };
}

export async function listKnowledge(): Promise<{
  sources: SourceConnection[];
  runs: ImportRun[];
  assertions: Array<EvidenceAssertion & { current_value?: unknown }>;
  decisions: ReconciliationDecision[];
  subjects: Record<string, { id: string; type: string; title: string }>;
}> {
  const [sources, runs, rawAssertions, decisions, nodes] = await Promise.all([
    repository.docList<SourceConnection>('knowledge_sources'),
    repository.docList<ImportRun>('knowledge_runs'),
    repository.docList<EvidenceAssertion>('evidence_assertions'),
    repository.docList<ReconciliationDecision>('reconciliation_decisions'),
    repository.allLiveNodes(),
  ]);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const assertions = rawAssertions.map((assertion) => {
    const node = byId.get(assertion.subject_id);
    return node && !assertion.field.startsWith('$')
      ? {
          ...assertion,
          current_value: pathGet(node as unknown as Record<string, unknown>, assertion.field),
        }
      : assertion;
  });
  runs.sort((a, b) => b.started_at.localeCompare(a.started_at));
  assertions.sort((a, b) => b.observed_at.localeCompare(a.observed_at));
  return {
    sources,
    runs,
    assertions,
    decisions,
    subjects: Object.fromEntries(
      nodes.map((node) => [node.id, { id: node.id, type: node.type, title: node.title }]),
    ),
  };
}

export async function knowledgeSummary(): Promise<KnowledgeSummary> {
  const [all, records, identities] = await Promise.all([
    listKnowledge(),
    repository.docList<SourceRecord>('source_records'),
    repository.docList<SourceIdentity>('source_identities'),
  ]);
  const months = new Map<string, { inbound: number; outbound: number; total: number }>();
  const dated = records
    .filter((record) => record.occurred_at)
    .sort((a, b) => a.occurred_at!.localeCompare(b.occurred_at!));
  for (const record of dated) {
    const month = record.occurred_at!.slice(0, 7);
    const row = months.get(month) ?? { inbound: 0, outbound: 0, total: 0 };
    row.total += 1;
    if (record.direction === 'in') row.inbound += 1;
    if (record.direction === 'out') row.outbound += 1;
    months.set(month, row);
  }
  return {
    sources: all.sources.length,
    runs: all.runs.length,
    records: records.length,
    messages: records.filter((r) => r.kind === 'message').length,
    attachments: records.filter((r) => r.kind === 'attachment').length,
    linked_entities: new Set(identities.map((identity) => identity.entity_id)).size,
    pending: all.assertions.filter((a) => a.status === 'proposed').length,
    conflicts: all.assertions.filter((a) => a.status === 'conflict').length,
    inbound: records.filter((r) => r.direction === 'in').length,
    outbound: records.filter((r) => r.direction === 'out').length,
    human_messages: records.filter((r) => r.category === 'human').length,
    career_messages: records.filter((r) => r.category === 'career').length,
    first_at: dated[0]?.occurred_at ?? null,
    last_at: dated.at(-1)?.occurred_at ?? null,
    months: [...months].map(([month, row]) => ({ month, ...row })),
  };
}

export async function putSource(input: unknown): Promise<SourceConnection> {
  const source = sourceConnectionSchema.parse(input);
  await repository.docPut('knowledge_sources', source.id, source);
  return source;
}
export async function putRun(input: unknown): Promise<ImportRun> {
  const run = importRunSchema.parse(input);
  await repository.docPut('knowledge_runs', run.id, run);
  return run;
}
export async function putSourceRecord(input: unknown): Promise<SourceRecord> {
  const record = sourceRecordSchema.parse(input);
  await repository.docPut('source_records', record.id, record);
  return record;
}
export async function putSourceIdentity(input: unknown): Promise<SourceIdentity> {
  const identity = sourceIdentitySchema.parse(input);
  await repository.docPut('source_identities', identity.id, identity);
  return identity;
}
export async function putAssertion(input: unknown): Promise<EvidenceAssertion> {
  const assertion = evidenceAssertionSchema.parse(input);
  await repository.docPut('evidence_assertions', assertion.id, assertion);
  return assertion;
}

/**
 * The evidence ledger deliberately exposes compact source records only. It is
 * paged so a mailbox import with thousands of messages never becomes a
 * multi-megabyte dashboard request.
 */
export async function listSourceRecords(options: {
  source_id?: string;
  run_id?: string;
  direction?: SourceRecord['direction'];
  category?: string;
  limit: number;
  offset: number;
}): Promise<{ records: SourceRecord[]; total: number }> {
  const filtered = (await repository.docList<SourceRecord>('source_records'))
    .filter((record) => !options.source_id || record.source_id === options.source_id)
    .filter((record) => !options.run_id || record.run_id === options.run_id)
    .filter((record) => !options.direction || record.direction === options.direction)
    .filter((record) => !options.category || record.category === options.category)
    // Missing message dates are a recorded extraction limitation. Put those
    // after dated correspondence instead of making them appear newest merely
    // because Vitae learned about every record in the same import run.
    .sort((a, b) => {
      if (a.occurred_at && !b.occurred_at) return -1;
      if (!a.occurred_at && b.occurred_at) return 1;
      return (b.occurred_at ?? b.learned_at).localeCompare(a.occurred_at ?? a.learned_at);
    });
  return {
    records: filtered.slice(options.offset, options.offset + options.limit),
    total: filtered.length,
  };
}

export async function evidenceFor(
  subjectId: string,
): Promise<{ assertions: EvidenceAssertion[]; records: Record<string, SourceRecord> }> {
  const assertions = (await repository.docList<EvidenceAssertion>('evidence_assertions')).filter(
    (a) => a.subject_id === subjectId,
  );
  const ids = new Set(assertions.map((a) => a.citation.record_id));
  const records = Object.fromEntries(
    (await repository.docList<SourceRecord>('source_records'))
      .filter((r) => ids.has(r.id))
      .map((r) => [r.id, r]),
  );
  return { assertions, records };
}

export async function decideAssertion(
  assertionId: string,
  choice: 'apply' | 'reject' | 'defer',
  actor?: string,
  automatic = false,
): Promise<{
  assertion: EvidenceAssertion;
  decision: ReconciliationDecision;
}> {
  const assertion = await repository.docGet<EvidenceAssertion>('evidence_assertions', assertionId);
  if (!assertion) throw new Error('assertion not found');
  if (assertion.status === 'accepted' || assertion.status === 'rejected')
    throw new RevisionConflictError('assertion has already been decided');
  const now = new Date().toISOString();
  let next: EvidenceAssertion = {
    ...assertion,
    reviewed_at: choice === 'defer' ? null : now,
    reviewed_by: actor,
  };
  const decision: ReconciliationDecision = reconciliationDecisionSchema.parse({
    id: repository.allocateId(),
    run_id: assertion.run_id,
    assertion_id: assertion.id,
    kind: choice,
    reason:
      choice === 'apply'
        ? 'Accepted into the curated graph'
        : choice === 'reject'
          ? 'Rejected during reconciliation'
          : 'Left for later review',
    automatic,
    decided_at: now,
    decided_by: actor,
    changes: [],
    reversed_at: null,
  });
  if (choice === 'apply') {
    if (
      assertion.subject_kind === 'node' &&
      assertion.subject_id.startsWith('candidate:') &&
      assertion.field === '$record'
    ) {
      const value = assertion.value as Record<string, unknown>;
      if (
        value.type !== 'person' ||
        value.identity_kind !== 'person' ||
        typeof value.title !== 'string'
      )
        throw new Error('this identity candidate cannot create a supported entity');
      const props =
        value.props && typeof value.props === 'object'
          ? (value.props as Record<string, unknown>)
          : {};
      const emails = Array.isArray(props.emails)
        ? props.emails.filter((email): email is string => typeof email === 'string')
        : [];
      await repository.transaction(async (tx) => {
        const parsed = repository.parseNodeCreate({
          type: 'person',
          title: value.title,
          props,
          identity_keys: emails.map((email) => `email:person:${normalizedEmail(email)}`),
          source: 'import_gmail',
          source_ref: assertion.run_id,
          confidence: assertion.confidence,
        });
        const node = await repository.stageNode(tx, parsed, {
          actor,
          source: 'import_gmail',
        });
        next = {
          ...next,
          subject_id: node.id,
          status: 'accepted',
          applied_revision: node.rev,
          reason: 'Created after identity review.',
        };
        decision.kind = 'create_entity';
        decision.target_id = node.id;
        decision.changes = [
          {
            subject_kind: 'node',
            subject_id: node.id,
            field: '$record',
            after: node,
            applied_revision: node.rev,
          },
        ];
        for (const email of emails) {
          const normalized = normalizedEmail(email);
          await repository.docPut(
            'source_identities',
            `${assertion.citation.source_id}:email:${normalized}`,
            {
              id: `${assertion.citation.source_id}:email:${normalized}`,
              source_id: assertion.citation.source_id,
              entity_id: node.id,
              entity_kind: 'person',
              scheme: 'email',
              value: email,
              normalized_value: normalized,
              verified: true,
              is_self: false,
              created_at: now,
            },
            {},
            tx,
          );
        }
        await repository.docPut('evidence_assertions', next.id, next, {}, tx);
        await repository.docPut('reconciliation_decisions', decision.id, decision, {}, tx);
      });
      return { assertion: next, decision };
    }
    if (assertion.subject_kind !== 'node' || assertion.field.startsWith('$'))
      throw new Error('this assertion cannot be applied as a node field');
    await repository.transaction(async (tx) => {
      const node = await repository.getNode(
        assertion.subject_id,
        { includeDeleted: true, forUpdate: true },
        tx,
      );
      if (!node) throw new Error('assertion subject not found');
      const current = pathGet(node as unknown as Record<string, unknown>, assertion.field);
      const reconciled = reconcileField(current, assertion.value);
      if (reconciled.status === 'conflict') {
        next = {
          ...next,
          status: 'conflict',
          reason: 'The curated value is nonempty and differs from this source.',
        };
        decision.kind = 'defer';
        decision.reason = next.reason;
        return;
      }
      if (reconciled.status === 'complement') {
        const updated = await repository.stageNodeUpdate(
          tx,
          node,
          nodePatch(assertion.field, reconciled.value, node.props as Record<string, unknown>),
          { actor, source: 'import_gmail' },
        );
        next = { ...next, status: 'accepted', applied_revision: updated.rev };
        decision.target_id = node.id;
        decision.expected_revision = node.rev;
        decision.changes = [
          {
            subject_kind: 'node',
            subject_id: node.id,
            field: assertion.field,
            before: current,
            after: reconciled.value,
            applied_revision: updated.rev,
          },
        ];
      } else
        next = {
          ...next,
          status: 'accepted',
          reason: 'The curated graph already held the same value.',
        };
      await repository.docPut('evidence_assertions', next.id, next, {}, tx);
      await repository.docPut('reconciliation_decisions', decision.id, decision, {}, tx);
    });
    // Conflict exits the transaction before its shared writes above.
    if (next.status === 'conflict') {
      await repository.docPut('evidence_assertions', next.id, next);
      await repository.docPut('reconciliation_decisions', decision.id, decision);
    }
  } else {
    next = { ...next, status: choice === 'reject' ? 'rejected' : 'proposed' };
    await repository.docPut('evidence_assertions', next.id, next);
    await repository.docPut('reconciliation_decisions', decision.id, decision);
  }
  return { assertion: next, decision };
}

export async function rollbackRun(
  runId: string,
  actor?: string,
): Promise<{ restored: number; refused: Array<{ subject_id: string; reason: string }> }> {
  const decisions = (
    await repository.docList<ReconciliationDecision>('reconciliation_decisions')
  ).filter(
    (d) =>
      d.run_id === runId && (d.kind === 'apply' || d.kind === 'create_entity') && !d.reversed_at,
  );
  let restored = 0;
  const refused: Array<{ subject_id: string; reason: string }> = [];
  for (const decision of decisions.reverse())
    for (const change of [...decision.changes].reverse()) {
      if (change.subject_kind !== 'node') continue;
      await repository.transaction(async (tx) => {
        const node = await repository.getNode(
          change.subject_id,
          { includeDeleted: true, forUpdate: true },
          tx,
        );
        if (decision.kind === 'create_entity' && change.field === '$record') {
          if (!node || node.rev !== change.applied_revision || node.deleted_at) {
            refused.push({
              subject_id: change.subject_id,
              reason: 'The created record changed after this run; rollback preserved it.',
            });
            return;
          }
          await repository.stageNodeUpdate(
            tx,
            node,
            { deleted_at: new Date().toISOString() },
            { actor, source: 'system', op: 'delete' },
          );
          restored += 1;
          await repository.docPut(
            'reconciliation_decisions',
            decision.id,
            { ...decision, reversed_at: new Date().toISOString() },
            {},
            tx,
          );
          return;
        }
        if (
          !node ||
          node.rev !== change.applied_revision ||
          JSON.stringify(pathGet(node as unknown as Record<string, unknown>, change.field)) !==
            JSON.stringify(change.after)
        ) {
          refused.push({
            subject_id: change.subject_id,
            reason: 'The record changed after this run; rollback preserved the later edit.',
          });
          return;
        }
        await repository.stageNodeUpdate(
          tx,
          node,
          nodePatch(change.field, change.before, node.props as Record<string, unknown>),
          { actor, source: 'system' },
        );
        restored += 1;
        const reversed = { ...decision, reversed_at: new Date().toISOString() };
        await repository.docPut('reconciliation_decisions', decision.id, reversed, {}, tx);
      });
    }
  const run = await repository.docGet<ImportRun>('knowledge_runs', runId);
  if (run)
    await repository.docPut('knowledge_runs', run.id, {
      ...run,
      status: 'rolled_back',
      finished_at: new Date().toISOString(),
    });
  return { restored, refused };
}
