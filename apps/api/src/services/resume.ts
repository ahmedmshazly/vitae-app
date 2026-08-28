/**
 * Résumé engine orchestration (SRS §6.6, the flagship). Ties together the
 * deterministic @vitae/core pipeline with Postgres data and the LaTeX build
 * service:
 *
 *   JD → parseJd (BM25F) → scoreAtoms → selectAtoms (submodular knapsack)
 *      → renderTemplate (TS, escaped) → compile (Tectonic) → coverage report
 *
 * The TS template renderer (SRS D10) owns escaping centrally so the build
 * service stays dumb; every value passes the §8.4 escape layer and the output
 * is asserted free of unresolved «tokens».
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertNoUnresolvedTokens,
  escapeInline,
  estimateLines,
  parseJd,
  scoreAtoms,
  selectAtoms,
  selectManual,
  type AtomScore,
  type LineModel,
  type ParsedJd,
  type ScorableAtom,
  type SelectableAtom,
  type SkillAlias,
  type Template,
} from '@vitae/core';
import { repository } from '../db/repository.js';
import * as buildsvc from './buildsvc-client.js';
import { rendererFor } from './template-renderers.js';
import type { ResumeModel } from './resume-model.js';

export type { ResumeModel } from './resume-model.js';

const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = process.env.TEMPLATES_DIR ?? resolve(here, '../../../../templates');

// ── Template registry (loaded from /templates/<key>/line-model.json) ─────────

const templateCache = new Map<string, Template>();

export async function loadTemplate(key: string): Promise<Template> {
  if (templateCache.has(key)) return templateCache.get(key)!;
  const raw = await readFile(resolve(TEMPLATES_DIR, key, 'line-model.json'), 'utf8');
  const parsed = JSON.parse(raw) as {
    key: string;
    version: string;
    name: string;
    ats_strict: boolean;
    line_model: LineModel;
    description?: string;
    traits?: string[];
    page_size?: string;
    accent_options?: string[];
  };
  const template: Template = {
    key: parsed.key,
    version: parsed.version,
    name: parsed.name,
    engine: 'tectonic',
    ats_strict: parsed.ats_strict,
    line_model: parsed.line_model,
    description: parsed.description,
    traits: parsed.traits ?? [],
    page_size: parsed.page_size ?? 'Letter',
    accent_options: parsed.accent_options ?? [],
  };
  templateCache.set(key, template);
  return template;
}

export async function listTemplates(): Promise<Template[]> {
  return Promise.all(['cobalt', 'onyx', 'argon'].map(loadTemplate));
}

export const DEFAULT_TEMPLATE_KEY = 'cobalt';

// ── Skill alias dictionary (the JD parser's dictionary) ──────────────────────

export async function loadSkillAliases(): Promise<SkillAlias[]> {
  const skills = await repository.listNodes({ type: 'skill', limit: 2000 });
  const aliases: SkillAlias[] = [];
  for (const s of skills) {
    const extra = ((s.props as Record<string, unknown>).aliases as string[]) ?? [];
    for (const alias of [s.title, ...extra]) {
      if (alias) aliases.push({ alias, term: s.title, skillId: s.id });
    }
  }
  return aliases;
}

// ── Atoms ────────────────────────────────────────────────────────────────────

export async function loadScorableAtoms(
  preloadedAtoms?: Array<Record<string, unknown>>,
): Promise<ScorableAtom[]> {
  // Callers that already fetched the atoms table (the Dashboard aggregate) can
  // pass the rows to avoid re-reading them; variants/skills still load here.
  const [atomRows, variantRows, skillRows] = await Promise.all([
    preloadedAtoms ?? repository.docList<Record<string, unknown>>('atoms'),
    repository.docList<{ atom_id: string } & Record<string, unknown>>('atom_variants'),
    repository.docList<{ atom_id: string; skill_id: string }>('atom_skills'),
  ]);
  const variantsByAtom = new Map<string, Array<Record<string, unknown>>>();
  for (const v of variantRows) {
    (variantsByAtom.get(v.atom_id) ?? variantsByAtom.set(v.atom_id, []).get(v.atom_id)!).push(v);
  }
  const skillsByAtom = new Map<string, string[]>();
  for (const s of skillRows) {
    (skillsByAtom.get(s.atom_id) ?? skillsByAtom.set(s.atom_id, []).get(s.atom_id)!).push(s.skill_id);
  }

  return atomRows
    .filter((a) => !a.deleted_at)
    .map((a) => ({
      id: a.id as string,
      owner_node: a.owner_node as string,
      kind: a.kind as ScorableAtom['kind'],
      metrics: (a.metrics as ScorableAtom['metrics']) ?? [],
      evidence: (a.evidence as ScorableAtom['evidence']) ?? [],
      date_start: a.date_start as string | undefined,
      date_end: a.date_end as string | undefined,
      pinned: Boolean(a.pinned),
      blocked: Boolean(a.blocked),
      created_at: a.created_at as string,
      updated_at: a.updated_at as string,
      deleted_at: null,
      variants: (variantsByAtom.get(a.id as string) ?? []).map((v) => ({
        id: v.id as string,
        atom_id: v.atom_id as string,
        emphasis: v.emphasis as ScorableAtom['variants'][number]['emphasis'],
        text: v.text as string,
        is_default: Boolean(v.is_default),
      })),
      skill_ids: skillsByAtom.get(a.id as string) ?? [],
    }));
}

// ── Targets ──────────────────────────────────────────────────────────────────

// Keyword `spans` are [start,end] tuples. jsonb stores them as nested arrays;
// `inflateTarget` still accepts the legacy JSON-string form from older bundles.
export async function createTarget(
  input: { role_title: string; company?: string; jd_raw: string; jd_url?: string },
  actor?: string,
): Promise<Record<string, unknown>> {
  const aliases = await loadSkillAliases();
  const parsed = parseJd(input.jd_raw, { aliases });
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const target = {
    id,
    role_title: input.role_title,
    company: input.company ?? null,
    jd_raw: input.jd_raw,
    jd_url: input.jd_url ?? null,
    parsed,
    status: 'saved',
    parse_revision: 1,
    rev: 1,
    deleted_at: null,
    created_at: now,
    updated_at: now,
  };
  await repository.transaction(async (tx) => {
    await repository.docPut('targets', id, target, {}, tx);
    await repository.stageRevision(tx, {
      kind: 'target',
      id,
      rev: 1,
      op: 'create',
      snapshot: target,
      actor,
    });
  });
  return target;
}

export async function getTarget(id: string): Promise<Record<string, unknown> | null> {
  const data = await repository.docGet<Record<string, unknown>>('targets', id);
  return data ? inflateTarget(data) : null;
}

function inflateTarget(data: Record<string, unknown>): Record<string, unknown> {
  if (typeof data.parsed_json === 'string') data.parsed = JSON.parse(data.parsed_json);
  if (typeof data.draft_json === 'string') data.draft = JSON.parse(data.draft_json);
  return data;
}

export async function listTargets(): Promise<Array<Record<string, unknown>>> {
  const rows = await repository.docList<Record<string, unknown>>('targets');
  return rows
    .map(inflateTarget)
    .sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')));
}

/** Persist the Tailor workspace draft (mode, selection, section config...) on the target. */
export async function updateTargetDraft(id: string, draft: Record<string, unknown>): Promise<void> {
  await repository.docMerge('targets', id, { draft, updated_at: new Date().toISOString() });
}

export async function updateTargetKeywords(
  id: string,
  parsed: ParsedJd,
  actor?: string,
): Promise<void> {
  await repository.transaction(async (tx) => {
    const before = await repository.docGet<Record<string, unknown>>('targets', id, tx);
    if (!before) throw new Error('target not found');
    const rev = Number(before.rev ?? 1) + 1;
    const after = {
      ...before,
      parsed,
      parse_revision: Number(before.parse_revision ?? 1) + 1,
      rev,
      updated_at: new Date().toISOString(),
    };
    await repository.docPut('targets', id, after, {}, tx);
    await repository.stageRevision(tx, {
      kind: 'target',
      id,
      rev,
      op: 'update',
      snapshot: after,
      diff: { parsed },
      actor,
    });
  });
}

export async function updateTarget(
  id: string,
  patch: {
    role_title?: string;
    company?: string | null;
    jd_raw?: string;
    jd_url?: string | null;
    status?: string;
  },
  actor?: string,
): Promise<Record<string, unknown>> {
  const before = await getTarget(id);
  if (!before) throw new Error('target not found');
  const jdChanged = patch.jd_raw !== undefined && patch.jd_raw !== before.jd_raw;
  const parsed = jdChanged
    ? parseJd(patch.jd_raw!, { aliases: await loadSkillAliases() })
    : before.parsed;
  let result: Record<string, unknown> = before;
  await repository.transaction(async (tx) => {
    const current = await repository.docGet<Record<string, unknown>>('targets', id, tx);
    if (!current) throw new Error('target not found');
    const rev = Number(current.rev ?? 1) + 1;
    result = {
      ...current,
      ...patch,
      parsed,
      parse_revision: jdChanged
        ? Number(current.parse_revision ?? 1) + 1
        : (current.parse_revision ?? 1),
      rev,
      updated_at: new Date().toISOString(),
    };
    await repository.docPut('targets', id, result, {}, tx);
    await repository.stageRevision(tx, {
      kind: 'target',
      id,
      rev,
      op: 'update',
      snapshot: result,
      diff: patch,
      actor,
    });
  });
  return result;
}

export async function setTargetDeleted(
  id: string,
  deleted: boolean,
  actor?: string,
): Promise<void> {
  await repository.transaction(async (tx) => {
    const before = await repository.docGet<Record<string, unknown>>('targets', id, tx);
    if (!before) throw new Error('target not found');
    const rev = Number(before.rev ?? 1) + 1;
    const after = {
      ...before,
      deleted_at: deleted ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
      rev,
    };
    await repository.docPut('targets', id, after, {}, tx);
    await repository.stageRevision(tx, {
      kind: 'target',
      id,
      rev,
      op: deleted ? 'delete' : 'restore',
      snapshot: after,
      diff: { deleted_at: after.deleted_at },
      actor,
    });
  });
}

// ── Scoring + selection ──────────────────────────────────────────────────────

export interface TailorResult {
  template: Template;
  scores: AtomScore[];
  selection: ReturnType<typeof selectAtoms>;
  pageEstimate: { lines: number; budget: number; pages: number; fill: number };
}

export async function tailor(params: {
  targetId: string;
  templateKey: string;
  budgetLines?: number;
  preferredEmphasis?: string;
  pins?: string[];
  blocks?: string[];
  /** 'auto' (default): budgeted knapsack. 'manual': `include` is the exact ordered atom list. */
  mode?: 'auto' | 'manual';
  include?: string[];
  /** Per-atom wording override; wins over preferredEmphasis when present. */
  variantByAtom?: Record<string, string>;
}): Promise<TailorResult> {
  const target = await getTarget(params.targetId);
  if (!target) throw new Error('target not found');
  const parsed = target.parsed as ParsedJd;
  const template = await loadTemplate(params.templateKey);
  const budget = params.budgetLines ?? template.line_model.lines_per_page;

  const atoms = await loadScorableAtoms();
  const scoreMap = scoreAtoms(atoms, parsed.keywords);
  const scores = [...scoreMap.values()].sort((a, b) => b.score - a.score);

  const pins = new Set(params.pins ?? []);
  const blocks = new Set(params.blocks ?? []);

  // Owner node types route atoms into Experience (role) vs Projects (project)
  // vs Research (publication) sections.
  const ownerTypes = new Map((await repository.allLiveNodes()).map((n) => [n.id, n.type]));
  const kindOf = (ownerId: string): SelectableAtom['ownerKind'] => {
    const t = ownerTypes.get(ownerId);
    return t === 'role' ? 'role' : t === 'project' ? 'project' : 'other';
  };

  const selectable: SelectableAtom[] = atoms.map((a) => {
    const score = scoreMap.get(a.id)!;
    const hitByKeyword: Record<string, number> = {};
    for (const h of score.hits) hitByKeyword[h.term] = h.hit;
    return {
      id: a.id,
      ownerId: a.owner_node,
      ownerKind: kindOf(a.owner_node),
      dateEnd: a.date_end,
      pinned: pins.has(a.id) || a.pinned,
      blocked: blocks.has(a.id) || a.blocked,
      quality: score.recency * score.metricBonus,
      hitByKeyword,
      variants: a.variants.map((v) => ({
        emphasis: v.emphasis,
        text: v.text,
        lines: estimateLines(v.text, template.line_model),
      })),
    };
  });

  const options = {
    keywords: parsed.keywords,
    budgetLines: budget,
    preferredEmphasis: params.preferredEmphasis,
    variantByAtom: params.variantByAtom,
    entryOverhead: template.line_model.entry_overhead,
  };
  const selection =
    params.mode === 'manual' ? selectManual(selectable, params.include ?? [], options) : selectAtoms(selectable, options);

  return {
    template,
    scores,
    selection,
    pageEstimate: {
      lines: selection.totalLines,
      budget: template.line_model.lines_per_page,
      pages: Math.max(1, Math.ceil(selection.totalLines / template.line_model.lines_per_page)),
      fill: selection.totalLines / template.line_model.lines_per_page,
    },
  };
}

// ── Template rendering (TS, escaped: SRS D10) ───────────────────────────────
// The per-template section/macro rendering lives in template-renderers.ts;
// this stays the token-splicing shell.

export async function renderTemplate(
  templateKey: string,
  model: ResumeModel,
  accent = '#2563eb',
): Promise<string> {
  const main = await readFile(resolve(TEMPLATES_DIR, templateKey, 'main.tex'), 'utf8');
  const r = rendererFor(templateKey);

  const rendered = main
    .replaceAll('«ACCENT_HEX»', accent.replace('#', '').toUpperCase())
    .replaceAll('«NAME»', escapeInline(model.name))
    .replaceAll('«CONTACT_LINE»', r.contactLine(model))
    .replaceAll('«HEADLINE»', escapeInline(model.headline))
    .replaceAll('«TAGLINE_BLOCK»', r.taglineBlock(model))
    .replaceAll('«SUMMARY_BLOCK»', r.summaryBlock(model))
    .replaceAll('«SECTIONS»', r.sections(model));

  assertNoUnresolvedTokens(rendered);
  return rendered;
}

// ── Compile + coverage ───────────────────────────────────────────────────────

export interface CoverageReport {
  weightedPct: number;
  perKeyword: Array<{ term: string; weight: number; covered: boolean; via: string }>;
  gaps: Array<{ term: string; weight: number }>;
  passesGate: boolean;
}

/** Coverage from the compiled PDF's extracted text (SRS FR-RES-015, ≥95% gate). */
export function coverageFromText(parsed: ParsedJd, extractedText: string | undefined): CoverageReport {
  const text = (extractedText ?? '').toLowerCase();
  let totalWeight = 0;
  let coveredWeight = 0;
  const perKeyword = parsed.keywords.map((kw) => {
    totalWeight += kw.weight;
    const covered = text.includes(kw.term.toLowerCase());
    if (covered) coveredWeight += kw.weight;
    return { term: kw.term, weight: kw.weight, covered, via: covered ? 'extraction' : 'gap' };
  });
  const weightedPct = totalWeight > 0 ? coveredWeight / totalWeight : 1;
  return {
    weightedPct,
    perKeyword,
    gaps: perKeyword.filter((k) => !k.covered).map((k) => ({ term: k.term, weight: k.weight })),
    passesGate: weightedPct >= 0.95,
  };
}

export async function compileResume(params: {
  templateKey: string;
  model: ResumeModel;
  parsed: ParsedJd;
  sourceDateEpoch?: number;
  accent?: string;
}): Promise<{
  tex: string;
  compile: buildsvc.CompileResult;
  coverage: CoverageReport | null;
}> {
  const template = await loadTemplate(params.templateKey);
  const tex = await renderTemplate(params.templateKey, params.model, params.accent);
  const compile = await buildsvc.compile({
    template: `${template.key}@${template.version}`,
    mainTex: tex,
    sourceDateEpoch: params.sourceDateEpoch,
    extractText: true,
  });
  const coverage = compile.ok ? coverageFromText(params.parsed, compile.text) : null;
  return { tex, compile, coverage };
}
