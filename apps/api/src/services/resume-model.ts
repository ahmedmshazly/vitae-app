/**
 * Full résumé model builder (SRS §6.6). Turns the selected atoms plus the
 * career graph (education, skills, publications, awards) into the multi-section
 * ResumeModel the template renderers consume. Loads nodes/edges once instead of
 * the previous per-owner N+1 lookups.
 *
 * Every item the templates can render carries a STABLE id (owner node id,
 * skill node id, contact key, skill-category key) and a `disabled` flag: the
 * model always contains EVERYTHING (so the visual editor can show hidden items
 * for re-enabling) and the renderers skip whatever is disabled. The DocConfig
 * (per-résumé draft) controls visibility and order at every level: sections,
 * entries within a section, individual skills, and contact items.
 */
import type { NodeRecord } from '@vitae/core';
import { estimateLines, type LineModel } from '@vitae/core';
import { repository } from '../db/repository.js';
import { buildOwnerIndex, ownedIdsFor, skillIdsFor } from './subjects.js';

export interface ResumeEntry {
  /** Stable id, the owning node's id (role/project/education/publication). */
  id: string;
  role: string;
  org?: string;
  location?: string;
  dates?: string;
  bullets: ResumeBullet[];
  disabled?: boolean;
}

export interface ResumeBullet {
  /** Atom id for selected content; deterministic synthetic id for graph-derived details. */
  id: string;
  text: string;
  disabled?: boolean;
}

export interface SkillChip {
  /** Skill node id. */
  id: string;
  name: string;
  disabled?: boolean;
}

export interface SkillRow {
  /** Stable id: `skillcat:<category>`. */
  id: string;
  label: string;
  /** Joined ENABLED skill names, what the renderers print. */
  content: string;
  /** All skills in the category (incl. disabled), what the editor shows. */
  skills: SkillChip[];
  disabled?: boolean;
}

export interface ResumeLine {
  /** Stable id, the source node's id (award). */
  id: string;
  text: string;
  disabled?: boolean;
}

export interface ContactItem {
  /** Semantic key: city | email | phone | github | linkedin | x | site. */
  key: string;
  /** Display text (URLs shown without protocol/www). */
  value: string;
  /** Link target for \href; omitted for plain text bits like city/phone. */
  href?: string;
  disabled?: boolean;
}

export interface ResumeSection {
  key: SectionKey;
  title: string;
  kind: 'entries' | 'skillrows' | 'lines';
  entries?: ResumeEntry[];
  skillRows?: SkillRow[];
  lines?: ResumeLine[];
  disabled?: boolean;
}

export interface ResumeModel {
  /** Self-person node id, used by the editor's “edit profile” link. */
  profileId?: string;
  name: string;
  tagline?: string;
  /** All contact items (incl. disabled), renderers print the enabled ones in order. */
  contacts: ContactItem[];
  headline: string;
  summary?: string;
  sections: ResumeSection[];
}

export type SectionKey = 'summary' | 'skills' | 'experience' | 'research' | 'projects' | 'education' | 'awards';

export const DEFAULT_SECTION_ORDER: SectionKey[] = ['summary', 'skills', 'experience', 'research', 'projects', 'education', 'awards'];

export interface SectionConfig {
  sectionsEnabled?: Partial<Record<SectionKey, boolean>>;
  sectionOrder?: string[];
}

/** Per-résumé document config, item-level visibility and order (the draft). */
export interface DocConfig extends SectionConfig {
  /** Contact keys in display order (unlisted keep default order after). */
  contactOrder?: string[];
  /** Contact keys hidden from this résumé. */
  contactDisabled?: string[];
  /** Entry/row order within each section, by item id. */
  itemOrder?: Partial<Record<string, string[]>>;
  /** Entry/row ids hidden from this résumé. */
  itemsDisabled?: string[];
  /** Default-hidden entries explicitly enabled for this résumé. */
  itemsEnabled?: string[];
  /** Individual skill node ids hidden from their category row. */
  skillsDisabled?: string[];
  /** Detail/bullet order within each entry, keyed by entry id. */
  bulletOrder?: Record<string, string[]>;
  /** Graph-derived details hidden independently from their parent entry. */
  bulletsDisabled?: string[];
}

export interface SelectionEntryLike {
  atomId: string;
  ownerId: string;
  text: string;
}

const SKILL_CATEGORY_LABELS: Array<[string, string]> = [
  ['language', 'Programming'],
  ['framework', 'Frameworks & Libraries'],
  ['platform', 'Platforms & Infrastructure'],
  ['domain', 'Domains'],
  ['method', 'Methods'],
  ['tool', 'Tooling'],
  ['soft', 'Strengths'],
];

export interface Graph {
  nodesById: Map<string, NodeRecord>;
  nodesByType: Map<string, NodeRecord[]>;
  edges: Array<{ type: string; src: string; dst: string }>;
}

export async function loadGraph(): Promise<Graph> {
  const [nodes, edges] = await Promise.all([repository.allLiveNodes(), repository.allLiveEdges()]);
  const nodesById = new Map<string, NodeRecord>();
  const nodesByType = new Map<string, NodeRecord[]>();
  for (const n of nodes) {
    nodesById.set(n.id, n);
    (nodesByType.get(n.type) ?? nodesByType.set(n.type, []).get(n.type)!).push(n);
  }
  return { nodesById, nodesByType, edges: edges.map((e) => ({ type: e.type, src: e.src, dst: e.dst })) };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const [y, m] = iso.split('-');
  const mi = Number(m) - 1;
  return mi >= 0 && mi < 12 ? `${MONTHS[mi]} ${y}` : y;
}

function dateRange(node: NodeRecord): string | undefined {
  const start = fmtDate(node.start_date ?? undefined);
  const end = node.end_date ? fmtDate(node.end_date) : node.start_date ? 'Present' : undefined;
  if (!start && !end) return undefined;
  // "--" survives escaping and typesets as a proper en dash in LaTeX.
  return [start, end].filter(Boolean).join(' -- ');
}

function orgOf(graph: Graph, nodeId: string, edgeTypes: string[]): NodeRecord | undefined {
  const edge = graph.edges.find((e) => edgeTypes.includes(e.type) && e.src === nodeId);
  return edge ? graph.nodesById.get(edge.dst) : undefined;
}

/** Group selected atoms by owner node, preserving selection order. */
function groupByOwner(entries: SelectionEntryLike[]): Map<string, ResumeBullet[]> {
  const byOwner = new Map<string, ResumeBullet[]>();
  for (const e of entries) {
    (byOwner.get(e.ownerId) ?? byOwner.set(e.ownerId, []).get(e.ownerId)!).push({ id: e.atomId, text: e.text });
  }
  return byOwner;
}

function entryFor(graph: Graph, owner: NodeRecord, bullets: ResumeBullet[]): ResumeEntry {
  const props = owner.props as Record<string, unknown>;
  const org = orgOf(graph, owner.id, ['ROLE_AT', 'PART_OF']);
  const orgProps = (org?.props ?? {}) as Record<string, unknown>;
  return {
    id: owner.id,
    role: owner.title,
    org: org?.title ?? (owner.subtitle?.split('·')[0]?.trim() || undefined),
    location: (props.location as string) ?? (orgProps.city as string) ?? undefined,
    dates: dateRange(owner),
    bullets,
  };
}

// ── DocConfig application helpers ─────────────────────────────────────────────

/** Order items: ids listed in `order` first (in that order), the rest keep their relative order. */
function applyOrder<T extends { id: string }>(items: T[], order: string[] | undefined): T[] {
  if (!order?.length) return items;
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...items].sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER));
}

// ── Section builders ──────────────────────────────────────────────────────────

/**
 * Whose records this résumé is built from.
 *
 * Every builder filters through this. The graph holds other people's roles,
 * degrees and awards (imported profiles), and a section that reads
 * `nodesByType.get(type)` directly would print them on the owner's résumé.
 * which is exactly what happened before this existed.
 */
export interface ResumeScope {
  /** Records owned by the subject (roles, projects, education, awards, publications). */
  records: Set<string>;
  /** Skills the subject uses directly or through a record they own. */
  skills: Set<string>;
}

/** Everything one person can legitimately put on a résumé. */
export function resumeScopeFor(personId: string, graph: Graph): ResumeScope {
  const index = buildOwnerIndex(graph);
  const records = ownedIdsFor(personId, index);
  return { records, skills: skillIdsFor(personId, graph, records) };
}

function buildSkills(graph: Graph, config: DocConfig, scope: ResumeScope): ResumeSection | null {
  const skills = (graph.nodesByType.get('skill') ?? []).filter((s) => scope.skills.has(s.id));
  if (skills.length === 0) return null;
  const skillsDisabled = new Set(config.skillsDisabled ?? []);
  const byCategory = new Map<string, SkillChip[]>();
  for (const s of skills.slice().sort((a, b) => a.title.localeCompare(b.title))) {
    const cat = ((s.props as Record<string, unknown>).category as string) ?? 'tool';
    const chip: SkillChip = { id: s.id, name: s.title, ...(skillsDisabled.has(s.id) ? { disabled: true } : {}) };
    (byCategory.get(cat) ?? byCategory.set(cat, []).get(cat)!).push(chip);
  }
  const skillRows: SkillRow[] = SKILL_CATEGORY_LABELS.filter(([cat]) => byCategory.has(cat)).map(([cat, label]) => {
    const chips = byCategory.get(cat)!;
    return {
      id: `skillcat:${cat}`,
      label,
      content: chips.filter((c) => !c.disabled).map((c) => c.name).join(', '),
      skills: chips,
    };
  });
  return skillRows.length ? { key: 'skills', title: 'Technical Skills', kind: 'skillrows', skillRows } : null;
}

function buildExperience(
  graph: Graph,
  byOwner: Map<string, ResumeBullet[]>,
  ownerOrder: string[],
  scope: ResumeScope,
): ResumeSection | null {
  const selectedRank = new Map(ownerOrder.map((id, index) => [id, index]));
  const entries = (graph.nodesByType.get('role') ?? [])
    .filter((r) => scope.records.has(r.id))
    .sort((a, b) => {
      const ar = selectedRank.get(a.id);
      const br = selectedRank.get(b.id);
      if (ar !== undefined && br !== undefined) return ar - br;
      if (ar !== undefined) return -1;
      if (br !== undefined) return 1;
      return (b.end_date ?? '9999').localeCompare(a.end_date ?? '9999') || a.id.localeCompare(b.id);
    })
    .map((owner) => ({
      ...entryFor(graph, owner, byOwner.get(owner.id) ?? []),
      ...(!byOwner.has(owner.id) ? { disabled: true } : {}),
    }));
  return entries.length ? { key: 'experience', title: 'Experience', kind: 'entries', entries } : null;
}

function buildProjects(
  graph: Graph,
  byOwner: Map<string, ResumeBullet[]>,
  ownerOrder: string[],
  scope: ResumeScope,
): ResumeSection | null {
  const selectedRank = new Map(ownerOrder.map((id, index) => [id, index]));
  const entries = (graph.nodesByType.get('project') ?? [])
    .filter((p) => scope.records.has(p.id))
    .sort((a, b) => {
      const ar = selectedRank.get(a.id);
      const br = selectedRank.get(b.id);
      if (ar !== undefined && br !== undefined) return ar - br;
      if (ar !== undefined) return -1;
      if (br !== undefined) return 1;
      return (b.end_date ?? '9999').localeCompare(a.end_date ?? '9999') || a.id.localeCompare(b.id);
    })
    .map((owner) => {
      const props = owner.props as Record<string, unknown>;
      return {
        id: owner.id,
        role: owner.title,
        org: (props.kind as string) === 'research' ? 'Research project' : undefined,
        dates: dateRange(owner),
        bullets: byOwner.get(owner.id) ?? [],
        ...(!byOwner.has(owner.id) ? { disabled: true } : {}),
      };
    });
  return entries.length ? { key: 'projects', title: 'Selected Projects', kind: 'entries', entries } : null;
}

function buildResearch(graph: Graph, byOwner: Map<string, ResumeBullet[]>, scope: ResumeScope): ResumeSection | null {
  // All publications, newest first, per-item disable/order replaces the old
  // arbitrary top-4 cap.
  const pubs = (graph.nodesByType.get('publication') ?? [])
    .filter((p) => scope.records.has(p.id))
    .sort((a, b) => {
    const da = ((a.props as Record<string, unknown>).published_on as string) ?? '';
    const db = ((b.props as Record<string, unknown>).published_on as string) ?? '';
    return db.localeCompare(da) || a.id.localeCompare(b.id);
  });
  if (pubs.length === 0) return null;
  const entries: ResumeEntry[] = pubs.map((p) => {
    const props = p.props as Record<string, unknown>;
    const year = ((props.published_on as string) ?? '').slice(0, 4) || undefined;
    return {
      id: p.id,
      role: p.title,
      org: (props.venue as string) ?? undefined,
      dates: year,
      bullets:
        byOwner.get(p.id) ??
        (props.my_contribution ? [{ id: `${p.id}:contribution`, text: props.my_contribution as string }] : []),
    };
  });
  return { key: 'research', title: 'Research', kind: 'entries', entries };
}

function buildEducation(graph: Graph, scope: ResumeScope): ResumeSection | null {
  const edus = (graph.nodesByType.get('education') ?? [])
    .filter((e) => scope.records.has(e.id))
    .sort((a, b) => (b.end_date ?? '9999').localeCompare(a.end_date ?? '9999') || a.id.localeCompare(b.id));
  if (edus.length === 0) return null;
  const entries: ResumeEntry[] = edus.map((e) => {
    const props = e.props as Record<string, unknown>;
    const gpa = props.gpa as number | undefined;
    const degree = (props.degree as string) ?? e.title;
    const org = orgOf(graph, e.id, ['PART_OF']);
    const coursework = (props.coursework as string[]) ?? [];
    return {
      id: e.id,
      role: gpa ? `${degree} (CGPA ${gpa} / 4.0)` : degree,
      org: org?.title ?? e.subtitle ?? undefined,
      location: ((org?.props ?? {}) as Record<string, unknown>).city as string | undefined,
      dates: dateRange(e),
      bullets: coursework.length
        ? [{ id: `${e.id}:coursework`, text: `Relevant coursework: ${coursework.join(', ')}.` }]
        : [],
    };
  });
  return { key: 'education', title: 'Education', kind: 'entries', entries };
}

function buildAwards(graph: Graph, scope: ResumeScope): ResumeSection | null {
  const awards = (graph.nodesByType.get('award') ?? [])
    .filter((a) => scope.records.has(a.id))
    .sort((a, b) => {
      const da = ((a.props as Record<string, unknown>).awarded_on as string) ?? '';
      const db = ((b.props as Record<string, unknown>).awarded_on as string) ?? '';
      return db.localeCompare(da) || a.id.localeCompare(b.id);
    });
  if (awards.length === 0) return null;
  const lines: ResumeLine[] = awards.map((a) => {
    const props = a.props as Record<string, unknown>;
    const year = ((props.awarded_on as string) ?? '').slice(0, 4);
    const detail = (props.award_for as string) ?? '';
    return { id: a.id, text: [a.title, detail, year].filter(Boolean).join(': ') };
  });
  return { key: 'awards', title: 'Awards', kind: 'lines', lines };
}

// ── Contacts ──────────────────────────────────────────────────────────────────

function urlLabel(url: string): string {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');
}

function withProtocol(url: string): string {
  return /^https?:\/\//.test(url) ? url : `https://${url}`;
}

/** All contact items derivable from the self person's props, default order. */
function buildContacts(selfProps: Record<string, unknown>, config: DocConfig): ContactItem[] {
  const socials = (selfProps.socials ?? {}) as Record<string, string>;
  const candidates: ContactItem[] = [];
  if (selfProps.city) candidates.push({ key: 'city', value: String(selfProps.city) });
  const email = (selfProps.emails as string[] | undefined)?.[0];
  if (email) candidates.push({ key: 'email', value: email, href: `mailto:${email}` });
  const phone = (selfProps.phones as string[] | undefined)?.[0];
  if (phone) candidates.push({ key: 'phone', value: phone });
  for (const key of ['linkedin', 'github', 'site', 'x'] as const) {
    const url = socials[key];
    if (url) candidates.push({ key, value: urlLabel(url), href: withProtocol(url) });
  }

  const disabled = new Set(config.contactDisabled ?? []);
  const marked = candidates.map((c) => (disabled.has(c.key) ? { ...c, disabled: true } : c));
  return applyOrder(
    marked.map((c) => ({ ...c, id: c.key })),
    config.contactOrder,
  ).map(({ id: _id, ...c }) => c);
}

// ── Assembly ──────────────────────────────────────────────────────────────────

function applySectionConfig(sections: ResumeSection[], config: SectionConfig): ResumeSection[] {
  const enabled = (key: SectionKey) => config.sectionsEnabled?.[key] !== false;
  const order = (config.sectionOrder ?? []).filter((k): k is SectionKey => DEFAULT_SECTION_ORDER.includes(k as SectionKey));
  const rank = new Map<string, number>();
  order.forEach((k, i) => rank.set(k, i));
  DEFAULT_SECTION_ORDER.forEach((k, i) => {
    if (!rank.has(k)) rank.set(k, order.length + i);
  });
  return sections
    .map((s) => (enabled(s.key) ? s : { ...s, disabled: true }))
    .sort((a, b) => rank.get(a.key)! - rank.get(b.key)!);
}

/** Apply per-item visibility + order to a built section. */
function applyItemConfig(section: ResumeSection, config: DocConfig): ResumeSection {
  const disabledIds = new Set(config.itemsDisabled ?? []);
  const enabledIds = new Set(config.itemsEnabled ?? []);
  const order = config.itemOrder?.[section.key];
  const configured = <T extends { id: string; disabled?: boolean }>(items: T[]): T[] =>
    items.map((item) => ({
      ...item,
      disabled: disabledIds.has(item.id) || (item.disabled === true && !enabledIds.has(item.id)),
    }));
  const configureEntries = (entries: ResumeEntry[]): ResumeEntry[] => {
    const disabledBullets = new Set(config.bulletsDisabled ?? []);
    return configured(entries).map((entry) => ({
      ...entry,
      bullets: applyOrder(
        entry.bullets.map((bullet) => ({
          ...bullet,
          ...(disabledBullets.has(bullet.id) ? { disabled: true } : {}),
        })),
        config.bulletOrder?.[entry.id],
      ),
    }));
  };
  if (section.kind === 'entries') {
    return { ...section, entries: applyOrder(configureEntries(section.entries ?? []), order) };
  }
  if (section.kind === 'skillrows') {
    return { ...section, skillRows: applyOrder(configured(section.skillRows ?? []), order) };
  }
  return { ...section, lines: applyOrder(configured(section.lines ?? []), order) };
}

export async function buildFullModel(
  selectionEntries: SelectionEntryLike[],
  opts: { headline: string; summary?: string; graph?: Graph } & DocConfig,
): Promise<ResumeModel> {
  const graph = opts.graph ?? (await loadGraph());
  const self =
    (graph.nodesByType.get('person') ?? []).find(
      (person) => (person.props as Record<string, unknown>).is_self === true,
    ) ?? null;
  const selfProps = (self?.props ?? {}) as Record<string, unknown>;

  // No anchor means no way to tell whose records these are. Rendering every
  // node in the graph under "Your Name" is the worst possible answer, it is the
  // leak in its purest form, so produce an empty résumé instead.
  const scope: ResumeScope = self
    ? resumeScopeFor(self.id, graph)
    : { records: new Set<string>(), skills: new Set<string>() };

  const byOwner = groupByOwner(selectionEntries);
  const ownerOrder = [...byOwner.keys()];

  const sections = [
    buildSkills(graph, opts, scope),
    buildExperience(graph, byOwner, ownerOrder, scope),
    buildResearch(graph, byOwner, scope),
    buildProjects(graph, byOwner, ownerOrder, scope),
    buildEducation(graph, scope),
    buildAwards(graph, scope),
  ]
    .filter((s): s is ResumeSection => s !== null)
    .map((s) => applyItemConfig(s, opts));

  return {
    profileId: self?.id,
    name: self?.title ?? 'Your Name',
    tagline: (selfProps.headline as string) ?? undefined,
    contacts: buildContacts(selfProps, opts),
    headline: opts.headline,
    summary: opts.sectionsEnabled?.summary === false ? undefined : opts.summary,
    sections: applySectionConfig(sections, opts),
  };
}

/**
 * Lines the static (non-atom) sections will consume, so /compile can shrink
 * the knapsack budget and the one-page gate holds (skills, education, awards,
 * research headers are not knapsack items). Disabled sections/items cost nothing.
 */
export function estimateStaticLines(model: ResumeModel, lineModel: LineModel): number {
  let lines = 0;
  const sectionOverhead = lineModel.section_overhead ?? 2;
  const entryOverhead = lineModel.entry_overhead ?? 2;
  for (const s of model.sections) {
    if (s.disabled) continue;
    if (s.key === 'experience' || s.key === 'projects') {
      // Bullets are knapsack items; count only the section + entry headers.
      lines += sectionOverhead + (s.entries ?? []).filter((e) => !e.disabled).length * entryOverhead;
      continue;
    }
    lines += sectionOverhead;
    if (s.kind === 'skillrows') {
      for (const row of (s.skillRows ?? []).filter((r) => !r.disabled)) lines += estimateLines(`${row.label} ${row.content}`, lineModel);
    } else if (s.kind === 'lines') {
      for (const l of (s.lines ?? []).filter((x) => !x.disabled)) lines += estimateLines(l.text, lineModel);
    } else {
      for (const e of (s.entries ?? []).filter((x) => !x.disabled)) {
        lines += entryOverhead;
        for (const b of e.bullets.filter((x) => !x.disabled)) lines += estimateLines(b.text, lineModel);
      }
    }
  }
  if (model.summary) lines += sectionOverhead + estimateLines(model.summary, lineModel);
  return lines;
}
