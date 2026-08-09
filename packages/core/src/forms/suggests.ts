/**
 * Where a field's autocompletions come from, and when a typed value should be
 * offered as a new record.
 *
 * Typing a value the graph already holds, under a slightly different spelling.
 * is how near-duplicates accumulate: "Fintech" and "FinTech", "Kigali" and
 * "Kigali, Rwanda". Every text field should therefore show what already exists.
 * Both form renderers consult this module so they cannot disagree about a
 * field's source.
 */
import type { NodeType } from '../types.js';
import type { FieldDescriptor, SuggestKind } from './types.js';

/**
 * Text props whose value names a record that could exist in the graph.
 *
 * Only these offer "create it by name". Most text props are plain strings on the
 * record they belong to: `industry: "Fintech"` is a property of an
 * organization, not a node of its own, and minting one would manufacture
 * exactly the orphan noise a graph collects and then has to be cleaned of.
 *
 * Keyed by prop name because the same name means the same thing across types:
 * `role.city`, `organization.hq_city` and `event.city` are all places.
 */
export const ENTITY_BACKED_PROPS: Readonly<Record<string, NodeType>> = {
  city: 'location',
  hq_city: 'location',
  location: 'location',
  destination: 'location',
  company: 'organization',
  vendor: 'organization',
  provider: 'organization',
  service: 'organization',
  platform: 'organization',
  primary_language: 'skill',
};

/**
 * The same question for a curated pool rather than a prop name, a `skill`
 * suggestion can become a skill node, a `city` one a location.
 */
export const ENTITY_BACKED_KINDS: Readonly<Partial<Record<SuggestKind, NodeType>>> = {
  skill: 'skill',
  tech: 'skill',
  city: 'location',
};

/** The node type a typed value in this field could become, if any. */
export function entityTypeForProp(key: string): NodeType | null {
  return ENTITY_BACKED_PROPS[key] ?? null;
}

/**
 * A pooled vocabulary shared by several fields, or that field's own values.
 *
 * `kind` pools cross-cut types in a way a per-field query cannot: `city` draws
 * on location titles *and* every `*.city` prop at once, so a field that
 * declares `suggestKind` keeps using it. Everything else falls back to "other
 * values of this same field", which needs no curation and so covers fields that
 * do not exist yet.
 */
export type SuggestSource =
  | { mode: 'kind'; kind: SuggestKind }
  | { mode: 'prop'; type: string; prop: string };

export function suggestSourceFor(ownerType: string, field: FieldDescriptor): SuggestSource {
  if (field.suggestKind) return { mode: 'kind', kind: field.suggestKind };
  return { mode: 'prop', type: ownerType, prop: field.key };
}

/** Query string for `GET /api/v1/suggest/values`, so callers build it one way. */
export function suggestQuery(source: SuggestSource, q: string): string {
  const params = new URLSearchParams();
  if (source.mode === 'kind') params.set('kind', source.kind);
  else {
    params.set('type', source.type);
    params.set('prop', source.prop);
  }
  if (q) params.set('q', q);
  return params.toString();
}

/**
 * Widgets that hold prose or a machine identifier, where a list of previous
 * values is noise rather than help. Everything else that is text-shaped gets
 * suggestions.
 */
export const NO_SUGGEST_WIDGETS: ReadonlySet<string> = new Set([
  'textarea',
  'url',
  'date',
  'datetime',
  'number',
  'money',
  'checkbox',
  'rating',
  'select',
  'object-list',
]);

export function fieldTakesSuggestions(field: FieldDescriptor): boolean {
  return !NO_SUGGEST_WIDGETS.has(field.widget);
}
