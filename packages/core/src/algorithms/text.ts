/**
 * Deterministic text utilities shared by the JD parser, deduplication, and atom
 * scoring. No external NLP, every function here is a pure, testable transform.
 */

/** A conservative English stoplist for novel-term suggestion (SRS §10.2). */
export const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'for', 'of', 'to', 'in', 'on',
  'at', 'by', 'with', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'this',
  'that', 'these', 'those', 'it', 'its', 'we', 'you', 'your', 'our', 'us', 'they', 'them',
  'their', 'will', 'would', 'can', 'could', 'should', 'may', 'might', 'must', 'have', 'has',
  'had', 'do', 'does', 'did', 'not', 'no', 'yes', 'all', 'any', 'some', 'more', 'most', 'such',
  'who', 'what', 'which', 'when', 'where', 'how', 'why', 'about', 'into', 'over', 'under',
  'per', 'via', 'across', 'within', 'including', 'etc', 'e.g', 'i.e', 'you\'ll', 'we\'re',
  'role', 'team', 'work', 'working', 'experience', 'years', 'year', 'ability', 'strong',
  'excellent', 'good', 'great', 'plus', 'preferred', 'required', 'requirements', 'responsibilities',
]);

/**
 * Normalize text for matching: NFC-normalize, lowercase, and collapse anything
 * that is not a word character while DELIBERATELY preserving the technical
 * characters `+ # .` so "C++", "C#", ".NET", and "Node.js" survive (SRS §10.2).
 */
export function normalizeForMatch(input: string): string {
  return input
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+#.\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split normalized text into tokens, keeping technical tokens intact. */
export function tokenize(input: string): string[] {
  const norm = normalizeForMatch(input);
  if (!norm) return [];
  return norm
    .split(/[\s]+/)
    .map((t) => t.replace(/^[.-]+|[.-]+$/g, '')) // trim stray leading/trailing punctuation
    .filter((t) => t.length > 0 && t !== '.' && t !== '-');
}

/** Contiguous n-grams (as space-joined strings) for n in [minN, maxN]. */
export function ngrams(tokens: string[], minN: number, maxN: number): string[] {
  const out: string[] = [];
  for (let n = minN; n <= maxN; n++) {
    for (let i = 0; i + n <= tokens.length; i++) {
      out.push(tokens.slice(i, i + n).join(' '));
    }
  }
  return out;
}

/**
 * A small, deterministic suffix stemmer (a trimmed Porter). Sufficient for the
 * "stemmed text hit" in atom scoring (SRS §10.4-B) without a dependency.
 */
export function stem(word: string): string {
  let current = word.toLowerCase();
  let next = current;
  do {
    current = next;
    next = stemOnce(current);
  } while (next !== current);
  return current;
}

function stemOnce(word: string): string {
  let w = word;
  if (w.length <= 3) return w;
  // plural / third-person
  if (w.endsWith('ies') && w.length > 4) w = w.slice(0, -3) + 'y';
  else if (w.endsWith('sses')) w = w.slice(0, -2);
  else if (w.endsWith('ss')) { /* keep */ }
  else if (w.endsWith('s')) w = w.slice(0, -1);
  // gerund / past
  if (w.endsWith('ing') && w.length > 5) w = w.slice(0, -3);
  else if (w.endsWith('ed') && w.length > 4) w = w.slice(0, -2);
  // adverb
  if (w.endsWith('ly') && w.length > 4) w = w.slice(0, -2);
  return w;
}

/** Character trigrams (with word-boundary padding) as a set. */
export function trigrams(input: string): Set<string> {
  const s = `  ${normalizeForMatch(input).replace(/\s+/g, ' ')} `;
  const set = new Set<string>();
  for (let i = 0; i + 3 <= s.length; i++) set.add(s.slice(i, i + 3));
  return set;
}

/** Sørensen-Dice trigram similarity in [0,1]: Postgres `pg_trgm`-style. */
export function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const g of ta) if (tb.has(g)) inter++;
  return (2 * inter) / (ta.size + tb.size);
}

/**
 * Jaro-Winkler string similarity in [0,1] (SRS §10.7.6 approximate comparator).
 * The Winkler prefix bonus rewards agreement in the first characters, which
 * empirically reduces record-linkage misclassification.
 */
export function jaroWinkler(s1: string, s2: string, prefixScale = 0.1): number {
  const a = s1.toLowerCase();
  const b = s2.toLowerCase();
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const matchDistance = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatches = new Array(a.length).fill(false);
  const bMatches = new Array(b.length).fill(false);

  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, b.length);
    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  transpositions /= 2;

  const m = matches;
  const jaro = (m / a.length + m / b.length + (m - transpositions) / m) / 3;

  // Winkler prefix bonus (up to 4 chars).
  let prefix = 0;
  for (let i = 0; i < Math.min(4, a.length, b.length); i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }
  return jaro + prefix * prefixScale * (1 - jaro);
}
