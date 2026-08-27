/**
 * Dossier storage and compilation (SRS FR-DOS-001, FR-DOS-002).
 *
 * The stored dossier is a selection: claims, and for each claim the records it
 * rests on. Compilation is where that selection becomes a document, and it
 * resolves every citation against the live graph rather than trusting anything
 * copied into the selection at the time it was made. That is the point of the
 * format. A reader who does not believe a sentence follows it to the appendix,
 * finds the record it rests on, and sees where that record came from, how
 * confident it was, and every revision it has been through.
 *
 * Compilation is deterministic: sections come out in the order the audience's
 * grammar declares, not the order they happen to sit in the document, and
 * citations within a claim keep the order the operator chose. The same
 * selection over the same graph compiles to the same bytes twice.
 */
import {
  DOSSIER_GRAMMAR,
  dossierCreateSchema,
  validateDossier,
  type Dossier,
  type DossierCitation,
  type DossierCreateInput,
  type DossierViolation,
  type NodeRecord,
  type ResolvedCitation,
} from '@vitae/core';
import { repository } from '../db/repository.js';
import { newId, nowIso } from '../db/util.js';
import { HttpError } from '../middleware/error.js';

type DossierRow = Dossier & Record<string, unknown>;

/** One record a claim rests on, as the appendix prints it. */
export interface CitedRecord {
  kind: 'node' | 'atom';
  id: string;
  /**
   * Three answers, not two. A record that is live, a record that was deleted,
   * and a record that never existed are different facts about a claim, and
   * collapsing the last two would tell a reader that a citation was made up
   * when it was in fact withdrawn.
   */
  presence: 'live' | 'deleted' | 'unknown';
  type: string | null;
  label: string | null;
  source: string | null;
  confidence: number | null;
  revisions: Array<{ rev: number; at: string; op: string; source: string; actor: string | null }>;
}

export interface CompiledClaim {
  id: string;
  text: string;
  cites: CitedRecord[];
}

export interface CompiledSection {
  grammar_id: string;
  heading: string;
  purpose: string;
  claims: CompiledClaim[];
}

export interface CompiledDossier {
  dossier: DossierRow;
  subject: { id: string; title: string } | null;
  sections: CompiledSection[];
  /** Every distinct cited record, once, in first-cited order. */
  appendix: CitedRecord[];
  violations: DossierViolation[];
  /**
   * Whether the violations stop this from being a document at all. A citation
   * whose record is gone does not: that is exactly the kind of fact the
   * appendix exists to print. A section that is missing, or an entry with no
   * evidence under it, does: the packet is not yet the thing it claims to be.
   */
  blocking: boolean;
}

const citationKey = (citation: DossierCitation): string => `${citation.kind}:${citation.id}`;

async function assertSubject(subjectNode: string): Promise<void> {
  const subject = await repository.getNode(subjectNode);
  if (!subject || subject.deleted_at) {
    throw new HttpError(422, 'VALIDATION', 'subject_node must reference a live record');
  }
  if (subject.type !== 'person') {
    throw new HttpError(
      422,
      'VALIDATION',
      `a dossier is about one person; ${subject.type} records cannot be its subject`,
    );
  }
}

export async function listDossiers(
  opts: { includeDeleted?: boolean; subjectNode?: string } = {},
): Promise<DossierRow[]> {
  let rows = await repository.docList<DossierRow>('dossiers');
  if (!opts.includeDeleted) rows = rows.filter((row) => !row.deleted_at);
  if (opts.subjectNode) rows = rows.filter((row) => row.subject_node === opts.subjectNode);
  return rows.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
}

export async function getDossier(id: string): Promise<DossierRow | null> {
  return repository.docGet<DossierRow>('dossiers', id);
}

export async function createDossier(body: unknown): Promise<DossierRow> {
  const parsed = dossierCreateSchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(422, 'VALIDATION', 'invalid dossier', parsed.error.issues);
  }
  await assertSubject(parsed.data.subject_node);
  const { expected_rev: _expected, ...input } = parsed.data;
  const now = nowIso();
  const dossier: DossierRow = {
    id: newId(),
    ...input,
    // Nothing has been compiled yet, and null says so. A zero page count or an
    // empty string key would both read as "compiled, and came out empty".
    tex_key: null,
    pdf_key: null,
    rev: 1,
    deleted_at: null,
    created_at: now,
    updated_at: now,
  };
  await repository.docPut('dossiers', dossier.id, dossier);
  return dossier;
}

export async function updateDossier(id: string, body: unknown): Promise<DossierRow> {
  const parsed = dossierCreateSchema.partial().safeParse(body);
  if (!parsed.success) {
    throw new HttpError(422, 'VALIDATION', 'invalid dossier update', parsed.error.issues);
  }
  if (parsed.data.subject_node) await assertSubject(parsed.data.subject_node);
  return repository.transaction(async (tx) => {
    const before = await repository.docGet<DossierRow>('dossiers', id, tx);
    if (!before || before.deleted_at) throw new HttpError(404, 'NOT_FOUND', 'dossier not found');
    const expected = parsed.data.expected_rev;
    if (expected != null && (before.rev ?? 1) !== expected) {
      throw new HttpError(409, 'CONFLICT', 'dossier was modified elsewhere, reload and retry');
    }
    const next: DossierRow = {
      ...before,
      subject_node: parsed.data.subject_node ?? before.subject_node,
      audience: parsed.data.audience ?? before.audience,
      title: parsed.data.title ?? before.title,
      window: parsed.data.window ?? before.window,
      sections: parsed.data.sections ?? before.sections,
      // Any edit to the selection invalidates what was compiled from it, and
      // keeping the old keys here would serve a stale PDF as if it matched.
      tex_key: parsed.data.sections ? null : before.tex_key,
      pdf_key: parsed.data.sections ? null : before.pdf_key,
      rev: (before.rev ?? 1) + 1,
      updated_at: nowIso(),
    };
    // The fourth argument is extra columns, not the connection; the connection
    // is fifth, and passing the transaction into the wrong slot would silently
    // write outside it.
    await repository.docPut('dossiers', id, next, {}, tx);
    return next;
  });
}

export async function deleteDossier(id: string): Promise<DossierRow> {
  const before = await getDossier(id);
  if (!before || before.deleted_at) throw new HttpError(404, 'NOT_FOUND', 'dossier not found');
  const next: DossierRow = { ...before, deleted_at: nowIso(), updated_at: nowIso() };
  await repository.docPut('dossiers', id, next);
  return next;
}

// ── Compilation ──────────────────────────────────────────────────────────────

/** The default variant's text, which is the sentence a résumé would print. */
function atomLabel(variants: Array<Record<string, unknown>>): string | null {
  const chosen = variants.find((variant) => variant.is_default === true) ?? variants[0];
  const text = chosen?.text;
  return typeof text === 'string' && text.trim() ? text : null;
}

/**
 * Resolve every distinct citation once.
 *
 * Once, because an exhibit list can cite the same document from two entries and
 * a promotion packet routinely rests three claims on one project, and looking
 * each one up per claim would multiply the queries by the repetition.
 */
async function resolveCitations(
  citations: DossierCitation[],
): Promise<Map<string, CitedRecord>> {
  const distinct = new Map<string, DossierCitation>();
  for (const citation of citations) {
    if (!distinct.has(citationKey(citation))) distinct.set(citationKey(citation), citation);
  }
  const resolved = new Map<string, CitedRecord>();

  const nodeIds = [...distinct.values()].filter((c) => c.kind === 'node').map((c) => c.id);
  const trails = await repository.revisionsForMany(nodeIds);

  for (const [key, citation] of distinct) {
    if (citation.kind === 'node') {
      // Deleted records are read back deliberately: a claim resting on
      // something that was withdrawn should say so, not read as a fabrication.
      const node = (await repository.getNode(citation.id, { includeDeleted: true })) as
        | NodeRecord
        | null;
      resolved.set(key, {
        kind: 'node',
        id: citation.id,
        presence: !node ? 'unknown' : node.deleted_at ? 'deleted' : 'live',
        type: node?.type ?? null,
        label: node?.title ?? null,
        source: node?.source ?? null,
        confidence: node?.confidence ?? null,
        revisions: (trails.get(citation.id) ?? []).map((revision) => ({
          rev: Number(revision.rev ?? 0),
          at: String(revision.at ?? ''),
          op: String(revision.op ?? ''),
          source: String(revision.source ?? 'manual'),
          actor: typeof revision.actor === 'string' ? revision.actor : null,
        })),
      });
      continue;
    }
    const atom = await repository.docGet<Record<string, unknown>>('atoms', citation.id);
    const variants = atom
      ? await repository.docQuery<Record<string, unknown>>('atom_variants', { atom_id: citation.id })
      : [];
    resolved.set(key, {
      kind: 'atom',
      id: citation.id,
      presence: !atom ? 'unknown' : atom.deleted_at ? 'deleted' : 'live',
      type: 'atom',
      label: atomLabel(variants),
      source: typeof atom?.source === 'string' ? atom.source : null,
      confidence: null,
      // Only graph writes keep revisions; an atom lives in a document table and
      // has no trail to print. An empty list here means there is none to have,
      // which the appendix says in words rather than leaving a blank column.
      revisions: [],
    });
  }
  return resolved;
}

/**
 * Turn a stored selection into a document plus its provenance appendix.
 *
 * Nothing is inferred. A claim's text is the operator's own sentence, the
 * evidence under it is what they selected, and everything the appendix adds
 * comes from the records themselves.
 */
export async function compileDossier(id: string): Promise<CompiledDossier> {
  const dossier = await getDossier(id);
  if (!dossier || dossier.deleted_at) throw new HttpError(404, 'NOT_FOUND', 'dossier not found');

  const everyCitation = dossier.sections.flatMap((section) =>
    section.claims.flatMap((claim) => claim.cites),
  );
  const resolved = await resolveCitations(everyCitation);

  const violations = validateDossier(dossier, (citation): ResolvedCitation | null => {
    const record = resolved.get(citationKey(citation));
    if (!record || record.presence !== 'live' || !record.type) return null;
    return { kind: record.kind, type: record.type };
  });

  const stored = new Map(dossier.sections.map((section) => [section.grammar_id, section]));
  const sections: CompiledSection[] = [];
  for (const rules of DOSSIER_GRAMMAR[dossier.audience]) {
    const section = stored.get(rules.id);
    if (!section) continue;
    sections.push({
      grammar_id: rules.id,
      heading: rules.heading,
      purpose: rules.purpose,
      claims: section.claims.map((claim) => ({
        id: claim.id,
        text: claim.text,
        cites: claim.cites
          .map((citation) => resolved.get(citationKey(citation)))
          .filter((record): record is CitedRecord => Boolean(record)),
      })),
    });
  }

  const appendix: CitedRecord[] = [];
  const printed = new Set<string>();
  for (const section of sections) {
    for (const claim of section.claims) {
      for (const record of claim.cites) {
        const key = `${record.kind}:${record.id}`;
        if (printed.has(key)) continue;
        printed.add(key);
        appendix.push(record);
      }
    }
  }

  const subjectNode = await repository.getNode(dossier.subject_node);
  return {
    dossier,
    subject: subjectNode ? { id: subjectNode.id, title: subjectNode.title } : null,
    sections,
    appendix,
    violations,
    blocking: violations.some((violation) => violation.rule !== 'citation_missing'),
  };
}

/** Re-exported so routes and tests do not each rebuild the audience list. */
export type { DossierCreateInput };
