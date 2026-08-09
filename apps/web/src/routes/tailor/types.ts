/** Shared types for the Tailor workspace (mirror of the /resumes API shapes). */

export interface Keyword {
  term: string;
  weight: number;
  skill_id: string | null;
  suggested?: boolean;
}

export interface Draft {
  mode: 'auto' | 'manual';
  templateKey: string;
  accent: string;
  preferredEmphasis: 'technical' | 'leadership' | 'concise' | 'detailed';
  variantByAtom: Record<string, 'technical' | 'leadership' | 'concise' | 'detailed'>;
  /** Manual mode: the exact, ordered atom ids to include. */
  include: string[];
  /** Auto mode: per-target pins/blocks fed to the knapsack. */
  pins: string[];
  blocks: string[];
  /** Auto mode: explicit ordering applied on top of the selection. */
  atomOrder: string[];
  sectionsEnabled: Record<string, boolean>;
  sectionOrder: string[];
  contactOrder: string[];
  contactDisabled: string[];
  itemOrder: Record<string, string[]>;
  itemsDisabled: string[];
  /** Roles/projects without selected bullets are hidden by default; this explicitly includes them. */
  itemsEnabled: string[];
  skillsDisabled: string[];
  bulletOrder: Record<string, string[]>;
  bulletsDisabled: string[];
  headline: string;
  summary: string;
}

export interface Target {
  id: string;
  role_title: string;
  company?: string | null;
  status?: string;
  deleted_at?: string | null;
  created_at?: string;
  updated_at?: string;
  parsed: { parser_version: string; keywords: Keyword[] };
  draft?: Partial<Draft>;
}

export interface AtomVariant {
  id: string;
  emphasis: string;
  text: string;
  is_default: boolean;
}

export interface AtomView {
  id: string;
  owner_node: string;
  owner_title: string;
  owner_type: string;
  kind: string;
  pinned: boolean;
  blocked: boolean;
  variants: AtomVariant[];
  skill_ids: string[];
}

export interface SelectionEntry {
  atomId: string;
  ownerId: string;
  emphasis: string;
  text: string;
  lines: number;
}

/** Per-atom score from /resumes/tailor (SRS FR-RES-007). */
export interface KeywordHit {
  term: string;
  weight: number;
  hit: number;
  contribution: number;
  via: 'skill' | 'text' | 'none';
}

export interface AtomScore {
  atomId: string;
  score: number;
  relevance: number;
  recency: number;
  metricBonus: number;
  hits: KeywordHit[];
}

export interface TailorResult {
  scores: AtomScore[];
  selection: { entries: SelectionEntry[]; totalLines: number; weightedCoverage: number };
  pageEstimate: { lines: number; budget: number; pages: number; fill: number };
}

export interface ResumeBullet {
  id: string;
  text: string;
  disabled?: boolean;
}

export interface ResumeEntry {
  id: string;
  role: string;
  org?: string;
  location?: string;
  dates?: string;
  bullets: ResumeBullet[];
  disabled?: boolean;
}

export interface SkillChip {
  id: string;
  name: string;
  disabled?: boolean;
}

export interface SkillRow {
  id: string;
  label: string;
  content: string;
  skills: SkillChip[];
  disabled?: boolean;
}

export interface ResumeLine {
  id: string;
  text: string;
  disabled?: boolean;
}

export interface ResumeSection {
  key: string;
  title: string;
  kind: 'entries' | 'skillrows' | 'lines';
  entries?: ResumeEntry[];
  skillRows?: SkillRow[];
  lines?: ResumeLine[];
  disabled?: boolean;
}

export interface ContactItem {
  key: string;
  value: string;
  href?: string;
  disabled?: boolean;
}

export interface ResumeModel {
  profileId?: string;
  name: string;
  tagline?: string;
  contacts: ContactItem[];
  headline: string;
  summary?: string;
  sections: ResumeSection[];
}

export interface ModelResult {
  model: ResumeModel;
  pageEstimate: TailorResult['pageEstimate'];
  selection: TailorResult['selection'];
}

export interface Coverage {
  weightedPct: number;
  passesGate: boolean;
  gaps: Array<{ term: string; weight: number }>;
  perKeyword: Array<{ term: string; covered: boolean }>;
}

export interface CompileResult {
  ok: boolean;
  pages: number | null;
  offline: boolean;
  error: { code: string; message: string; section?: string } | null;
  logTail: string | null;
  pdfBase64: string | null;
  tex: string;
  coverage: Coverage | null;
  pageEstimate: TailorResult['pageEstimate'];
  selection: TailorResult['selection'];
}

export interface FinalizeResult {
  id: string;
  status: 'final' | 'draft';
  onePage: boolean;
  gatePassed: boolean;
  needsManualTrim?: boolean;
  fitDecisions?: Array<{
    iteration: number;
    action: 'concise-swap' | 'drop';
    atomId: string;
    pagesBefore: number;
    emphasisBefore?: string;
    emphasisAfter?: string;
  }>;
  pages: number | null;
  coverage: Coverage | null;
  offline: boolean;
  error: { code: string; message: string } | null;
  logTail: string | null;
}

export const SECTION_LABELS: Array<{ key: string; label: string }> = [
  { key: 'summary', label: 'Summary' },
  { key: 'skills', label: 'Technical Skills' },
  { key: 'experience', label: 'Experience' },
  { key: 'research', label: 'Research' },
  { key: 'projects', label: 'Selected Projects' },
  { key: 'education', label: 'Education' },
  { key: 'awards', label: 'Awards' },
];

export function defaultDraft(templateKey = 'cobalt', headline = ''): Draft {
  return {
    mode: 'auto',
    templateKey,
    accent: '#2563eb',
    preferredEmphasis: 'technical',
    variantByAtom: {},
    include: [],
    pins: [],
    blocks: [],
    atomOrder: [],
    sectionsEnabled: Object.fromEntries(SECTION_LABELS.map((s) => [s.key, true])),
    sectionOrder: SECTION_LABELS.map((s) => s.key),
    contactOrder: [],
    contactDisabled: [],
    itemOrder: {},
    itemsDisabled: [],
    itemsEnabled: [],
    skillsDisabled: [],
    bulletOrder: {},
    bulletsDisabled: [],
    headline,
    summary: '',
  };
}

export function defaultVariantText(a: AtomView): string {
  const v = a.variants.find((x) => x.is_default) ?? a.variants[0];
  return v?.text ?? '(no variant)';
}

/** Draft payload for /resumes/compile + /resumes/finalize. */
export function compileBody(targetId: string, d: Draft) {
  return {
    targetId,
    templateKey: d.templateKey,
    accent: d.accent,
    preferredEmphasis: d.preferredEmphasis,
    variantByAtom: d.variantByAtom,
    mode: d.mode,
    include: d.mode === 'manual' ? d.include : undefined,
    pins: d.mode === 'auto' ? d.pins : undefined,
    blocks: d.mode === 'auto' ? d.blocks : undefined,
    atomOrder: d.mode === 'auto' && d.atomOrder.length ? d.atomOrder : undefined,
    sectionOrder: d.sectionOrder,
    sectionsEnabled: d.sectionsEnabled,
    contactOrder: d.contactOrder,
    contactDisabled: d.contactDisabled,
    itemOrder: d.itemOrder,
    itemsDisabled: d.itemsDisabled,
    itemsEnabled: d.itemsEnabled,
    skillsDisabled: d.skillsDisabled,
    bulletOrder: d.bulletOrder,
    bulletsDisabled: d.bulletsDisabled,
    headline: d.headline || undefined,
    summary: d.summary || undefined,
  };
}
