/**
 * Search filter grammar (SRS FR-SRCH-002). Parses a composable query like
 *
 *   type:link shared_by:"Omar" after:2025-01-01 transformer
 *
 * into an AST of typed clauses + free text. This is the deterministic "ask"
 * layer (A2, not natural language). Unknown tokens degrade gracefully to text
 * search with a hint rather than erroring, and the AST round-trips through a URL
 * so saved views are shareable (FR-ORG-005).
 */

export const FILTER_FIELDS = [
  'type',
  'tag',
  'org',
  'city',
  'before',
  'after',
  'has',
  'is',
  'source',
  'shared_by',
] as const;

export type FilterField = (typeof FILTER_FIELDS)[number];

export interface FilterClause {
  field: FilterField;
  value: string;
  raw: string;
}

export interface FilterAst {
  text: string;
  clauses: FilterClause[];
  /** Tokens that looked like clauses but failed validation (surfaced as hints). */
  invalid: Array<{ raw: string; reason: string }>;
}

const FIELD_SET = new Set<string>(FILTER_FIELDS);
const HAS_VALUES = new Set(['attachment', 'note', 'metric']);
const IS_VALUES = new Set(['archived', 'pinned', 'sensitive', 'draft', 'final', 'sent']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Tokenize a query respecting double-quoted values.
 *
 * The `\S*` prefix is load-bearing: without it the quoted alternative only ever
 * matched a quote sitting at the start of a token, so `org:"Nile Robotics"`.
 * exactly what `astToQueryString` emits for a value containing a space, split
 * into `org:"Nile` + `Robotics"` and the round-trip this module promises did
 * not hold. Exported because the UI has to chop a query into the same tokens
 * the parser saw, or a chip removes something other than the clause it names.
 */
export function tokenizeQuery(q: string): string[] {
  const tokens: string[] = [];
  const re = /\S*"[^"]*"|\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(q)) !== null) tokens.push(m[0]);
  return tokens;
}

function validate(field: FilterField, value: string): string | null {
  if (!value) return 'empty value';
  switch (field) {
    case 'before':
    case 'after':
      return DATE_RE.test(value) ? null : 'expected a date (YYYY-MM-DD)';
    case 'has':
      return HAS_VALUES.has(value.toLowerCase()) ? null : `expected one of ${[...HAS_VALUES].join(', ')}`;
    case 'is':
      return IS_VALUES.has(value.toLowerCase()) ? null : `expected one of ${[...IS_VALUES].join(', ')}`;
    default:
      return null;
  }
}

export function parseFilterQuery(q: string): FilterAst {
  const ast: FilterAst = { text: '', clauses: [], invalid: [] };
  const textParts: string[] = [];

  for (const token of tokenizeQuery(q)) {
    const colon = token.indexOf(':');
    // A clause needs a colon not at position 0 and a known field.
    if (colon > 0) {
      const field = token.slice(0, colon).toLowerCase();
      let value = token.slice(colon + 1);
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);

      if (FIELD_SET.has(field)) {
        const reason = validate(field as FilterField, value);
        if (reason) {
          ast.invalid.push({ raw: token, reason });
          textParts.push(value); // degrade to text
        } else {
          ast.clauses.push({ field: field as FilterField, value, raw: token });
        }
        continue;
      }
    }
    // Plain text (strip surrounding quotes).
    textParts.push(token.replace(/^"|"$/g, ''));
  }

  ast.text = textParts.join(' ').trim();
  return ast;
}

/** Serialize an AST back to a query string (stable order, for URLs/saved views). */
export function astToQueryString(ast: FilterAst): string {
  const parts = ast.clauses
    .slice()
    .sort((a, b) => a.field.localeCompare(b.field) || a.value.localeCompare(b.value))
    .map((c) => (/\s/.test(c.value) ? `${c.field}:"${c.value}"` : `${c.field}:${c.value}`));
  if (ast.text) parts.push(ast.text);
  return parts.join(' ');
}
