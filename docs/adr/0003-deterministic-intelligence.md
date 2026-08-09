# ADR 0003: Deterministic intelligence (no AI), grounded in the literature

- **Status:** accepted (mandated by SRS A2 and the constitution)
- **Date:** 2026-07-11

## Context

Modern personal-CRM and résumé tools lean on opaque AI. The SRS forbids AI
entirely in v1 (A2): no LLM calls, no embeddings. Both as a privacy/ownership
stance and because the owner is "allergic to systems that force summarization."
The challenge: deliver genuinely useful ranking, parsing, and generation without
a learned model.

## Decision

Every "intelligent" behaviour is a **closed-form algorithm from the peer-reviewed
literature**, implemented as a pure function whose output decomposes exactly into
visible factors:

| Behaviour | Method | Reference |
|---|---|---|
| Tie strength | Hawkes exponential-kernel intensity + adaptive decay | Masuda 2012; Navarro 2017 |
| Reconnect order | Spaced-repetition optimal review intensity | Tabibian 2019 |
| Who to call | Expert-finding (BM25 evidence) + Personalized PageRank | Balog 2012; Kloumann 2016 |
| JD parsing | BM25F structured-document term weighting | Robertson & Zaragoza 2009 |
| Résumé selection | Budgeted submodular maximization (knapsack) | Lin & Bilmes 2010 |
| Deduplication | Fellegi-Sunter probabilistic record linkage | Fellegi & Sunter 1969 |

Tunable constants live in one file (`algorithms/constants.ts`) so a settings
override is a single object spread (SRS FR-SET-004).

## Consequences

- **Reproducibility & auditability**: identical inputs give identical outputs;
  byte-identical résumé re-export is possible; the revision log is fully
  replayable. No compared product offers this.
- **Explainability by construction**: the UI's factor chips are the literal terms
  of the scoring sum.
- **Cost**: no generative phrasing. The résumé "summary" is retrieval +
  slot-filling, not free text. Marked interface "sockets" exist (SRS §10.6) if A2
  is ever relaxed.
