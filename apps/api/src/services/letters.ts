/**
 * Cover letters: persistence (SRS FR-RES-020) and compilation (FR-RES-021).
 *
 * Blocks may cite atoms or carry free text. A finalized letter compiles to the
 * same artifact pair a résumé does, PDF plus source, through the same
 * HMAC-signed sandboxed compiler, the same LaTeX escape layer (SRS §8.4), and
 * the same graceful degradation when that compiler is unreachable: `compile()`
 * answers `{ok:false, offline:true}` and the caller falls back to the .tex
 * source rather than failing the flow (FR-RES-013 / REL-005).
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertNoUnresolvedTokens,
  letterCreateSchema,
  type Letter,
  type LetterBlock,
  type LetterCreateInput,
} from '@vitae/core';
import { repository } from '../db/repository.js';
import { newId, nowIso } from '../db/util.js';
import { HttpError } from '../middleware/error.js';
import * as buildsvc from './buildsvc-client.js';
import { getTarget, loadTemplate } from './resume.js';
import { buildFullModel } from './resume-model.js';
import { getSettings } from './settings.js';
import { storage } from './storage/cloudinary.js';
import { letterParagraphs, letterTokens, type LetterRenderModel } from './template-renderers.js';

type LetterRow = Letter & Record<string, unknown>;

// Mirrors the constant in resume.ts. Both resolve the repository's templates/
// directory from their own file location, which is the same directory in every
// deployment; the env var is what a container overrides.
const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = process.env.TEMPLATES_DIR ?? resolve(here, '../../../../templates');

/**
 * The only letter layout that ships today. It is deliberately NOT in
 * listTemplates(): that gallery picks a résumé layout, and offering a business
 * letter there would let someone typeset their résumé as a letter.
 */
export const LETTER_TEMPLATE_KEY = 'letter-classic';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * "26 August 2026", in UTC. Intl would read the host locale, and the same
 * letter recompiled on a differently-configured machine has to come out byte
 * for byte identical (SOURCE_DATE_EPOCH is honoured for the same reason).
 */
export function letterDateLine(epochSeconds: number): string {
  const at = new Date(epochSeconds * 1000);
  return `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]} ${at.getUTCFullYear()}`;
}

/**
 * The clock this letter is compiled against. Pinned at finalize so a later
 * re-export reproduces the stored PDF exactly; before that it follows the last
 * edit, so the date in the preview is the date the finalize will carry.
 */
function sourceDateEpochOf(letter: LetterRow): number {
  const pinned = letter.source_date_epoch;
  if (typeof pinned === 'number' && Number.isFinite(pinned)) return pinned;
  const edited = Date.parse(String(letter.updated_at ?? letter.created_at ?? ''));
  return Number.isFinite(edited) ? Math.floor(edited / 1000) : Math.floor(Date.now() / 1000);
}

async function assertRefs(input: LetterCreateInput): Promise<void> {
  const target = await getTarget(input.target_id);
  if (!target || target.deleted_at) {
    throw new HttpError(422, 'VALIDATION', 'target_id must reference a live target');
  }
  if (input.resume_id) {
    const resume = await repository.docGet<Record<string, unknown>>('resumes', input.resume_id);
    if (!resume || resume.deleted_at) {
      throw new HttpError(422, 'VALIDATION', 'resume_id must reference a live résumé');
    }
  }
  for (const block of input.blocks) {
    if (!block.atom_id) continue;
    const atom = await repository.docGet<Record<string, unknown>>('atoms', block.atom_id);
    if (!atom || atom.deleted_at) {
      throw new HttpError(422, 'VALIDATION', `atom ${block.atom_id} does not exist or is deleted`);
    }
  }
}

export async function listLetters(opts: {
  includeDeleted?: boolean;
  targetId?: string;
  resumeId?: string;
} = {}): Promise<LetterRow[]> {
  let rows = await repository.docList<LetterRow>('letters');
  if (!opts.includeDeleted) rows = rows.filter((row) => !row.deleted_at);
  if (opts.targetId) rows = rows.filter((row) => row.target_id === opts.targetId);
  if (opts.resumeId) rows = rows.filter((row) => row.resume_id === opts.resumeId);
  return rows.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
}

export async function getLetter(id: string): Promise<LetterRow | null> {
  return repository.docGet<LetterRow>('letters', id);
}

export async function createLetter(
  raw: unknown,
  actor?: string,
): Promise<LetterRow> {
  const parsed = letterCreateSchema.safeParse(raw);
  if (!parsed.success) {
    throw new HttpError(422, 'VALIDATION', 'invalid letter', parsed.error.issues);
  }
  await assertRefs(parsed.data);
  const id = newId();
  const now = nowIso();
  const { expected_rev: _expected, ...input } = parsed.data;
  const letter: LetterRow = {
    id,
    ...input,
    // Nothing has been compiled yet, and null is the honest word for that. A
    // zero page count would read as "compiled, and empty".
    template_key: null,
    template_version: null,
    tex_key: null,
    pdf_key: null,
    pages: null,
    artifact_ids: {},
    artifact_hashes: {},
    source_date_epoch: null,
    rev: 1,
    deleted_at: null,
    created_at: now,
    updated_at: now,
  };
  await repository.transaction(async (tx) => {
    await repository.docPut('letters', id, letter, {}, tx);
    await repository.stageRevision(tx, {
      kind: 'letter',
      id,
      rev: 1,
      op: 'create',
      snapshot: letter,
      actor,
    });
  });
  return letter;
}

export async function updateLetter(
  id: string,
  raw: unknown,
  actor?: string,
): Promise<LetterRow> {
  const parsed = letterCreateSchema.partial().safeParse(raw);
  if (!parsed.success) {
    throw new HttpError(422, 'VALIDATION', 'invalid letter update', parsed.error.issues);
  }
  return repository.transaction(async (tx) => {
    const before = await repository.docGet<LetterRow>('letters', id, tx);
    if (!before || before.deleted_at) throw new HttpError(404, 'NOT_FOUND', 'letter not found');
    const expected = parsed.data.expected_rev;
    if (expected != null && (before.rev ?? 1) !== expected) {
      throw new HttpError(409, 'CONFLICT', 'letter was modified elsewhere, reload and retry');
    }
    const nextInput: LetterCreateInput = {
      target_id: parsed.data.target_id ?? before.target_id,
      resume_id: parsed.data.resume_id ?? before.resume_id,
      blocks: parsed.data.blocks ?? before.blocks,
      status: parsed.data.status ?? before.status,
      recipient: parsed.data.recipient ?? before.recipient,
      salutation: parsed.data.salutation ?? before.salutation,
      closing: parsed.data.closing ?? before.closing,
    };
    await assertRefs(nextInput);
    const after: LetterRow = {
      ...before,
      ...nextInput,
      rev: (before.rev ?? 1) + 1,
      updated_at: nowIso(),
    };
    await repository.docPut('letters', id, after, {}, tx);
    await repository.stageRevision(tx, {
      kind: 'letter',
      id,
      rev: after.rev,
      op: 'update',
      snapshot: after,
      diff: parsed.data,
      actor,
    });
    return after;
  });
}

export async function setLetterDeleted(
  id: string,
  deleted: boolean,
  actor?: string,
): Promise<LetterRow> {
  return repository.transaction(async (tx) => {
    const before = await repository.docGet<LetterRow>('letters', id, tx);
    if (!before) throw new HttpError(404, 'NOT_FOUND', 'letter not found');
    const after: LetterRow = {
      ...before,
      deleted_at: deleted ? nowIso() : null,
      rev: (before.rev ?? 1) + 1,
      updated_at: nowIso(),
    };
    await repository.docPut('letters', id, after, {}, tx);
    await repository.stageRevision(tx, {
      kind: 'letter',
      id,
      rev: after.rev,
      op: deleted ? 'archive' : 'restore',
      snapshot: after,
      actor,
    });
    return after;
  });
}

// ── Compile (FR-RES-021) ─────────────────────────────────────────────────────

/**
 * The prose each block contributes, in stored order. A block that cites an atom
 * takes the atom's default wording; free text on the block wins over it,
 * because that text is what the author last chose to say.
 *
 * A block whose atom has since been deleted yields nothing at all, and silently
 * dropping a paragraph from a document someone is about to send is worse than
 * refusing to build it, so the caller is told which atom went missing.
 */
async function blockParagraphs(blocks: LetterBlock[]): Promise<string[]> {
  const cited = blocks.map((block) => block.atom_id).filter((id): id is string => Boolean(id));
  const textByAtom = new Map<string, string>();
  if (cited.length > 0) {
    const variants = await repository.docList<{ atom_id: string } & Record<string, unknown>>(
      'atom_variants',
    );
    const wanted = new Set(cited);
    for (const variant of variants) {
      if (!wanted.has(variant.atom_id)) continue;
      const existing = textByAtom.get(variant.atom_id);
      if (existing && !variant.is_default) continue;
      textByAtom.set(variant.atom_id, String(variant.text ?? ''));
    }
  }

  const paragraphs: string[] = [];
  for (const block of blocks) {
    const source = block.text?.trim() || (block.atom_id ? textByAtom.get(block.atom_id) : undefined);
    if (!source) {
      throw new HttpError(
        422,
        'VALIDATION',
        block.atom_id
          ? `The ${block.kind} block cites atom ${block.atom_id}, which no longer has any wording to quote.`
          : `The ${block.kind} block has no text to compile.`,
      );
    }
    paragraphs.push(...letterParagraphs(source));
  }
  return paragraphs;
}

/**
 * Assemble the render model from recorded facts only. The sender is the `is_self`
 * person and their contact block, exactly as a résumé header would print them;
 * the recipient is whatever the letter records, and otherwise the company and
 * role from the job target. Nothing here fills in a name nobody wrote down: with
 * no recorded recipient the letter addresses the organisation, and says so.
 */
async function buildLetterRenderModel(letter: LetterRow): Promise<LetterRenderModel> {
  const target = await getTarget(String(letter.target_id));
  if (!target || target.deleted_at) {
    throw new HttpError(422, 'VALIDATION', 'This letter’s job target is missing, so there is nothing to address it to.');
  }
  const [profile, settings] = await Promise.all([
    buildFullModel([], { headline: '' }),
    getSettings(),
  ]);

  const recipient = (letter.recipient ?? {}) as LetterRenderModel['recipient'];
  const company = typeof target.company === 'string' ? target.company : undefined;
  const role = typeof target.role_title === 'string' ? target.role_title : undefined;

  return {
    senderName: profile.name,
    senderContacts: profile.contacts,
    dateLine: letterDateLine(sourceDateEpochOf(letter)),
    recipient: {
      ...recipient,
      org: recipient.org ?? company,
    },
    subject: role,
    // "Dear Hiring Team," is a convention, not a claim about anyone: it is what
    // the letter says when no reader has been recorded. A recorded name is used
    // the moment there is one.
    salutation:
      (typeof letter.salutation === 'string' && letter.salutation.trim()) ||
      (recipient.name ? `Dear ${recipient.name},` : 'Dear Hiring Team,'),
    paragraphs: await blockParagraphs(letter.blocks),
    closing: (typeof letter.closing === 'string' && letter.closing.trim()) || 'Sincerely,',
    accent: settings.resumeDefaults.accent ?? '#2563eb',
  };
}

/** Splice the escaped tokens into letter-classic/main.tex (the résumé shell, for letters). */
export async function renderLetterTex(letter: LetterRow): Promise<string> {
  const model = await buildLetterRenderModel(letter);
  if (model.paragraphs.length === 0) {
    throw new HttpError(422, 'VALIDATION', 'This letter has no text to compile.');
  }
  const main = await readFile(resolve(TEMPLATES_DIR, LETTER_TEMPLATE_KEY, 'main.tex'), 'utf8');
  const tokens = letterTokens(model);
  const rendered = main.replace(/«([A-Z_]+)»/g, (_, name: string) => {
    if (!(name in tokens)) throw new Error(`letter template: no value for token «${name}»`);
    return tokens[name]!;
  });
  assertNoUnresolvedTokens(rendered);
  return rendered;
}

export interface LetterCompileResult {
  letter: LetterRow;
  tex: string;
  compile: buildsvc.CompileResult;
  template: { key: string; version: string };
}

/**
 * Render and compile, without storing anything. This is the preview half of the
 * pair the résumé engine has (/resumes/compile previews, /resumes/finalize is
 * the artifact of record) and it degrades the same way: an unreachable build
 * service comes back as `offline`, with the .tex still complete.
 */
export async function compileLetter(id: string): Promise<LetterCompileResult> {
  const letter = await getLetter(id);
  if (!letter || letter.deleted_at) throw new HttpError(404, 'NOT_FOUND', 'letter not found');
  const template = await loadTemplate(LETTER_TEMPLATE_KEY);
  const tex = await renderLetterTex(letter);
  const compile = await buildsvc.compile({
    template: `${template.key}@${template.version}`,
    mainTex: tex,
    sourceDateEpoch: sourceDateEpochOf(letter),
    // A letter has no keyword-coverage gate to feed, so there is nothing for
    // the extracted text to be measured against.
    extractText: false,
  });
  return { letter, tex, compile, template: { key: template.key, version: template.version } };
}

/**
 * The stored artifact record for one half of the pair. Deliberately the same
 * shape resumes.ts writes (subject_kind differs, and the filename), so both
 * kinds of document are downloadable, hashable and re-exportable by one code
 * path in Attachments.
 */
async function letterArtifactRecord(params: {
  letterId: string;
  kind: 'pdf' | 'tex';
  bytes: Buffer;
  createdAt: string;
}) {
  const mime = params.kind === 'pdf' ? 'application/pdf' : 'application/x-tex';
  const filename = `letter-${params.letterId}.${params.kind}`;
  const sha256 = createHash('sha256').update(params.bytes).digest('hex');
  // No NODE_ENV branch. Unit tests stub the adapter, so skipping the call here
  // only made the stub dead and produced a record claiming a stored file with
  // no key to fetch it by, which is a state production cannot reach. Integration
  // tests run the real adapter unconfigured, so it throws and the caller's
  // existing storage-outage branch catches it: the letter compiled, and its
  // artifacts were not kept. That is the truth in both cases.
  const stored = await storage.upload({ data: params.bytes, filename, mime, sha256 });
  return {
    id: newId(),
    subject_id: params.letterId,
    subject_kind: 'letter',
    artifact_kind: params.kind,
    filename,
    mime,
    bytes: params.bytes.length,
    sha256,
    storage_key: stored?.key ?? null,
    private: true,
    created_at: params.createdAt,
    updated_at: params.createdAt,
  };
}

/**
 * Compile and keep the result: PDF plus source, stored and hashed, with the
 * letter marked final and its compile clock pinned so a re-export reproduces
 * the same bytes.
 *
 * When the build service is unreachable the letter is left exactly as it was
 * and the caller still receives the .tex. Flipping a letter to `final` on the
 * strength of a compile that never ran would be the lie this whole path exists
 * to avoid.
 */
export async function finalizeLetter(id: string, actor?: string): Promise<LetterCompileResult> {
  const result = await compileLetter(id);
  const { compile, tex, template } = result;
  if (!compile.ok || !compile.pdfBase64) return result;

  const now = nowIso();
  const sourceDateEpoch = sourceDateEpochOf(result.letter);
  let artifacts: Array<Awaited<ReturnType<typeof letterArtifactRecord>>> = [];
  try {
    artifacts = await Promise.all([
      letterArtifactRecord({ letterId: id, kind: 'pdf', bytes: Buffer.from(compile.pdfBase64, 'base64'), createdAt: now }),
      letterArtifactRecord({ letterId: id, kind: 'tex', bytes: Buffer.from(tex, 'utf8'), createdAt: now }),
    ]);
  } catch {
    // A storage outage must not lose a letter that did compile: the status and
    // the page count are still true, and the artifacts can be rebuilt later.
    artifacts = [];
  }
  // An attachments row asserts that a blob was stored and can be fetched back.
  // A record with no storage key is the same situation as a storage outage:
  // the letter compiled and its artifacts were not kept.
  artifacts = artifacts.filter((artifact) => artifact.storage_key);
  const byKind = new Map(artifacts.map((artifact) => [artifact.artifact_kind, artifact]));

  const letter = await repository.transaction(async (tx) => {
    const before = await repository.docGet<LetterRow>('letters', id, tx);
    if (!before || before.deleted_at) throw new HttpError(404, 'NOT_FOUND', 'letter not found');
    const after: LetterRow = {
      ...before,
      status: before.status === 'sent' ? 'sent' : 'final',
      template_key: template.key,
      template_version: template.version,
      // Null, not 1: buildsvc answers null when poppler could not count the
      // pages, and an invented 1 would be indistinguishable from a measurement.
      pages: compile.pages ?? null,
      tex_key: byKind.get('tex')?.storage_key ?? null,
      pdf_key: byKind.get('pdf')?.storage_key ?? null,
      artifact_ids: { tex: byKind.get('tex')?.id, pdf: byKind.get('pdf')?.id },
      artifact_hashes: { tex: byKind.get('tex')?.sha256, pdf: byKind.get('pdf')?.sha256 },
      source_date_epoch: sourceDateEpoch,
      rev: (before.rev ?? 1) + 1,
      updated_at: now,
    };
    await repository.docPut('letters', id, after, {}, tx);
    for (const artifact of artifacts) {
      await repository.docPut('attachments', String(artifact.id), artifact, {}, tx);
    }
    await repository.stageRevision(tx, {
      kind: 'letter',
      id,
      rev: after.rev,
      op: 'update',
      snapshot: after,
      diff: { status: after.status, pages: after.pages },
      actor,
    });
    return after;
  });

  return { ...result, letter };
}
