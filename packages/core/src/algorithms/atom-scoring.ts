/**
 * Atom scoring against a parsed target (SRS §10.4-B, FR-RES-007).
 *
 *   s(atom) = ( Σ_k weight_k · hit_k(atom) ) · recency(atom) · metricBonus(atom)
 *
 * where hit_k = 1.0 for a skill-tag match, 0.6 for a stemmed text match, 0
 * otherwise; recency = max(exp(−yearsSinceEnd / 8), 0.35); metricBonus =
 * 1 + 0.15·min(metricCount, 2). Every atom's score decomposes EXACTLY into the
 * per-keyword contributions shown in the breakdown popover (FR-RES-007).
 */
import { SELECTION } from './constants.js';
import type { ParsedKeyword, ScorableAtom } from '../schema/resume.js';
import { stem, tokenize } from './text.js';

const MS_PER_YEAR = 365.25 * 86_400_000;

export interface KeywordHit {
  term: string;
  weight: number;
  hit: number; // 0, 0.6, or 1.0
  contribution: number; // weight · hit
  via: 'skill' | 'text' | 'none';
}

export interface AtomScore {
  atomId: string;
  score: number;
  relevance: number; // Σ weight·hit (pre-multipliers)
  recency: number;
  metricBonus: number;
  hits: KeywordHit[];
}

/** Return the default (or first) variant text of an atom. */
export function defaultVariantText(atom: ScorableAtom): string {
  const def = atom.variants.find((v) => v.is_default) ?? atom.variants[0];
  return def?.text ?? '';
}

function stemSet(text: string): Set<string> {
  return new Set(tokenize(text).map(stem));
}

/** Does the keyword's stemmed phrase appear in the atom's stemmed text? */
function textHit(keywordStems: string[], atomStems: Set<string>): boolean {
  if (keywordStems.length === 0) return false;
  return keywordStems.every((s) => atomStems.has(s));
}

export function recencyFactor(dateEnd: string | undefined, now: Date): number {
  if (!dateEnd) return 1; // ongoing → treated as current
  const end = Date.parse(dateEnd);
  if (Number.isNaN(end)) return 1;
  const years = Math.max(0, (now.getTime() - end) / MS_PER_YEAR);
  return Math.max(Math.exp(-years / SELECTION.recencyTauYears), SELECTION.recencyFloor);
}

export function metricBonus(metricCount: number): number {
  return 1 + SELECTION.metricCoeff * Math.min(metricCount, SELECTION.metricCap);
}

export function scoreAtom(
  atom: ScorableAtom,
  keywords: ParsedKeyword[],
  now: Date = new Date(),
): AtomScore {
  const atomStems = stemSet(defaultVariantText(atom));
  const skillIds = new Set(atom.skill_ids);

  const hits: KeywordHit[] = [];
  let relevance = 0;
  for (const kw of keywords) {
    let hit = 0;
    let via: KeywordHit['via'] = 'none';
    if (kw.skill_id && skillIds.has(kw.skill_id)) {
      hit = SELECTION.skillHit;
      via = 'skill';
    } else if (textHit(tokenize(kw.term).map(stem), atomStems)) {
      hit = SELECTION.textHit;
      via = 'text';
    }
    const contribution = kw.weight * hit;
    if (hit > 0) relevance += contribution;
    hits.push({ term: kw.term, weight: kw.weight, hit, contribution: round(contribution), via });
  }

  const recency = recencyFactor(atom.date_end, now);
  const bonus = metricBonus(atom.metrics.length);
  const score = relevance * recency * bonus;

  return {
    atomId: atom.id,
    score: round(score),
    relevance: round(relevance),
    recency: round(recency),
    metricBonus: round(bonus),
    hits: hits.filter((h) => h.hit > 0).sort((a, b) => b.contribution - a.contribution),
  };
}

export function scoreAtoms(
  atoms: ScorableAtom[],
  keywords: ParsedKeyword[],
  now: Date = new Date(),
): Map<string, AtomScore> {
  const map = new Map<string, AtomScore>();
  for (const a of atoms) map.set(a.id, scoreAtom(a, keywords, now));
  return map;
}

function round(v: number): number {
  return Math.round(v * 1e4) / 1e4;
}
