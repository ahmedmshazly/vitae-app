import { Router } from 'express';
import { createHash } from 'node:crypto';
import type { FitDecision, ParsedJd } from '@vitae/core';
import { applyFitStep, estimateLines, planFitStep } from '@vitae/core';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { repository } from '../../db/repository.js';
import { newId, nowIso } from '../../db/util.js';
import { todayIso } from '../../db/timezone.js';
import {
  compileResume,
  DEFAULT_TEMPLATE_KEY,
  getTarget,
  listTargets,
  listTemplates,
  loadScorableAtoms,
  loadTemplate,
  tailor,
} from '../../services/resume.js';
import { buildFullModel, estimateStaticLines, loadGraph, type DocConfig } from '../../services/resume-model.js';
import { getSettings, patchSettings } from '../../services/settings.js';
import { storage } from '../../services/storage/cloudinary.js';
import * as buildsvc from '../../services/buildsvc-client.js';
import { env } from '../../env.js';

export const resumesRouter: Router = Router();

/** Shared request shape for model/compile/finalize (the Tailor draft). */
interface ResumeRequestBody {
  targetId?: string;
  templateKey?: string;
  mode?: 'auto' | 'manual';
  include?: string[];
  pins?: string[];
  blocks?: string[];
  budgetLines?: number;
  preferredEmphasis?: string;
  variantByAtom?: Record<string, string>;
  accent?: string;
  atomOrder?: string[];
  sectionOrder?: string[];
  sectionsEnabled?: Record<string, boolean>;
  // Item-level document config (visual editor): contacts, per-section entry
  // order/visibility, individual skills.
  contactOrder?: string[];
  contactDisabled?: string[];
  itemOrder?: Record<string, string[]>;
  itemsDisabled?: string[];
  itemsEnabled?: string[];
  skillsDisabled?: string[];
  bulletOrder?: Record<string, string[]>;
  bulletsDisabled?: string[];
  headline?: string;
  summary?: string;
  name?: string;
}

const ACCENTS = ['#2563eb', '#0f766e', '#7c3aed', '#b45309', '#be123c', '#111827'];
const EMPHASES = ['technical', 'leadership', 'concise', 'detailed'];

function assertCuratedBody(body: ResumeRequestBody) {
  if (body.accent && !ACCENTS.includes(body.accent)) {
    throw new HttpError(422, 'VALIDATION', 'Accent must be selected from the curated palette.');
  }
  if (body.preferredEmphasis && !EMPHASES.includes(body.preferredEmphasis)) {
    throw new HttpError(422, 'VALIDATION', 'Unknown preferred wording emphasis.');
  }
  if (
    body.variantByAtom &&
    Object.values(body.variantByAtom).some((value) => !EMPHASES.includes(value))
  ) {
    throw new HttpError(422, 'VALIDATION', 'Unknown atom variant emphasis.');
  }
}

function docConfigOf(body: ResumeRequestBody): DocConfig {
  return {
    sectionsEnabled: body.sectionsEnabled,
    sectionOrder: body.sectionOrder,
    contactOrder: body.contactOrder,
    contactDisabled: body.contactDisabled,
    itemOrder: body.itemOrder,
    itemsDisabled: body.itemsDisabled,
    itemsEnabled: body.itemsEnabled,
    skillsDisabled: body.skillsDisabled,
    bulletOrder: body.bulletOrder,
    bulletsDisabled: body.bulletsDisabled,
  };
}

/** Map a persisted résumé.config blob onto DocConfig (camelCase + legacy snake_case). */
function docConfigFromStored(config: Record<string, unknown>): DocConfig {
  return {
    sectionsEnabled: config.sectionsEnabled as DocConfig['sectionsEnabled'],
    sectionOrder: (config.sectionOrder ?? config.section_order) as DocConfig['sectionOrder'],
    contactOrder: config.contactOrder as DocConfig['contactOrder'],
    contactDisabled: config.contactDisabled as DocConfig['contactDisabled'],
    itemOrder: config.itemOrder as DocConfig['itemOrder'],
    itemsDisabled: config.itemsDisabled as DocConfig['itemsDisabled'],
    itemsEnabled: config.itemsEnabled as DocConfig['itemsEnabled'],
    skillsDisabled: config.skillsDisabled as DocConfig['skillsDisabled'],
    bulletOrder: config.bulletOrder as DocConfig['bulletOrder'],
    bulletsDisabled: config.bulletsDisabled as DocConfig['bulletsDisabled'],
  };
}

resumesRouter.get(
  '/templates',
  asyncHandler(async (_req, res) => {
    const [templates, settings, health] = await Promise.all([
      listTemplates(),
      getSettings(),
      buildsvc.healthz(),
    ]);
    res.json({
      templates,
      defaultKey: settings.resumeDefaults.templateKey ?? DEFAULT_TEMPLATE_KEY,
      defaultAccent: settings.resumeDefaults.accent,
      calibration: health.ok ? health.detail : { ok: false },
    });
  }),
);

resumesRouter.patch(
  '/templates/default',
  asyncHandler(async (req, res) => {
    const templateKey = String(req.body?.templateKey ?? '');
    if (!(await listTemplates()).some((template) => template.key === templateKey)) {
      throw new HttpError(422, 'VALIDATION', 'Unknown résumé template.');
    }
    const settings = await patchSettings({
      resumeDefaults: { ...(await getSettings()).resumeDefaults, templateKey },
    });
    res.json({ defaultKey: settings.resumeDefaults.templateKey });
  }),
);

/** Score atoms + select to the page budget, auto (knapsack) or manual (SRS FR-RES-007/008/009). */
resumesRouter.post(
  '/tailor',
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as ResumeRequestBody;
    assertCuratedBody(body);
    const { targetId, templateKey = DEFAULT_TEMPLATE_KEY, budgetLines, preferredEmphasis, pins, blocks, mode, include } =
      body;
    if (!targetId) throw new HttpError(400, 'BAD_REQUEST', 'targetId required');
    const result = await tailor({
      targetId,
      templateKey,
      budgetLines,
      preferredEmphasis,
      pins,
      blocks,
      mode,
      include,
      variantByAtom: body.variantByAtom,
    });
    res.json(result);
  }),
);

/** Run selection + model assembly for a model/compile/finalize request. */
async function prepare(body: ResumeRequestBody) {
  assertCuratedBody(body);
  const settings = await getSettings();
  const { targetId, templateKey = settings.resumeDefaults.templateKey || DEFAULT_TEMPLATE_KEY } = body;
  const target = await getTarget(targetId ?? '');
  if (!target) throw new HttpError(404, 'NOT_FOUND', 'target not found');
  const parsed = target.parsed as ParsedJd;
  const template = await loadTemplate(templateKey);

  const docConfig = docConfigOf(body);
  const headline = body.headline ?? String(target.role_title ?? 'Professional');

  // One graph load serves both model builds below.
  const graph = await loadGraph();

  // Static sections (skills/education/awards/research/summary) consume lines
  // the knapsack doesn't know about, shrink its budget so one page holds.
  const staticModel = await buildFullModel([], { headline, summary: body.summary, graph, ...docConfig });
  const staticLines = estimateStaticLines(staticModel, template.line_model);
  const budgetLines = body.budgetLines ?? Math.max(8, template.line_model.lines_per_page - staticLines);

  const t = await tailor({
    targetId: targetId!,
    templateKey,
    budgetLines,
    preferredEmphasis: body.preferredEmphasis ?? settings.resumeDefaults.emphasis,
    pins: body.pins,
    blocks: body.blocks,
    mode: body.mode,
    include: body.include,
    variantByAtom: body.variantByAtom,
  });

  // Optional explicit ordering on top of auto selection (drag-and-drop):
  // listed ids first in the given order, unlisted keep their relative order.
  let entries = t.selection.entries;
  if (body.atomOrder?.length) {
    const rank = new Map(body.atomOrder.map((id, i) => [id, i]));
    entries = [...entries].sort((a, b) => {
      const ra = rank.get(a.atomId);
      const rb = rank.get(b.atomId);
      if (ra !== undefined && rb !== undefined) return ra - rb;
      if (ra !== undefined) return -1;
      if (rb !== undefined) return 1;
      return 0; // stable: preserve selection order among unlisted
    });
  }

  const model = await buildFullModel(entries, { headline, summary: body.summary, graph, ...docConfig });
  return {
    target,
    parsed,
    template,
    t: { ...t, selection: { ...t.selection, entries } },
    model,
    templateKey,
    headline,
    accent: body.accent ?? settings.resumeDefaults.accent,
    preferredEmphasis: body.preferredEmphasis ?? settings.resumeDefaults.emphasis,
    variantByAtom: body.variantByAtom ?? {},
  };
}

/** Assemble the résumé model for the visual editor, no LaTeX, no compile. */
resumesRouter.post(
  '/model',
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as ResumeRequestBody;
    const { t, model } = await prepare(body);
    res.json({ model, pageEstimate: t.pageEstimate, selection: t.selection });
  }),
);

/** Build the résumé model, render LaTeX, and compile (SRS FR-RES-011/012/013). */
resumesRouter.post(
  '/compile',
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as ResumeRequestBody;
    const { target, parsed, t, model, templateKey, accent } = await prepare(body);

    const { tex, compile, coverage } = await compileResume({
      templateKey,
      model,
      parsed,
      sourceDateEpoch: Math.floor(Date.parse(target.created_at as string) / 1000),
      accent,
    });

    res.json({
      ok: compile.ok,
      pages: compile.pages ?? null,
      offline: compile.offline ?? false,
      error: compile.error ?? null,
      logTail: compile.logTail ?? null,
      pdfBase64: compile.pdfBase64 ?? null,
      tex,
      coverage,
      pageEstimate: t.pageEstimate,
      selection: t.selection,
    });
  }),
);

/** Finalize: one-page fit loop (FR-RES-014) + ≥95% coverage gate (FR-RES-015). */
resumesRouter.post(
  '/finalize',
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as ResumeRequestBody;
    const {
      target,
      parsed,
      template,
      t,
      model: initialModel,
      templateKey,
      headline,
      accent,
      preferredEmphasis,
      variantByAtom: initialVariantByAtom,
    } = await prepare(body);
    const sourceDateEpoch = Math.floor(Date.parse(String(target.created_at)) / 1000);
    const docConfig = docConfigOf(body);
    const graph = await loadGraph();

    let entries = [...t.selection.entries];
    let variantByAtom = { ...initialVariantByAtom };
    let model = initialModel;
    let { tex, compile, coverage } = await compileResume({
      templateKey,
      model,
      parsed,
      sourceDateEpoch,
      accent,
    });

    const fitDecisions: FitDecision[] = [];
    let needsManualTrim = false;
    const pinSet = new Set<string>(body.pins ?? []);
    // Resolve pin flags from request + atom defaults for drop protection.
    const atoms = await loadScorableAtoms();
    for (const atom of atoms) {
      if (atom.pinned) pinSet.add(atom.id);
    }

    const scoreById = new Map(t.scores.map((score) => [score.atomId, score.score]));
    const conciseByAtom = new Map(
      atoms
        .map((atom) => {
          const concise = atom.variants.find((variant) => variant.emphasis === 'concise');
          if (!concise) return null;
          return [
            atom.id,
            {
              text: concise.text,
              lines: estimateLines(concise.text, template.line_model),
            },
          ] as const;
        })
        .filter((row): row is readonly [string, { text: string; lines: number }] => row !== null),
    );

    while (
      compile.ok &&
      !compile.offline &&
      typeof compile.pages === 'number' &&
      compile.pages > 1 &&
      fitDecisions.length < 3
    ) {
      const step = planFitStep(
        entries.map((entry) => ({
          atomId: entry.atomId,
          score: scoreById.get(entry.atomId) ?? 0,
          pinned: pinSet.has(entry.atomId),
          emphasis: entry.emphasis,
          hasConcise: conciseByAtom.has(entry.atomId),
        })),
      );
      if (!step) {
        needsManualTrim = true;
        break;
      }
      const before = entries.find((entry) => entry.atomId === step.atomId);
      const pagesBefore = compile.pages;
      entries = applyFitStep(entries, step, conciseByAtom);
      if (step.action === 'concise-swap') {
        variantByAtom = { ...variantByAtom, [step.atomId]: 'concise' };
      }
      fitDecisions.push({
        iteration: fitDecisions.length + 1,
        action: step.action,
        atomId: step.atomId,
        pagesBefore,
        emphasisBefore: before?.emphasis,
        emphasisAfter: step.action === 'concise-swap' ? 'concise' : undefined,
      });
      model = await buildFullModel(entries, {
        headline,
        summary: body.summary,
        graph,
        ...docConfig,
      });
      ({ tex, compile, coverage } = await compileResume({
        templateKey,
        model,
        parsed,
        sourceDateEpoch,
        accent,
      }));
    }

    if (compile.ok && !compile.offline && typeof compile.pages === 'number' && compile.pages > 1) {
      needsManualTrim = true;
    }

    const totalLines = entries.reduce((sum, entry) => sum + entry.lines, 0);
    const selection = {
      ...t.selection,
      entries,
      totalLines,
    };
    const pageEstimate = {
      lines: totalLines,
      budget: template.line_model.lines_per_page,
      pages: Math.max(1, Math.ceil(totalLines / template.line_model.lines_per_page)),
      fill: totalLines / template.line_model.lines_per_page,
    };

    const gatePassed = coverage ? coverage.passesGate : false;
    const onePage = compile.ok ? compile.pages === 1 : false;
    const status = compile.ok && onePage && gatePassed ? 'final' : 'draft';

    const id = newId();
    const now = nowIso();
    const baseId = (await repository.docGet<{ resume_id?: string }>('meta', 'resume-base'))
      ?.resume_id;
    const base = baseId
      ? await repository.docGet<Record<string, unknown>>('resumes', baseId)
      : null;

    let artifacts: Array<Record<string, unknown>> = [];
    if (env.NODE_ENV !== 'test' && compile.ok && compile.pdfBase64) {
      try {
        artifacts = await Promise.all([
          artifactRecord({
            resumeId: id,
            kind: 'pdf',
            bytes: Buffer.from(compile.pdfBase64, 'base64'),
            createdAt: now,
          }),
          artifactRecord({
            resumeId: id,
            kind: 'tex',
            bytes: Buffer.from(tex, 'utf8'),
            createdAt: now,
          }),
        ]);
      } catch {
        // Storage outage must not block finalize: Outputs will show "re-export".
        artifacts = [];
      }
    }
    // An attachments row asserts a blob was stored and can be fetched back, so
    // a record with no storage key must not become one. The rebuild path below
    // already refuses this through a NODE_ENV check; keying on the missing key
    // instead says why rather than where, and also covers a storage adapter
    // that answers without one. Without it the export guard refuses to back the
    // whole workspace up rather than hand out a bundle it cannot honour.
    artifacts = artifacts.filter((artifact) => artifact.storage_key);
    const artifactByKind = new Map(
      artifacts.map((artifact) => [String(artifact.artifact_kind), artifact]),
    );

    const record = {
      id,
      target_id: body.targetId,
      template_key: templateKey,
      template_version: template.version,
      name: body.name ?? `${target.company ?? 'Company'}: ${target.role_title}: ${now.slice(0, 10)}`,
      config: {
        headline,
        summary: body.summary ?? null,
        accent,
        emphasis: preferredEmphasis,
        variant_by_atom: variantByAtom,
        mode: body.mode ?? 'auto',
        include: body.include ?? [],
        pins: body.pins ?? [],
        blocks: body.blocks ?? [],
        atomOrder: body.atomOrder ?? [],
        sectionOrder: body.sectionOrder ?? [],
        sectionsEnabled: body.sectionsEnabled ?? {},
        contactOrder: body.contactOrder ?? [],
        contactDisabled: body.contactDisabled ?? [],
        itemOrder: body.itemOrder ?? {},
        itemsDisabled: body.itemsDisabled ?? [],
        itemsEnabled: body.itemsEnabled ?? [],
        skillsDisabled: body.skillsDisabled ?? [],
        bulletOrder: body.bulletOrder ?? {},
        bulletsDisabled: body.bulletsDisabled ?? [],
      },
      selection,
      page_estimate: pageEstimate,
      fit_decisions: fitDecisions,
      needs_manual_trim: needsManualTrim,
      coverage,
      pages: compile.pages ?? null,
      status,
      target_snapshot: {
        id: target.id,
        role_title: target.role_title,
        company: target.company,
        status: target.status,
      },
      base_resume_id: baseId ?? null,
      base_diff: selectionDiff(base, selection.entries),
      tex_key: artifactByKind.get('tex')?.storage_key ?? null,
      pdf_key: artifactByKind.get('pdf')?.storage_key ?? null,
      artifact_ids: {
        tex: artifactByKind.get('tex')?.id,
        pdf: artifactByKind.get('pdf')?.id,
      },
      artifact_hashes: {
        tex: artifactByKind.get('tex')?.sha256,
        pdf: artifactByKind.get('pdf')?.sha256,
      },
      source_date_epoch: sourceDateEpoch,
      rev: 1,
      deleted_at: null,
      created_at: now,
      updated_at: now,
    };

    await repository.transaction(async (tx) => {
      await repository.docPut('resumes', id, record, {}, tx);
      for (const artifact of artifacts)
        await repository.docPut('attachments', String(artifact.id), artifact, {}, tx);
      await repository.stageRevision(tx, {
        kind: 'resume',
        id,
        rev: 1,
        op: 'create',
        snapshot: record,
        actor: req.user?.email,
      });
      if (!baseId && status === 'final') {
        await repository.docPut('meta', 'resume-base', { resume_id: id, updated_at: now }, {}, tx);
      }
    });

    res.json({
      id,
      status,
      onePage,
      gatePassed,
      needsManualTrim,
      fitDecisions,
      coverage,
      pages: compile.pages ?? null,
      offline: compile.offline ?? false,
      error: compile.error ?? null,
      logTail: compile.logTail ?? null,
      artifactIds: record.artifact_ids,
      selection,
      pageEstimate,
    });
  }),
);

async function artifactRecord(params: {
  resumeId: string;
  kind: 'pdf' | 'tex';
  bytes: Buffer;
  createdAt: string;
}) {
  const mime = params.kind === 'pdf' ? 'application/pdf' : 'application/x-tex';
  const filename = `resume-${params.resumeId}.${params.kind}`;
  const sha256 = createHash('sha256').update(params.bytes).digest('hex');
  const stored =
    env.NODE_ENV === 'test'
      ? null
      : await storage.upload({ data: params.bytes, filename, mime, sha256 });
  const id = newId();
  return {
    id,
    subject_id: params.resumeId,
    subject_kind: 'resume',
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

function selectionDiff(
  base: Record<string, unknown> | null,
  entries: Array<{ atomId: string; text: string; emphasis: string }>,
) {
  if (!base) return null;
  const prior = ((base.selection as Record<string, unknown> | undefined)?.entries ?? []) as Array<{
    atomId: string;
    text: string;
    emphasis: string;
  }>;
  const before = new Map(prior.map((entry) => [entry.atomId, entry]));
  const after = new Map(entries.map((entry) => [entry.atomId, entry]));
  return {
    added: entries.filter((entry) => !before.has(entry.atomId)).map((entry) => entry.atomId),
    removed: prior.filter((entry) => !after.has(entry.atomId)).map((entry) => entry.atomId),
    changed: entries
      .filter((entry) => {
        const old = before.get(entry.atomId);
        return old && (old.text !== entry.text || old.emphasis !== entry.emphasis);
      })
      .map((entry) => entry.atomId),
  };
}

resumesRouter.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const [atoms, variants, atomSkills, targets, resumes, base] = await Promise.all([
      repository.docList<Record<string, unknown>>('atoms'),
      repository.docList<Record<string, unknown>>('atom_variants'),
      repository.docList<Record<string, unknown>>('atom_skills'),
      repository.docList<Record<string, unknown>>('targets'),
      repository.docList<Record<string, unknown>>('resumes'),
      repository.docGet<{ resume_id?: string }>('meta', 'resume-base'),
    ]);
    const liveAtoms = atoms.filter((atom) => !atom.deleted_at);
    const liveTargets = targets.filter((target) => !target.deleted_at);
    const liveResumes = resumes.filter((resume) => !resume.deleted_at);
    const variantCounts = new Map<string, number>();
    const skillCounts = new Map<string, number>();
    for (const variant of variants) {
      const atomId = String(variant.atom_id);
      variantCounts.set(atomId, (variantCounts.get(atomId) ?? 0) + 1);
    }
    for (const skill of atomSkills) {
      const atomId = String(skill.atom_id);
      skillCounts.set(atomId, (skillCounts.get(atomId) ?? 0) + 1);
    }
    res.json({
      counts: {
        atoms: liveAtoms.length,
        pinnedAtoms: liveAtoms.filter((atom) => atom.pinned).length,
        incompleteAtoms: liveAtoms.filter(
          (atom) =>
            (variantCounts.get(String(atom.id)) ?? 0) < 2 ||
            (skillCounts.get(String(atom.id)) ?? 0) === 0,
        ).length,
        targets: liveTargets.length,
        activeTargets: liveTargets.filter((target) =>
          ['saved', 'active'].includes(String(target.status)),
        ).length,
        outputs: liveResumes.length,
        finalized: liveResumes.filter((resume) =>
          ['final', 'sent'].includes(String(resume.status)),
        ).length,
      },
      baseResumeId: base?.resume_id ?? null,
      recent: liveResumes
        .sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')))
        .slice(0, 4),
    });
  }),
);

resumesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const resume = await repository.docGet<Record<string, unknown>>('resumes', req.params.id);
    if (!resume || (resume.deleted_at && req.query.includeDeleted !== 'true'))
      throw new HttpError(404, 'NOT_FOUND', 'résumé not found');
    const target = resume.target_id ? await getTarget(String(resume.target_id)) : null;
    const attachments = await repository.docQuery<Record<string, unknown>>('attachments', {
      subject_id: req.params.id,
    });
    const baseId = (await repository.docGet<{ resume_id?: string }>('meta', 'resume-base'))
      ?.resume_id;
    res.json({
      resume: { ...resume, target, artifacts: attachments, is_base: baseId === resume.id },
    });
  }),
);

resumesRouter.get(
  '/:id/artifacts/:kind',
  asyncHandler(async (req, res) => {
    if (!['pdf', 'tex'].includes(req.params.kind))
      throw new HttpError(404, 'NOT_FOUND', 'artifact not found');
    const resume = await repository.docGet<Record<string, unknown>>('resumes', req.params.id);
    if (!resume || resume.deleted_at) throw new HttpError(404, 'NOT_FOUND', 'résumé not found');
    const artifactId = (resume.artifact_ids as Record<string, string> | undefined)?.[
      req.params.kind
    ];
    const artifact = artifactId
      ? await repository.docGet<Record<string, unknown>>('attachments', artifactId)
      : null;
    if (!artifact?.storage_key)
      throw new HttpError(
        409,
        'ARTIFACT_UNAVAILABLE',
        'This output has no stored artifact. Use Rebuild artifacts on the Outputs detail sheet.',
      );
    const url = await storage.signedUrl(String(artifact.storage_key), 300, String(artifact.mime));
    res.json({
      url,
      expiresIn: 300,
      filename: artifact.filename,
      sha256: artifact.sha256,
    });
  }),
);

/**
 * Recompile a saved output and (re)upload PDF/TeX to Cloudinary (FR-RES-019 recovery).
 * Older outputs finalized before storage was wired, or during a storage outage, keep
 * their selection/config, this fills in private artifacts without a full Tailor pass.
 * When the stored selection is empty (legacy seed rows), re-run tailor first.
 */
resumesRouter.post(
  '/:id/reexport',
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const resume = await repository.docGet<Record<string, unknown>>('resumes', id);
    if (!resume || resume.deleted_at) throw new HttpError(404, 'NOT_FOUND', 'résumé not found');

    const targetId = String(resume.target_id ?? '');
    const target = await getTarget(targetId);
    if (!target) throw new HttpError(404, 'NOT_FOUND', 'target not found');

    const config = (resume.config ?? {}) as Record<string, unknown>;
    const templateKey = String(resume.template_key ?? DEFAULT_TEMPLATE_KEY);
    const parsed = target.parsed as ParsedJd;
    const sourceDateEpoch =
      Number(resume.source_date_epoch) ||
      Math.floor(Date.parse(String(target.created_at)) / 1000);

    type Entry = {
      atomId: string;
      ownerId: string;
      emphasis: string;
      text: string;
      lines: number;
    };
    const priorSelection = (resume.selection ?? {}) as {
      entries?: Entry[];
      totalLines?: number;
      weightedCoverage?: number;
    };
    let entries = [...(priorSelection.entries ?? [])];
    let selection = {
      entries,
      totalLines: priorSelection.totalLines ?? entries.reduce((sum, e) => sum + (e.lines ?? 0), 0),
      weightedCoverage: priorSelection.weightedCoverage ?? 0,
    };
    let refreshedSelection = false;

    if (entries.length === 0) {
      const tailored = await tailor({
        targetId,
        templateKey,
        preferredEmphasis:
          typeof config.emphasis === 'string'
            ? config.emphasis
            : typeof config.preferredEmphasis === 'string'
              ? config.preferredEmphasis
              : undefined,
        variantByAtom:
          (config.variant_by_atom as Record<string, string> | undefined) ??
          (config.variantByAtom as Record<string, string> | undefined),
        mode: (config.mode as 'auto' | 'manual' | undefined) ?? 'auto',
        include: Array.isArray(config.include) ? (config.include as string[]) : undefined,
        pins: Array.isArray(config.pins) ? (config.pins as string[]) : undefined,
        blocks: Array.isArray(config.blocks) ? (config.blocks as string[]) : undefined,
      });
      selection = tailored.selection;
      entries = [...selection.entries];
      refreshedSelection = true;
    }

    const graph = await loadGraph();
    const headline =
      (typeof config.headline === 'string' && config.headline) ||
      String(target.role_title ?? 'Professional');
    const model = await buildFullModel(entries, {
      headline,
      summary: typeof config.summary === 'string' ? config.summary : undefined,
      graph,
      ...docConfigFromStored(config),
    });

    const accent = typeof config.accent === 'string' ? config.accent : undefined;
    const { tex, compile, coverage } = await compileResume({
      templateKey,
      model,
      parsed,
      sourceDateEpoch,
      accent,
    });

    if (!compile.ok || !compile.pdfBase64) {
      throw new HttpError(
        compile.offline ? 503 : 422,
        compile.offline ? 'BUILD_OFFLINE' : 'COMPILE_FAILED',
        compile.error?.message ?? 'Could not recompile this output for artifact recovery.',
      );
    }

    const now = nowIso();
    let artifacts: Array<Record<string, unknown>>;
    try {
      artifacts = await Promise.all([
        artifactRecord({
          resumeId: id,
          kind: 'pdf',
          bytes: Buffer.from(compile.pdfBase64, 'base64'),
          createdAt: now,
        }),
        artifactRecord({
          resumeId: id,
          kind: 'tex',
          bytes: Buffer.from(tex, 'utf8'),
          createdAt: now,
        }),
      ]);
    } catch {
      throw new HttpError(
        503,
        'STORAGE_UNAVAILABLE',
        'Compile succeeded but Cloudinary storage failed. Retry Rebuild artifacts shortly.',
      );
    }

    // In tests we skip Cloudinary and do not write attachment rows (null
    // storage_key would break later export/restore round-trips). Prod requires
    // a real storage_key on every artifact.
    if (env.NODE_ENV === 'test') {
      artifacts = artifacts.map((artifact) => ({ ...artifact, storage_key: null }));
    } else if (artifacts.some((a) => !a.storage_key)) {
      throw new HttpError(
        503,
        'STORAGE_UNAVAILABLE',
        'Compile succeeded but Cloudinary storage failed. Retry Rebuild artifacts shortly.',
      );
    }

    const artifactByKind = new Map(
      artifacts.map((artifact) => [String(artifact.artifact_kind), artifact]),
    );
    const persistAttachments = env.NODE_ENV !== 'test';
    const oldIds = Object.values(
      (resume.artifact_ids as Record<string, string> | undefined) ?? {},
    ).filter(Boolean);
    const oldKeys: Array<{ key: string; mime: string }> = [];
    for (const oldId of oldIds) {
      const old = await repository.docGet<Record<string, unknown>>('attachments', oldId);
      if (old?.storage_key) {
        oldKeys.push({
          key: String(old.storage_key),
          mime: String(old.mime ?? 'application/octet-stream'),
        });
      }
    }

    const template = await loadTemplate(templateKey);
    const linesPerPage = template.line_model.lines_per_page;
    const rev = Number(resume.rev ?? 1) + 1;
    const next = {
      ...resume,
      selection,
      coverage: coverage ?? resume.coverage ?? null,
      pages: compile.pages ?? resume.pages ?? null,
      page_estimate: {
        lines: selection.totalLines,
        budget:
          (resume.page_estimate as { budget?: number } | undefined)?.budget ?? linesPerPage,
        pages: Math.max(1, Math.ceil(selection.totalLines / linesPerPage)),
        fill: selection.totalLines / linesPerPage,
      },
      tex_key: artifactByKind.get('tex')?.storage_key ?? null,
      pdf_key: artifactByKind.get('pdf')?.storage_key ?? null,
      artifact_ids: {
        tex: artifactByKind.get('tex')?.id,
        pdf: artifactByKind.get('pdf')?.id,
      },
      artifact_hashes: {
        tex: artifactByKind.get('tex')?.sha256,
        pdf: artifactByKind.get('pdf')?.sha256,
      },
      source_date_epoch: sourceDateEpoch,
      updated_at: now,
      rev,
    };

    await repository.transaction(async (tx) => {
      await repository.docPut('resumes', id, next, {}, tx);
      if (persistAttachments) {
        for (const artifact of artifacts)
          await repository.docPut('attachments', String(artifact.id), artifact, {}, tx);
        for (const oldId of oldIds) await repository.docDelete('attachments', oldId, tx);
      }
      await repository.stageRevision(tx, {
        kind: 'resume',
        id,
        rev,
        op: 'update',
        snapshot: next,
        actor: req.user?.email,
      });
    });

    if (env.NODE_ENV !== 'test') {
      for (const old of oldKeys) {
        try {
          await storage.delete(old.key, old.mime);
        } catch {
          // Best-effort, new artifacts are already stored.
        }
      }
    }

    res.json({
      ok: true,
      id,
      refreshedSelection,
      pages: next.pages,
      coverage: next.coverage,
      artifactIds: next.artifact_ids,
      artifactHashes: next.artifact_hashes,
    });
  }),
);

resumesRouter.post(
  '/:id/set-base',
  asyncHandler(async (req, res) => {
    const resume = await repository.docGet<Record<string, unknown>>('resumes', req.params.id);
    if (!resume || resume.deleted_at) throw new HttpError(404, 'NOT_FOUND', 'résumé not found');
    if (!['final', 'sent'].includes(String(resume.status)))
      throw new HttpError(409, 'NOT_FINAL', 'Only a finalized output can be the base résumé.');
    await repository.docPut('meta', 'resume-base', {
      resume_id: req.params.id,
      updated_at: nowIso(),
    });
    res.json({ ok: true, resumeId: req.params.id });
  }),
);

resumesRouter.post(
  '/:id/duplicate',
  asyncHandler(async (req, res) => {
    const source = await repository.docGet<Record<string, unknown>>('resumes', req.params.id);
    if (!source || source.deleted_at) throw new HttpError(404, 'NOT_FOUND', 'résumé not found');
    const id = newId();
    const now = nowIso();
    const copy = {
      ...source,
      id,
      name: `${source.name ?? 'Résumé'}, copy`,
      status: 'draft',
      sent_at: null,
      application_id: null,
      artifact_ids: {},
      artifact_hashes: {},
      tex_key: null,
      pdf_key: null,
      rev: 1,
      deleted_at: null,
      created_at: now,
      updated_at: now,
    };
    await repository.transaction(async (tx) => {
      await repository.docPut('resumes', id, copy, {}, tx);
      await repository.stageRevision(tx, {
        kind: 'resume',
        id,
        rev: 1,
        op: 'create',
        snapshot: copy,
        actor: req.user?.email,
      });
    });
    res.status(201).json({ resume: copy });
  }),
);

resumesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const current = await repository.docGet<Record<string, unknown>>('resumes', req.params.id);
    if (!current) throw new HttpError(404, 'NOT_FOUND', 'résumé not found');
    const rev = Number(current.rev ?? 1) + 1;
    const next = { ...current, deleted_at: nowIso(), updated_at: nowIso(), rev };
    await repository.transaction(async (tx) => {
      await repository.docPut('resumes', req.params.id, next, {}, tx);
      await repository.stageRevision(tx, {
        kind: 'resume',
        id: req.params.id,
        rev,
        op: 'delete',
        snapshot: next,
        actor: req.user?.email,
      });
    });
    res.json({ ok: true });
  }),
);

resumesRouter.post(
  '/:id/restore',
  asyncHandler(async (req, res) => {
    const current = await repository.docGet<Record<string, unknown>>('resumes', req.params.id);
    if (!current) throw new HttpError(404, 'NOT_FOUND', 'résumé not found');
    const rev = Number(current.rev ?? 1) + 1;
    const next = { ...current, deleted_at: null, updated_at: nowIso(), rev };
    await repository.transaction(async (tx) => {
      await repository.docPut('resumes', req.params.id, next, {}, tx);
      await repository.stageRevision(tx, {
        kind: 'resume',
        id: req.params.id,
        rev,
        op: 'restore',
        snapshot: next,
        actor: req.user?.email,
      });
    });
    res.json({ ok: true });
  }),
);

/**
 * Mark a résumé as sent → create/link an application node (SRS FR-RES-018).
 *
 * FR-011: `final` is an invariant, not a label. Only a résumé that passed the
 * one-page and ≥95%-coverage gate at finalize time can be sent, otherwise a
 * draft that failed those checks could become a real application. `sent` is
 * also terminal: re-sending would spawn duplicate application nodes.
 */
resumesRouter.post(
  '/:id/mark-sent',
  asyncHandler(async (req, res) => {
    const applicationId = `resume-application-${req.params.id}`;
    const application = await repository.transaction(async (tx) => {
      const resume = await repository.docGet<Record<string, unknown>>('resumes', req.params.id, tx);
      if (!resume || resume.deleted_at) throw new HttpError(404, 'NOT_FOUND', 'resume not found');
      if (resume.status === 'sent') {
        throw new HttpError(409, 'ALREADY_SENT', 'This résumé has already been sent.');
      }
      if (resume.status !== 'final') {
        throw new HttpError(
          409,
          'NOT_FINAL',
          'Only a finalized résumé can be sent, this one is still a draft. Re-run Finalize: it must fit one page and cover ≥95% of the job description’s keywords.',
        );
      }
      const target = await repository.docGet<Record<string, unknown>>(
        'targets',
        String(resume.target_id),
        tx,
      );
      const input = repository.parseNodeCreate({
        type: 'application',
        title: `${target?.role_title ?? 'Role'} @ ${target?.company ?? 'Company'}`,
        props: {
          role_title: target?.role_title ?? 'Role',
          status: 'applied',
          applied_on: todayIso(),
          resume_id: req.params.id,
          target_id: resume.target_id,
        },
        source: 'system',
      });
      const created = await repository.stageNode(
        tx,
        input,
        { actor: req.user?.email },
        { id: applicationId },
      );
      await repository.docMerge(
        'resumes',
        req.params.id,
        {
          status: 'sent',
          sent_at: nowIso(),
          application_id: applicationId,
        },
        tx,
      );
      return created;
    });
    res.json({ application });
  }),
);

resumesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const [rows, targets, base] = await Promise.all([
      repository.docList<Record<string, unknown>>('resumes'),
      listTargets(),
      repository.docGet<{ resume_id?: string }>('meta', 'resume-base'),
    ]);
    const targetById = new Map(targets.map((target) => [String(target.id), target]));
    const includeDeleted = req.query.includeDeleted === 'true';
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const template = typeof req.query.template === 'string' ? req.query.template : '';
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const resumes = rows
      .filter((resume) => includeDeleted || !resume.deleted_at)
      .filter((resume) => !status || resume.status === status)
      .filter((resume) => !template || resume.template_key === template)
      .filter((resume) => {
        if (!q) return true;
        const target = targetById.get(String(resume.target_id));
        return `${resume.name ?? ''} ${target?.company ?? ''} ${target?.role_title ?? ''}`
          .toLowerCase()
          .includes(q);
      })
      .map(
        (resume): Record<string, unknown> => ({
          ...resume,
          target: targetById.get(String(resume.target_id)) ?? null,
          is_base: base?.resume_id === resume.id,
        }),
      )
      .sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')));
    res.json({ resumes });
  }),
);
