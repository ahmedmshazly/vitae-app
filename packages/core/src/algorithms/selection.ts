/**
 * Résumé atom selection as budgeted submodular maximization (SRS §10.7.5,
 * FR-RES-008/014). Selecting bullets to fill a one-page budget is exactly the
 * formulation that made extractive summarization tractable with a guarantee
 * [Lin & Bilmes 2010; Sviridenko 2003].
 *
 * Objective (monotone submodular, diminishing returns per keyword):
 *
 *   F(S) = Σ_k w_k·(1 − e^{−λ·cov_k(S)}) + μ·Σ_{a∈S} quality(a)
 *
 * cov_k(S) = Σ_{a∈S} hit_k(a). The saturating exponential means the third bullet
 * proving "Python" adds far less than the first, so the optimizer diversifies
 * coverage across the JD rather than stacking redundant bullets.
 *
 * Constraints: knapsack (Σ lines ≤ budget), partition (≤ maxBullets per owner,
 * roles reverse-chron), pinned forced in, blocked excluded. Algorithm:
 * cost-benefit greedy (argmax marginal-gain ÷ line-cost), compared against the
 * best single atom, the (1−1/e)/2 approximation safeguard. The concise variant
 * is a lower-cost item for the same coverage, so the fit loop is a special case
 * (swap-to-concise) of the same optimizer. Deterministic tiebreaks preserve
 * "identical inputs → identical proposal".
 */
import { SELECTION } from './constants.js';
import type { ParsedKeyword } from '../schema/resume.js';

export interface SelectableVariant {
  emphasis: string;
  text: string;
  /** Estimated line cost from the template line model. */
  lines: number;
}

export interface SelectableAtom {
  id: string;
  ownerId: string;
  ownerKind: 'role' | 'project' | 'other';
  /** ISO date; undefined = ongoing (sorts most-recent). */
  dateEnd?: string;
  pinned: boolean;
  blocked: boolean;
  /** recency × metricBonus (from atom scoring). */
  quality: number;
  /** Per-keyword hit value in [0,1], keyed by keyword term. */
  hitByKeyword: Record<string, number>;
  /** Available variants with line costs; must be non-empty. */
  variants: SelectableVariant[];
}

export interface SelectionEntry {
  atomId: string;
  ownerId: string;
  emphasis: string;
  text: string;
  lines: number;
}

export interface SelectionDecision {
  atomId: string;
  action: 'pinned' | 'greedy-add' | 'concise-swap' | 'dropped-blocked' | 'dropped-budget' | 'manual-add';
  ratio?: number;
}

export interface SelectionResult {
  entries: SelectionEntry[];
  totalLines: number;
  objective: number;
  /** Fraction of each keyword's weight covered (saturated), for the report. */
  coverage: Record<string, number>;
  weightedCoverage: number;
  decisions: SelectionDecision[];
}

export interface SelectOptions {
  keywords: ParsedKeyword[];
  budgetLines: number;
  preferredEmphasis?: string;
  /** Per-atom wording override; wins over preferredEmphasis when present. */
  variantByAtom?: Record<string, string>;
  lambda?: number;
  mu?: number;
  minBulletsPerRole?: number;
  maxBulletsPerRole?: number;
  /** Lines consumed by an owner's header the first time it is included. */
  entryOverhead?: number;
}

/** Resolve wording: per-atom override → global preferred emphasis → first variant. */
export function resolveVariant(
  atom: Pick<SelectableAtom, 'id' | 'variants'>,
  options: Pick<SelectOptions, 'preferredEmphasis' | 'variantByAtom'>,
): SelectableVariant {
  const perAtom = options.variantByAtom?.[atom.id];
  if (perAtom) {
    const match = atom.variants.find((variant) => variant.emphasis === perAtom);
    if (match) return match;
  }
  if (options.preferredEmphasis) {
    const match = atom.variants.find((variant) => variant.emphasis === options.preferredEmphasis);
    if (match) return match;
  }
  return atom.variants[0]!;
}

interface WorkingAtom extends SelectableAtom {
  chosen?: SelectableVariant;
}

export function selectAtoms(atoms: SelectableAtom[], options: SelectOptions): SelectionResult {
  const lambda = options.lambda ?? SELECTION.lambda;
  const mu = options.mu ?? SELECTION.mu;
  const maxBullets = options.maxBulletsPerRole ?? SELECTION.maxBulletsPerRole;
  const entryOverhead = options.entryOverhead ?? 0;
  const keywords = options.keywords;
  const weightOf: Record<string, number> = {};
  for (const kw of keywords) weightOf[kw.term] = kw.weight;

  const decisions: SelectionDecision[] = [];
  const pool: WorkingAtom[] = atoms
    .filter((a) => {
      if (a.blocked) {
        decisions.push({ atomId: a.id, action: 'dropped-blocked' });
        return false;
      }
      return a.variants.length > 0;
    })
    .map((a) => ({ ...a }));

  const cov: Record<string, number> = {};
  for (const kw of keywords) cov[kw.term] = 0;

  const selected: WorkingAtom[] = [];
  const ownerCount = new Map<string, number>();
  const includedOwners = new Set<string>();
  let budget = options.budgetLines;

  const preferredVariant = (a: WorkingAtom): SelectableVariant => resolveVariant(a, options);
  const conciseVariant = (a: WorkingAtom): SelectableVariant =>
    a.variants.find((v) => v.emphasis === 'concise') ?? preferredVariant(a);

  /** Marginal coverage+quality gain of adding atom `a` given current coverage. */
  const marginalGain = (a: WorkingAtom): number => {
    let gain = 0;
    for (const [term, hit] of Object.entries(a.hitByKeyword)) {
      const w = weightOf[term];
      if (!w || hit <= 0) continue;
      const before = 1 - Math.exp(-lambda * cov[term]!);
      const after = 1 - Math.exp(-lambda * (cov[term]! + hit));
      gain += w * (after - before);
    }
    return gain + mu * a.quality;
  };

  const commit = (a: WorkingAtom, variant: SelectableVariant, action: SelectionDecision['action'], ratio?: number) => {
    let cost = variant.lines;
    if (!includedOwners.has(a.ownerId)) cost += entryOverhead;
    a.chosen = variant;
    selected.push(a);
    budget -= cost;
    includedOwners.add(a.ownerId);
    ownerCount.set(a.ownerId, (ownerCount.get(a.ownerId) ?? 0) + 1);
    for (const [term, hit] of Object.entries(a.hitByKeyword)) {
      if (cov[term] !== undefined) cov[term]! += hit;
    }
    decisions.push({ atomId: a.id, action, ratio: ratio === undefined ? undefined : round(ratio) });
  };

  const costWithOverhead = (a: WorkingAtom, variant: SelectableVariant): number =>
    variant.lines + (includedOwners.has(a.ownerId) ? 0 : entryOverhead);

  // ── 1. Pinned atoms are forced in (SRS FR-RES-008). ────────────────────────
  for (const a of pool.filter((x) => x.pinned)) {
    commit(a, preferredVariant(a), 'pinned');
  }

  // ── 2. Cost-benefit greedy over the rest. ──────────────────────────────────
  const remaining = new Set(pool.filter((x) => !x.pinned));
  for (;;) {
    let best: { atom: WorkingAtom; variant: SelectableVariant; ratio: number } | null = null;
    for (const a of remaining) {
      if ((ownerCount.get(a.ownerId) ?? 0) >= maxBullets) continue;
      // Prefer the emphasis variant; fall back to concise when tight.
      const pref = preferredVariant(a);
      const conc = conciseVariant(a);
      const candidates = pref === conc ? [pref] : [pref, conc];
      for (const variant of candidates) {
        const cost = costWithOverhead(a, variant);
        if (cost <= 0 || cost > budget) continue;
        const gain = marginalGain(a);
        if (gain <= 0) continue;
        const ratio = gain / cost;
        const isConcise = variant.emphasis === 'concise' && pref !== conc;
        // Deterministic tiebreak: higher ratio, then prefer non-concise, then quality, then id.
        if (
          !best ||
          ratio > best.ratio + 1e-9 ||
          (Math.abs(ratio - best.ratio) <= 1e-9 &&
            preferOver(a, variant, isConcise, best))
        ) {
          best = { atom: a, variant, ratio };
        }
      }
    }
    if (!best) break;
    const isConcise = best.variant.emphasis === 'concise' && preferredVariant(best.atom) !== best.variant;
    commit(best.atom, best.variant, isConcise ? 'concise-swap' : 'greedy-add', best.ratio);
    remaining.delete(best.atom);
  }

  // ── 3. (1−1/e)/2 safeguard: compare against the best single atom. ──────────
  const greedyResult = buildResult(selected, keywords, weightOf, lambda, mu, decisions, { entryOverhead });
  const singleBest = bestSingleAtom(pool, options, keywords, weightOf, lambda, mu, entryOverhead);
  const result = singleBest && singleBest.objective > greedyResult.objective ? singleBest : greedyResult;

  return result;
}

/**
 * Manual selection (FR-RES-008 manual mode): the user hand-picks and orders
 * atoms; we keep their order verbatim, resolve each atom's variant (preferred
 * emphasis → default), and reuse the same coverage math so the report is
 * comparable with auto mode. No budget enforcement, the page meter and the
 * one-page gate downstream tell the user when they've overfilled.
 */
export function selectManual(atoms: SelectableAtom[], orderedIds: string[], options: SelectOptions): SelectionResult {
  const lambda = options.lambda ?? SELECTION.lambda;
  const mu = options.mu ?? SELECTION.mu;
  const weightOf: Record<string, number> = {};
  for (const kw of options.keywords) weightOf[kw.term] = kw.weight;

  const byId = new Map(atoms.map((a) => [a.id, a]));
  const decisions: SelectionDecision[] = [];
  const selected: WorkingAtom[] = [];
  const seen = new Set<string>();
  for (const id of orderedIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const a = byId.get(id);
    if (!a || a.variants.length === 0) continue;
    const w: WorkingAtom = { ...a };
    w.chosen = resolveVariant(w, options);
    selected.push(w);
    decisions.push({ atomId: id, action: 'manual-add' });
  }

  return buildResult(selected, options.keywords, weightOf, lambda, mu, decisions, {
    preserveOrder: true,
    entryOverhead: options.entryOverhead ?? 0,
  });
}

function preferOver(
  a: WorkingAtom,
  _variant: SelectableVariant,
  isConcise: boolean,
  best: { atom: WorkingAtom; ratio: number },
): boolean {
  // Prefer non-concise (nicer phrasing) and higher quality on ties.
  if (isConcise) return false;
  if (a.quality !== best.atom.quality) return a.quality > best.atom.quality;
  return a.id.localeCompare(best.atom.id) < 0;
}

/**
 * The (1−1/e)/2 fallback: the single best atom, when it beats the whole greedy
 * selection. FR-018: feasibility here is `lines + entryOverhead`, the same cost
 * model the greedy loop budgets with. Comparing bare `v.lines` against the
 * budget could pick an atom whose text fits but whose owner header does not,
 * producing a selection that overflows the page while reporting that it fits.
 */
function bestSingleAtom(
  pool: WorkingAtom[],
  options: SelectOptions,
  keywords: ParsedKeyword[],
  weightOf: Record<string, number>,
  lambda: number,
  mu: number,
  entryOverhead: number,
): SelectionResult | null {
  const fits = (v: SelectableVariant): boolean => v.lines + entryOverhead <= options.budgetLines;

  let best: WorkingAtom | null = null;
  let bestVariant: SelectableVariant | null = null;
  let bestObj = -Infinity;
  for (const a of pool) {
    const variant = a.variants.find(fits);
    if (!variant) continue;
    let obj = mu * a.quality;
    for (const [term, hit] of Object.entries(a.hitByKeyword)) {
      const w = weightOf[term];
      if (w) obj += w * (1 - Math.exp(-lambda * hit));
    }
    if (obj > bestObj) {
      bestObj = obj;
      best = a;
      bestVariant = variant;
    }
  }
  if (!best || !bestVariant) return null;
  best.chosen = bestVariant;
  return buildResult([best], keywords, weightOf, lambda, mu, [{ atomId: best.id, action: 'greedy-add' }], {
    entryOverhead,
  });
}

function buildResult(
  selected: WorkingAtom[],
  keywords: ParsedKeyword[],
  weightOf: Record<string, number>,
  lambda: number,
  mu: number,
  decisions: SelectionDecision[],
  opts: { preserveOrder?: boolean; entryOverhead?: number } = {},
): SelectionResult {
  // Order: roles reverse-chron by date_end (ongoing first), then quality desc, id asc.
  // Manual mode passes preserveOrder, the user's hand ordering is kept verbatim.
  const ordered = opts.preserveOrder
    ? [...selected]
    : [...selected].sort((a, b) => reverseChron(a, b) || b.quality - a.quality || a.id.localeCompare(b.id));

  const cov: Record<string, number> = {};
  for (const kw of keywords) cov[kw.term] = 0;
  // FR-018: report the same cost the greedy loop budgets with, bullet lines
  // PLUS one owner-header overhead per distinct entry. Summing only variant
  // lines under-reported the page fill by an entry header per role/project,
  // which is exactly what the one-page gate downstream trusts.
  const entryOverhead = opts.entryOverhead ?? 0;
  const countedOwners = new Set<string>();
  let totalLines = 0;
  const entries: SelectionEntry[] = ordered.map((a) => {
    const v = a.chosen ?? a.variants[0]!;
    totalLines += v.lines;
    if (!countedOwners.has(a.ownerId)) {
      totalLines += entryOverhead;
      countedOwners.add(a.ownerId);
    }
    for (const [term, hit] of Object.entries(a.hitByKeyword)) {
      if (cov[term] !== undefined) cov[term]! += hit;
    }
    return { atomId: a.id, ownerId: a.ownerId, emphasis: v.emphasis, text: v.text, lines: v.lines };
  });

  const coverage: Record<string, number> = {};
  let objective = 0;
  let coveredWeight = 0;
  let totalWeight = 0;
  for (const kw of keywords) {
    const saturated = 1 - Math.exp(-lambda * (cov[kw.term] ?? 0));
    coverage[kw.term] = round(saturated);
    objective += kw.weight * saturated;
    totalWeight += kw.weight;
    coveredWeight += kw.weight * saturated;
  }
  for (const a of selected) objective += mu * a.quality;

  return {
    entries,
    totalLines: round(totalLines),
    objective: round(objective),
    coverage,
    weightedCoverage: totalWeight > 0 ? round(coveredWeight / totalWeight) : 0,
    decisions,
  };
}

function reverseChron(a: WorkingAtom, b: WorkingAtom): number {
  const ta = a.dateEnd ? Date.parse(a.dateEnd) : Number.POSITIVE_INFINITY;
  const tb = b.dateEnd ? Date.parse(b.dateEnd) : Number.POSITIVE_INFINITY;
  return tb - ta;
}

function round(v: number): number {
  return Math.round(v * 1e4) / 1e4;
}
