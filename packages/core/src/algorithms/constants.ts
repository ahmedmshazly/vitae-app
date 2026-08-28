/**
 * All tunable constants for the intelligence layer, in one editable place
 * (SRS FR-SET-004: "constants editor ... validated ranges, versioned, live
 * preview"). Every algorithm imports its constants from here so a settings
 * override is a single object spread, and the defaults are the documented
 * values from SRS §10.7. Nothing here is learned; everything is a curated,
 * version-able number.
 */

/** Tie-strength model (SRS §10.7.1). */
export const TIE_STRENGTH = {
  /** Exponential-kernel decay time constant, in days (Hawkes intensity). */
  tauDays: 90,
  /** Per-interaction-kind intensity weights w(kind). */
  kindWeights: {
    meeting: 1.0,
    coffee: 1.0,
    call: 0.8,
    video: 0.8,
    encounter: 0.5,
    message: 0.35,
    email: 0.35,
    outreach: 0.25,
    comment: 0.15,
  } as Record<string, number>,
  /** Temporal-regularity multiplier: 1 + coeff·min(distinctDays/window, 1). */
  regularityCoeff: 0.2,
  regularityWindowDays: 90,
  regularityDistinctDaysTarget: 12,
  /** strength = closenessWeight·(closeness/5) + intensityWeight·min(R/rNorm, 1). */
  closenessWeight: 0.45,
  intensityWeight: 0.55,
  rNorm: 3,
  /** Adaptive decay thresholds as multiples of the per-tie median gap. */
  decayingGapMultiplier: 3,
  dormantGapMultiplier: 8,
} as const;

/**
 * Correspondence rollup (SRS FR-COMM-002): which dormant ties were once
 * strong enough to be worth reactivating, and how many candidates a rollup
 * shows before it stops being a ranking and starts being a directory.
 */
export const CORRESPONDENCE = {
  /** A tie's historical peak strength must have reached this to count as "once strong". */
  minPeakStrength: 0.55,
  /** Candidates shown; the register says how many were considered. */
  maxCandidates: 25,
  /**
   * A direction change further apart than this is a new thread, not a reply —
   * without the cap, answering an eight-month-old message would record an
   * eight-month "reply latency", which is dormancy wearing the wrong label.
   */
  replyPairMaxGapDays: 60,
  /** The contact-day distribution spans this many trailing calendar months. */
  contactWindowMonths: 12,
  /** A tie needs this many directional events before its balance is a fact worth ranking. */
  minDirectionalForImbalance: 4,
} as const;

/** Who-to-call ranking weights (SRS §10.4-A / §10.7.3). */
export const WHO_TO_CALL_WEIGHTS = {
  affiliation: 2.0,
  topic: 1.6,
  strength: 1.2,
  geo: 0.6,
  reciprocity: 0.4,
  graph: 0.8,
  pinned: 1.0,
} as const;

/** Affiliation sub-scores. */
export const AFFILIATION = { current: 1.0, past: 0.6 } as const;
/** Geography sub-scores. */
export const GEO = { sameCity: 1.0, sameCountry: 0.5 } as const;
/** Reciprocity adjustments. */
export const RECIPROCITY = { unsettledOwedToMe: 0.5, askedRecently: -0.5, recentDays: 30 } as const;

/** Personalized PageRank (SRS §10.7.3). */
export const PAGERANK = {
  alpha: 0.15, // teleport probability
  maxIterations: 50,
  tolerance: 1e-6,
  /** Relative transition weights per edge type (higher = stronger conduit). */
  edgeWeights: {
    KNOWS: 3.0,
    WORKED_ON: 2.0,
    ROLE_AT: 1.5,
    HELD: 1.5,
    FOUNDED: 2.2,
    STUDIED_AT: 1.4,
    REPORTS_TO: 1.8,
    PART_OF: 1.2,
    ATTENDED: 1.0,
    USES_SKILL: 0.8,
    AUTHORED: 0.8,
    WITH: 1.0,
    ABOUT: 0.5,
    RELATES_TO: 0.5,
    MEMBER_OF: 1.2,
    ORG_RELATED: 1.2,
    FOLLOWS: 0.4,
    EARNED: 1.0,
    COMPLETED: 0.9,
  } as Record<string, number>,
} as const;

/** BM25F JD parsing (SRS §10.7.4). */
export const BM25F = {
  k1: 1.2,
  b: 0.75,
  /** Field (section) weights applied to term frequency before saturation. */
  sectionWeights: {
    title: 1.5,
    requirements: 1.0,
    responsibilities: 0.7,
    nice_to_have: 0.4,
    about: 0.2,
  } as Record<string, number>,
  maxKeywords: 40,
  /** n-gram sizes to consider for phrase matching. */
  minGram: 1,
  maxGram: 3,
} as const;

/** Atom scoring + submodular selection (SRS §10.7.5). */
export const SELECTION = {
  /** Per-keyword hit strength. */
  skillHit: 1.0,
  textHit: 0.6,
  /** Recency: exp(-yearsSinceEnd / recencyTau), floored. */
  recencyTauYears: 8,
  recencyFloor: 0.35,
  /** Metric bonus: 1 + metricCoeff·min(metricCount, metricCap). */
  metricCoeff: 0.15,
  metricCap: 2,
  /** Submodular coverage saturation rate λ and quality weight μ. */
  lambda: 1,
  mu: 0.5,
  /** Bullets-per-included-role partition constraint (SRS FR-RES-008). */
  minBulletsPerRole: 2,
  maxBulletsPerRole: 4,
  /** One-page fit loop cap (SRS FR-RES-014). */
  maxFitIterations: 3,
} as const;

/**
 * Fellegi-Sunter record-linkage m/u probabilities per field (SRS §10.7.6).
 * m = P(agree | match), u = P(agree | non-match). Curated constants; the
 * duplicates queue stores labelled pairs for optional later EM re-estimation.
 */
export const DEDUP = {
  fields: {
    email: { m: 0.95, u: 0.0001 },
    name_trigram: { m: 0.9, u: 0.02 },
    org_domain: { m: 0.92, u: 0.001 },
    shared_event: { m: 0.7, u: 0.05 },
    phone: { m: 0.93, u: 0.0005 },
  } as Record<string, { m: number; u: number }>,
  /** Two thresholds (in summed log2 weight) partition the pair space. */
  possibleThreshold: 4,
  probableThreshold: 10,
} as const;

export type Constants = {
  tieStrength: typeof TIE_STRENGTH;
  whoToCall: typeof WHO_TO_CALL_WEIGHTS;
  bm25f: typeof BM25F;
  selection: typeof SELECTION;
  dedup: typeof DEDUP;
  pagerank: typeof PAGERANK;
};
