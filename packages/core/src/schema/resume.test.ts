/**
 * The cover-letter half of the résumé schemas (FR-RES-020, FR-RES-021). The
 * compile path reads these fields, so what they accept and what they default to
 * is what ends up typeset on a document someone sends to a stranger.
 */
import { describe, expect, it } from 'vitest';
import { letterCreateSchema, letterRecipientSchema, letterSchema } from './resume.js';

const BLOCKS = [{ kind: 'hook' as const, text: 'I am writing about the role.' }];

describe('letterCreateSchema', () => {
  it('accepts a letter that records nothing about its recipient', () => {
    const parsed = letterCreateSchema.parse({ target_id: 't1', blocks: BLOCKS });
    expect(parsed.recipient).toBeUndefined();
    expect(parsed.salutation).toBeUndefined();
    expect(parsed.closing).toBeUndefined();
  });

  it('keeps a recorded recipient and gives its address lines an empty default', () => {
    const parsed = letterCreateSchema.parse({
      target_id: 't1',
      blocks: BLOCKS,
      recipient: { name: 'Amara Diallo', title: 'Head of Engineering' },
    });
    expect(parsed.recipient).toEqual({
      name: 'Amara Diallo',
      title: 'Head of Engineering',
      address: [],
    });
  });

  it('refuses a blank salutation rather than storing an empty greeting', () => {
    const parsed = letterCreateSchema.safeParse({
      target_id: 't1',
      blocks: BLOCKS,
      salutation: '   ',
    });
    expect(parsed.success).toBe(false);
  });

  it('caps the address at six lines so an envelope cannot become a document', () => {
    const parsed = letterRecipientSchema.safeParse({
      address: ['1', '2', '3', '4', '5', '6', '7'],
    });
    expect(parsed.success).toBe(false);
  });

  it('still requires at least one block with text or an atom behind it', () => {
    expect(letterCreateSchema.safeParse({ target_id: 't1', blocks: [] }).success).toBe(false);
    expect(
      letterCreateSchema.safeParse({ target_id: 't1', blocks: [{ kind: 'hook' }] }).success,
    ).toBe(false);
  });
});

describe('letterSchema', () => {
  const stored = {
    id: 'l1',
    target_id: 't1',
    blocks: BLOCKS,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  };

  it('defaults every compile artifact to null, never to zero pages', () => {
    const letter = letterSchema.parse(stored);
    expect(letter.pages).toBeNull();
    expect(letter.tex_key).toBeNull();
    expect(letter.pdf_key).toBeNull();
    expect(letter.template_key).toBeNull();
    expect(letter.source_date_epoch).toBeNull();
    expect(letter.artifact_ids).toEqual({});
    expect(letter.artifact_hashes).toEqual({});
  });

  it('carries the artifact pair a finalized letter produces', () => {
    const letter = letterSchema.parse({
      ...stored,
      status: 'final',
      template_key: 'letter-classic',
      template_version: '1.0.0',
      pages: 1,
      tex_key: 'letters/l1.tex',
      pdf_key: 'letters/l1.pdf',
      artifact_ids: { pdf: 'a1', tex: 'a2' },
      artifact_hashes: { pdf: 'deadbeef', tex: 'cafebabe' },
      source_date_epoch: 1_756_252_800,
    });
    expect(letter.pages).toBe(1);
    expect(letter.artifact_ids.pdf).toBe('a1');
    expect(letter.source_date_epoch).toBe(1_756_252_800);
  });

  it('accepts a null page count from a compile that could not measure one', () => {
    expect(letterSchema.parse({ ...stored, pages: null }).pages).toBeNull();
  });
});
