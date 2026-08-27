/**
 * Cover-letter compilation (FR-RES-021): what reaches the compiler, and what
 * the letter looks like afterwards when the compiler is not there.
 *
 * The repository, the profile graph, settings and storage are all stubbed, so
 * these assertions are about the letter path itself rather than about Postgres.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const docs = new Map<string, Map<string, Record<string, unknown>>>();
const staged: Array<Record<string, unknown>> = [];

function table(name: string): Map<string, Record<string, unknown>> {
  if (!docs.has(name)) docs.set(name, new Map());
  return docs.get(name)!;
}

vi.mock('../db/repository.js', () => ({
  // error.ts imports both of these by name, so the stub has to carry them even
  // though nothing in this file throws one.
  NotFoundError: class NotFoundError extends Error {},
  ValidationError: class ValidationError extends Error {},
  repository: {
    docGet: async (name: string, id: string) => table(name).get(id) ?? null,
    docPut: async (name: string, id: string, value: Record<string, unknown>) => {
      table(name).set(id, value);
    },
    docList: async (name: string) => [...table(name).values()],
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
    stageRevision: async (_tx: unknown, revision: Record<string, unknown>) => {
      staged.push(revision);
    },
  },
}));

const target = {
  id: 't1',
  role_title: 'Senior Machine Learning Engineer',
  company: 'Nile Robotics',
  deleted_at: null,
};
vi.mock('./resume.js', () => ({
  getTarget: async (id: string) => (id === 't1' ? target : null),
  loadTemplate: async (key: string) => ({ key, version: '1.0.0', name: 'Letter Classic' }),
}));

vi.mock('./resume-model.js', () => ({
  buildFullModel: async () => ({
    name: 'Amara Diallo',
    contacts: [
      { key: 'city', value: 'Kigali, Rwanda' },
      { key: 'email', value: 'a@example.com', href: 'mailto:a@example.com' },
    ],
    sections: [],
  }),
}));

vi.mock('./settings.js', () => ({
  getSettings: async () => ({ resumeDefaults: { accent: '#0f766e' } }),
}));

const compileMock = vi.fn();
vi.mock('./buildsvc-client.js', () => ({ compile: (req: unknown) => compileMock(req) }));

vi.mock('./storage/cloudinary.js', () => ({
  storage: { upload: async () => ({ key: 'unused-in-test-mode' }), signedUrl: async () => 'url' },
}));

vi.mock('../env.js', () => ({ env: { NODE_ENV: 'test' } }));

const {
  compileLetter,
  finalizeLetter,
  letterDateLine,
  renderLetterTex,
  LETTER_TEMPLATE_KEY,
} = await import('./letters.js');

/** 2026-08-26T12:00:00Z, the letter's pinned compile clock in these tests. */
const EPOCH = Date.UTC(2026, 7, 26, 12) / 1000;

function seedLetter(over: Record<string, unknown> = {}): Record<string, unknown> {
  const letter = {
    id: 'l1',
    target_id: 't1',
    blocks: [
      { kind: 'hook', text: 'I am writing about the role.' },
      { kind: 'closer', text: 'Looking forward to speaking.' },
    ],
    status: 'draft',
    rev: 1,
    deleted_at: null,
    source_date_epoch: EPOCH,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-02T00:00:00.000Z',
    ...over,
  };
  table('letters').set(String(letter.id), letter);
  return letter;
}

beforeEach(() => {
  docs.clear();
  staged.length = 0;
  compileMock.mockReset();
  compileMock.mockResolvedValue({ ok: true, pdfBase64: 'cGRm', pages: 1 });
});

describe('letterDateLine', () => {
  it('formats in UTC so the same letter dates the same on any machine', () => {
    expect(letterDateLine(EPOCH)).toBe('26 August 2026');
  });

  it('does not pad the day, the way a typed letter would not', () => {
    expect(letterDateLine(Date.UTC(2026, 0, 3) / 1000)).toBe('3 January 2026');
  });
});

describe('renderLetterTex', () => {
  it('leaves no unresolved token in the compiled source', async () => {
    const tex = await renderLetterTex(
      seedLetter({
        blocks: [
          { kind: 'hook', text: 'I am writing about the **role**.\nIt is the one I want.' },
          { kind: 'body', text: 'Budget was $40 and #1 priority.\n\nA second paragraph with 100% of the *emphasis*.' },
          { kind: 'closer', text: 'Looking forward to speaking.' },
        ],
      }) as never,
    );
    expect(tex.match(/«[^»]*»/)).toBeNull();
    expect(tex).toContain('Amara Diallo');
    expect(tex).toContain('26 August 2026');
    // Prose keeps its shape: a line break inside a block is a space, a blank
    // line starts a new paragraph, and the markers become macros.
    expect(tex).toContain('I am writing about the \\textbf{role}. It is the one I want.');
    expect(tex).toContain('Budget was \\$40 and \\#1 priority.\n\nA second paragraph');
    expect(tex).toContain('\\textit{emphasis}');
  });

  it('addresses the company from the job target when no recipient is recorded', async () => {
    const tex = await renderLetterTex(seedLetter() as never);
    expect(tex).toContain('Nile Robotics');
    expect(tex).toContain('Re: Senior Machine Learning Engineer');
    expect(tex).toContain('Dear Hiring Team,');
  });

  it('greets a recorded recipient by name instead', async () => {
    const tex = await renderLetterTex(
      seedLetter({ recipient: { name: 'Marie Uwase', title: 'Head of Engineering' } }) as never,
    );
    expect(tex).toContain('Dear Marie Uwase,');
    expect(tex).toContain('Head of Engineering');
  });

  it('quotes the default wording of an atom a block cites', async () => {
    table('atom_variants').set('v1', {
      id: 'v1',
      atom_id: 'a1',
      text: 'Cut inference latency by 38 percent.',
      is_default: true,
    });
    const tex = await renderLetterTex(
      seedLetter({ blocks: [{ kind: 'body', atom_id: 'a1' }] }) as never,
    );
    expect(tex).toContain('Cut inference latency by 38 percent.');
  });

  it('refuses to build a letter whose cited atom has lost its wording', async () => {
    await expect(
      renderLetterTex(seedLetter({ blocks: [{ kind: 'body', atom_id: 'gone' }] }) as never),
    ).rejects.toThrow(/no longer has any wording/);
  });

  it('escapes a company name that happens to contain TeX metacharacters', async () => {
    const tex = await renderLetterTex(
      seedLetter({ recipient: { org: 'Nile & Co_100' } }) as never,
    );
    expect(tex).toContain('Nile \\& Co\\_100');
    expect(tex).not.toContain('Nile & Co_100');
  });
});

describe('compileLetter', () => {
  it('sends the letter template and the pinned clock to the build service', async () => {
    seedLetter();
    const result = await compileLetter('l1');
    expect(result.compile.ok).toBe(true);
    expect(compileMock).toHaveBeenCalledOnce();
    const request = compileMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(request.template).toBe(`${LETTER_TEMPLATE_KEY}@1.0.0`);
    expect(request.sourceDateEpoch).toBe(EPOCH);
    expect(request.mainTex).toContain('\\documentclass');
  });

  it('falls back to the last edit when no clock has been pinned yet', async () => {
    seedLetter({ source_date_epoch: null, updated_at: '2026-08-02T00:00:00.000Z' });
    await compileLetter('l1');
    const request = compileMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(request.sourceDateEpoch).toBe(Date.parse('2026-08-02T00:00:00.000Z') / 1000);
  });

  it('reports 404 for a letter that is not there', async () => {
    await expect(compileLetter('nope')).rejects.toMatchObject({ status: 404 });
  });

  it('stores nothing, because it is a preview', async () => {
    seedLetter();
    await compileLetter('l1');
    expect(table('letters').get('l1')!.status).toBe('draft');
    expect(staged).toHaveLength(0);
  });
});

describe('finalizeLetter', () => {
  it('keeps the PDF and the source as a hashed artifact pair', async () => {
    seedLetter();
    const result = await finalizeLetter('l1', 'owner@example.com');
    expect(result.compile.ok).toBe(true);

    const attachments = [...table('attachments').values()];
    expect(attachments.map((a) => a.artifact_kind).sort()).toEqual(['pdf', 'tex']);
    expect(attachments.every((a) => a.subject_kind === 'letter')).toBe(true);
    expect(attachments.every((a) => a.subject_id === 'l1')).toBe(true);
    expect(attachments.every((a) => typeof a.sha256 === 'string')).toBe(true);

    const letter = table('letters').get('l1')!;
    expect(letter.status).toBe('final');
    expect(letter.pages).toBe(1);
    expect(letter.template_key).toBe(LETTER_TEMPLATE_KEY);
    expect(letter.source_date_epoch).toBe(EPOCH);
    expect((letter.artifact_ids as Record<string, string>).pdf).toBeTruthy();
    expect(letter.rev).toBe(2);
    expect(staged).toHaveLength(1);
  });

  it('records a null page count rather than inventing one page', async () => {
    compileMock.mockResolvedValue({ ok: true, pdfBase64: 'cGRm', pages: null });
    seedLetter();
    await finalizeLetter('l1');
    expect(table('letters').get('l1')!.pages).toBeNull();
  });

  it('leaves the letter a draft when the build service is unreachable', async () => {
    compileMock.mockResolvedValue({
      ok: false,
      offline: true,
      error: { code: 'BUILDSVC_OFFLINE', message: 'unreachable' },
    });
    seedLetter();
    const result = await finalizeLetter('l1');

    expect(result.compile.offline).toBe(true);
    // The source is complete either way, which is what the caller offers
    // instead of the PDF it could not produce.
    expect(result.tex).toContain('\\begin{document}');
    const letter = table('letters').get('l1')!;
    expect(letter.status).toBe('draft');
    expect(letter.rev).toBe(1);
    expect(table('attachments').size).toBe(0);
    expect(staged).toHaveLength(0);
  });

  it('does not demote a letter that was already marked sent', async () => {
    seedLetter({ status: 'sent' });
    await finalizeLetter('l1');
    expect(table('letters').get('l1')!.status).toBe('sent');
  });
});
