---
id: ARC-ALGORITHMS
title: The deterministic algorithms
summary: Every algorithm module in the shared domain package — its inputs, its formula, the constants that tune it, and where it stops being reliable.
audience: [developer, maintainer]
domain: architecture
type: explanation
status: verified
verified_at: 2026-08-26
sources:
  - packages/core/src/algorithms/constants.ts
  - packages/core/src/algorithms/text.ts
  - packages/core/src/algorithms/aho-corasick.ts
  - packages/core/src/algorithms/tie-strength.ts
  - packages/core/src/algorithms/reconnect.ts
  - packages/core/src/algorithms/pagerank.ts
  - packages/core/src/algorithms/who-to-call.ts
  - packages/core/src/algorithms/graph-paths.ts
  - packages/core/src/algorithms/jd-parser.ts
  - packages/core/src/algorithms/atom-scoring.ts
  - packages/core/src/algorithms/selection.ts
  - packages/core/src/algorithms/line-model.ts
  - packages/core/src/algorithms/fit-loop.ts
  - packages/core/src/algorithms/latex-escape.ts
  - packages/core/src/algorithms/dedup.ts
  - packages/core/src/algorithms/capture-grammar.ts
  - packages/core/src/algorithms/filter-grammar.ts
  - packages/core/src/algorithms/composer.ts
  - packages/core/src/algorithms/streaks.ts
  - packages/core/src/algorithms/latex-escape.test.ts
  - apps/api/src/services/settings.ts
  - apps/api/src/routes/v1/settings.ts
  - apps/api/src/routes/v1/resumes.ts
  - docs/generated/algorithms.json
requirements: [FR-SET-004, FR-CON-004, FR-CON-006, FR-CON-007, FR-RES-006, FR-RES-007, FR-RES-008, FR-RES-009, FR-RES-012, FR-RES-014, FR-CAP-001, FR-SRCH-002, FR-ORG-005, FR-018]
covers:
  - algorithm:aho-corasick
  - algorithm:atom-scoring
  - algorithm:capture-grammar
  - algorithm:composer
  - algorithm:constants
  - algorithm:correspondence
  - algorithm:dedup
  - algorithm:filter-grammar
  - algorithm:fit-loop
  - algorithm:graph-paths
  - algorithm:jd-parser
  - algorithm:latex-escape
  - algorithm:line-model
  - algorithm:pagerank
  - algorithm:reconnect
  - algorithm:selection
  - algorithm:streaks
  - algorithm:text
  - algorithm:tie-strength
  - algorithm:who-to-call
related: [ARC-OVERVIEW, ARC-GRAPH, ARC-RESUME, ARC-REQUEST]
---

# The deterministic algorithms

## In short

Everything Vitae presents as a judgement — who you should call, how strong a
relationship is, which bullets belong on a résumé, whether two records are the
same person — is computed by a closed-form function with a written formula and
a fixed set of tuned numbers. There is no model, nothing is learned, and the
same inputs always produce the same output.

That is a correctness property rather than a stylistic preference. Every score
the interface shows decomposes exactly into the factors it displays beside it,
so a ranking can be argued with. A number you cannot take apart is a number you
cannot check.

## How it works

Nineteen modules live in one directory in the shared domain package. All of them
are pure: no clock they did not receive, no database, no network. Where a
function needs the current time it takes it as a parameter, which is why every
one of them can be tested with a fixed date and why the results are reproducible
months later.

They divide into five jobs. A small set of text primitives — normalisation,
tokenising, stemming, two string-similarity measures — underlies everything
else. On top of those sit the relationship algorithms that answer questions
about people, the résumé algorithms that turn a job description into a page of
bullets, the identity algorithms that decide whether two records describe the
same thing, and a few small grammars that parse what a person typed.

The tunable numbers are gathered in one module so that changing a weight is one
edit rather than a search. That module's stated purpose is broader than what is
wired, though, and the difference matters if you plan to tune anything — see
[The constants table](#the-constants-table) at the end, which also names four
constants that no code reads.

## Mechanics

Each subsection below gives a module's inputs, its rule, the constants that tune
it and where they live, and its limits. Exported symbol lists, per-module test
files and consumer counts are in `docs/generated/algorithms.json`; the generated
catalog records all nineteen as pure, all nineteen as tested, and none as unused
by the product.

### Shared text primitives

Two modules, `text.ts` and `aho-corasick.ts`, everything else builds on.

These are the functions this documentation’s own search uses. Type into them:

```explainer
text
```

`text.ts` takes strings and returns strings, token arrays or similarity numbers.
Normalisation is NFC, lowercase, and collapsing anything that is not a letter,
digit, `+`, `#`, `.`, hyphen or space — those four punctuation marks are
preserved deliberately, so `C++`, `C#`, `.NET` and `Node.js` survive as single
tokens instead of shattering. Tokenising splits on whitespace and trims stray
leading and trailing dots and hyphens. The stemmer is a trimmed Porter applied
repeatedly until it stops changing the word. Trigram similarity is
Sørensen–Dice over padded character trigrams, `2·|A∩B| / (|A|+|B|)`, chosen to
match what the database's trigram extension would compute. Jaro–Winkler adds a
prefix bonus over at most four leading characters with a scale of 0.1.

Its constants are in the module, not the constants table: the stoplist and the
prefix scale. The stoplist is English and deliberately includes job-advert
filler — *role*, *team*, *experience*, *strong*, *preferred*, *requirements* —
because its job is to stop those being proposed as skills.

Limits: the stemmer is not linguistically complete and is not meant to be; the
stoplist has no other language; and neither similarity measure knows anything
about names, so `dedup.ts` layers name canonicalisation on top rather than
trusting them raw. This is the most reused module in the directory.

`aho-corasick.ts` is a token-level automaton. It takes patterns as token
sequences with attached metadata, builds a trie with failure links, and matches
them all against a token stream in a single linear pass — which is how the job
description parser finds every dictionary term without scanning the text once
per pattern. It has no constants.

Limits: matching is exact on normalised tokens. An alias matches only when its
tokens match, so a misspelling or an inflection is invisible to it; approximate
matching happens elsewhere, on purpose.

### Tie strength

Inputs: a self-reported closeness of 1 to 5, a list of interactions with kinds
and dates, an optional cadence target, and a reference time.

The shipped function, run here against inputs you can change:

```explainer
tie-strength
```

The intensity term is the conditional intensity of a self-exciting point process
with an exponential kernel — the standard shape for bursty human contact:

```text
R(t) = Σᵢ w(kindᵢ) · exp( −(t − tᵢ) / τ )
```

`R` is then multiplied by a regularity factor, `1 + 0.2·min(distinctDays/12, 1)`
over a 90-day window, so twelve separate conversations beat twelve messages in
one afternoon. The published strength combines it with closeness:

```text
strength = clamp( 0.45·(closeness/5) + 0.55·min(R/3, 1), 0, 1 )
```

Status is adaptive rather than absolute: a tie is *decaying* past three times
its own median inter-contact gap and *dormant* past eight times it, so a friend
you speak to yearly is not flagged in month two. An explicit cadence target
tightens the decaying threshold but never loosens it.

Constants: `TIE_STRENGTH` in `packages/core/src/algorithms/constants.ts:11` —
τ of 90 days, nine per-kind interaction weights from 1.0 for a meeting down to
0.15 for a comment, the regularity coefficient and window, the two combination
weights, the normalising divisor of 3, and the two gap multipliers.

Limits: a missing closeness is treated as 2, not as unknown. Future-dated
interactions are dropped. A tie with fewer than two interactions has no median
gap, so status falls back to the cadence target alone and is *active* when there
is none. An unrecognised interaction kind gets the weight of a message.

### Reconnect ordering

Inputs: an identifier, closeness, and the intensity `R` computed above.

```text
priority = (closeness / 5) · (1 − min(R / 3, 1))
```

The two terms are the two chips the interface shows. The shape comes from the
result that optimal review intensity under exponential forgetting is
proportional to one minus the recall probability: the ties that are both
valuable and most decayed surface first, and a close friend you saw yesterday
drops off the lane on his own. Ranking is by priority descending, tie-broken by
identifier so the order is stable.

Constants: `TIE_STRENGTH.rNorm`, the same divisor of 3, from
`constants.ts:11`. It has no others.

Limits: the input carries a status and a days-since-last that the score does not
use — only closeness and intensity enter the formula. It inherits every
assumption of tie strength, because its second term is that module's output.

### Correspondence reactivation

Inputs: the same ties the reconnect lane reads — closeness, cadence target,
and interaction events — plus a reference now.

There is no new formula, and that is the point. A tie's history is re-read
with `computeTieStrength` itself, evaluated at each interaction instant plus
one millisecond so the event counts itself; the largest of those readings is
the tie's peak. A tie is a reactivation candidate when its current status is
`dormant` and its peak strength reached `CORRESPONDENCE.minPeakStrength`.
Candidates rank by peak strength descending, then by days quiet, then by
identifier for stability, and the result carries the number of dormant ties
considered so the cap can never read as a census. Brokers are a plain tally
of the `met_via` labels on the relationship edges, sorted by count then
label.

Constants: `CORRESPONDENCE.minPeakStrength` (0.55) and
`CORRESPONDENCE.maxCandidates` (25), beside every other tunable in
`constants.ts`.

Limits: evaluating the kernel at every interaction instant is quadratic in a
tie's event count — fine at the interactive envelope, and the reason the
rollup is a request-time read rather than a per-keystroke one. A tie with a
single logged interaction can never be dormant (the adaptive threshold needs
a gap history), so it can never be a candidate — which is the model being
honest about how little it knows. Reciprocity and reply latency are absent
deliberately: they need directional interaction data the schema does not yet
carry, and nothing here guesses.

### Graph proximity

Inputs: a node list, directed edges with types and optional per-edge
multipliers, and a seed distribution.

Personalised PageRank by power iteration. Each edge's transition weight is its
type weight times its per-edge multiplier, mass is split proportionally across a
node's weighted out-edges, and mass that reaches a node with no out-edges is
redistributed through the teleport vector rather than being lost. Seeds are
normalised; an empty seed set falls back to uniform.

Constants: `PAGERANK` at `constants.ts:58` — a teleport probability of 0.15, at
most 50 iterations, a convergence tolerance of 1e-6, and a table of nineteen
per-edge-type transition weights, highest for acquaintance and founding edges,
lowest for following.

Limits: the caller is responsible for supplying an undirected relationship in
both directions; the algorithm does not symmetrise. Edges whose computed weight
is zero or negative are skipped entirely. The weight table covers nineteen of
the twenty-eight edge types, and an unlisted type falls back to a weight of 1 —
which is *higher* than six of the weights that are listed, so a new edge type is
a stronger conduit than a skill or an authorship link until someone adds it to
the table.

### Who to call

Inputs: candidate people with affiliation, evidence text, tie strength, city and
country, a favour ledger, a graph proximity score, and an intent describing what
is needed and where.

```text
S = 2.0·affiliation + 1.6·topic + 1.2·strength + 0.6·geo
  + 0.4·reciprocity + 0.8·graph + 1.0·pinned
```

Only non-zero factors produce a chip, and the score is the sum of exactly the
chips shown — that identity is the explainability contract. The topic term is a
BM25 score of the intent's stemmed terms against each person's evidence text,
using the candidate set itself as the corpus, then divided by the highest score
observed so it lands in `[0,1]`. Affiliation is 1.0 for a current employer and
0.6 for a past one; geography is 1.0 for the same city or 0.5 for the same
country; reciprocity adds 0.5 when someone owes you an unsettled favour and
subtracts 0.5 when you asked them for something within thirty days. People
marked do-not-contact are removed before anything is computed. Ties break by
most recent interaction, then by identifier.

Constants: `WHO_TO_CALL_WEIGHTS` (`constants.ts:40`), `AFFILIATION` (`:51`),
`GEO` (`:53`), `RECIPROCITY` (`:55`). The seven factor weights are the only
constants in the whole system a person can change at runtime: settings stores an
override, the settings route validates each to a number in `[0,5]`, and the ask
route passes them in.

Limits, three of them real:

- The BM25 saturation parameters are **local literals** at
  `who-to-call.ts:76-77`, not the shared `BM25F` group. Editing the constants
  table changes the job-description parser's saturation and does not touch this.
- Removing do-not-contact people also removes them from the corpus, so
  suppressing someone slightly changes everyone else's topic score.
- Document frequency is computed with a linear membership scan per query stem
  per candidate, and the tie-break comparator looks each candidate up by
  identifier in an array. Both are fine at single-user scale and neither is
  fine at a much larger one.

### Warm-introduction paths

Inputs: nodes, edges with optional tie strengths, a self identifier and a target
organisation identifier.

A bounded depth-first search over simple paths from self to the organisation.
Two hop kinds exist: an acquaintance hop, whose weight is the persisted tie
strength floored at a minimum; and an affiliation hop, where the two-edge chain
person → role → organisation is collapsed into one person → organisation hop
with a fixed weight. A path's score is the product of its hop strengths, so a
long chain of weak links ranks below a short strong one. Adjacency is sorted
before the walk, results are de-duplicated by their node signature, and the
final ordering is score, then length, then node identifiers — deterministic all
the way down.

Constants: in the module, at `graph-paths.ts:56` — at most three person hops, at
most five returned paths, an affiliation weight of 0.9 and a strength floor of
0.05. They are not in the constants table.

Limits: only person nodes are traversed as intermediates, so a path through an
organisation or an event is not found. The search is bounded only by the hop cap
and the simple-path rule. And the module branches at `:102` on an edge type
`INTRODUCED` that is not a member of the edge vocabulary, so that branch is
unreachable — see [The typed career graph](career-graph.md) for the evidence.

### Job-description parsing

Input: raw job-description text, plus a dictionary of skill aliases built from
the skill nodes already in the graph and an optional document-frequency corpus.

Text is split into lines, each line is classified into a section by header
pattern, and tokens keep their section and their character span. Dictionary
terms are found by the token automaton; the remaining uncovered, non-stopword
runs yield novel candidate terms. Every term is then weighted by BM25F, which
applies the section weight to term frequency *before* a single shared
saturation:

```text
tf̃(t)     = Σ_fields  w_field · tf(t,field) / (1 − b + b·(len_field / avgLen_field))
weight(t) = idf(t) · tf̃ / (k1 + tf̃)
```

Weighting the field before saturating rather than after is the whole point of
the F in BM25F: a term repeated nine times is not nine times more important, and
adverts of different lengths stay comparable.

Constants: `BM25F` at `constants.ts:81` — `k1` 1.2, `b` 0.75, five section
weights from 1.5 for the title down to 0.2 for the boilerplate about the
company, and a cap of 40 keywords. Average field lengths and a shipped prior
corpus of two hundred documents with twenty-three common terms live in the
module, so that generic words self-deprecate before a real corpus exists.

Limits:

- `BM25F.minGram` and `BM25F.maxGram` (1 and 3) are **not honoured**. Novel
  candidates are generated as 1- and 2-grams by literals at `jd-parser.ts:220`
  and `:222`, and the `ngrams()` call at `:220` computes a value that `:242`
  explicitly discards. Changing `maxGram` changes nothing.
- The novel-term rarity gate is a literal `idf < 2.0` at `:233`, not a constant.
- A section not in the weight table defaults to 0.5.
- Header classification only considers lines of 70 characters or fewer, and the
  first non-empty line is always treated as the title.

### Atom scoring

Inputs: résumé atoms with their variants, skill tags, metrics and end dates; the
parsed keyword set; and a reference time.

```text
score = ( Σ_k weight_k · hit_k ) · recency · metricBonus
```

`hit` is 1.0 when the atom carries the keyword's skill tag, 0.6 when every stem
of the keyword phrase appears in the atom's text, and 0 otherwise. Recency is
`max(exp(−yearsSinceEnd / 8), 0.35)` and is 1 for anything still running.
The metric bonus is `1 + 0.15·min(metricCount, 2)`. Every term's contribution is
returned individually, which is what the breakdown popover displays.

Constants: `SELECTION` at `constants.ts:105` — the two hit strengths, the
recency time constant of eight years and its floor of 0.35, and the metric
coefficient and cap.

Limits: only the default variant's text is scored, so an alternative phrasing
that would have matched the keyword does not help unless it is the default.
The text hit requires all of the keyword's stems but ignores their order and
distance, so a two-word phrase matches a bullet mentioning both words anywhere.
Zero-value hits are dropped from the returned breakdown.

### Bullet selection

Inputs: selectable atoms with their variants, line costs, owner, quality and
per-keyword hits; the keyword set; and a line budget.

Selecting bullets to fill a page is budgeted submodular maximisation:

```text
F(S) = Σ_k w_k·( 1 − e^(−λ·cov_k(S)) ) + μ·Σ_{a∈S} quality(a)
```

The saturating exponential is what makes the objective diversify: the third
bullet proving the same keyword adds far less than the first, so the optimiser
spreads across the advert instead of stacking. The algorithm is cost-benefit
greedy — repeatedly take the atom with the highest marginal gain per line — and
the result is compared against the best single feasible atom, which is the
safeguard that gives the greedy its approximation guarantee. Pinned atoms are
committed first, blocked atoms are dropped, and an owner's header overhead is
charged the first time one of its bullets is included (FR-018: costing bare
bullet lines let a selection overflow the page while reporting that it fitted).
Tie-breaks are ratio, then prefer the fuller phrasing over the concise one, then
quality, then identifier.

Constants: `SELECTION` at `constants.ts:105` — the coverage saturation rate λ of
1, the quality weight μ of 0.5, and the per-owner bullet cap of 4. The line
budget comes from the template.

Limits:

- `SELECTION.minBulletsPerRole` (2) is **never read**. It exists in the constants
  table and again as an option field at `selection.ts:81`, and no code consults
  either. There is no minimum-bullets-per-role constraint.
- Pinned atoms are committed before any budget check, so pins can exceed the
  budget outright; the fit loop is what recovers from that.
- Marginal gain is recomputed for every candidate on every round, so cost grows
  with rounds × candidates × keywords.
- Manual mode preserves the caller's ordering verbatim and enforces no budget at
  all; the page meter and the one-page gate downstream are what tell the person.

### The line model

Inputs: a text string or a set of entry groups, and a template's line model.

Wrapped lines are `max(1, ceil(len / chars_per_line))` after collapsing
whitespace, and empty text costs nothing. A section costs its section overhead
once, plus per entry an entry overhead, its header, and its bullets. Pages are
`ceil(totalLines / lines_per_page)`, with a fill fraction and an overflow count
returned alongside for the live meter.

Constants: not in the constants table. The four numbers — characters per line,
lines per page, entry overhead, section overhead — are per-template, declared in
each template's `line-model.json`, and verified against a real compile during
the build service's image build to within three lines.
[From graph to compiled résumé](resume-pipeline.md) covers that calibration.

Limits: estimation is by character count. It knows nothing about word
boundaries, font metrics, hyphenation or widow control, which is exactly why the
compiled page count still governs and the fit loop exists.

### The one-page fit loop

Inputs: the currently selected entries with their scores, pinned flags, current
phrasing and whether a concise phrasing exists.

The planner sorts candidates by score ascending, then identifier. It returns the
first candidate that is not already concise and has a concise variant as a swap;
failing that, the first unpinned candidate as a drop; failing that, nothing,
which the caller reports as needing a manual trim. Applying a step either
removes the entry or replaces its text and line cost. Swapping before dropping
is deliberate — a shorter phrasing keeps the same keyword coverage, and a drop
does not.

Constants: `SELECTION.maxFitIterations` (3) at `constants.ts:122` is **never
read**. The cap is a literal `3` at `apps/api/src/routes/v1/resumes.ts:328`.
Changing the constant changes nothing.

Limits: the plan is by score alone, not by lines saved, so it can spend an
iteration on a swap that recovers nothing. It reacts to the compiled page count,
so each iteration costs a full model rebuild and a recompile.

### LaTeX escaping

Input: any user-controlled string on its way into a LaTeX document. This module
is security-critical; see
[Trust boundaries and data handling](security.md) for what it defends against.

Escaping is a single pass over a per-character map covering the TeX
metacharacters plus four typographic characters that map to explicit macros
rather than relying on font coverage. Single-pass is the rule, not an
optimisation: a sequential run of replacements would reprocess the braces
introduced by an earlier escape. Control characters are stripped and input is
NFC-normalised first. Inline fields additionally collapse newlines, so a
multi-line paste cannot break a single-line slot.

The mini-markdown renderer recognises exactly bold and italic. It tokenises the
markers over the *raw* string, escapes each segment, and only then wraps —
guaranteeing that escaped content can never be re-read as a marker. Link targets
take a different path: a scheme allow-list decides whether a value may become a
link at all (a value with no scheme is safe by construction, because there is
nothing for a viewer to act on), and the URL escape percent-encodes what TeX
cannot see while backslash-escaping the rest, so the target stays a working
link. Finally, a rendered document is asserted to contain no unresolved template
token.

Constants: none tunable. The escape map and the scheme allow-list are the rule.

Limits: only bold and italic are supported; an unpaired marker is literal text.
The escape map is the whole defence, so a character added to a template's macro
vocabulary must be checked against it. Correctness is held by a property suite
of several thousand randomised full-Unicode cases asserting safety,
idempotent structure and markdown invariants
(`packages/core/src/algorithms/latex-escape.test.ts:105-151`).

### Record linkage

This module contains **two different scoring systems**, both in production, on
different paths, producing numbers on different scales. Knowing which one ran is
necessary to read a duplicate's score.

**Fellegi–Sunter, `scorePair`.** Inputs are per-field comparisons carrying a
similarity, a presence flag and an agreement threshold. Each present field
contributes a log₂ match weight interpolated by similarity:

```text
agreement    = log₂( m / u )
disagreement = log₂( (1−m) / (1−u) )
t            = clamp( (similarity − sMin) / (1 − sMin), 0, 1 )
weight       = disagreement + t·( agreement − disagreement )
```

An absent field contributes zero rather than disagreement — missing at random,
not evidence against. The summed weight is partitioned by two thresholds into
non-match, possible and probable. `comparePersons` builds the five comparisons:
email, name trigram, organisation domain, shared event and phone. All but the
name are exact set overlap at a 0.99 threshold; the name uses the larger of
trigram similarity and a slightly discounted Jaro–Winkler at 0.6.

Constants: `DEDUP` at `constants.ts:130` — five fields' `m` and `u`
probabilities, and thresholds of 4 and 10 in summed log₂ weight. These are
curated, not estimated; the queue stores labelled pairs so they could be
re-estimated later.

**Explainable entity comparison, `compareEntities`.** Inputs are two whole
records of the same type. It is an additive 0–100 scale with its own weights
declared inside the module: a shared external identity is decisive, a shared
canonical URL, organisation domain, email or phone is strong, an exactly equal
canonical name is moderate, and a shared start date or country is weak.
Conflicting emails, phones or countries subtract. Its own thresholds classify
the result. Names are canonicalised per type — titles and suffixes stripped for
people, legal-form suffixes for organisations — with a conservative Arabic
folding and a transliteration used as supporting evidence only, never as
identity.

Its most important rule is the anchor: without a corroborating non-name signal
of meaningful weight, and with name similarity below 0.9, the score is capped
below the probable threshold. A fuzzy name alone can therefore never produce a
probable match, which is the property that keeps two different people with the
same common name apart.

Which one runs: person-to-person candidate matching during an import uses
`scorePair`; the duplicates queue, and every non-person type on the import path,
uses `compareEntities`.

Limits:

- The two produce values on **incomparable scales** — a summed log₂ weight and a
  0–100 point score — and both are written into the same `weight` field of an
  import's duplicate record. Do not compare or threshold across the two paths.
- Only `scorePair` reads the tunable constants. `compareEntities` cannot be
  tuned without editing the module.
- The country alias table covers eight countries; anything else falls back to a
  two-letter code test.
- Neither ever merges anything. Both possible and probable verdicts go to a
  queue for a person to decide.

### The capture grammar

Input: one line of text and a reference time. Output: a structured plan plus the
chips the interface previews.

A leading key sets the record type. Sigils then classify the rest: a doubled
at-sign starts an organisation, a single at-sign a person, a hash a tag, a caret
a date, a bang-and-p a priority, a bare web address a link, and a greater-than
splits everything after it into notes. Anything unclaimed accumulates into the
current sink — the title, or the person or organisation currently being named.
Date tokens accept an ISO date, *today*, *tomorrow*, *yesterday*, or a weekday
prefix meaning the next such day, never today. The chips are derived from the
finished plan, so the preview cannot disagree with what gets committed.

Constants: in the module — the key map and the weekday list.

Limits: the key map is built on a null prototype deliberately, because a leading
`__proto__` would otherwise resolve through `Object.prototype` and set a record
type that was never written; a property test found that. Only one date and one
priority survive, the last one wins. Relative dates are resolved from the local
calendar fields of the reference time the caller passes, so the caller is
responsible for passing a time already in the right zone.

### The filter grammar

Input: a query string. Output: an abstract syntax tree of typed clauses plus
leftover free text, and a list of tokens that looked like clauses but failed
validation.

Ten fields are recognised. The tokeniser respects double-quoted values, with a
leading `\S*` in the pattern that is load-bearing: without it a quoted value
only matched when the quote opened the token, so a field-and-quoted-value pair
split in two and the round-trip this module promises did not hold. An unknown
field or an invalid value degrades to free text with a hint rather than
erroring. Serialising back sorts clauses by field then value, so a saved view
produces a stable URL.

Constants: in the module — the field list and the closed value sets for the two
enumerated fields.

Limits: there is no negation, no disjunction and no grouping. Date fields demand
a complete ISO date. The tokeniser is exported because the interface has to
split a query exactly the way the parser did, or removing a chip removes
something else.

### The outreach composer

Inputs: an ask kind, a tone, the names involved, and a list of context facts
supplied by the caller.

A template matrix of five ask kinds by three tones, with an opener and a closer
per tone, filled with the supplied facts. This is a deliberate design decision
rather than a placeholder: the product does not generate text with a model, so
the draft is a form letter a person edits.

Constants: the opener, closer and ask matrices, in the module.

Limits: English only, and the module reads nothing — the facts that make a draft
specific are assembled by the API and passed in.

### Habit streaks

Inputs: the set of checked dates as ISO strings, today's date, and a grid
length.

The current streak walks backwards from today, starting at yesterday when today
is unchecked so that a miss does not break the streak before the day is over.
The best streak is a single scan over the sorted unique days. The grid is the
last N days oldest to newest, defaulting to thirty.

Constants: the grid default, in the module.

Limits: all arithmetic is on UTC midnights of ISO date strings, so "today" must
already be resolved in the person's timezone before it arrives — which is what
the request timezone context described in
[What happens to a request](request-lifecycle.md) is for.

### The constants table

`packages/core/src/algorithms/constants.ts` gathers nine groups and 87 values in
one editable place. Its stated purpose (FR-SET-004) is a constants editor with
validated ranges, versioning and live preview, so that an override is a single
object spread.

What is actually wired is narrower, and this is the most useful thing to know
before tuning anything. **Only the seven who-to-call factor weights are
overridable at runtime.** Settings stores them, the settings route validates
each to a number in `[0,5]`, and the ask route spreads them over the defaults.
Every other group — tie strength, PageRank, BM25F, selection, dedup, and the
affiliation, geography and reciprocity sub-scores — is edit-and-redeploy.

Four values in the table are read by nothing at all, each named in its section
above: the two n-gram bounds, the minimum bullets per role, and the fit-loop
iteration cap. Two more are shadowed: the BM25 saturation parameters are
re-declared locally in the who-to-call module. Treat the table as authoritative
for the numbers a module says it reads, and check the module before assuming an
edit will take effect.

## Related

- [From graph to compiled résumé](resume-pipeline.md) is the pipeline the
  résumé algorithms sit inside.
- [The typed career graph](career-graph.md) defines the node and edge
  vocabulary these functions traverse.
- [The system in one view](system-overview.md) explains why these live in a
  package with no I/O.
- [What happens to a request](request-lifecycle.md) covers how a request
  reaches them.
