/**
 * A structured profile for any person in the graph.
 *
 * The résumé answers "what goes on *my* CV" and is deliberately single-subject.
 * This answers the neighbouring question: "what do we know about this person".
 * for anyone, using the same ownership machinery. The graph holds several
 * imported profiles; without this they are only reachable as an undifferentiated
 * list of edges on the record page.
 */
import type { NodeRecord } from '@vitae/core';
import { loadGraph, type Graph } from './resume-model.js';
import { buildOwnerIndex, ownedIdsFor, skillIdsFor, type OwnerIndex } from './subjects.js';

export interface ProfileEntry {
  id: string;
  type: string;
  title: string;
  /** Organisation the record hangs off, when there is one. */
  org?: string;
  subtitle?: string;
  start_date?: string;
  end_date?: string;
  is_current?: boolean;
}

export interface PersonProfile {
  person: { id: string; title: string; subtitle?: string; headline?: string; isSelf: boolean; isPlaceholder: boolean };
  /** Owned records grouped by node type, newest first. */
  sections: Array<{ type: string; label: string; entries: ProfileEntry[] }>;
  skills: Array<{ id: string; name: string; category?: string }>;
  counts: { records: number; skills: number };
}

/** Section order and labels, mirroring how a CV reads. */
const SECTIONS: Array<[string, string]> = [
  ['role', 'Experience'],
  ['education', 'Education'],
  ['project', 'Projects'],
  ['publication', 'Publications'],
  ['certification', 'Certifications'],
  ['course', 'Courses'],
  ['award', 'Awards'],
  ['repository', 'Repositories'],
  ['talk', 'Talks'],
  ['post', 'Posts'],
];

/** The organisation a record hangs off, following the edges that express it. */
function orgTitleFor(graph: Graph, nodeId: string): string | undefined {
  const edge = graph.edges.find(
    (e) => (e.type === 'ROLE_AT' || e.type === 'PART_OF' || e.type === 'RELATES_TO') && e.src === nodeId,
  );
  const target = edge ? graph.nodesById.get(edge.dst) : undefined;
  return target?.type === 'organization' ? target.title : undefined;
}

function toEntry(graph: Graph, node: NodeRecord): ProfileEntry {
  return {
    id: node.id,
    type: node.type,
    title: node.title,
    org: orgTitleFor(graph, node.id),
    subtitle: node.subtitle ?? undefined,
    start_date: node.start_date ?? undefined,
    end_date: node.end_date ?? undefined,
  };
}

/** Newest first, undated last, the order every CV section wants. */
function byRecency(a: ProfileEntry, b: ProfileEntry): number {
  const av = a.end_date ?? a.start_date ?? '';
  const bv = b.end_date ?? b.start_date ?? '';
  if (av && bv) return bv.localeCompare(av);
  if (av) return -1;
  if (bv) return 1;
  return a.title.localeCompare(b.title);
}

export function personProfileFrom(graph: Graph, personId: string, index?: OwnerIndex): PersonProfile | null {
  const person = graph.nodesById.get(personId);
  if (!person || person.type !== 'person') return null;

  const ownerIndex = index ?? buildOwnerIndex(graph);
  const owned = ownedIdsFor(personId, ownerIndex);
  const skillIds = skillIdsFor(personId, graph, owned);
  const props = (person.props ?? {}) as Record<string, unknown>;

  const sections = SECTIONS.map(([type, label]) => ({
    type,
    label,
    entries: (graph.nodesByType.get(type) ?? [])
      .filter((n) => owned.has(n.id))
      .map((n) => toEntry(graph, n))
      .sort(byRecency),
  })).filter((s) => s.entries.length > 0);

  const skills = [...skillIds]
    .map((id) => graph.nodesById.get(id))
    .filter((n): n is NodeRecord => Boolean(n))
    .map((n) => ({
      id: n.id,
      name: n.title,
      category: ((n.props ?? {}) as Record<string, unknown>).category as string | undefined,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    person: {
      id: person.id,
      title: person.title,
      subtitle: person.subtitle ?? undefined,
      headline: props.headline as string | undefined,
      isSelf: props.is_self === true,
      isPlaceholder: props.is_placeholder === true,
    },
    sections,
    skills,
    counts: { records: owned.size, skills: skills.length },
  };
}

export async function personProfile(personId: string): Promise<PersonProfile | null> {
  return personProfileFrom(await loadGraph(), personId);
}
