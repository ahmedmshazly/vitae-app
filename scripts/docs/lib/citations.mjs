/**
 * Find requirement identifiers in source text.
 *
 * The repository writes identifiers three ways, and a validator that knows only
 * the first silently loses a third of them:
 *
 *   FR-RES-009            a full identifier
 *   FR-RES-007/008/009    a group, where later members drop the family
 *   FR-SRCH-001..004      a range, where every member between the ends is meant
 *
 * Eleven identifiers in this repository are reachable ONLY through a group or a
 * range continuation. `docs/ROADMAP.md` additionally writes three families with
 * no `FR-` prefix at all, which `aliases` maps back to the canonical spelling,
 * and the interface family `INT-n` is written with one digit rather than three,
 * which `families` opts in by name.
 */

/** A full identifier, plus any `/NNN` or `..NNN` continuations that follow it. */
const CITATION = /\b((?:FR|NFR)(?:-[A-Z]{2,4})?)-(\d{3})((?:\s*(?:\/|\.\.)\s*\d{3})*)/g;
/** An identifier written without its `FR-` prefix, as `docs/ROADMAP.md` does. */
const ALIAS = /(^|[^A-Z-])([A-Z]{2,4})-(\d{3})((?:\s*(?:\/|\.\.)\s*\d{3})*)/g;

function expand(family, first, tail) {
  const ids = [`${family}-${first}`];
  const numbers = (tail ?? '').match(/\d{3}/g) ?? [];
  if (!numbers.length) return ids;
  if (tail.includes('..')) {
    // A range names its endpoints and means everything between them.
    for (let n = Number(first) + 1; n <= Number(numbers[numbers.length - 1]); n += 1) {
      ids.push(`${family}-${String(n).padStart(3, '0')}`);
    }
    return ids;
  }
  for (const n of numbers) ids.push(`${family}-${n}`);
  return ids;
}

/**
 * Every identifier cited in `text`.
 *
 * `aliases` maps an unprefixed spelling such as `VIS-001` to `FR-VIS-001`.
 * `families` names additional prefixes to recognize, such as `INT`, whose
 * identifiers are numbered without zero padding.
 */
export function citationsIn(text, { aliases = {}, families = [] } = {}) {
  const found = new Set();
  for (const match of text.matchAll(CITATION)) {
    for (const id of expand(match[1], match[2], match[3])) found.add(id);
  }
  // Alias families are matched separately because their spelling is ambiguous
  // on its own: only an explicit entry in `aliases` promotes `VIS-001` to a
  // requirement, so an unrelated token such as `SHA-256` is never claimed.
  for (const match of text.matchAll(ALIAS)) {
    for (const id of expand(match[2], match[3], match[4])) {
      const canonical = aliases[id];
      if (canonical) found.add(canonical);
    }
  }
  // Extra families are opt-in by name for the same reason aliases are: an
  // unconstrained `LETTERS-digits` pattern would claim `SHA-256` and `RFC-822`.
  for (const family of families) {
    for (const match of text.matchAll(new RegExp(`\\b${family}-(\\d{1,3})\\b`, 'g'))) {
      found.add(`${family}-${match[1]}`);
    }
  }
  return [...found].sort(compareIds);
}

/** Sort identifiers by family, then numerically, so output order is stable. */
export function compareIds(a, b) {
  const split = (id) => {
    const m = /^([A-Z]{2,4}(?:-[A-Z]{2,4})?)-(\d{1,3})$/.exec(id);
    return m ? [m[1], Number(m[2])] : [id, 0];
  };
  const [fa, na] = split(a);
  const [fb, nb] = split(b);
  if (fa !== fb) {
    // Bare `FR` first, then its sub-families, then `NFR`, then everything else.
    const rank = (f) => (f === 'FR' ? 0 : f.startsWith('FR-') ? 1 : f.startsWith('NFR') ? 2 : 3);
    if (rank(fa) !== rank(fb)) return rank(fa) - rank(fb);
    return fa < fb ? -1 : 1;
  }
  return na - nb;
}

/**
 * Blank the regions a generator owns, keeping the line count intact.
 *
 * A generated block is derived from the register, so reading identifiers back
 * out of it would count the register as evidence for itself. The requirement
 * table in `docs/specs/srs.md` lists every identifier the register knows,
 * including the ones it records as cited nowhere — which would make them cited.
 *
 * Lines are blanked rather than removed so that every `path:line` reported
 * after a generated block still points at the right line.
 */
export function stripGenerated(text) {
  const lines = text.split('\n');
  let inside = false;
  return lines
    .map((line) => {
      if (/<!--\s*generated:[\w-]+\s+start\s*-->/.test(line)) inside = true;
      const wasInside = inside;
      if (/<!--\s*generated:[\w-]+\s+end\s*-->/.test(line)) inside = false;
      return wasInside ? '' : line;
    })
    .join('\n');
}

/** Is this repository-relative path a test rather than production source? */
export function isTestPath(rel) {
  return /(^|\/)__tests__\//.test(rel)
    || /\.(test|spec)\.[cm]?[jt]sx?$/.test(rel)
    || /^e2e\/tests\//.test(rel);
}

/**
 * Turn a parsed requirements registry into the options `citationsIn` wants.
 *
 * Every generator needs the same two fields, and the shapes differ from the
 * argument names: `families` is an object in the registry and an array here.
 * Deriving it in each generator is how one of them ends up reading citations
 * with a different vocabulary from the gate that checks them.
 */
export function optionsFrom(registry) {
  return {
    aliases: registry.id_aliases ?? {},
    families: Object.keys(registry.families ?? {}).sort(),
  };
}
