/**
 * Cover-letter persistence (SRS FR-RES-020). Storage + CRUD only, generation
 * and compile UI are deferred; blocks may cite atoms or carry free text.
 */
import { letterCreateSchema, type Letter, type LetterCreateInput } from '@vitae/core';
import { repository } from '../db/repository.js';
import { newId, nowIso } from '../db/util.js';
import { HttpError } from '../middleware/error.js';
import { getTarget } from './resume.js';

type LetterRow = Letter & Record<string, unknown>;

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
    tex_key: null,
    pdf_key: null,
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
