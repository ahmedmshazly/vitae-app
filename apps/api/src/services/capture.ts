/**
 * Commit a parsed capture plan (SRS §5.1, FR-CAP-001). Turns a single ⌘K line
 * into linked records in one transaction: the primary node, org/person stubs,
 * tags, a KNOWS edge when a person is captured, a note, and a follow-up
 * reminder. Every write is revisioned so the whole capture is a single Undo
 * (FR-002). Ids are pre-allocated so related records can reference each other
 * inside that transaction.
 */
import { parseCapture, type CapturePlan, type EdgeCreateInput, type NodeType } from '@vitae/core';
import { repository } from '../db/repository.js';
import { newId, nowIso } from '../db/util.js';
import { todayIso, userCalendarNow } from '../db/timezone.js';
import { getSelf } from './self.js';
import { searchIndex } from '../db/search-index.js';

export interface CaptureResult {
  plan: CapturePlan;
  created: { nodes: string[]; edges: string[]; reminders: string[]; tags: string[] };
  primaryId: string | null;
}

const NOTE_APPEND = 'note_append';

export async function commitCapture(raw: string, opts: { lastViewedId?: string } = {}): Promise<CaptureResult> {
  // ^today and ^fri are calendar questions, answered in the request timezone
  // (FR-025) — the host clock is a day ahead of some users every night.
  const plan = parseCapture(raw, userCalendarNow());
  const created: CaptureResult['created'] = { nodes: [], edges: [], reminders: [], tags: [] };

  // Note-append mode targets the last-viewed record (SRS FR-CAP-008).
  if (plan.primaryType === NOTE_APPEND) {
    if (!opts.lastViewedId) throw new Error('note-append requires a last-viewed record');
    const node = await repository.getNode(opts.lastViewedId);
    if (!node) throw new Error('last-viewed record not found');
    const appended = `${node.notes_md ? node.notes_md + '\n' : ''}${plan.notes || plan.title}`;
    await repository.updateNode(node.id, { notes_md: appended }, { op: 'append', source: 'manual' });
    searchIndex.markDirty();
    return { plan, created, primaryId: node.id };
  }

  const primaryType = (plan.primaryType === 'unknown' ? 'idea' : plan.primaryType) as NodeType;

  // ── Build and validate the whole plan before touching the database ────────
  const primaryProps: Record<string, unknown> = {};
  if (primaryType === 'link' && plan.url) {
    primaryProps.url = plan.url;
    primaryProps.domain = safeDomain(plan.url);
  }
  const primaryTitle = plan.title || (plan.url ?? 'Untitled');

  const primaryId = repository.allocateId();
  const pending = new Map<string, string>([[primaryId, primaryType]]);

  const nodeInputs: Array<{ id: string; value: ReturnType<typeof repository.parseNodeCreate> }> = [
    {
      id: primaryId,
      value: repository.parseNodeCreate({
        type: primaryType,
        title: primaryTitle,
        notes_md: plan.notes,
        ...(plan.date ? { start_date: plan.date.iso } : {}),
        props: withTypeDefaults(primaryType, primaryProps, plan),
        source: 'manual',
      }),
    },
  ];

  const orgIds: string[] = [];
  for (const orgName of plan.orgs) {
    const id = repository.allocateId();
    orgIds.push(id);
    pending.set(id, 'organization');
    nodeInputs.push({
      id,
      value: repository.parseNodeCreate({
        type: 'organization',
        title: orgName,
        subtitle: 'needs detail',
        source: 'manual',
        confidence: 0.6,
      }),
    });
  }

  const personIds: string[] = [];
  for (const name of plan.people) {
    const id = repository.allocateId();
    personIds.push(id);
    pending.set(id, 'person');
    nodeInputs.push({
      id,
      value: repository.parseNodeCreate({ type: 'person', title: name, source: 'manual', confidence: 0.7 }),
    });
  }

  const self = await getSelf();
  const edgeInputs: EdgeCreateInput[] = [];

  // A captured person becomes a KNOWS relationship with met-context prefilled.
  if (primaryType === 'person' && self && self.id !== primaryId) {
    edgeInputs.push(
      repository.parseEdgeCreate({
        type: 'KNOWS',
        src: self.id,
        dst: primaryId,
        props: {
          met_via: plan.orgs[0] ?? (plan.notes ? plan.notes.slice(0, 80) : undefined),
          topics: plan.tags,
          closeness: 2,
        },
        source: 'manual',
      }),
    );
  }

  // Link primary to captured orgs / people so the graph stays connected.
  for (const orgId of orgIds) {
    edgeInputs.push(
      repository.parseEdgeCreate({
        type: 'RELATES_TO',
        src: primaryId,
        dst: orgId,
        props: { label: 'met at' },
        source: 'manual',
      }),
    );
  }
  for (const pid of personIds) {
    edgeInputs.push(repository.parseEdgeCreate({ type: 'WITH', src: primaryId, dst: pid, source: 'manual' }));
  }

  // ── One transaction: reads first, then every write ─────────────────────────
  await repository.transaction(async (tx) => {
    // READ phase.
    for (const input of edgeInputs) {
      await repository.assertEdgeEndpoints(tx, input, pending);
    }
    // `tags.name` carries a unique index per space, so at most one can match.
    const existingTags = await Promise.all(
      plan.tags.map((name) => repository.docQuery<{ id: string }>('tags', { name }, tx)),
    );

    // WRITE phase.
    for (const { id, value } of nodeInputs) {
      await repository.stageNode(tx, value, {}, { id });
      created.nodes.push(id);
    }
    for (const input of edgeInputs) {
      const edge = await repository.stageEdge(tx, input);
      created.edges.push(edge.id);
    }

    for (const [i, name] of plan.tags.entries()) {
      const existing = existingTags[i]!;
      let tagId: string;
      if (existing.length > 0) {
        tagId = existing[0]!.id;
      } else {
        tagId = newId();
        await repository.docPut('tags', tagId, { id: tagId, name, kind: 'facet', created_at: nowIso() }, {}, tx);
      }
      created.tags.push(tagId);
      const taggingId = newId();
      await repository.docPut('taggings', taggingId, {
        id: taggingId,
        tag_id: tagId,
        subject_kind: 'node',
        subject_id: primaryId,
        created_at: nowIso(),
      }, {}, tx);
    }

    // A dated capture spawns a follow-up reminder (SRS FR-CAP / FR-CON-003).
    if (plan.date) {
      const reminderId = newId();
      await repository.docPut('reminders', reminderId, {
        id: reminderId,
        subject_kind: 'node',
        subject_id: primaryId,
        due_on: plan.date.iso,
        reason: 'follow_up',
        note: plan.notes || primaryTitle,
        status: 'open',
        created_from: 'capture',
        created_at: nowIso(),
      }, {}, tx);
      created.reminders.push(reminderId);
    }
  });

  searchIndex.markDirty();
  return { plan, created, primaryId };
}

function withTypeDefaults(type: NodeType, props: Record<string, unknown>, plan: CapturePlan): Record<string, unknown> {
  if (type === 'task') return { status: 'inbox', ...(plan.priority ? { priority: plan.priority } : {}), ...props };
  if (type === 'idea') return { status: 'spark', ...props };
  if (type === 'journal_entry') return { entry_date: plan.date?.iso ?? todayIso(), ...props };
  if (type === 'goal') return { goal_status: 'active', horizon: 'quarter', ...props };
  if (type === 'habit') return { cadence: 'daily', active: true, ...props };
  return props;
}

function safeDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}
