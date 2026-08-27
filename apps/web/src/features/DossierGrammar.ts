/**
 * What the browser is allowed to know about dossiers (SRS FR-DOS-001,
 * FR-DOS-002).
 *
 * The section grammar itself is deliberately not here. The server publishes it
 * at `/dossiers/audiences` so that headings, purposes and limits have exactly
 * one home; the Career workspace once carried its own copy of the pipeline
 * order and drifted from the server, and that is the defect this hook exists to
 * prevent. Everything below either fetches the published grammar, phrases a
 * value the server sent, or edits the operator's own selection.
 *
 * The sentences are here rather than inline in the screens because both dossier
 * screens say the same things about a section, and two copies of "at least one
 * record per entry" would eventually disagree about which section that was.
 */
import { useQuery } from '@tanstack/react-query';
import { NODE_TYPES } from '@vitae/core';
import type {
  DossierAudience,
  DossierClaim,
  DossierSection,
  DossierSectionGrammar,
  NodeType,
} from '@vitae/core';
import { api } from '../lib/api.js';
import { typeLabel } from '../lib/entity-href.js';

export interface AudienceGrammar {
  audience: DossierAudience;
  sections: DossierSectionGrammar[];
}

/**
 * The published grammars, under one cache key because every dossier screen
 * reads the same list and none of them may answer from a local copy.
 */
export function useDossierAudiences() {
  return useQuery({
    queryKey: ['dossier-audiences'],
    queryFn: () => api.get<{ audiences: AudienceGrammar[] }>('/dossiers/audiences'),
    staleTime: 5 * 60 * 1000,
    select: (res) => res.audiences,
  });
}

/**
 * `promotion_review` as a person would say it.
 *
 * The same transform the server's own violation messages use, so a heading and
 * the message printed under it read as one voice rather than two vocabularies
 * for the same audience.
 */
export function audiencePhrase(audience: string): string {
  const words = audience.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The node types a section will take, for the evidence picker.
 *
 * A section that admits anything gets the whole catalog rather than a shorter
 * list somebody thought was reasonable. Narrowing here would be the browser
 * deciding what counts as evidence, which is the server's decision.
 */
export function admittedTypes(section: DossierSectionGrammar): NodeType[] {
  return section.admits === 'any' ? [...NODE_TYPES] : [...section.admits];
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/** "a, b, or c" with no serial-comma surprise at two items. */
function orList(words: string[]): string {
  if (words.length <= 1) return words[0] ?? '';
  if (words.length === 2) return `${words[0]} or ${words[1]}`;
  return `${words.slice(0, -1).join(', ')}, or ${words[words.length - 1]}`;
}

/** What this section takes as evidence, in words. */
export function admitsSentence(section: DossierSectionGrammar): string {
  const records =
    section.admits === 'any'
      ? 'Takes a record of any type as evidence.'
      : `Takes ${orList([...section.admits].map(typeLabel))} records as evidence.`;
  // Said either way. A section that refuses atoms and says nothing about it
  // looks like a section nobody thought about, and the operator finds out by
  // being told their entry breaks a rule after they saved it.
  const atoms = section.admitsAtoms
    ? 'Résumé atoms count here too.'
    : 'Résumé atoms do not count here; cite the record an atom was written from.';
  return `${records} ${atoms}`;
}

/** How many entries this section will hold, in words. */
export function claimsSentence(section: DossierSectionGrammar): string {
  const { minClaims: min, maxClaims: max } = section;
  if (max === null) {
    return min === 0
      ? 'Any number of entries.'
      : `At least ${min} ${plural(min, 'entry', 'entries')}.`;
  }
  if (min === 0) return `Up to ${max} ${plural(max, 'entry', 'entries')}.`;
  if (min === max) return `Exactly ${min} ${plural(min, 'entry', 'entries')}.`;
  return `Between ${min} and ${max} entries.`;
}

/** How much evidence each entry here needs, in words. */
export function citationsSentence(section: DossierSectionGrammar): string {
  const min = section.minCitationsPerClaim;
  const max = section.maxCitationsPerClaim;
  if (max === null) {
    return min === 0
      ? 'Evidence is optional on an entry here.'
      : `At least ${min} ${plural(min, 'record', 'records')} per entry.`;
  }
  if (min === max) {
    // The exhibit list is the reason this reads as a rule and not a range: a
    // numbered exhibit that cites three documents leaves the number pointing at
    // nothing in particular.
    return `Exactly ${min} ${plural(min, 'record', 'records')} per entry.`;
  }
  return `Between ${min} and ${max} records per entry.`;
}

/** A claim id the operator never sees, stable for as long as the claim lives. */
export function newClaimId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `claim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The stored selection with one claim appended to a section.
 *
 * A section the dossier does not have yet is created here rather than by the
 * server, because the server stores what it is sent and a claim with nowhere to
 * live would simply be dropped.
 */
export function withClaimAdded(
  sections: DossierSection[],
  grammarId: string,
  claim: DossierClaim,
): DossierSection[] {
  if (!sections.some((section) => section.grammar_id === grammarId)) {
    return [...sections, { grammar_id: grammarId, claims: [claim] }];
  }
  return sections.map((section) =>
    section.grammar_id === grammarId
      ? { ...section, claims: [...section.claims, claim] }
      : section,
  );
}

/**
 * The stored selection with one claim removed.
 *
 * A section emptied by the removal goes with it. Keeping it would compile to a
 * heading with nothing under it, and a required section left empty would be
 * reported as holding too few entries rather than as missing, which is the
 * vaguer of the two true statements.
 */
export function withClaimRemoved(
  sections: DossierSection[],
  grammarId: string,
  claimId: string,
): DossierSection[] {
  return sections
    .map((section) =>
      section.grammar_id === grammarId
        ? { ...section, claims: section.claims.filter((claim) => claim.id !== claimId) }
        : section,
    )
    .filter((section) => section.claims.length > 0);
}
