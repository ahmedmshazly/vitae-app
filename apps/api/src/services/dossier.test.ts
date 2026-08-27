/**
 * Compiling a dossier: what the document says, and what the provenance
 * appendix says about the records under it.
 *
 * The repository is faked here so the whole of the interesting behaviour -
 * resolution, ordering, and the three answers a citation can have - is pinned
 * without a database. The storage half is covered by the route's integration
 * suite, which is where a rev guard and a soft delete actually mean something.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const now = '2026-08-27T09:00:00.000Z';

const nodes: Record<string, Record<string, unknown>> = {
  'person-1': { id: 'person-1', type: 'person', title: 'Jordan Kim', source: 'manual', confidence: 1, deleted_at: null },
  'role-1': { id: 'role-1', type: 'role', title: 'Senior ML Engineer', source: 'manual', confidence: 1, deleted_at: null },
  'project-1': { id: 'project-1', type: 'project', title: 'PerceptionBench', source: 'import_aperture', confidence: 0.6, deleted_at: null },
  'project-2': { id: 'project-2', type: 'project', title: 'Withdrawn work', source: 'manual', confidence: 1, deleted_at: now },
};

const revisions: Record<string, Array<Record<string, unknown>>> = {
  'project-1': [
    { rev: 1, at: '2026-01-04T10:00:00.000Z', op: 'create', source: 'import_aperture', actor: 'o@example.com' },
    { rev: 2, at: '2026-02-11T10:00:00.000Z', op: 'update', source: 'manual', actor: 'o@example.com' },
  ],
};

const atoms: Record<string, Record<string, unknown>> = {
  'atom-1': { id: 'atom-1', source: 'manual', deleted_at: null },
};

const variants: Record<string, Array<Record<string, unknown>>> = {
  'atom-1': [
    { id: 'v1', atom_id: 'atom-1', text: 'Long technical phrasing.', is_default: false },
    { id: 'v2', atom_id: 'atom-1', text: 'Cut inference latency 38%.', is_default: true },
  ],
};

let stored: Record<string, unknown> | null = null;

vi.mock('../db/repository.js', () => ({
  repository: {
    getNode: vi.fn(async (id: string, opts?: { includeDeleted?: boolean }) => {
      const node = nodes[id];
      if (!node) return null;
      if (node.deleted_at && !opts?.includeDeleted) return null;
      return node;
    }),
    revisionsForMany: vi.fn(async (ids: string[]) => new Map(ids.map((id) => [id, revisions[id] ?? []]))),
    docGet: vi.fn(async (table: string, id: string) => {
      if (table === 'dossiers') return stored;
      if (table === 'atoms') return atoms[id] ?? null;
      return null;
    }),
    docQuery: vi.fn(async (table: string, filters: Record<string, string>) =>
      table === 'atom_variants' ? (variants[filters.atom_id!] ?? []) : [],
    ),
    docList: vi.fn(async () => []),
    docPut: vi.fn(async () => undefined),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(null)),
  },
}));

const { compileDossier } = await import('./dossier.js');

function dossier(sections: unknown[]) {
  return {
    id: 'dossier-1',
    subject_node: 'person-1',
    audience: 'promotion_review',
    title: 'Staff promotion',
    sections,
    tex_key: null,
    pdf_key: null,
    rev: 1,
    deleted_at: null,
    created_at: now,
    updated_at: now,
  };
}

const scope = {
  grammar_id: 'scope',
  claims: [{ id: 'c1', text: 'Owned the serving path.', cites: [{ kind: 'node', id: 'role-1' }] }],
};
const impact = {
  grammar_id: 'impact',
  claims: [
    { id: 'c2', text: 'Cut latency across the fleet.', cites: [{ kind: 'atom', id: 'atom-1' }] },
    { id: 'c3', text: 'Shipped the benchmark.', cites: [{ kind: 'node', id: 'project-1' }] },
  ],
};

beforeEach(() => {
  stored = dossier([scope, impact]);
});

describe('compileDossier', () => {
  it('names the subject and carries the operator sentences unchanged', async () => {
    const compiled = await compileDossier('dossier-1');
    expect(compiled.subject).toEqual({ id: 'person-1', title: 'Jordan Kim' });
    expect(compiled.sections[0]?.claims[0]?.text).toBe('Owned the serving path.');
  });

  it('emits sections in the order the grammar declares, not the order they were stored', async () => {
    // Determinism is the requirement, and the stored array is whatever order
    // the editor last wrote. Same selection, same document, twice.
    stored = dossier([impact, scope]);
    const compiled = await compileDossier('dossier-1');
    expect(compiled.sections.map((section) => section.grammar_id)).toEqual(['scope', 'impact']);
    expect(compiled.sections[0]?.heading).toBe('Scope');
  });

  it('resolves a record to its live title, source and confidence', async () => {
    const compiled = await compileDossier('dossier-1');
    const bench = compiled.appendix.find((record) => record.id === 'project-1');
    expect(bench).toMatchObject({
      presence: 'live',
      type: 'project',
      label: 'PerceptionBench',
      source: 'import_aperture',
      confidence: 0.6,
    });
  });

  it('carries the whole revision trail of a cited record', async () => {
    const compiled = await compileDossier('dossier-1');
    const bench = compiled.appendix.find((record) => record.id === 'project-1');
    expect(bench?.revisions.map((entry) => entry.op)).toEqual(['create', 'update']);
    expect(bench?.revisions[1]?.source).toBe('manual');
  });

  it('reads an atom through its default variant, and says it has no trail', async () => {
    const compiled = await compileDossier('dossier-1');
    const atom = compiled.appendix.find((record) => record.kind === 'atom');
    expect(atom?.label).toBe('Cut inference latency 38%.');
    expect(atom?.revisions).toEqual([]);
  });

  it('tells a withdrawn record apart from one that never existed', async () => {
    // Collapsing these two would tell a reader that a citation was invented
    // when the record behind it was in fact deleted.
    stored = dossier([
      { grammar_id: 'scope', claims: [{ id: 'c1', text: 'Scope.', cites: [{ kind: 'node', id: 'project-2' }] }] },
      { grammar_id: 'impact', claims: [
        { id: 'c2', text: 'Impact.', cites: [{ kind: 'node', id: 'never-existed' }] },
        { id: 'c3', text: 'More.', cites: [{ kind: 'node', id: 'project-1' }] },
      ] },
    ]);
    const compiled = await compileDossier('dossier-1');
    expect(compiled.appendix.find((r) => r.id === 'project-2')?.presence).toBe('deleted');
    expect(compiled.appendix.find((r) => r.id === 'never-existed')?.presence).toBe('unknown');
    expect(compiled.appendix.find((r) => r.id === 'never-existed')?.label).toBeNull();
  });

  it('prints each cited record once, in first-cited order', async () => {
    stored = dossier([
      scope,
      {
        grammar_id: 'impact',
        claims: [
          { id: 'c2', text: 'One.', cites: [{ kind: 'node', id: 'project-1' }] },
          { id: 'c3', text: 'Two.', cites: [{ kind: 'node', id: 'project-1' }] },
        ],
      },
    ]);
    const compiled = await compileDossier('dossier-1');
    expect(compiled.appendix.map((record) => record.id)).toEqual(['role-1', 'project-1']);
  });

  it('compiles despite a missing citation, and refuses to for a malformed packet', async () => {
    // A record that is gone is a fact worth printing. A section that is absent
    // means the packet is not yet the thing it claims to be.
    stored = dossier([
      { grammar_id: 'scope', claims: [{ id: 'c1', text: 'Scope.', cites: [{ kind: 'node', id: 'never-existed' }] }] },
      impact,
    ]);
    const withMissing = await compileDossier('dossier-1');
    expect(withMissing.violations.map((v) => v.rule)).toEqual(['citation_missing']);
    expect(withMissing.blocking).toBe(false);

    stored = dossier([scope]);
    const malformed = await compileDossier('dossier-1');
    expect(malformed.violations.map((v) => v.rule)).toContain('missing_required_section');
    expect(malformed.blocking).toBe(true);
  });

  it('refuses to compile a dossier that is not there', async () => {
    stored = null;
    await expect(compileDossier('dossier-1')).rejects.toThrow('dossier not found');
  });
});
