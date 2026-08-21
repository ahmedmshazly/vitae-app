import { Router } from 'express';
import {
  applicationDetailResponseSchema,
  applicationListResponseSchema,
  applicationStatusSchema,
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
import { repository } from '../../db/repository.js';
import { todayIso } from '../../db/timezone.js';
import { asyncHandler, HttpError } from '../../middleware/error.js';

export const applicationsRouter: Router = Router();

const CLOSED_STATUSES = new Set<ApplicationStatus>(['rejected', 'withdrawn', 'accepted']);

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
    const { applications, graph } = await graphSnapshot();
    const node = applications.find((application) => application.id === req.params.id);
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
    const dossier: ApplicationDossier = {
      ...summary,
      posting: postingFor(node.id, graph),
      interviews: interviewsFor(node.id, graph),
      target: targetSummary(target),
      resume: resumeSummary(resume),
    };
    res.json(applicationDetailResponseSchema.parse({ application: dossier }));
  }),
);
