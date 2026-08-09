import { Router } from 'express';
import {
  atomAggregateInputSchema,
  scoreAtoms,
  type AtomAggregateInput,
  type ParsedJd,
  type ScorableAtom,
} from '@vitae/core';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { repository, type Tx } from '../../db/repository.js';
import { loadGraph } from '../../services/resume-model.js';
import { getSelf } from '../../services/self.js';
import { buildOwnerIndex, ownedIdsFor } from '../../services/subjects.js';
import { newId, nowIso } from '../../db/util.js';
import { getTarget } from '../../services/resume.js';

export const atomsRouter: Router = Router();

interface AtomRow extends Record<string, unknown> {
  id: string;
  owner_node: string;
  kind: ScorableAtom['kind'];
  metrics?: ScorableAtom['metrics'];
  date_start?: string;
  date_end?: string;
  pinned?: boolean;
  blocked?: boolean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  rev?: number;
  evidence?: AtomAggregateInput['evidence'];
}

interface VariantRow extends Record<string, unknown> {
  id: string;
  atom_id: string;
  emphasis: ScorableAtom['variants'][number]['emphasis'];
  text: string;
  is_default: boolean;
}

interface SkillRow extends Record<string, unknown> {
  id: string;
  atom_id: string;
  skill_id: string;
  weight?: number;
}

function normalizeInput(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const source = body as Record<string, unknown>;
  const variants = Array.isArray(source.variants)
    ? source.variants.map((raw, index) => {
        const variant = raw as Record<string, unknown>;
        return { ...variant, is_default: variant.is_default ?? index === 0 };
      })
    : source.variants;
  return { ...source, variants };
}

async function validateReferences(input: AtomAggregateInput, tx: Tx) {
  const owner = await repository.getNode(input.owner_node, { includeDeleted: true }, tx);
  if (!owner || owner.deleted_at || !['role', 'project'].includes(owner.type)) {
    throw new HttpError(422, 'VALIDATION', 'owner_node must be a live role or project');
  }
  for (const skillId of [...new Set(input.skill_ids)]) {
    const skill = await repository.getNode(skillId, { includeDeleted: true }, tx);
    if (!skill || skill.deleted_at || skill.type !== 'skill') {
      throw new HttpError(422, 'VALIDATION', `skill ${skillId} does not exist or is not live`);
    }
  }
  for (const evidence of input.evidence) {
    if (evidence.kind !== 'node') continue;
    const node = await repository.getNode(evidence.node_id, { includeDeleted: true }, tx);
    if (!node || node.deleted_at) {
      throw new HttpError(
        422,
        'VALIDATION',
        `evidence node ${evidence.node_id} does not exist or is deleted`,
      );
    }
  }
}

function childRows(id: string, input: AtomAggregateInput) {
  const variants: VariantRow[] = input.variants.map((variant) => ({
    id: variant.id ?? newId(),
    atom_id: id,
    emphasis: variant.emphasis,
    text: variant.text,
    is_default: variant.is_default,
  }));
  const skills: SkillRow[] = [...new Set(input.skill_ids)].map((skillId) => ({
    id: newId(),
    atom_id: id,
    skill_id: skillId,
    weight: 1,
  }));
  return { variants, skills };
}

atomsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const [atomRows, variantRows, skillRows, nodes, graph, self] = await Promise.all([
      repository.docList<AtomRow>('atoms'),
      repository.docList<VariantRow>('atom_variants'),
      repository.docList<SkillRow>('atom_skills'),
      repository.allLiveNodes(),
      loadGraph(),
      getSelf(),
    ]);
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const variantsByAtom = new Map<string, VariantRow[]>();
    for (const variant of variantRows) {
      (
        variantsByAtom.get(variant.atom_id) ??
        variantsByAtom.set(variant.atom_id, []).get(variant.atom_id)!
      ).push(variant);
    }
    const skillsByAtom = new Map<string, SkillRow[]>();
    for (const skill of skillRows) {
      (
        skillsByAtom.get(skill.atom_id) ?? skillsByAtom.set(skill.atom_id, []).get(skill.atom_id)!
      ).push(skill);
    }

    const scopeAll = req.query.scope === 'all';
    const includeDeleted = req.query.includeDeleted === 'true';
    const mine = self ? ownedIdsFor(self.id, buildOwnerIndex(graph)) : new Set<string>();
    const allLive = atomRows.filter((atom) => !atom.deleted_at);
    let visible = atomRows.filter((atom) => includeDeleted || !atom.deleted_at);
    if (!scopeAll && self) visible = visible.filter((atom) => mine.has(atom.owner_node));
    if (typeof req.query.owner === 'string')
      visible = visible.filter((atom) => atom.owner_node === req.query.owner);
    if (typeof req.query.kind === 'string')
      visible = visible.filter((atom) => atom.kind === req.query.kind);
    if (typeof req.query.skill === 'string') {
      visible = visible.filter((atom) =>
        (skillsByAtom.get(atom.id) ?? []).some((skill) => skill.skill_id === req.query.skill),
      );
    }
    if (req.query.state === 'pinned') visible = visible.filter((atom) => atom.pinned);
    if (req.query.state === 'blocked') visible = visible.filter((atom) => atom.blocked);
    if (req.query.state === 'archived') visible = visible.filter((atom) => atom.deleted_at);
    if (req.query.state === 'incomplete') {
      visible = visible.filter(
        (atom) =>
          (variantsByAtom.get(atom.id)?.length ?? 0) < 2 ||
          (skillsByAtom.get(atom.id)?.length ?? 0) === 0,
      );
    }
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    if (q) {
      visible = visible.filter((atom) => {
        const owner = byId.get(atom.owner_node);
        const text = (variantsByAtom.get(atom.id) ?? []).map((variant) => variant.text).join(' ');
        return `${owner?.title ?? ''} ${atom.kind} ${text}`.toLowerCase().includes(q);
      });
    }

    const target =
      typeof req.query.targetId === 'string' ? await getTarget(req.query.targetId) : null;
    const scorable: ScorableAtom[] = allLive.map((atom) => ({
      id: atom.id,
      owner_node: atom.owner_node,
      kind: atom.kind,
      metrics: atom.metrics ?? [],
      evidence: atom.evidence ?? [],
      date_start: atom.date_start,
      date_end: atom.date_end,
      pinned: Boolean(atom.pinned),
      blocked: Boolean(atom.blocked),
      created_at: atom.created_at,
      updated_at: atom.updated_at,
      deleted_at: null,
      variants: (variantsByAtom.get(atom.id) ?? []).map((variant) => ({
        id: variant.id,
        atom_id: variant.atom_id,
        emphasis: variant.emphasis,
        text: variant.text,
        is_default: Boolean(variant.is_default),
      })),
      skill_ids: (skillsByAtom.get(atom.id) ?? []).map((skill) => skill.skill_id),
    }));
    const scoreMap = target ? scoreAtoms(scorable, (target.parsed as ParsedJd).keywords) : null;

    res.json({
      atoms: visible
        .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
        .map((atom) => {
          const owner = byId.get(atom.owner_node);
          const skills = (skillsByAtom.get(atom.id) ?? []).map((link) => ({
            id: link.skill_id,
            name: byId.get(link.skill_id)?.title ?? link.skill_id,
            weight: link.weight ?? 1,
          }));
          const evidence = (atom.evidence ?? []).map((item) =>
            item.kind === 'node'
              ? {
                  ...item,
                  title: byId.get(item.node_id)?.title ?? item.label ?? 'Missing record',
                  node_type: byId.get(item.node_id)?.type,
                }
              : item,
          );
          return {
            ...atom,
            rev: atom.rev ?? 1,
            variants: variantsByAtom.get(atom.id) ?? [],
            skill_ids: skills.map((skill) => skill.id),
            skills,
            evidence,
            owner_title: owner?.title ?? 'Unknown',
            owner_type: owner?.type ?? 'other',
            owner_subtitle: owner?.subtitle ?? null,
            score: scoreMap?.get(atom.id) ?? null,
          };
        }),
      owners: [...mine]
        .map((id) => byId.get(id))
        .filter((node): node is NonNullable<typeof node> =>
          Boolean(node && (node.type === 'role' || node.type === 'project')),
        )
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((node) => ({
          id: node.id,
          title: node.title,
          type: node.type,
          subtitle: node.subtitle ?? null,
        })),
      hiddenForeign:
        scopeAll || !self
          ? 0
          : atomRows.filter((atom) => !atom.deleted_at && !mine.has(atom.owner_node)).length,
    });
  }),
);

atomsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = atomAggregateInputSchema.safeParse(normalizeInput(req.body));
    if (!parsed.success)
      throw new HttpError(422, 'VALIDATION', 'invalid atom', parsed.error.issues);
    const id = newId();
    const now = nowIso();
    const {
      expected_rev: _expected,
      variants: _variants,
      skill_ids: _skills,
      ...atomInput
    } = parsed.data;
    const atom: AtomRow = {
      id,
      ...atomInput,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      rev: 1,
    };
    const children = childRows(id, parsed.data);

    await repository.transaction(async (tx) => {
      await validateReferences(parsed.data, tx);
      await repository.docPut('atoms', id, atom, {}, tx);
      for (const variant of children.variants)
        await repository.docPut('atom_variants', variant.id, variant, {}, tx);
      for (const skill of children.skills)
        await repository.docPut('atom_skills', skill.id, skill, {}, tx);
      await repository.stageRevision(tx, {
        kind: 'atom',
        id,
        rev: 1,
        op: 'create',
        actor: req.user?.email,
        snapshot: {
          ...atom,
          variants: children.variants,
          skill_ids: children.skills.map((skill) => skill.skill_id),
        },
      });
    });
    res.status(201).json({ id });
  }),
);

atomsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const aggregateEdit = Array.isArray(req.body?.variants);
    await repository.transaction(async (tx) => {
      const before = await repository.docGet<AtomRow>('atoms', req.params.id, tx);
      if (!before) throw new HttpError(404, 'NOT_FOUND', 'Atom not found.');
      const rev = (before.rev ?? 1) + 1;

      if (!aggregateEdit) {
        const patch: Record<string, unknown> = { updated_at: nowIso(), rev };
        if (typeof req.body?.pinned === 'boolean') patch.pinned = req.body.pinned;
        if (typeof req.body?.blocked === 'boolean') patch.blocked = req.body.blocked;
        const after = { ...before, ...patch };
        await repository.docPut('atoms', req.params.id, after, {}, tx);
        await repository.stageRevision(tx, {
          kind: 'atom',
          id: req.params.id,
          rev,
          op: 'update',
          snapshot: after,
          diff: patch,
          actor: req.user?.email,
        });
        return;
      }

      const parsed = atomAggregateInputSchema.safeParse(normalizeInput(req.body));
      if (!parsed.success)
        throw new HttpError(422, 'VALIDATION', 'invalid atom', parsed.error.issues);
      if (
        parsed.data.expected_rev !== undefined &&
        parsed.data.expected_rev !== (before.rev ?? 1)
      ) {
        throw new HttpError(
          409,
          'REV_CONFLICT',
          'This atom changed since it was opened. Reload it before saving.',
        );
      }
      await validateReferences(parsed.data, tx);
      const {
        expected_rev: _expected,
        variants: _variants,
        skill_ids: _skills,
        ...atomInput
      } = parsed.data;
      const after: AtomRow = { ...before, ...atomInput, updated_at: nowIso(), rev };
      const oldVariants = await repository.docQuery<VariantRow>(
        'atom_variants',
        { atom_id: req.params.id },
        tx,
      );
      const oldSkills = await repository.docQuery<SkillRow>(
        'atom_skills',
        { atom_id: req.params.id },
        tx,
      );
      const children = childRows(req.params.id, parsed.data);
      for (const variant of oldVariants) await repository.docDelete('atom_variants', variant.id, tx);
      for (const skill of oldSkills) await repository.docDelete('atom_skills', skill.id, tx);
      await repository.docPut('atoms', req.params.id, after, {}, tx);
      for (const variant of children.variants)
        await repository.docPut('atom_variants', variant.id, variant, {}, tx);
      for (const skill of children.skills)
        await repository.docPut('atom_skills', skill.id, skill, {}, tx);
      const snapshot = {
        ...after,
        variants: children.variants,
        skill_ids: children.skills.map((skill) => skill.skill_id),
      };
      await repository.stageRevision(tx, {
        kind: 'atom',
        id: req.params.id,
        rev,
        op: 'update',
        snapshot,
        diff: atomInput,
        actor: req.user?.email,
      });
    });
    res.json({ ok: true });
  }),
);

async function setDeleted(id: string, deleted: boolean, actor?: string) {
  await repository.transaction(async (tx) => {
    const before = await repository.docGet<AtomRow>('atoms', id, tx);
    if (!before) throw new HttpError(404, 'NOT_FOUND', 'Atom not found.');
    const rev = (before.rev ?? 1) + 1;
    const after = { ...before, deleted_at: deleted ? nowIso() : null, updated_at: nowIso(), rev };
    await repository.docPut('atoms', id, after, {}, tx);
    await repository.stageRevision(tx, {
      kind: 'atom',
      id,
      rev,
      op: deleted ? 'delete' : 'restore',
      snapshot: after,
      diff: { deleted_at: after.deleted_at },
      actor,
    });
  });
}

atomsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await setDeleted(req.params.id, true, req.user?.email);
    res.json({ ok: true });
  }),
);

atomsRouter.post(
  '/:id/restore',
  asyncHandler(async (req, res) => {
    await setDeleted(req.params.id, false, req.user?.email);
    res.json({ ok: true });
  }),
);

atomsRouter.post(
  '/:id/duplicate',
  asyncHandler(async (req, res) => {
    const [atom, variants, skills] = await Promise.all([
      repository.docGet<AtomRow>('atoms', req.params.id),
      repository.docQuery<VariantRow>('atom_variants', { atom_id: req.params.id }),
      repository.docQuery<SkillRow>('atom_skills', { atom_id: req.params.id }),
    ]);
    if (!atom || atom.deleted_at) throw new HttpError(404, 'NOT_FOUND', 'Atom not found.');
    const input = {
      owner_node: atom.owner_node,
      kind: atom.kind,
      metrics: atom.metrics ?? [],
      evidence: atom.evidence ?? [],
      date_start: atom.date_start,
      date_end: atom.date_end,
      pinned: false,
      blocked: false,
      variants: variants.map((variant) => ({
        emphasis: variant.emphasis,
        text: variant.text,
        is_default: variant.is_default,
      })),
      skill_ids: skills.map((skill) => skill.skill_id),
    };
    const parsed = atomAggregateInputSchema.parse(input);
    const id = newId();
    const now = nowIso();
    const {
      variants: _variants,
      skill_ids: _skillIds,
      expected_rev: _expected,
      ...atomInput
    } = parsed;
    const duplicate: AtomRow = {
      id,
      ...atomInput,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      rev: 1,
    };
    const children = childRows(id, parsed);
    await repository.transaction(async (tx) => {
      await validateReferences(parsed, tx);
      await repository.docPut('atoms', id, duplicate, {}, tx);
      for (const variant of children.variants)
        await repository.docPut('atom_variants', variant.id, variant, {}, tx);
      for (const skill of children.skills)
        await repository.docPut('atom_skills', skill.id, skill, {}, tx);
      await repository.stageRevision(tx, {
        kind: 'atom',
        id,
        rev: 1,
        op: 'create',
        snapshot: { ...duplicate, variants: children.variants },
        actor: req.user?.email,
        source: 'duplicate',
      });
    });
    res.status(201).json({ id });
  }),
);
