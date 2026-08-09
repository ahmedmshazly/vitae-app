/**
 * "Who should I call?" ranking (SRS §10.4-A, upgraded per §10.7.3).
 *
 * This is the expert-finding task [Balog 2006/2012]: rank people by aggregating
 * the relevance of their associated evidence. The score is a linear weighted sum
 * that decomposes EXACTLY into the reason chips the UI shows (FR-CON-006):
 *
 *   S = 2.0·affiliation + 1.6·topic + 1.2·strength + 0.6·geo
 *     + 0.4·reciprocity + 0.8·graph(PPR) + 1.0·pinned
 *
 * where `topic` is a normalized BM25 score of the intent terms over each
 * person's evidence text (KNOWS.topics ∪ skills ∪ shared project/interaction
 * text), and `graph` is the person's Personalized-PageRank proximity to self.
 * `do_not_contact` people are excluded; ties break by last interaction desc.
 */
import { AFFILIATION, GEO, RECIPROCITY, WHO_TO_CALL_WEIGHTS } from './constants.js';
import { normalizeForMatch, stem, tokenize } from './text.js';

export interface Intent {
  need?: string;
  /** Topic terms to match against evidence, e.g. ["reinforcement learning"]. */
  terms: string[];
  /** Target organization title (case-insensitive compare done by caller). */
  org?: string;
  city?: string;
  country?: string;
}

export interface FavorEntry {
  direction: 'owed_to_me' | 'owed_by_me';
  settled?: boolean;
}

export interface CandidatePerson {
  id: string;
  title: string;
  pinned?: boolean;
  doNotContact?: boolean;
  /** Relationship to the target org (SRS affiliation factor). */
  affiliation?: 'current' | 'past' | null;
  /** Evidence snippets; each becomes a candidate chip source. */
  evidence?: EvidenceItem[];
  strength?: number;
  city?: string;
  country?: string;
  favors?: FavorEntry[];
  askedRecentlyDays?: number | null;
  /** Normalized Personalized-PageRank proximity in [0,1]. */
  graphScore?: number;
  lastInteractionAt?: string | null;
}

export interface EvidenceItem {
  /** Human label for the chip, e.g. "PerceptionBench" or "coffee 2026-03-12". */
  label: string;
  text: string;
}

export interface FactorChip {
  factor: string;
  raw: number;
  weighted: number;
  detail?: string;
}

export interface RankedPerson {
  id: string;
  title: string;
  score: number;
  chips: FactorChip[];
  topEvidence: string[];
}

// ── BM25 over evidence documents ─────────────────────────────────────────────

const BM25_K1 = 1.2;
const BM25_B = 0.75;

interface EvidenceDoc {
  personId: string;
  stems: string[];
  bestLabelByStem: Map<string, string>;
}

function buildEvidenceDoc(p: CandidatePerson): EvidenceDoc {
  const stems: string[] = [];
  const bestLabelByStem = new Map<string, string>();
  for (const item of p.evidence ?? []) {
    for (const tok of tokenize(item.text)) {
      const s = stem(tok);
      stems.push(s);
      if (!bestLabelByStem.has(s)) bestLabelByStem.set(s, item.label);
    }
  }
  return { personId: p.id, stems, bestLabelByStem };
}

/**
 * Score each candidate's topic relevance with BM25 over the candidate set as the
 * corpus, then normalize to [0,1] by the max observed. Returns raw score and the
 * evidence labels that matched (for chips).
 */
function topicScores(
  candidates: CandidatePerson[],
  terms: string[],
): Map<string, { score: number; evidence: string[] }> {
  const result = new Map<string, { score: number; evidence: string[] }>();
  const termStems = terms
    .flatMap((t) => tokenize(t))
    .map(stem)
    .filter(Boolean);
  if (termStems.length === 0) {
    for (const c of candidates) result.set(c.id, { score: 0, evidence: [] });
    return result;
  }

  const docs = candidates.map(buildEvidenceDoc);
  const N = docs.length || 1;
  const avgdl = docs.reduce((s, d) => s + d.stems.length, 0) / N || 1;

  // Document frequency per query stem.
  const df = new Map<string, number>();
  for (const s of new Set(termStems)) {
    let count = 0;
    for (const d of docs) if (d.stems.includes(s)) count++;
    df.set(s, count);
  }

  let maxScore = 0;
  const raw = new Map<string, { score: number; evidence: string[] }>();
  for (const d of docs) {
    const dl = d.stems.length;
    const tf = new Map<string, number>();
    for (const s of d.stems) tf.set(s, (tf.get(s) ?? 0) + 1);

    let score = 0;
    const evidence: string[] = [];
    for (const qs of new Set(termStems)) {
      const f = tf.get(qs) ?? 0;
      if (f === 0) continue;
      const n = df.get(qs) ?? 0;
      // BM25 idf with +1 to keep it non-negative.
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      const denom = f + BM25_K1 * (1 - BM25_B + (BM25_B * dl) / avgdl);
      score += idf * ((f * (BM25_K1 + 1)) / denom);
      const label = d.bestLabelByStem.get(qs);
      if (label && !evidence.includes(label)) evidence.push(label);
    }
    raw.set(d.personId, { score, evidence });
    if (score > maxScore) maxScore = score;
  }

  for (const [id, v] of raw) {
    result.set(id, { score: maxScore > 0 ? v.score / maxScore : 0, evidence: v.evidence.slice(0, 3) });
  }
  return result;
}

// ── Ranking ──────────────────────────────────────────────────────────────────

export interface RankOptions {
  /** Numeric overrides for the factor weights (settings-driven). */
  weights?: Record<keyof typeof WHO_TO_CALL_WEIGHTS, number>;
  limit?: number;
}

export function whoToCall(
  candidates: CandidatePerson[],
  intent: Intent,
  options: RankOptions = {},
): RankedPerson[] {
  const w = options.weights ?? WHO_TO_CALL_WEIGHTS;
  const limit = options.limit ?? 10;

  const eligible = candidates.filter((c) => !c.doNotContact);
  const topics = topicScores(eligible, intent.terms);

  const wantCity = intent.city ? normalizeForMatch(intent.city) : null;
  const wantCountry = intent.country ? normalizeForMatch(intent.country) : null;

  const ranked: RankedPerson[] = eligible.map((c) => {
    const chips: FactorChip[] = [];

    // Affiliation.
    const affRaw =
      c.affiliation === 'current' ? AFFILIATION.current : c.affiliation === 'past' ? AFFILIATION.past : 0;
    if (affRaw > 0) {
      chips.push({
        factor: 'affiliation',
        raw: affRaw,
        weighted: w.affiliation * affRaw,
        detail: c.affiliation === 'current' ? 'Works there now' : 'Worked there',
      });
    }

    // Topic (BM25 evidence).
    const topic = topics.get(c.id) ?? { score: 0, evidence: [] };
    if (topic.score > 0) {
      chips.push({
        factor: 'topic',
        raw: topic.score,
        weighted: w.topic * topic.score,
        detail: topic.evidence.length ? `via ${topic.evidence.join(', ')}` : undefined,
      });
    }

    // Strength.
    const strengthRaw = c.strength ?? 0;
    if (strengthRaw > 0) {
      chips.push({ factor: 'strength', raw: strengthRaw, weighted: w.strength * strengthRaw });
    }

    // Geography.
    const cCity = c.city ? normalizeForMatch(c.city) : null;
    const cCountry = c.country ? normalizeForMatch(c.country) : null;
    let geoRaw = 0;
    let geoDetail: string | undefined;
    if (wantCity && cCity && cCity === wantCity) {
      geoRaw = GEO.sameCity;
      geoDetail = `Same city: ${c.city}`;
    } else if (wantCountry && cCountry && cCountry === wantCountry) {
      geoRaw = GEO.sameCountry;
      geoDetail = `Same country`;
    }
    if (geoRaw > 0) chips.push({ factor: 'geo', raw: geoRaw, weighted: w.geo * geoRaw, detail: geoDetail });

    // Reciprocity.
    let recRaw = 0;
    const owesMe = (c.favors ?? []).some((f) => f.direction === 'owed_to_me' && !f.settled);
    if (owesMe) recRaw += RECIPROCITY.unsettledOwedToMe;
    if (c.askedRecentlyDays != null && c.askedRecentlyDays < RECIPROCITY.recentDays) {
      recRaw += RECIPROCITY.askedRecently;
    }
    if (recRaw !== 0) {
      chips.push({
        factor: 'reciprocity',
        raw: recRaw,
        weighted: w.reciprocity * recRaw,
        detail: owesMe ? 'Owes you one' : 'Asked recently',
      });
    }

    // Graph proximity (PPR).
    const graphRaw = c.graphScore ?? 0;
    if (graphRaw > 0) {
      chips.push({ factor: 'graph', raw: graphRaw, weighted: w.graph * graphRaw });
    }

    // Pinned boost.
    if (c.pinned) chips.push({ factor: 'pinned', raw: 1, weighted: w.pinned, detail: 'Pinned' });

    const score = chips.reduce((s, chip) => s + chip.weighted, 0);
    return {
      id: c.id,
      title: c.title,
      score: round(score),
      chips: chips.map((chip) => ({ ...chip, raw: round(chip.raw), weighted: round(chip.weighted) })),
      topEvidence: topic.evidence,
    };
  });

  return ranked
    .sort(
      (a, b) =>
        b.score - a.score ||
        lastDesc(byId(eligible, a.id), byId(eligible, b.id)) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, limit);
}

function byId(list: CandidatePerson[], id: string): CandidatePerson | undefined {
  return list.find((c) => c.id === id);
}

function lastDesc(a?: CandidatePerson, b?: CandidatePerson): number {
  const ta = a?.lastInteractionAt ? Date.parse(a.lastInteractionAt) : 0;
  const tb = b?.lastInteractionAt ? Date.parse(b.lastInteractionAt) : 0;
  return tb - ta;
}

function round(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}
