/**
 * Probabilistic record linkage, the Fellegi-Sunter model (SRS §5.3, §10.7.6).
 *
 * The standard framework for linkage without shared identifiers [Fellegi &
 * Sunter 1969; Asher 2020]. Each compared field contributes a log₂ match weight:
 *
 *   agreement:    log₂(m / u)         disagreement:  log₂((1−m) / (1−u))
 *
 * with two refinements:
 *   • Approximate comparators [DuVall 2010; Li 2014], the agreement weight
 *     scales with trigram / Jaro-Winkler similarity instead of binary agree,
 *     interpolating from the disagreement weight below a per-field threshold.
 *   • Missing-at-random [Li 2021], an absent field contributes 0, not
 *     disagreement.
 *
 * The summed weight is partitioned by two thresholds into non-match / possible /
 * probable. Possible AND probable go to the duplicates QUEUE (auto-merge never
 * happens, SRS §4.7); the per-field breakdown is shown as match evidence, so
 * "why matched" decomposes exactly, the same explainability contract as ranking.
 */
import { DEDUP } from './constants.js';
import { jaroWinkler, normalizeForMatch, trigramSimilarity } from './text.js';
import type { NodeType } from '../types.js';

export type Verdict = 'non_match' | 'possible' | 'probable';

export interface FieldComparison {
  field: string;
  /** Similarity in [0,1]; 1 = exact. */
  similarity: number;
  present: boolean;
  /** Per-field agreement threshold below which similarity reads as disagreement. */
  simThreshold?: number;
}

export interface FieldWeight {
  field: string;
  similarity: number;
  weight: number;
}

export interface PairScore {
  weight: number;
  verdict: Verdict;
  breakdown: FieldWeight[];
}

export type MatchSignalKind =
  | 'external_identity'
  | 'email'
  | 'phone'
  | 'domain'
  | 'url'
  | 'country'
  | 'name'
  | 'date'
  | 'context'
  | 'contradiction';

export interface MatchSignal {
  kind: MatchSignalKind;
  label: string;
  similarity: number;
  weight: number;
  left?: string;
  right?: string;
  contradiction?: boolean;
}

export interface EntityMatchInput {
  type: NodeType;
  title: string;
  subtitle?: string | null;
  props?: Record<string, unknown>;
  identity_keys?: string[];
  start_date?: string;
  end_date?: string;
}

export interface EntityMatchResult {
  score: number;
  verdict: Verdict;
  signals: MatchSignal[];
  contradictions: MatchSignal[];
}

const PERSON_TITLES = new Set([
  'mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'professor', 'eng', 'engineer', 'sir',
]);
const PERSON_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'phd', 'md', 'mba']);
const ORG_SUFFIXES = new Set([
  'inc', 'incorporated', 'llc', 'ltd', 'limited', 'plc', 'corp', 'corporation',
  'company', 'co', 'gmbh', 'sae', 's.a.e', 'ag', 'group', 'holding', 'holdings',
]);
const ARABIC_FOLD: Record<string, string> = {
  أ: 'ا', إ: 'ا', آ: 'ا', ٱ: 'ا', ة: 'ه', ى: 'ي', ئ: 'ي', ؤ: 'و',
};
const ARABIC_LATIN: Record<string, string> = {
  ا: 'a', ب: 'b', ت: 't', ث: 'th', ج: 'j', ح: 'h', خ: 'kh', د: 'd', ذ: 'th',
  ر: 'r', ز: 'z', س: 's', ش: 'sh', ص: 's', ض: 'd', ط: 't', ظ: 'z', ع: 'a',
  غ: 'gh', ف: 'f', ق: 'q', ك: 'k', ل: 'l', م: 'm', ن: 'n', ه: 'h', و: 'w',
  ي: 'y', ء: '', ة: 'h', ى: 'a',
};

/** Stable, intentionally conservative Arabic folding for identity comparison. */
export function normalizeArabic(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/[أإآٱةىئؤ]/g, (c) => ARABIC_FOLD[c] ?? c)
    .replace(/ـ/g, '');
}

/** Transliteration is supporting evidence only; callers never treat it as identity. */
export function transliterateArabic(input: string): string {
  return normalizeArabic(input).replace(/[\u0621-\u064A]/g, (c) => ARABIC_LATIN[c] ?? c);
}

function words(input: string): string[] {
  return normalizeForMatch(normalizeArabic(input))
    .replace(/[+#.]/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean);
}

export function canonicalPersonName(input: string): string {
  const tokens = words(input).filter((t) => !PERSON_TITLES.has(t) && !PERSON_SUFFIXES.has(t));
  return tokens.join(' ');
}

export function canonicalOrganizationName(input: string): string {
  const tokens = words(input);
  while (tokens.length > 1 && ORG_SUFFIXES.has(tokens[tokens.length - 1]!)) tokens.pop();
  return tokens.join(' ');
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string' && Boolean(v.trim()));
  return typeof value === 'string' && value.trim() ? [value] : [];
}

function normalizedSet(values: string[], normalizer = normalizeForMatch): Set<string> {
  return new Set(values.map(normalizer).filter(Boolean));
}

function overlap(a: Set<string>, b: Set<string>): boolean {
  for (const value of a) if (b.has(value)) return true;
  return false;
}

function host(raw: string): string {
  const value = raw.trim().toLowerCase();
  try {
    return new URL(value.includes('://') ? value : `https://${value}`).hostname.replace(/^www\./, '');
  } catch {
    return value.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] ?? value;
  }
}

function canonicalUrl(raw: string): string {
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (key.startsWith('utm_')) url.searchParams.delete(key);
    return `${url.hostname.replace(/^www\./, '').toLowerCase()}${url.pathname.replace(/\/+$/, '')}${url.search}`;
  } catch {
    return normalizeForMatch(raw);
  }
}

const COUNTRY_ALIASES: Record<string, string> = {
  eg: 'EG', egy: 'EG', egypt: 'EG', 'arab republic of egypt': 'EG', مصر: 'EG',
  us: 'US', usa: 'US', 'united states': 'US', 'united states of america': 'US',
  uk: 'GB', gb: 'GB', gbr: 'GB', 'united kingdom': 'GB', britain: 'GB',
  ae: 'AE', are: 'AE', uae: 'AE', 'united arab emirates': 'AE',
  sa: 'SA', sau: 'SA', 'saudi arabia': 'SA',
  de: 'DE', deu: 'DE', germany: 'DE',
  fr: 'FR', fra: 'FR', france: 'FR',
  ca: 'CA', can: 'CA', canada: 'CA',
};
const COUNTRY_NAMES: Record<string, string> = {
  EG: 'Egypt', US: 'United States', GB: 'United Kingdom', AE: 'United Arab Emirates',
  SA: 'Saudi Arabia', DE: 'Germany', FR: 'France', CA: 'Canada',
};

export function canonicalCountryCode(raw: string): string | null {
  const key = normalizeForMatch(normalizeArabic(raw));
  return COUNTRY_ALIASES[key] ?? (/^[a-z]{2}$/.test(key) ? key.toUpperCase() : null);
}

export function canonicalCountryName(raw: string): string | null {
  const code = canonicalCountryCode(raw);
  return code ? COUNTRY_NAMES[code] ?? raw.trim() : null;
}

function addSignal(signals: MatchSignal[], signal: MatchSignal): void {
  signals.push({ ...signal, similarity: round(signal.similarity), weight: round(signal.weight) });
}

/**
 * Explainable, type-aware entity linkage. Scores are normalized to 0-100 and
 * intentionally conservative: fuzzy title similarity cannot establish a
 * probable identity without a corroborating signal.
 */
export function compareEntities(a: EntityMatchInput, b: EntityMatchInput): EntityMatchResult {
  if (a.type !== b.type) return { score: 0, verdict: 'non_match', signals: [], contradictions: [] };
  const ap = a.props ?? {};
  const bp = b.props ?? {};
  const signals: MatchSignal[] = [];
  const contradictions: MatchSignal[] = [];

  const idsA = normalizedSet(a.identity_keys ?? []);
  const idsB = normalizedSet(b.identity_keys ?? []);
  if (idsA.size && idsB.size && overlap(idsA, idsB)) {
    addSignal(signals, { kind: 'external_identity', label: 'Same external identity', similarity: 1, weight: 100 });
  }

  const compareExactList = (
    kind: MatchSignalKind,
    label: string,
    left: string[],
    right: string[],
    normalizer: (value: string) => string,
    weight: number,
  ) => {
    const la = normalizedSet(left, normalizer);
    const lb = normalizedSet(right, normalizer);
    if (!la.size || !lb.size) return;
    if (overlap(la, lb)) addSignal(signals, { kind, label, similarity: 1, weight });
    else if (kind === 'email' || kind === 'phone') {
      const conflict = { kind: 'contradiction' as const, label: `Different ${label.toLowerCase()}`, similarity: 0, weight: -12, contradiction: true };
      contradictions.push(conflict);
      signals.push(conflict);
    }
  };

  compareExactList('email', 'Same email', stringList(ap.emails), stringList(bp.emails), (v) => v.trim().toLowerCase(), 55);
  compareExactList('phone', 'Same phone', stringList(ap.phones), stringList(bp.phones), (v) => v.replace(/\D/g, '').slice(-10), 45);

  const urlsA = [...stringList(ap.url), ...stringList(ap.website), ...stringList(ap.credential_url)];
  const urlsB = [...stringList(bp.url), ...stringList(bp.website), ...stringList(bp.credential_url)];
  compareExactList('url', 'Same canonical URL', urlsA, urlsB, canonicalUrl, 70);

  if (a.type === 'organization') {
    compareExactList('domain', 'Same domain', [...stringList(ap.domain), ...urlsA], [...stringList(bp.domain), ...urlsB], host, 65);
  }

  const rawA = a.type === 'person' ? canonicalPersonName(a.title) : a.type === 'organization' ? canonicalOrganizationName(a.title) : normalizeForMatch(a.title);
  const rawB = b.type === 'person' ? canonicalPersonName(b.title) : b.type === 'organization' ? canonicalOrganizationName(b.title) : normalizeForMatch(b.title);
  const directName = Math.max(trigramSimilarity(rawA, rawB), jaroWinkler(rawA, rawB) * 0.96);
  const transA = normalizeForMatch(transliterateArabic(a.title));
  const transB = normalizeForMatch(transliterateArabic(b.title));
  const transliterated = /[\u0600-\u06ff]/.test(`${a.title}${b.title}`)
    ? Math.max(trigramSimilarity(transA, transB), jaroWinkler(transA, transB) * 0.9)
    : 0;
  const nameSimilarity = Math.max(directName, transliterated);
  if (nameSimilarity >= 0.58) {
    const exact = rawA === rawB;
    addSignal(signals, {
      kind: 'name',
      label: exact ? 'Same normalized name' : transliterated > directName ? 'Arabic/Latin name variant' : 'Similar name',
      similarity: nameSimilarity,
      weight: exact ? 48 : 8 + 30 * nameSimilarity,
      left: a.title,
      right: b.title,
    });
  }

  const countryA = canonicalCountryCode(String(ap.country_code ?? ap.country ?? (a.type === 'location' ? a.title : '')));
  const countryB = canonicalCountryCode(String(bp.country_code ?? bp.country ?? (b.type === 'location' ? b.title : '')));
  if (countryA && countryB) {
    if (countryA === countryB) addSignal(signals, { kind: 'country', label: `Same country (${countryA})`, similarity: 1, weight: a.type === 'location' ? 75 : 12 });
    else {
      const conflict = { kind: 'contradiction' as const, label: `Different countries (${countryA}/${countryB})`, similarity: 0, weight: -18, contradiction: true };
      contradictions.push(conflict);
      signals.push(conflict);
    }
  }

  if (a.start_date && b.start_date) {
    const exact = a.start_date === b.start_date;
    if (exact) addSignal(signals, { kind: 'date', label: 'Same start date', similarity: 1, weight: 22 });
  }

  const positive = signals.reduce((sum, signal) => sum + Math.max(0, signal.weight), 0);
  const negative = contradictions.reduce((sum, signal) => sum + Math.abs(signal.weight), 0);
  let score = Math.max(0, Math.min(100, positive - negative));
  const hasAnchor = signals.some((s) =>
    ['external_identity', 'email', 'phone', 'domain', 'url', 'country', 'date'].includes(s.kind) && s.weight >= 20,
  );
  if (!hasAnchor && nameSimilarity < 0.9) score = Math.min(score, 64);
  const verdict: Verdict = score >= 78 ? 'probable' : score >= 48 ? 'possible' : 'non_match';
  return { score: round(score), verdict, signals, contradictions };
}

const LOG2 = Math.log(2);
const log2 = (x: number): number => Math.log(x) / LOG2;

/** Score a candidate pair from its field comparisons (SRS §10.7.6). */
export function scorePair(
  comparisons: FieldComparison[],
  params: typeof DEDUP = DEDUP,
): PairScore {
  const breakdown: FieldWeight[] = [];
  let total = 0;

  for (const c of comparisons) {
    if (!c.present) {
      breakdown.push({ field: c.field, similarity: c.similarity, weight: 0 });
      continue; // missing-at-random: contributes 0
    }
    const mu = params.fields[c.field];
    if (!mu) continue;
    const agree = log2(mu.m / mu.u);
    const disagree = log2((1 - mu.m) / (1 - mu.u));
    const sMin = c.simThreshold ?? 0.6;
    // Interpolate agreement→disagreement by similarity above the threshold.
    const t = clamp((c.similarity - sMin) / (1 - sMin), 0, 1);
    const weight = disagree + t * (agree - disagree);
    total += weight;
    breakdown.push({ field: c.field, similarity: round(c.similarity), weight: round(weight) });
  }

  const verdict: Verdict =
    total >= params.probableThreshold
      ? 'probable'
      : total >= params.possibleThreshold
        ? 'possible'
        : 'non_match';

  return { weight: round(total), verdict, breakdown };
}

// ── Convenience comparators for person/org records ───────────────────────────

export interface PersonLike {
  emails?: string[];
  phones?: string[];
  title?: string;
  orgDomains?: string[];
  eventIds?: string[];
}

export function comparePersons(a: PersonLike, b: PersonLike): FieldComparison[] {
  const comps: FieldComparison[] = [];

  const emailA = new Set((a.emails ?? []).map((e) => e.toLowerCase()));
  const emailB = new Set((b.emails ?? []).map((e) => e.toLowerCase()));
  const emailPresent = emailA.size > 0 && emailB.size > 0;
  comps.push({
    field: 'email',
    present: emailPresent,
    similarity: emailPresent ? ([...emailA].some((e) => emailB.has(e)) ? 1 : 0) : 0,
    simThreshold: 0.99,
  });

  const namePresent = Boolean(a.title && b.title);
  comps.push({
    field: 'name_trigram',
    present: namePresent,
    similarity: namePresent
      ? Math.max(
          trigramSimilarity(a.title!, b.title!),
          jaroWinkler(a.title!, b.title!) * 0.95, // JW as a secondary comparator
        )
      : 0,
    simThreshold: 0.6,
  });

  const domA = new Set((a.orgDomains ?? []).map((d) => d.toLowerCase()));
  const domB = new Set((b.orgDomains ?? []).map((d) => d.toLowerCase()));
  const domPresent = domA.size > 0 && domB.size > 0;
  comps.push({
    field: 'org_domain',
    present: domPresent,
    similarity: domPresent ? ([...domA].some((d) => domB.has(d)) ? 1 : 0) : 0,
    simThreshold: 0.99,
  });

  const evA = new Set(a.eventIds ?? []);
  const evB = new Set(b.eventIds ?? []);
  const evPresent = evA.size > 0 && evB.size > 0;
  comps.push({
    field: 'shared_event',
    present: evPresent,
    similarity: evPresent ? ([...evA].some((e) => evB.has(e)) ? 1 : 0) : 0,
    simThreshold: 0.99,
  });

  const phonePresent = Boolean(a.phones?.length && b.phones?.length);
  const phoneA = new Set((a.phones ?? []).map(normalizePhone));
  const phoneB = new Set((b.phones ?? []).map(normalizePhone));
  comps.push({
    field: 'phone',
    present: phonePresent,
    similarity: phonePresent ? ([...phoneA].some((p) => phoneB.has(p)) ? 1 : 0) : 0,
    simThreshold: 0.99,
  });

  return comps;
}

function normalizePhone(p: string): string {
  return p.replace(/[^\d+]/g, '');
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function round(v: number): number {
  return Math.round(v * 1e4) / 1e4;
}
