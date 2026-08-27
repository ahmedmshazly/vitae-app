import { Router } from 'express';
import { z } from 'zod';
import {
  APPLICATION_OUTCOMES,
  applicationDetailResponseSchema,
  applicationListResponseSchema,
  applicationStatusSchema,
  canTransition,
  illegalTransitionMessage,
  validateNodeUpdate,
  type ApplicationAttention,
  type ApplicationDossier,
  type ApplicationEntityRef,
  type ApplicationInterviewSummary,
  type ApplicationResumeSummary,
  type ApplicationStageCounts,
  type ApplicationStatus,
  type ApplicationSummary,
  type ApplicationTargetSummary,
  type EdgeRecord,
  type NodeRecord,
} from '@vitae/core';
import { repository, ValidationError } from '../../db/repository.js';
import { searchIndex } from '../../db/search-index.js';
import { todayIso } from '../../db/timezone.js';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { invalidateDuplicateScan } from '../../services/duplicates.js';

export const applicationsRouter: Router = Router();

// The fourth copy of the outcomes list, and the last one. Which statuses close
// a record decides how this route sorts and what it counts as active, so a
// ninth status reaching the enum and missing this set would quietly file it
// under "still open" forever.
const CLOSED_STATUSES = new Set<ApplicationStatus>(APPLICATION_OUTCOMES);

const EMPTY_COUNTS: ApplicationStageCounts = {
  draft: 0,
  applied: 0,
  screening: 0,
  interview: 0,
  offer: 0,
  rejected: 0,
  withdrawn: 0,
  accepted: 0,
};

interface GraphIndex {
  nodes: Map<string, NodeRecord>;
  outgoing: Map<string, EdgeRecord[]>;
  incoming: Map<string, EdgeRecord[]>;
}

function indexGraph(nodes: NodeRecord[], edges: EdgeRecord[]): GraphIndex {
  const outgoing = new Map<string, EdgeRecord[]>();
  const incoming = new Map<string, EdgeRecord[]>();
  for (const edge of edges) {
    (outgoing.get(edge.src) ?? outgoing.set(edge.src, []).get(edge.src)!).push(edge);
    (incoming.get(edge.dst) ?? incoming.set(edge.dst, []).get(edge.dst)!).push(edge);
  }
  return { nodes: new Map(nodes.map((node) => [node.id, node])), outgoing, incoming };
}

function text(props: Record<string, unknown>, key: string): string | null {
  const value = props[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function integer(props: Record<string, unknown>, key: string): number | null {
  const value = props[key];
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function entityRef(node: NodeRecord | undefined): ApplicationEntityRef | null {
  return node ? { id: node.id, type: node.type, title: node.title } : null;
}

function statusOf(node: NodeRecord): ApplicationStatus {
  const props = node.props as Record<string, unknown>;
  const parsed = applicationStatusSchema.safeParse(props.status ?? props.stage);
  // applicationProps has required this enum since the type shipped. Keeping a
  // defensive fallback lets a legacy bundle remain readable instead of making
  // the entire Career workspace fail because of one pre-schema record.
  return parsed.success ? parsed.data : 'draft';
}

function attentionFor(props: Record<string, unknown>, today: string): ApplicationAttention | null {
  const candidates = [
    text(props, 'next_step_date')
      ? { date: text(props, 'next_step_date')!, source: 'next_step' as const }
      : null,
    text(props, 'deadline')
      ? { date: text(props, 'deadline')!, source: 'deadline' as const }
      : null,
  ]
    .filter((candidate): candidate is { date: string; source: 'next_step' | 'deadline' } =>
      Boolean(candidate),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const first = candidates[0];
  if (!first) return null;
  return {
    ...first,
    kind: first.date < today ? 'overdue' : first.date === today ? 'today' : 'upcoming',
  };
}

function interviewerRefs(interviewId: string, graph: GraphIndex): ApplicationEntityRef[] {
  const refs = new Map<string, ApplicationEntityRef>();
  const edges = [
    ...(graph.outgoing.get(interviewId) ?? []),
    ...(graph.incoming.get(interviewId) ?? []),
  ].filter((edge) => edge.type === 'WITH');
  for (const edge of edges) {
    const otherId = edge.src === interviewId ? edge.dst : edge.src;
    const person = graph.nodes.get(otherId);
    if (person?.type === 'person') refs.set(person.id, entityRef(person)!);
  }
  return [...refs.values()];
}

function interviewSummary(node: NodeRecord, graph: GraphIndex): ApplicationInterviewSummary {
  const props = node.props as Record<string, unknown>;
  return {
    id: node.id,
    title: node.title,
    round: text(props, 'round'),
    stage_no: integer(props, 'stage_no'),
    format: text(props, 'format'),
    scheduled_at: text(props, 'scheduled_at'),
    outcome: text(props, 'outcome'),
    prep_notes: text(props, 'prep_notes'),
    reflection: text(props, 'reflection'),
    interviewers: interviewerRefs(node.id, graph),
  };
}

function interviewsFor(applicationId: string, graph: GraphIndex): ApplicationInterviewSummary[] {
  return (graph.incoming.get(applicationId) ?? [])
    .filter((edge) => edge.type === 'INTERVIEW_FOR')
    .map((edge) => graph.nodes.get(edge.src))
    .filter((node): node is NodeRecord => node?.type === 'interview')
    .map((node) => interviewSummary(node, graph))
    .sort((a, b) => {
      if (a.stage_no != null || b.stage_no != null)
        return (a.stage_no ?? 999) - (b.stage_no ?? 999);
      return comparableInterviewTime(a.scheduled_at) - comparableInterviewTime(b.scheduled_at);
    });
}

const TERMINAL_INTERVIEW_OUTCOMES = new Set(['cancelled', 'passed', 'failed']);

/** ISO strings with offsets do not sort chronologically as text. Invalid or
 * missing timestamps belong at the end of a history and never qualify as the
 * next interview. */
function comparableInterviewTime(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

function nextInterviewFor(
  interviews: ApplicationInterviewSummary[],
  now = Date.now(),
): ApplicationInterviewSummary | null {
  return (
    interviews
      .map((interview) => ({
        interview,
        timestamp: comparableInterviewTime(interview.scheduled_at),
      }))
      .filter(
        ({ interview, timestamp }) =>
          Number.isFinite(timestamp) &&
          timestamp >= now &&
          !TERMINAL_INTERVIEW_OUTCOMES.has(interview.outcome ?? ''),
      )
      .sort((a, b) => a.timestamp - b.timestamp)[0]?.interview ?? null
  );
}

function linkedNode(
  applicationId: string,
  graph: GraphIndex,
  edgeType: string,
  nodeType: string,
): NodeRecord | undefined {
  for (const edge of graph.outgoing.get(applicationId) ?? []) {
    if (edge.type !== edgeType) continue;
    const node = graph.nodes.get(edge.dst);
    if (node?.type === nodeType) return node;
  }
  return undefined;
}

function summaryFor(node: NodeRecord, graph: GraphIndex, today: string): ApplicationSummary {
  const props = node.props as Record<string, unknown>;
  const interviews = interviewsFor(node.id, graph);
  return {
    id: node.id,
    title: node.title,
    role_title: text(props, 'role_title') ?? node.title,
    status: statusOf(node),
    organization: entityRef(linkedNode(node.id, graph, 'APPLIED_TO', 'organization')),
    referred_by: entityRef(linkedNode(node.id, graph, 'REFERRED_BY', 'person')),
    applied_on: text(props, 'applied_on'),
    deadline: text(props, 'deadline'),
    next_step: text(props, 'next_step'),
    next_step_date: text(props, 'next_step_date'),
    channel: text(props, 'channel'),
    location_mode: text(props, 'location_mode'),
    salary_range: text(props, 'salary_range'),
    job_url: text(props, 'job_url'),
    target_id: text(props, 'target_id'),
    resume_id: text(props, 'resume_id'),
    interview_count: interviews.length,
    next_interview: nextInterviewFor(interviews),
    attention: attentionFor(props, today),
    notes_md: node.notes_md,
    source: node.source,
    created_at: node.created_at,
    updated_at: node.updated_at,
  };
}

function postingFor(applicationId: string, graph: GraphIndex) {
  const posting = linkedNode(applicationId, graph, 'RELATES_TO', 'job_posting');
  if (!posting) return null;
  const props = posting.props as Record<string, unknown>;
  return {
    id: posting.id,
    title: posting.title,
    company: text(props, 'company'),
    location: text(props, 'location'),
    location_mode: text(props, 'location_mode'),
    employment_type: text(props, 'employment_type'),
    deadline: text(props, 'deadline'),
    url: text(props, 'url'),
    source: text(props, 'source'),
  };
}

function targetSummary(raw: Record<string, unknown> | null): ApplicationTargetSummary | null {
  if (!raw || typeof raw.id !== 'string' || typeof raw.role_title !== 'string') return null;
  return {
    id: raw.id,
    company: typeof raw.company === 'string' ? raw.company : null,
    company_node: typeof raw.company_node === 'string' ? raw.company_node : null,
    role_title: raw.role_title,
    jd_url: typeof raw.jd_url === 'string' ? raw.jd_url : null,
    status: typeof raw.status === 'string' ? raw.status : null,
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : null,
  };
}

function resumeSummary(raw: Record<string, unknown> | null): ApplicationResumeSummary | null {
  if (
    !raw ||
    typeof raw.id !== 'string' ||
    typeof raw.name !== 'string' ||
    typeof raw.status !== 'string'
  )
    return null;
  return {
    id: raw.id,
    name: raw.name,
    status: raw.status,
    template_key: typeof raw.template_key === 'string' ? raw.template_key : null,
    sent_at: typeof raw.sent_at === 'string' ? raw.sent_at : null,
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : null,
  };
}

async function graphSnapshot(): Promise<{ applications: NodeRecord[]; graph: GraphIndex }> {
  const [nodes, edges] = await Promise.all([repository.allLiveNodes(), repository.allLiveEdges()]);
  return {
    applications: nodes.filter((node) => node.type === 'application'),
    graph: indexGraph(nodes, edges),
  };
}

/**
 * The whole dossier for one application. Every write returns this, so a create,
 * an edit and a transition all hand back exactly what the next
 * `GET /applications/:id` would say, and no client has to guess how the server
 * re-derived the record it just changed.
 */
async function dossierFor(id: string): Promise<ApplicationDossier> {
  const { applications, graph } = await graphSnapshot();
  const node = applications.find((application) => application.id === id);
  if (!node) throw new HttpError(404, 'NOT_FOUND', 'Application not found.');
  const summary = summaryFor(node, graph, todayIso());
  const [target, resume] = await Promise.all([
    summary.target_id
      ? repository.docGet<Record<string, unknown>>('targets', summary.target_id)
      : Promise.resolve(null),
    summary.resume_id
      ? repository.docGet<Record<string, unknown>>('resumes', summary.resume_id)
      : Promise.resolve(null),
  ]);
  return {
    ...summary,
    posting: postingFor(node.id, graph),
    interviews: interviewsFor(node.id, graph),
    target: targetSummary(target),
    resume: resumeSummary(resume),
  };
}

/**
 * The status machine, applied to a node update.
 *
 * Returns the sentence to refuse with, or null when there is nothing to refuse.
 * Three cases deliberately return null. Props that do not mention a status say
 * nothing about a move. A status equal to the stored one is a re-save, not a
 * transition, and refusing it would make an ordinary edit to a rejected
 * application impossible. And a stored status the enum cannot read falls back
 * through `statusOf` to `draft`, the head of the pipeline, which leaves every
 * forward move open: the read path already refuses to let one pre-schema record
 * break the workspace, and the write path must not turn that same record into
 * one nobody can edit.
 *
 * `nodes.ts` calls this as well. A guard the generic PATCH does not run is not
 * a guard at all, only a front door with the back door standing open.
 */
export function applicationTransitionRefusal(
  existing: NodeRecord,
  incomingProps: Record<string, unknown> | undefined,
): string | null {
  if (existing.type !== 'application' || !incomingProps) return null;
  const incoming = applicationStatusSchema.safeParse(incomingProps.status);
  // An unreadable incoming status is the props schema's refusal to make, not
  // this one's; saying "cannot move to Applied?" about a value that never
  // parsed would name a move nobody attempted.
  if (!incoming.success) return null;
  const from = statusOf(existing);
  if (canTransition(from, incoming.data)) return null;
  return illegalTransitionMessage(from, incoming.data);
}

/**
 * The props an edit leaves behind.
 *
 * The generic node PATCH replaces `props` wholesale, so changing a deadline
 * means resending every other field and anything the caller left out is gone.
 * A first-class editor merges instead. An explicit `null` clears a key, because
 * a merge that only ever adds would leave no way to unset a deadline once one
 * had been recorded.
 */
function mergedProps(
  stored: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...stored };
  for (const [key, value] of Object.entries(incoming)) {
    if (value === null) delete merged[key];
    else merged[key] = value;
  }
  return merged;
}

/** The application this id names, or a 404. Deleted records have no write path. */
async function liveApplication(id: string): Promise<NodeRecord> {
  const node = await repository.getNode(id);
  if (!node || node.type !== 'application') {
    throw new HttpError(404, 'NOT_FOUND', 'Application not found.');
  }
  return node;
}

const statusChangeSchema = z.object({
  status: applicationStatusSchema,
  /**
   * Record a correction rather than a move. An operator who mis-set a status to
   * `rejected` would otherwise be held there forever by the guard, and a guard
   * that makes true data unfixable is worse than no guard at all.
   */
  correction: z.boolean().optional(),
});

function fieldErrors(error: z.ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

/** The complete application runway, including terminal outcomes. */
applicationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const statusQuery = typeof req.query.status === 'string' ? req.query.status : '';
    if (statusQuery && !applicationStatusSchema.safeParse(statusQuery).success) {
      throw new HttpError(422, 'VALIDATION', 'Unknown application status.');
    }
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const { applications: nodes, graph } = await graphSnapshot();
    const all = nodes
      .map((node) => summaryFor(node, graph, todayIso()))
      .sort((a, b) => {
        const aClosed = Number(CLOSED_STATUSES.has(a.status));
        const bClosed = Number(CLOSED_STATUSES.has(b.status));
        return (
          aClosed - bClosed ||
          (a.attention?.date ?? '9999').localeCompare(b.attention?.date ?? '9999') ||
          b.updated_at.localeCompare(a.updated_at)
        );
      });
    const counts = { ...EMPTY_COUNTS };
    for (const application of all) counts[application.status] += 1;

    const applications = all.filter((application) => {
      if (statusQuery && application.status !== statusQuery) return false;
      if (!q) return true;
      return `${application.title} ${application.role_title} ${application.organization?.title ?? ''} ${application.next_step ?? ''}`
        .toLowerCase()
        .includes(q);
    });
    res.json(
      applicationListResponseSchema.parse({
        applications,
        counts,
        total: all.length,
        active: all.filter((application) => !CLOSED_STATUSES.has(application.status)).length,
        needs_attention: all.filter(
          (application) =>
            !CLOSED_STATUSES.has(application.status) &&
            (application.attention?.kind === 'overdue' || application.attention?.kind === 'today'),
        ).length,
      }),
    );
  }),
);

/** One application with every linked artifact and relationship the graph has. */
applicationsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(
      applicationDetailResponseSchema.parse({ application: await dossierFor(req.params.id) }),
    );
  }),
);

/**
 * Create an application (FR-CAR-003). Until this existed the only way to make
 * one was `POST /nodes`, which knows nothing about applications beyond the
 * props schema.
 *
 * Any status the enum holds is a legal starting point. An application entered
 * after the fact may already have been rejected, and a create endpoint that
 * insisted every record begin at `draft` would be refusing to record something
 * that happened. The machine governs moves between statuses, not the first one.
 */
applicationsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const props = (body.props ?? {}) as Record<string, unknown>;
    // A record whose name would only ever be its role title should not have to
    // repeat it. This is one stated fact under two keys, not a title invented
    // for a record that has none: with neither, the envelope still refuses.
    const title =
      typeof body.title === 'string' && body.title.trim() ? body.title : props.role_title;
    const node = await repository.createNode(
      { ...body, type: 'application', title },
      { actor: req.user?.email },
    );
    searchIndex.markDirty();
    await invalidateDuplicateScan();
    res
      .status(201)
      .json(applicationDetailResponseSchema.parse({ application: await dossierFor(node.id) }));
  }),
);

/**
 * Edit an application (FR-CAR-003).
 *
 * `props` merges onto what is stored rather than replacing it, so a caller can
 * change a deadline without resending the role title, and a `null` clears a
 * field. A status that moves is put through the same machine as the dedicated
 * status endpoint; there is no correction here, because correcting a status is
 * a different act from editing the record and gets its own door.
 */
applicationsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await liveApplication(req.params.id);
    const { props: incoming, ...envelope } = (req.body ?? {}) as Record<string, unknown>;
    const objectProps =
      typeof incoming === 'object' && incoming !== null && !Array.isArray(incoming);
    if (incoming !== undefined && !objectProps) {
      throw new ValidationError('invalid application update', [
        { path: 'props', message: 'props must be an object' },
      ]);
    }
    const stored = existing.props as Record<string, unknown>;
    const update = objectProps
      ? { ...envelope, props: mergedProps(stored, incoming as Record<string, unknown>) }
      : envelope;

    const parsed = validateNodeUpdate('application', update);
    if (!parsed.ok) throw new ValidationError('invalid application update', parsed.errors);
    const refusal = applicationTransitionRefusal(existing, parsed.value.props);
    if (refusal) throw new HttpError(422, 'ILLEGAL_TRANSITION', refusal);

    await repository.updateNode(existing.id, parsed.value, { actor: req.user?.email });
    searchIndex.markDirty();
    await invalidateDuplicateScan();
    res.json(applicationDetailResponseSchema.parse({ application: await dossierFor(existing.id) }));
  }),
);

/**
 * Record a status change (FR-CAR-003).
 *
 * A move the machine refuses comes back as a 422 naming both ends of it. A
 * correction skips the machine and is marked in the revision it writes, so the
 * two acts stay distinguishable in the ledger afterwards: a transition is
 * sourced `manual` like any other edit, a correction is sourced `correction`,
 * and both carry the `props.status` from/to pair in their diff. Marking it that
 * way costs nothing and answers the only question the history could not
 * otherwise answer, which is whether the record moved or whether the last
 * entry had simply been wrong.
 */
applicationsRouter.post(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const parsed = statusChangeSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new ValidationError('invalid status change', fieldErrors(parsed.error));
    }
    const existing = await liveApplication(req.params.id);
    const props = existing.props as Record<string, unknown>;
    const from = statusOf(existing);
    const to = parsed.data.status;
    const correction = parsed.data.correction === true;
    // Compared against what is stored, not against what `statusOf` could read
    // out of it. A legacy record holding an unparseable status reads as `draft`,
    // and correcting one of those to `draft` is the one case where the two
    // differ: nothing appears to change, yet the unreadable value is exactly
    // what the operator is here to replace.
    const unchanged = props.status === to;

    if (!unchanged) {
      if (!correction && !canTransition(from, to)) {
        throw new HttpError(422, 'ILLEGAL_TRANSITION', illegalTransitionMessage(from, to));
      }
      await repository.updateNode(
        existing.id,
        { props: { ...props, status: to } },
        { actor: req.user?.email, source: correction ? 'correction' : 'manual' },
      );
      searchIndex.markDirty();
      await invalidateDuplicateScan();
    }

    res.json({
      ...applicationDetailResponseSchema.parse({ application: await dossierFor(existing.id) }),
      // A status resubmitted as itself changes nothing, so nothing is written:
      // a revision recording a move that did not happen would be a false entry
      // in a history whose whole value is that every line is true.
      transition: { from, to, correction, recorded: !unchanged },
    });
  }),
);
