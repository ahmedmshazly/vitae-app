/**
 * Job-description parsing (SRS §10.2, upgraded to BM25F per §10.7.4).
 *
 * Pipeline: normalize → segment lines & classify sections by header regex →
 * Aho-Corasick alias matching (dictionary skills) + novel n-gram candidates →
 * BM25F structured-document term weighting [Robertson & Zaragoza 2009]:
 *
 *     tf̃(t)     = Σ_fields  w_field · tf_{t,field} / (1 − b + b·(len_field/avglen_field))
 *     weight(t) = idf(t) · tf̃ / (k1 + tf̃)
 *
 * Section (field) weights act on term frequency BEFORE a single shared
 * saturation, so a keyword repeated 9× is not 9× more important, JDs of
 * different lengths are comparable, and generic terms self-deprecate as the
 * stored-JD corpus grows. Output is a weighted keyword set with evidence spans,
 * fully editable downstream (FR-RES-006). Deterministic, no AI.
 */
import { AhoCorasick } from './aho-corasick.js';
import { BM25F } from './constants.js';
import type { ParsedJd, ParsedKeyword } from '../schema/resume.js';
import { STOPWORDS, ngrams, normalizeForMatch, tokenize } from './text.js';

export type JdSection = 'title' | 'requirements' | 'responsibilities' | 'nice_to_have' | 'about';

export interface SkillAlias {
  alias: string;
  /** Canonical display term, e.g. "Kubernetes". */
  term: string;
  skillId: string | null;
}

export interface JdCorpus {
  /** Number of JDs in the corpus. */
  N: number;
  /** Document frequency per normalized term. */
  df: Record<string, number>;
}

export interface ParseJdOptions {
  aliases?: SkillAlias[];
  corpus?: JdCorpus;
  parserVersion?: string;
  avgFieldLen?: Partial<Record<JdSection, number>>;
}

export const JD_PARSER_VERSION = '2.0.0-bm25f';

/** A small shipped prior so generic terms self-deprecate before the corpus grows. */
export const DEFAULT_JD_CORPUS: JdCorpus = {
  N: 200,
  df: {
    team: 185, experience: 190, work: 180, ability: 170, strong: 165, communication: 160,
    skills: 175, years: 170, engineer: 150, software: 140, develop: 130, build: 135,
    design: 120, product: 125, collaborate: 130, environment: 140, opportunity: 150,
    passionate: 120, growth: 110, business: 130, customer: 120, data: 120, systems: 115,
  },
};

const AVG_FIELD_LEN: Record<JdSection, number> = {
  title: 8,
  requirements: 120,
  responsibilities: 120,
  nice_to_have: 40,
  about: 80,
};

const HEADER_PATTERNS: Array<[RegExp, JdSection]> = [
  [/\b(nice[- ]to[- ]haves?|preferred|bonus|good to have|pluses?)\b/i, 'nice_to_have'],
  [/\b(requirements?|qualifications?|must[- ]?haves?|what (we|you)('?re| are)? (need|looking|bring|have)|you (have|bring)|basic qualifications|minimum)\b/i, 'requirements'],
  [/\b(responsibilities|what you'?ll do|the role|day[- ]to[- ]day|in this role|about the (job|role|position))\b/i, 'responsibilities'],
  [/\b(about (us|the company|the team|our)|who we are|our (mission|team|company))\b/i, 'about'],
];

interface PositionedToken {
  norm: string;
  rawStart: number;
  rawEnd: number;
  section: JdSection;
  covered: boolean;
}

interface TermStat {
  term: string;
  skillId: string | null;
  suggested: boolean;
  /** tf per field. */
  tf: Record<JdSection, number>;
  sections: Set<JdSection>;
  spans: Array<[number, number]>;
}

function classifyLine(line: string, current: JdSection, isFirst: boolean): JdSection {
  if (isFirst && line.trim().length > 0) return 'title';
  const trimmed = line.trim();
  if (trimmed.length > 0 && trimmed.length <= 70) {
    for (const [re, section] of HEADER_PATTERNS) {
      if (re.test(trimmed)) return section;
    }
  }
  return current;
}

/** Tokenize a full JD, retaining each token's raw span and its section. */
function positionTokens(raw: string): PositionedToken[] {
  const tokens: PositionedToken[] = [];
  const lineRegex = /[^\n]*\n?/g;
  let current: JdSection = 'responsibilities';
  let lineIndex = 0;
  let match: RegExpExecArray | null;
  const wordRe = /[\p{L}\p{N}][\p{L}\p{N}+#.-]*/gu;

  while ((match = lineRegex.exec(raw)) !== null) {
    const lineText = match[0];
    if (lineText === '') break;
    const lineStart = match.index;
    const section = classifyLine(lineText, current, lineIndex === 0);
    // Header lines set the section for SUBSEQUENT lines; the title line is itself 'title'.
    if (section !== 'title') current = section;
    const tokenSection = section;

    let w: RegExpExecArray | null;
    wordRe.lastIndex = 0;
    while ((w = wordRe.exec(lineText)) !== null) {
      const norm = normalizeForMatch(w[0]).replace(/^[.-]+|[.-]+$/g, '');
      if (!norm) continue;
      tokens.push({
        norm,
        rawStart: lineStart + w.index,
        rawEnd: lineStart + w.index + w[0].length,
        section: tokenSection,
        covered: false,
      });
    }
    lineIndex++;
    if (lineRegex.lastIndex === match.index) lineRegex.lastIndex++;
  }
  return tokens;
}

function bm25fWeight(
  stat: TermStat,
  idf: number,
  avgFieldLen: Record<JdSection, number>,
  fieldLen: Record<JdSection, number>,
): number {
  const { k1, b, sectionWeights } = BM25F;
  let tfTilde = 0;
  for (const field of Object.keys(stat.tf) as JdSection[]) {
    const tf = stat.tf[field];
    if (tf === 0) continue;
    const wField = sectionWeights[field] ?? 0.5;
    const norm = 1 - b + b * ((fieldLen[field] || 1) / (avgFieldLen[field] || 1));
    tfTilde += wField * (tf / norm);
  }
  return idf * (tfTilde / (k1 + tfTilde));
}

export function parseJd(raw: string, options: ParseJdOptions = {}): ParsedJd {
  const corpus = options.corpus ?? DEFAULT_JD_CORPUS;
  const aliases = options.aliases ?? [];
  const avgFieldLen = { ...AVG_FIELD_LEN, ...options.avgFieldLen };

  const tokens = positionTokens(raw);
  const normTokens = tokens.map((t) => t.norm);

  // Per-field token counts (for BM25F length normalization).
  const fieldLen: Record<JdSection, number> = {
    title: 0, requirements: 0, responsibilities: 0, nice_to_have: 0, about: 0,
  };
  for (const t of tokens) fieldLen[t.section]++;

  const stats = new Map<string, TermStat>();
  const ensure = (key: string, term: string, skillId: string | null, suggested: boolean): TermStat => {
    let s = stats.get(key);
    if (!s) {
      s = {
        term,
        skillId,
        suggested,
        tf: { title: 0, requirements: 0, responsibilities: 0, nice_to_have: 0, about: 0 },
        sections: new Set(),
        spans: [],
      };
      stats.set(key, s);
    }
    return s;
  };

  // ── 1. Dictionary matches via Aho-Corasick ─────────────────────────────────
  const ac = new AhoCorasick<{ term: string; skillId: string | null }>();
  for (const a of aliases) {
    const toks = tokenize(a.alias);
    if (toks.length > 0) ac.add(toks, { term: a.term, skillId: a.skillId });
  }
  for (const m of ac.search(normTokens)) {
    const key = m.meta.term.toLowerCase();
    const stat = ensure(key, m.meta.term, m.meta.skillId, false);
    const startTok = tokens[m.start]!;
    const endTok = tokens[m.end]!;
    stat.tf[startTok.section]++;
    stat.sections.add(startTok.section);
    stat.spans.push([startTok.rawStart, endTok.rawEnd]);
    for (let i = m.start; i <= m.end; i++) tokens[i]!.covered = true;
  }

  // ── 2. Novel-term candidates: high-idf uncovered 1-2-grams, not stopwords ───
  const uncovered: PositionedToken[][] = [];
  let run: PositionedToken[] = [];
  for (const t of tokens) {
    if (t.covered || STOPWORDS.has(t.norm) || t.norm.length < 2) {
      if (run.length) uncovered.push(run);
      run = [];
    } else {
      run.push(t);
    }
  }
  if (run.length) uncovered.push(run);

  for (const segment of uncovered) {
    const segNorms = segment.map((t) => t.norm);
    const grams = ngrams(segNorms, 1, 2);
    // Map gram → its token span within the segment by re-scanning.
    for (let n = 1; n <= 2; n++) {
      for (let i = 0; i + n <= segment.length; i++) {
        const gram = segment.slice(i, i + n).map((t) => t.norm).join(' ');
        if (n === 1 && (STOPWORDS.has(gram) || /^\d+$/.test(gram))) continue;
        const key = gram;
        if (stats.has(key)) {
          // already a dictionary term; skip to avoid double count
          continue;
        }
        const idf = idfFor(gram, corpus);
        // Only keep reasonably rare candidates (idf above the median-ish gate).
        if (idf < 2.0) continue;
        const stat = ensure(key, titleCase(gram), null, true);
        const first = segment[i]!;
        const last = segment[i + n - 1]!;
        stat.tf[first.section]++;
        stat.sections.add(first.section);
        stat.spans.push([first.rawStart, last.rawEnd]);
      }
    }
    void grams;
  }

  // ── 3. BM25F weighting ─────────────────────────────────────────────────────
  const keywords: ParsedKeyword[] = [];
  for (const [key, stat] of stats) {
    const idf = idfFor(key, corpus);
    const weight = bm25fWeight(stat, idf, avgFieldLen, fieldLen);
    if (weight <= 0) continue;
    keywords.push({
      term: stat.term,
      weight: round(weight),
      sections: [...stat.sections],
      spans: stat.spans.slice(0, 8),
      skill_id: stat.skillId,
      ...(stat.suggested ? { suggested: true } : {}),
    });
  }

  keywords.sort((a, b) => b.weight - a.weight || a.term.localeCompare(b.term));

  return {
    parser_version: options.parserVersion ?? JD_PARSER_VERSION,
    keywords: keywords.slice(0, BM25F.maxKeywords),
  };
}

function idfFor(term: string, corpus: JdCorpus): number {
  const df = corpus.df[term] ?? 0;
  const N = corpus.N;
  // BM25 idf with +1 to stay non-negative even for very common terms.
  return Math.log(1 + (N - df + 0.5) / (df + 0.5));
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function round(v: number): number {
  return Math.round(v * 1e4) / 1e4;
}
