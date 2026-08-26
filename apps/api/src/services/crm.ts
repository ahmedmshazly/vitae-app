/**
 * CRM orchestration (SRS §6.3): assembles the life graph from Postgres and
 * feeds the deterministic algorithms in @vitae/core, tie strength (§10.7.1),
 * reconnect ordering (§10.7.2), and who-to-call ranking with Personalized
 * PageRank (§10.7.3). All computation is in-memory over the live graph, which
 * is well within budget at single-user scale (SRS A5).
 */
import {
  brokerTally,
  computeTieStrength,
  correspondenceProfile,
  introductionTally,
  normalizeForMatch,
  personalizedPageRank,
  rankReactivation,
  rankReconnect,
  whoToCall,
  type BrokerTally,
  type CandidatePerson,
  type CorrespondenceProfile,
  type EdgeRecord,
  type GraphEdge,
  type Intent,
  type InteractionEvent,
  type NodeRecord,
  type ProfileEvent,
  type RankedPerson,
  type RankOptions,
  CORRESPONDENCE,
  PAGERANK,
} from '@vitae/core';
import { repository } from '../db/repository.js';
import { getSelf } from './self.js';
import { buildOwnerIndex, ownableFrom } from './subjects.js';

export interface Graph {
  nodes: Map<string, NodeRecord>;
  edges: EdgeRecord[];
  bySrc: Map<string, EdgeRecord[]>;
  byDst: Map<string, EdgeRecord[]>;
}

export async function loadGraph(): Promise<Graph> {
  const [nodes, edges] = await Promise.all([repository.allLiveNodes(), repository.allLiveEdges()]);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const bySrc = new Map<string, EdgeRecord[]>();
  const byDst = new Map<string, EdgeRecord[]>();
  for (const e of edges) {
    (bySrc.get(e.src) ?? bySrc.set(e.src, []).get(e.src)!).push(e);
    (byDst.get(e.dst) ?? byDst.set(e.dst, []).get(e.dst)!).push(e);
  }
  return { nodes: nodeMap, edges, bySrc, byDst };
}

function neighbors(graph: Graph, nodeId: string, type: string, dir: 'out' | 'in'): EdgeRecord[] {
  const list = (dir === 'out' ? graph.bySrc : graph.byDst).get(nodeId) ?? [];
  return list.filter((e) => e.type === type);
}

/** Interactions a person was present at (via WITH edges). */
function interactionsFor(graph: Graph, personId: string): NodeRecord[] {
  const withEdges = neighbors(graph, personId, 'WITH', 'in'); // interaction -WITH-> person
  return withEdges
    .map((e) => graph.nodes.get(e.src))
    .filter((n): n is NodeRecord => Boolean(n) && n!.type === 'interaction');
}

function knowsEdge(graph: Graph, selfId: string, personId: string): EdgeRecord | undefined {
  return graph.edges.find(
    (e) =>
      e.type === 'KNOWS' &&
      ((e.src === selfId && e.dst === personId) || (e.src === personId && e.dst === selfId)),
  );
}

function toEvents(interactions: NodeRecord[]): InteractionEvent[] {
  return interactions
    .map((i) => {
      const props = i.props as Record<string, unknown>;
      return { kind: (props.kind as string) ?? 'message', occurredAt: (props.occurred_at as string) ?? i.created_at };
    })
    .filter((e) => e.occurredAt);
}

/**
 * The KNOWS edge between self and a person (favor ledger + closeness live here).
 *
 * `preloaded` follows the same contract as reconnectLane's: loadGraph() reads
 * every node and every edge, so a caller that needs two of these helpers should
 * load once and thread it rather than pay for the graph twice in one request.
 */
export async function findKnowsEdge(personId: string, preloaded?: Graph): Promise<EdgeRecord | undefined> {
  const graph = preloaded ?? (await loadGraph());
  const self = await getSelf();
  return self ? knowsEdge(graph, self.id, personId) : undefined;
}

export async function personStrength(
  personId: string,
  preloaded?: Graph,
): Promise<ReturnType<typeof computeTieStrength>> {
  const graph = preloaded ?? (await loadGraph());
  const self = await getSelf();
  const interactions = interactionsFor(graph, personId);
  const knows = self ? knowsEdge(graph, self.id, personId) : undefined;
  const props = (knows?.props ?? {}) as Record<string, unknown>;
  return computeTieStrength({
    closeness: (props.closeness as number) ?? null,
    cadenceTargetDays: (props.cadence_target_days as number) ?? null,
    interactions: toEvents(interactions),
  });
}

/**
 * Recompute and persist a KNOWS edge's derived strength + last_interaction_at.
 *
 * A `preloaded` graph must have been read AFTER whatever write prompted the
 * recompute, the interaction being scored has to be in it. The values written
 * (`strength`, `last_interaction_at`) are outputs, never inputs to
 * computeTieStrength, so this write does not invalidate the caller's graph for
 * a subsequent personStrength() on the same person.
 */
export async function recomputeAndPersistStrength(personId: string, preloaded?: Graph): Promise<void> {
  const graph = preloaded ?? (await loadGraph());
  const self = await getSelf();
  if (!self) return;
  const knows = knowsEdge(graph, self.id, personId);
  if (!knows) return;
  const interactions = interactionsFor(graph, personId);
  const props = (knows.props ?? {}) as Record<string, unknown>;
  const s = computeTieStrength({
    closeness: (props.closeness as number) ?? null,
    cadenceTargetDays: (props.cadence_target_days as number) ?? null,
    interactions: toEvents(interactions),
  });
  await repository.updateEdge(
    knows.id,
    { props: { ...props, strength: s.strength, last_interaction_at: s.lastInteractionAt } },
    { op: 'update', source: 'system' },
  );
}

function computePpr(graph: Graph, selfId: string): Map<string, number> {
  const nodeIds = [...graph.nodes.keys()];
  const pprEdges: GraphEdge[] = [];
  for (const e of graph.edges) {
    const weight =
      e.type === 'KNOWS' ? ((e.props as Record<string, unknown>).closeness as number ?? 3) / 5 + 0.2 : 1;
    // Add both directions so proximity is symmetric for undirected relations.
    pprEdges.push({ src: e.src, dst: e.dst, type: e.type, weight });
    pprEdges.push({ src: e.dst, dst: e.src, type: e.type, weight });
  }
  return personalizedPageRank(nodeIds, pprEdges, { [selfId]: 1 }, { edgeWeights: PAGERANK.edgeWeights });
}

export async function reconnectLane(preloaded?: Graph): Promise<Array<{ person: NodeRecord; priority: number; status: string; daysSinceLast: number | null; valueTerm: number; decayTerm: number }>> {
  // Accept a caller-preloaded graph so callers that already hold one (the
  // Dashboard aggregate) don't trigger a second full nodes+edges read.
  const graph = preloaded ?? (await loadGraph());
  const self = await getSelf();
  if (!self) return [];
  const knowsEdges = graph.edges.filter((e) => e.type === 'KNOWS' && (e.src === self.id || e.dst === self.id));

  const items = knowsEdges.map((e) => {
    const personId = e.src === self.id ? e.dst : e.src;
    const person = graph.nodes.get(personId);
    const props = (e.props ?? {}) as Record<string, unknown>;
    const s = computeTieStrength({
      closeness: (props.closeness as number) ?? null,
      cadenceTargetDays: (props.cadence_target_days as number) ?? null,
      interactions: toEvents(interactionsFor(graph, personId)),
    });
    return { personId, person, closeness: (props.closeness as number) ?? null, intensity: s.intensity, status: s.status, daysSinceLast: s.daysSinceLast };
  });

  const ranked = rankReconnect(
    items.map((i) => ({ id: i.personId, closeness: i.closeness, intensity: i.intensity, status: i.status as 'active' | 'decaying' | 'dormant', daysSinceLast: i.daysSinceLast })),
  );
  const byId = new Map(items.map((i) => [i.personId, i]));
  return ranked
    .filter((r) => byId.get(r.id)?.person)
    .map((r) => {
      const it = byId.get(r.id)!;
      return { person: it.person!, priority: r.priority, status: it.status, daysSinceLast: it.daysSinceLast, valueTerm: r.valueTerm, decayTerm: r.decayTerm };
    });
}

/** Org an active/most-recent role points at, for a person (person -HELD-> role -ROLE_AT-> org). */
function primaryOrgFor(graph: Graph, personId: string): NodeRecord | undefined {
  let best: { org: NodeRecord; current: boolean } | undefined;
  for (const held of neighbors(graph, personId, 'HELD', 'out')) {
    const role = graph.nodes.get(held.dst);
    if (!role) continue;
    const roleAt = neighbors(graph, role.id, 'ROLE_AT', 'out')[0];
    const org = roleAt ? graph.nodes.get(roleAt.dst) : undefined;
    if (!org) continue;
    const current = !role.end_date || role.status === 'active';
    if (!best || (current && !best.current)) best = { org, current };
  }
  return best?.org;
}

export interface PersonListItem {
  id: string;
  title: string;
  headline: string | null;
  org: string | null;
  city: string | null;
  topics: string[];
  /** KNOWS.relation when a relationship with self exists. */
  relation: string | null;
  closeness: number | null;
  cadenceTargetDays: number | null;
  strength: number;
  status: string;
  daysSinceLast: number | null;
  lastInteraction: { kind: string; title: string; occurredAt: string } | null;
  source: string;
  /** How many records in the graph are this person's own (roles, degrees, …). */
  recordCount: number;
  /** The reserved owner for records nobody has claimed. */
  isPlaceholder: boolean;
}

/**
 * Every non-self person in the graph, with live tie-strength where available.
 *
 * Imported people intentionally do not receive an automatic KNOWS edge: a
 * scraped profile is not necessarily someone the owner knows. The People page
 * is nevertheless the person directory, so hiding those nodes here makes the
 * dashboard count disagree with the list and leaves imported profiles with no
 * discoverable home.
 */
export async function peopleList(): Promise<PersonListItem[]> {
  const graph = await loadGraph();
  const self = await getSelf();
  const out: PersonListItem[] = [];

  // One pass for every person's record count (per-person queries would rescan
  // the graph). Ownership matters: the graph holds several people's records.
  const ownerIndex = buildOwnerIndex(ownableFrom(graph));

  const relationshipByPerson = new Map<string, EdgeRecord>();
  if (self) {
    for (const edge of graph.edges) {
      if (edge.type !== 'KNOWS' || (edge.src !== self.id && edge.dst !== self.id)) continue;
      const personId = edge.src === self.id ? edge.dst : edge.src;
      if (!relationshipByPerson.has(personId)) relationshipByPerson.set(personId, edge);
    }
  }

  for (const person of graph.nodes.values()) {
    const props = person.props as Record<string, unknown>;
    if (person.type !== 'person' || person.id === self?.id || props.is_self === true) continue;
    const personId = person.id;
    const relationship = relationshipByPerson.get(personId);
    const kprops = (relationship?.props ?? {}) as Record<string, unknown>;
    const interactions = interactionsFor(graph, personId).sort((a, b) => {
      const ta = ((a.props as Record<string, unknown>).occurred_at as string) ?? a.created_at;
      const tb = ((b.props as Record<string, unknown>).occurred_at as string) ?? b.created_at;
      return tb.localeCompare(ta);
    });
    const s = computeTieStrength({
      closeness: (kprops.closeness as number) ?? null,
      cadenceTargetDays: (kprops.cadence_target_days as number) ?? null,
      interactions: toEvents(interactions),
    });
    const last = interactions[0];
    out.push({
      id: personId,
      title: person.title,
      headline: (props.headline as string) ?? null,
      org: primaryOrgFor(graph, personId)?.title ?? null,
      city: (props.city as string) ?? null,
      topics: (kprops.topics as string[]) ?? [],
      relation: (kprops.relation as string) ?? null,
      closeness: (kprops.closeness as number) ?? null,
      cadenceTargetDays: (kprops.cadence_target_days as number) ?? null,
      strength: s.strength,
      status: s.status,
      daysSinceLast: s.daysSinceLast,
      lastInteraction: last
        ? {
            kind: ((last.props as Record<string, unknown>).kind as string) ?? 'message',
            title: last.title,
            occurredAt: ((last.props as Record<string, unknown>).occurred_at as string) ?? last.created_at,
          }
        : null,
      source: person.source,
      recordCount: (ownerIndex.recordsOf.get(personId) ?? new Set()).size,
      isPlaceholder: props.is_placeholder === true,
    });
  }
  return out.sort((a, b) => b.strength - a.strength || a.title.localeCompare(b.title));
}

export interface OrgListItem {
  id: string;
  title: string;
  kind: string | null;
  domain: string | null;
  city: string | null;
  peopleCount: number;
  affinity: number;
  openRoles: number;
}

/** People connected (via HELD role ROLE_AT org) with their strengths, per org. */
function orgMembers(graph: Graph, orgId: string, people: PersonListItem[]): PersonListItem[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  const members: PersonListItem[] = [];
  for (const roleAt of neighbors(graph, orgId, 'ROLE_AT', 'in')) {
    const role = graph.nodes.get(roleAt.src);
    if (!role) continue;
    for (const held of neighbors(graph, role.id, 'HELD', 'in')) {
      const p = byId.get(held.src);
      if (p && !members.some((m) => m.id === p.id)) members.push(p);
    }
  }
  return members.sort((a, b) => b.strength - a.strength);
}

/**
 * Org affinity ∈ [0,1]: how warm the org is to you. Strongest tie dominates
 * (one strong insider beats many acquaintances), breadth adds a little.
 */
function orgAffinity(members: PersonListItem[]): number {
  if (members.length === 0) return 0;
  const max = members[0].strength;
  const mean = members.reduce((s, m) => s + m.strength, 0) / members.length;
  const breadth = Math.min(members.length, 5) / 5;
  return Math.min(1, max * 0.6 + mean * 0.25 + breadth * 0.15);
}

function openRolesFor(graph: Graph, orgId: string): NodeRecord[] {
  return neighbors(graph, orgId, 'ROLE_AT', 'in')
    .map((e) => graph.nodes.get(e.src))
    .filter((r): r is NodeRecord => Boolean(r) && r!.type === 'role' && (r!.props as Record<string, unknown>).open === true);
}

export async function orgsOverview(): Promise<OrgListItem[]> {
  const graph = await loadGraph();
  const people = await peopleList();
  const out: OrgListItem[] = [];
  for (const node of graph.nodes.values()) {
    if (node.type !== 'organization') continue;
    const props = node.props as Record<string, unknown>;
    const members = orgMembers(graph, node.id, people);
    out.push({
      id: node.id,
      title: node.title,
      kind: (props.kind as string) ?? null,
      domain: (props.domain as string) ?? null,
      city: (props.city as string) ?? null,
      peopleCount: members.length,
      affinity: Number(orgAffinity(members).toFixed(2)),
      openRoles: openRolesFor(graph, node.id).length,
    });
  }
  return out.sort((a, b) => b.affinity - a.affinity);
}

export interface OrgProfile extends OrgListItem {
  inroads: Array<{ rank: number; person: PersonListItem; reason: string }>;
  roles: Array<{ id: string; title: string; open: boolean; holder: string | null }>;
  relatedOrgs: Array<{
    id: string;
    title: string;
    kind: string;
    direction: 'out' | 'in';
    edgeId: string;
    note: string | null;
  }>;
}

export async function orgProfile(orgId: string): Promise<OrgProfile | null> {
  const graph = await loadGraph();
  const org = graph.nodes.get(orgId);
  if (!org || org.type !== 'organization') return null;
  const people = await peopleList();
  const props = org.props as Record<string, unknown>;
  const members = orgMembers(graph, orgId, people);

  const inroads = members.map((p, i) => ({
    rank: i + 1,
    person: p,
    reason:
      p.strength >= 0.6
        ? 'Strong tie, natural referrer'
        : p.strength >= 0.35
          ? 'Knows the team, warm intro possible'
          : 'Weak tie, warm up before asking',
  }));

  const roles = neighbors(graph, orgId, 'ROLE_AT', 'in')
    .map((e) => graph.nodes.get(e.src))
    .filter((r): r is NodeRecord => Boolean(r) && r!.type === 'role')
    .map((r) => {
      const holderEdge = neighbors(graph, r.id, 'HELD', 'in')[0];
      const holder = holderEdge ? graph.nodes.get(holderEdge.src) : undefined;
      return {
        id: r.id,
        title: r.title,
        open: (r.props as Record<string, unknown>).open === true,
        holder: holder?.title ?? null,
      };
    });

  const relatedOrgs: OrgProfile['relatedOrgs'] = [];
  for (const e of neighbors(graph, orgId, 'ORG_RELATED', 'out')) {
    const other = graph.nodes.get(e.dst);
    if (!other || other.type !== 'organization') continue;
    const ep = (e.props ?? {}) as Record<string, unknown>;
    relatedOrgs.push({
      id: other.id,
      title: other.title,
      kind: (ep.kind as string) ?? 'other',
      direction: 'out',
      edgeId: e.id,
      note: (ep.note as string) ?? null,
    });
  }
  for (const e of neighbors(graph, orgId, 'ORG_RELATED', 'in')) {
    const other = graph.nodes.get(e.src);
    if (!other || other.type !== 'organization') continue;
    const ep = (e.props ?? {}) as Record<string, unknown>;
    relatedOrgs.push({
      id: other.id,
      title: other.title,
      kind: (ep.kind as string) ?? 'other',
      direction: 'in',
      edgeId: e.id,
      note: (ep.note as string) ?? null,
    });
  }
  relatedOrgs.sort((a, b) => a.title.localeCompare(b.title));

  return {
    id: org.id,
    title: org.title,
    kind: (props.kind as string) ?? null,
    domain: (props.domain as string) ?? null,
    city: (props.city as string) ?? null,
    peopleCount: members.length,
    affinity: Number(orgAffinity(members).toFixed(2)),
    openRoles: roles.filter((r) => r.open).length,
    inroads,
    roles,
    relatedOrgs,
  };
}

export async function askWhoToCall(
  intent: Intent,
  options: { weights?: RankOptions['weights'] } = {},
): Promise<AskRankedPerson[]> {
  const graph = await loadGraph();
  const self = await getSelf();
  const selfId = self?.id;
  const ppr = selfId ? computePpr(graph, selfId) : new Map<string, number>();
  const maxPpr = Math.max(1e-9, ...[...ppr.values()]);

  const wantOrg = intent.org ? normalizeForMatch(intent.org) : null;

  const candidates: CandidatePerson[] = [];
  for (const node of graph.nodes.values()) {
    if (node.type !== 'person') continue;
    if (node.id === selfId) continue;
    const props = node.props as Record<string, unknown>;

    // Affiliation: person -HELD-> role -ROLE_AT-> org.
    let affiliation: 'current' | 'past' | null = null;
    if (wantOrg) {
      for (const held of neighbors(graph, node.id, 'HELD', 'out')) {
        const role = graph.nodes.get(held.dst);
        if (!role) continue;
        const roleAt = neighbors(graph, role.id, 'ROLE_AT', 'out')[0];
        const org = roleAt ? graph.nodes.get(roleAt.dst) : undefined;
        if (org && normalizeForMatch(org.title).includes(wantOrg)) {
          const current = !role.end_date || role.status === 'active';
          affiliation = current ? 'current' : affiliation === 'current' ? 'current' : 'past';
        }
      }
    }

    // Evidence text: KNOWS.topics ∪ skills ∪ shared projects/interactions.
    const evidence: CandidatePerson['evidence'] = [];
    const knows = selfId ? knowsEdge(graph, selfId, node.id) : undefined;
    const kprops = (knows?.props ?? {}) as Record<string, unknown>;
    const topics = (kprops.topics as string[]) ?? [];
    if (topics.length) evidence.push({ label: 'topics', text: topics.join(' ') });
    for (const uses of neighbors(graph, node.id, 'USES_SKILL', 'out')) {
      const skill = graph.nodes.get(uses.dst);
      if (skill) evidence.push({ label: skill.title, text: skill.title });
    }
    for (const worked of neighbors(graph, node.id, 'WORKED_ON', 'out')) {
      const proj = graph.nodes.get(worked.dst);
      if (proj) evidence.push({ label: proj.title, text: `${proj.title} ${(proj.props as Record<string, unknown>).outcome ?? ''}` });
    }
    for (const i of interactionsFor(graph, node.id).slice(0, 5)) {
      const tp = ((i.props as Record<string, unknown>).talking_points as string[]) ?? [];
      evidence.push({ label: i.title, text: `${i.title} ${tp.join(' ')}` });
    }

    const s = computeTieStrength({
      closeness: (kprops.closeness as number) ?? null,
      cadenceTargetDays: (kprops.cadence_target_days as number) ?? null,
      interactions: toEvents(interactionsFor(graph, node.id)),
    });

    const favors = ((kprops.favors as Array<{ direction: 'owed_to_me' | 'owed_by_me'; settled?: boolean }>) ?? []).map((f) => ({
      direction: f.direction,
      settled: f.settled,
    }));

    candidates.push({
      id: node.id,
      title: node.title,
      pinned: node.pinned,
      doNotContact: props.do_not_contact === true,
      affiliation,
      evidence,
      strength: s.strength,
      city: props.city as string | undefined,
      favors,
      graphScore: (ppr.get(node.id) ?? 0) / maxPpr,
      lastInteractionAt: s.lastInteractionAt,
    });
  }

  const ranked = whoToCall(candidates, intent, { limit: 10, weights: options.weights });
  return ranked.map((r) => {
    const node = graph.nodes.get(r.id);
    const props = (node?.props ?? {}) as Record<string, unknown>;
    return {
      ...r,
      headline: (props.headline as string) ?? null,
      city: (props.city as string) ?? null,
      pack: buildAskPack(graph, selfId, r.id),
    };
  });
}

export interface AskPackInteraction {
  id: string;
  title: string;
  kind?: string;
  date?: string;
}

export interface AskPackFollowUp {
  what: string;
  due?: string;
}

export interface AskPackShared {
  id: string;
  title: string;
  type: string;
}

export interface AskContextPack {
  interactions: AskPackInteraction[];
  followUps: AskPackFollowUp[];
  shared: AskPackShared[];
  topics: string[];
}

export type AskRankedPerson = RankedPerson & {
  headline: string | null;
  city: string | null;
  pack: AskContextPack;
};

function buildAskPack(graph: Graph, selfId: string | undefined, personId: string): AskContextPack {
  const interactions = interactionsFor(graph, personId)
    .sort((a, b) => {
      const ta = ((a.props as Record<string, unknown>).occurred_at as string) ?? a.created_at;
      const tb = ((b.props as Record<string, unknown>).occurred_at as string) ?? b.created_at;
      return tb.localeCompare(ta);
    })
    .slice(0, 3)
    .map((i) => {
      const p = i.props as Record<string, unknown>;
      return {
        id: i.id,
        title: i.title,
        kind: typeof p.kind === 'string' ? p.kind : undefined,
        date: typeof p.occurred_at === 'string' ? p.occurred_at.slice(0, 10) : i.created_at?.slice(0, 10),
      };
    });

  const followUps: AskPackFollowUp[] = [];
  for (const i of interactionsFor(graph, personId)) {
    const fus = ((i.props as Record<string, unknown>).follow_ups as Array<{ what?: string; due?: string }>) ?? [];
    for (const f of fus) {
      if (f.what) followUps.push({ what: f.what, ...(f.due ? { due: f.due } : {}) });
    }
  }

  const sharedIds = new Set<string>();
  const shared: AskPackShared[] = [];
  const addShared = (id: string) => {
    if (sharedIds.has(id) || id === personId || id === selfId) return;
    const n = graph.nodes.get(id);
    if (!n) return;
    if (!['project', 'event', 'organization', 'trip'].includes(n.type)) return;
    sharedIds.add(id);
    shared.push({ id: n.id, title: n.title, type: n.type });
  };

  for (const e of neighbors(graph, personId, 'WORKED_ON', 'out')) addShared(e.dst);
  for (const e of neighbors(graph, personId, 'ATTENDED', 'out')) addShared(e.dst);
  for (const held of neighbors(graph, personId, 'HELD', 'out')) {
    const roleAt = neighbors(graph, held.dst, 'ROLE_AT', 'out')[0];
    if (roleAt) addShared(roleAt.dst);
  }
  if (selfId) {
    const selfProjects = new Set(neighbors(graph, selfId, 'WORKED_ON', 'out').map((e) => e.dst));
    for (const e of neighbors(graph, personId, 'WORKED_ON', 'out')) {
      if (selfProjects.has(e.dst)) addShared(e.dst);
    }
    const selfEvents = new Set(neighbors(graph, selfId, 'ATTENDED', 'out').map((e) => e.dst));
    for (const e of neighbors(graph, personId, 'ATTENDED', 'out')) {
      if (selfEvents.has(e.dst)) addShared(e.dst);
    }
  }

  const knows = selfId ? knowsEdge(graph, selfId, personId) : undefined;
  const topics = (((knows?.props ?? {}) as Record<string, unknown>).topics as string[]) ?? [];

  return {
    interactions,
    followUps: followUps.slice(0, 5),
    shared: shared.slice(0, 8),
    topics: topics.slice(0, 8),
  };
}

/**
 * The correspondence rollup (SRS FR-COMM-002): dormant-but-once-strong ties
 * ranked for reactivation by the same kernel that scores them today, and the
 * brokers the relationship edges credit for introductions. Same assembly as
 * the reconnect lane, so the two surfaces read one substrate.
 */
export async function correspondenceRollup(preloaded?: Graph): Promise<{
  candidates: Array<{
    person: NodeRecord;
    score: number;
    peakStrength: number;
    peakAt: string;
    currentStrength: number;
    daysSinceLast: number | null;
    factors: { closeness: number; intensity: number };
  }>;
  consideredDormant: number;
  brokers: BrokerTally[];
  introducedBrokers: Array<{
    via: string;
    personId: string | null;
    label: string;
    count: number;
    edgeIds: string[];
  }>;
  outOfBalance: Array<{
    person: NodeRecord;
    ratio: number;
    outbound: number;
    inbound: number;
    unansweredInbound: number;
  }>;
}> {
  const graph = preloaded ?? (await loadGraph());
  const self = await getSelf();
  if (!self) {
    return { candidates: [], consideredDormant: 0, brokers: [], introducedBrokers: [], outOfBalance: [] };
  }
  const knowsEdges = graph.edges.filter(
    (e) => e.type === 'KNOWS' && (e.src === self.id || e.dst === self.id),
  );

  const ties = knowsEdges.map((e) => {
    const personId = e.src === self.id ? e.dst : e.src;
    const props = (e.props ?? {}) as Record<string, unknown>;
    return {
      personId,
      closeness: (props.closeness as number) ?? null,
      cadenceTargetDays: (props.cadence_target_days as number) ?? null,
      interactions: toEvents(interactionsFor(graph, personId)),
    };
  });

  const rollup = rankReactivation(ties);
  const brokers = brokerTally(
    knowsEdges.map((e) => ((e.props ?? {}) as Record<string, unknown>).met_via as string | undefined),
  );

  // Reciprocity imbalance across the whole graph (FR-COMM-001 figures at
  // rollup scale): ties with enough directional history, ranked by how far
  // their outbound share sits from even. Same profile function as the
  // per-person panel, so the two surfaces cannot disagree.
  const outOfBalance = ties
    .map((tie) => {
      const profile = correspondenceProfile(profileEvents(graph, tie.personId));
      const person = graph.nodes.get(tie.personId);
      return { person, profile };
    })
    .filter(
      (row): row is { person: NodeRecord; profile: CorrespondenceProfile } =>
        Boolean(row.person) &&
        row.profile.reciprocity.ratio !== null &&
        row.profile.coverage.withDirection >= CORRESPONDENCE.minDirectionalForImbalance,
    )
    .map(({ person, profile }) => ({
      person,
      ratio: profile.reciprocity.ratio!,
      outbound: profile.reciprocity.outbound,
      inbound: profile.reciprocity.inbound,
      unansweredInbound: profile.unansweredInbound.count,
    }))
    .sort(
      (a, b) =>
        Math.abs(b.ratio - 0.5) - Math.abs(a.ratio - 0.5) || a.person.id.localeCompare(b.person.id),
    )
    .slice(0, 10);

  return {
    introducedBrokers: recordedIntroductions(graph),
    outOfBalance,
    candidates: rollup.candidates.flatMap((c) => {
      const person = graph.nodes.get(c.personId);
      if (!person) return [];
      return [
        {
          person,
          score: c.score,
          peakStrength: c.peak.strength,
          peakAt: c.peakAt,
          currentStrength: c.current.strength,
          daysSinceLast: c.current.daysSinceLast,
          factors: c.peak.factors,
        },
      ];
    }),
    consideredDormant: rollup.consideredDormant,
    brokers,
  };
}

/**
 * The per-person correspondence profile: reciprocity, per-direction reply
 * latency, unanswered inbound, contact-day distribution — computed from the
 * person's logged interactions with their stated directions. Interactions
 * without a stated direction are reported in `coverage`, never guessed at.
 */
function profileEvents(graph: Graph, personId: string): ProfileEvent[] {
  return interactionsFor(graph, personId).map((node) => {
    const props = node.props as Record<string, unknown>;
    return {
      id: node.id,
      occurredAt: (props.occurred_at as string) ?? node.created_at,
      initiatedBy: (props.initiated_by as 'me' | 'them' | undefined) ?? null,
    };
  });
}

export async function personCorrespondence(
  personId: string,
  preloaded?: Graph,
): Promise<CorrespondenceProfile> {
  const graph = preloaded ?? (await loadGraph());
  return correspondenceProfile(profileEvents(graph, personId));
}

/**
 * Brokers by recorded introduction (FR-COMM-003): the INTRODUCED edges'
 * `via` values tallied, each resolved to a live person where the value is a
 * person id and kept as written where it is not. Presented beside the
 * free-text met-via tally as a separate labeled group, never merged.
 */
export function recordedIntroductions(graph: Graph): Array<{
  via: string;
  personId: string | null;
  label: string;
  count: number;
  edgeIds: string[];
}> {
  const intros = graph.edges.filter((e) => e.type === 'INTRODUCED');
  return introductionTally(
    intros.map((e) => ({
      edgeId: e.id,
      via: ((e.props ?? {}) as Record<string, unknown>).via as string | undefined,
    })),
  ).map((tally) => {
    const person = graph.nodes.get(tally.via);
    return {
      ...tally,
      personId: person && person.type === 'person' ? person.id : null,
      label: person && person.type === 'person' ? person.title : tally.via,
    };
  });
}
