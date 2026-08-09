/**
 * The résumé is single-subject: it may only ever contain the owner's records.
 *
 * The graph holds other people's profiles, imports bring in their roles,
 * degrees, awards and publications, all perfectly well-formed. Every section
 * builder used to read `nodesByType.get(<type>)` directly, so a résumé printed
 * 16 degrees and 10 awards belonging to other people. These tests pin the fix.
 *
 * `buildFullModel` accepts an injected graph, so this needs no database and
 * always runs.
 */
import { describe, expect, it } from 'vitest';
import type { NodeRecord } from '@vitae/core';
import { buildFullModel, type Graph } from '../services/resume-model.js';
import { renderTemplate } from '../services/resume.js';

const now = '2026-07-30T00:00:00.000Z';

function node(id: string, type: string, title: string, props: Record<string, unknown> = {}): NodeRecord {
  return {
    id,
    type,
    title,
    subtitle: undefined,
    props,
    identity_keys: [],
    notes_md: '',
    date_precision: 'day',
    pinned: false,
    sensitivity: 'normal',
    source: 'manual',
    confidence: 1,
    captured_at: now,
    created_at: now,
    updated_at: now,
    archived_at: null,
    deleted_at: null,
    merged_into: null,
    rev: 1,
  } as unknown as NodeRecord;
}

/** Me and one imported profile, each with a full record set of their own. */
function twoPersonGraph(): Graph {
  const nodes = [
    node('me', 'person', 'Jordan Kim', { is_self: true, headline: 'Engineer' }),
    node('them', 'person', 'Marwan Elsayed', { headline: 'Scraped profile' }),

    node('role-mine', 'role', 'Data Engineering Intern', { employment_type: 'intern' }),
    node('role-theirs', 'role', 'Chief Operating Officer', { employment_type: 'full_time' }),

    node('edu-mine', 'education', 'M.Sc. Electrical & Computer Engineering', { degree: 'M.Sc. ECE' }),
    node('edu-theirs', 'education', 'MA Development Economics', { degree: 'MA Development Economics' }),

    node('award-mine', 'award', 'World Robot Challenge', { awarded_on: '2019-03-01' }),
    node('award-theirs', 'award', 'NNPC/TOTAL National Merit Scholarship', { awarded_on: '2015-01-01' }),

    node('pub-mine', 'publication', 'Adaptive Pipeline Orchestration', { published_on: '2026-01-01' }),
    node('pub-theirs', 'publication', 'Hydropower Plant Efficiency', { published_on: '2020-01-01' }),

    node('proj-mine', 'project', 'Solar CommHub', { kind: 'research' }),
    node('proj-theirs', 'project', 'Their Side Project', { kind: 'personal' }),

    node('skill-mine', 'skill', 'Python', { category: 'language' }),
    node('skill-theirs', 'skill', 'Salesforce Administration', { category: 'tool' }),
    node('skill-shared', 'skill', 'Data Analysis', { category: 'method' }),
  ];

  const edges = [
    // Subject edges, who owns what.
    { type: 'HELD', src: 'me', dst: 'role-mine' },
    { type: 'HELD', src: 'them', dst: 'role-theirs' },
    { type: 'ATTENDED', src: 'me', dst: 'edu-mine' },
    { type: 'ATTENDED', src: 'them', dst: 'edu-theirs' },
    { type: 'EARNED', src: 'me', dst: 'award-mine' },
    { type: 'EARNED', src: 'them', dst: 'award-theirs' },
    { type: 'AUTHORED', src: 'me', dst: 'pub-mine' },
    { type: 'AUTHORED', src: 'them', dst: 'pub-theirs' },
    { type: 'WORKED_ON', src: 'me', dst: 'proj-mine' },
    { type: 'WORKED_ON', src: 'them', dst: 'proj-theirs' },

    // Skills: claimed directly, evidenced through an owned record, or theirs.
    { type: 'USES_SKILL', src: 'me', dst: 'skill-mine' },
    { type: 'USES_SKILL', src: 'role-mine', dst: 'skill-shared' },
    { type: 'USES_SKILL', src: 'role-theirs', dst: 'skill-theirs' },
    { type: 'USES_SKILL', src: 'role-theirs', dst: 'skill-shared' },
  ];

  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const nodesByType = new Map<string, NodeRecord[]>();
  for (const n of nodes) (nodesByType.get(n.type) ?? nodesByType.set(n.type, []).get(n.type)!).push(n);
  return { nodesById, nodesByType, edges };
}

const opts = { headline: 'Machine Learning Engineer', graph: twoPersonGraph() };

/** Every id the model exposes, across every section kind. */
function idsIn(model: Awaited<ReturnType<typeof buildFullModel>>): string[] {
  return model.sections.flatMap((s) => [
    ...(s.entries ?? []).map((e) => e.id),
    ...(s.lines ?? []).map((l) => l.id),
    ...(s.skillRows ?? []).flatMap((r) => r.skills.map((c) => c.id)),
  ]);
}

describe('the résumé contains only the owner’s records', () => {
  it('excludes every record owned by someone else', async () => {
    const model = await buildFullModel([{ atomId: 'a1', ownerId: 'role-mine', text: 'Did a thing.' }], opts);
    const ids = idsIn(model);

    for (const foreign of [
      'role-theirs',
      'edu-theirs',
      'award-theirs',
      'pub-theirs',
      'proj-theirs',
      'skill-theirs',
    ]) {
      expect(ids, `${foreign} must not reach the résumé`).not.toContain(foreign);
    }
  });

  it('keeps the owner’s own records in every section', async () => {
    const model = await buildFullModel([{ atomId: 'a1', ownerId: 'role-mine', text: 'Did a thing.' }], opts);
    const ids = idsIn(model);
    for (const mine of ['role-mine', 'edu-mine', 'award-mine', 'pub-mine', 'proj-mine', 'skill-mine']) {
      expect(ids, `${mine} should be on the résumé`).toContain(mine);
    }
    expect(model.name).toBe('Jordan Kim');
  });

  it('claims a shared skill through a role the owner holds, not through theirs', async () => {
    // skill-shared is used by both people's roles. It is the owner's because an
    // owned role uses it, not because it happens to exist in the graph.
    const model = await buildFullModel([], opts);
    expect(idsIn(model)).toContain('skill-shared');
  });

  it('never renders a foreign record into the LaTeX', async () => {
    const model = await buildFullModel([{ atomId: 'a1', ownerId: 'role-mine', text: 'Did a thing.' }], opts);
    const tex = await renderTemplate('cobalt', model);
    for (const title of [
      'Chief Operating Officer',
      'MA Development Economics',
      'NNPC/TOTAL National Merit Scholarship',
      'Hydropower Plant Efficiency',
      'Salesforce Administration',
    ]) {
      expect(tex, `"${title}" leaked into the rendered résumé`).not.toContain(title);
    }
    expect(tex).toContain('Data Engineering Intern');
  });

  it('produces an empty résumé when no is_self anchor exists', async () => {
    // Worst case of the original bug: with no anchor every record in the graph
    // was rendered under the name "Your Name". Emitting nothing is the only
    // defensible answer.
    const graph = twoPersonGraph();
    const me = graph.nodesById.get('me')!;
    (me.props as Record<string, unknown>).is_self = false;

    const model = await buildFullModel([], { headline: 'X', graph });
    expect(idsIn(model)).toEqual([]);
    expect(model.name).toBe('Your Name');
  });
});
