/**
 * LaTeX escaping / sanitization (SRS §8.4, FR-RES-012). SECURITY-CRITICAL.
 *
 * Every piece of user content that reaches `main_tex` passes through here first
 * (SRS C5: "no exceptions"). Goals:
 *   1. Neutralize TeX metacharacters so injected markup renders as literal text
 *      and cannot trigger shell escape, file writes, or macro execution.
 *   2. Support a tiny whitelist of mini-markdown (**bold**, *italic*) mapped to
 *      \textbf / \textit (the only rich text the résumé engine emits).
 *
 * The property-based fuzz suite (latex-escape.test.ts) asserts that arbitrary
 * Unicode + TeX metacharacters always produce output that is safe (no active
 * control sequences leak) and stable (idempotent structure).
 */

/**
 * Per-character escape map. Single-pass so characters introduced by an escape
 * (e.g. the `{}` in `\textbackslash{}`) are never reprocessed. Naive sequential
 * `String.replace` is unsafe for that reason.
 */
const CHAR_ESCAPES: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '&': '\\&',
  '%': '\\%',
  $: '\\$',
  '#': '\\#',
  _: '\\_',
  '{': '\\{',
  '}': '\\}',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
  // Typographic punctuation → explicit macros. utf8 inputenc under T1 renders
  // these inconsistently across fonts (· became ů in charter); macros are exact.
  '–': '\\textendash{}',
  '—': '\\textemdash{}',
  '·': '\\textperiodcentered{}',
  '•': '\\textbullet{}',
};

/** Strip C0 control characters (except tab/newline handling done by caller). */
function stripControls(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
}

/**
 * Escape a raw string for safe inclusion in LaTeX. Does not interpret markup;
 * use {@link renderInlineMarkdown} when mini-markdown is desired.
 */
export function escapeLatex(input: string): string {
  const cleaned = stripControls(input.normalize('NFC'));
  let out = '';
  for (const ch of cleaned) out += CHAR_ESCAPES[ch] ?? ch;
  return out;
}

/**
 * Escape an inline field (name, org, dates): additionally collapse newlines to
 * spaces so a multi-line paste cannot break a single-line template slot.
 */
export function escapeInline(input: string): string {
  return escapeLatex(input.replace(/[\r\n]+/g, ' ')).replace(/\s+/g, ' ').trim();
}

/**
 * Render whitelisted mini-markdown to LaTeX. Only `**bold**` and `*italic*`
 * (and `_italic_`) are recognised; the surrounding text is fully escaped first,
 * so the emphasis markers are the ONLY structure that becomes active LaTeX.
 *
 * Implementation: tokenize on the emphasis markers over the RAW string, escape
 * each text segment, then wrap emphasized segments, guaranteeing no escaped
 * content can ever be reinterpreted as a marker.
 */
export function renderInlineMarkdown(input: string): string {
  const cleaned = stripControls(input.normalize('NFC'));
  let result = '';
  let i = 0;
  const n = cleaned.length;

  const emit = (text: string, wrap?: 'bold' | 'italic') => {
    const escaped = escapeLatex(text);
    if (!wrap) return escaped;
    return wrap === 'bold' ? `\\textbf{${escaped}}` : `\\textit{${escaped}}`;
  };

  while (i < n) {
    if (cleaned.startsWith('**', i)) {
      const end = cleaned.indexOf('**', i + 2);
      if (end !== -1) {
        result += emit(cleaned.slice(i + 2, end), 'bold');
        i = end + 2;
        continue;
      }
    }
    const ch = cleaned[i]!;
    if ((ch === '*' || ch === '_') && !cleaned.startsWith('**', i)) {
      const end = cleaned.indexOf(ch, i + 1);
      if (end !== -1 && end > i + 1) {
        result += emit(cleaned.slice(i + 1, end), 'italic');
        i = end + 1;
        continue;
      }
    }
    // Accumulate a run of plain text up to the next potential marker.
    let j = i;
    while (j < n && cleaned[j] !== '*' && cleaned[j] !== '_') j++;
    if (j === i) j = i + 1; // lone marker with no partner → treat as literal
    result += emit(cleaned.slice(i, j));
    i = j;
  }
  return result;
}

/**
 * Schemes allowed to become a clickable link target in a generated PDF.
 * A résumé is a document handed to strangers, and a PDF link annotation with a
 * `javascript:` (or `file:`, `data:`) target is honoured by some viewers, so
 * the scheme is decided here rather than trusted from a contact record.
 */
const SAFE_URL_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/** Anything before the first `:` that looks like an RFC-3986 scheme. */
const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/**
 * May this string be used as an \href target? A value with no scheme at all
 * ("example.com/in/me", what people actually type into a contact field) is
 * safe by construction: with nothing before the colon there is no scheme for a
 * viewer to act on. Only an explicit, non-allow-listed scheme is refused.
 */
export function isSafeHref(input: string): boolean {
  const cleaned = stripControls(input.normalize('NFC')).trim();
  const match = SCHEME_RE.exec(cleaned);
  return match ? SAFE_URL_SCHEMES.has(match[0].toLowerCase()) : true;
}

/**
 * Escape a URL for use as the FIRST argument of hyperref's \href{url}{text}.
 * Distinct from text escaping: the URL must stay a working link target, so
 * characters TeX cannot see even in escaped form are percent-encoded (a
 * semantics-preserving URL transformation), and the remaining TeX specials
 * (% # & _ $) are backslash-escaped, hyperref resolves those to the literal
 * character in the link target.
 */
export function escapeUrl(input: string): string {
  const cleaned = stripControls(input.normalize('NFC')).trim();
  const encoded = cleaned
    .replace(/[\\{}^]/g, (c) => encodeURIComponent(c))
    .replace(/~/g, '%7E')
    .replace(/ /g, '%20');
  return encoded.replace(/[%#&_$]/g, (c) => `\\${c}`);
}

/** Assert that a rendered template has no unresolved «guillemet» tokens. */
export function assertNoUnresolvedTokens(rendered: string): void {
  const match = rendered.match(/«[^»]*»/);
  if (match) {
    throw new Error(`Unresolved template token in LaTeX output: ${match[0]}`);
  }
}
