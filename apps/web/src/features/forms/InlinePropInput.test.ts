/**
 * Every widget an edge field declares must be rendered deliberately.
 *
 * `InlinePropInput` ends in a plain text input, so an unhandled widget does not
 * fail loudly, it silently renders a text box and emits a *string*. That is how
 * KNOWS.topics (widget `suggest-list`, schema `z.array(z.string())`) came to
 * send "Business" instead of ["Business"], and the API rejected the whole edge
 * with a 422 naming a field the form never showed as wrong.
 *
 * The text fallback is legitimate for scalar widgets. It is never right for a
 * list-shaped one, so those are pinned explicitly.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EDGE_FORM_DESCRIPTORS,
  EDGE_PROPS_SCHEMAS,
  NODE_FORM_DESCRIPTORS,
  fieldTakesSuggestions,
  suggestSourceFor,
  type EdgeType,
} from '@vitae/core';
import { z } from 'zod';

/**
 * Widgets the component actually branches on, read from its source rather than
 * mirrored by hand, a hand-kept list drifts, and drift here is invisible
 * because the fallback silently renders something plausible.
 */
// Path is relative to the vitest root (apps/web); import.meta.url is not a
// file: URL under the jsdom environment.
const EDGE_COMPONENT = readFileSync('src/features/forms/EdgeSubEditorRow.tsx', 'utf8');
const HANDLED = new Set([
  ...[...EDGE_COMPONENT.matchAll(/field\.widget === '([a-z-]+)'/g)].map((m) => m[1]!),
  'text', // the deliberate fallback at the end of the component
]);

/** The node-form renderer switches on the widget instead of comparing it. */
const NODE_COMPONENT = readFileSync('src/features/forms/FieldRenderer.tsx', 'utf8');
const NODE_HANDLED = new Set(
  [...NODE_COMPONENT.matchAll(/case '([a-z-]+)':/g)].map((m) => m[1]!),
);

/** Rendered by the parent as its own row, never by InlinePropInput. */
const RENDERED_ELSEWHERE = new Set(['object-list']);

function nodeFields() {
  return Object.entries(NODE_FORM_DESCRIPTORS).flatMap(([type, d]) =>
    d.fields.map((f) => ({ type, field: f })),
  );
}

function edgeFields() {
  return Object.entries(EDGE_FORM_DESCRIPTORS).flatMap(([type, d]) =>
    d.fields.map((f) => ({ type: type as EdgeType, field: f })),
  );
}

describe('InlinePropInput covers every widget the edge descriptors use', () => {
  it('handles every declared widget, or renders it elsewhere', () => {
    for (const { type, field } of edgeFields()) {
      if (RENDERED_ELSEWHERE.has(field.widget)) continue;
      expect(
        HANDLED.has(field.widget),
        `${type}.${field.key} uses widget "${field.widget}", which InlinePropInput does not branch on: ` +
          'it would fall through to the text input and emit a string',
      ).toBe(true);
    }
  });

  it('never lets an array-typed prop be driven by a scalar widget', () => {
    // The actual invariant: if the schema wants an array, the widget must be one
    // that produces an array. A text/date/number widget cannot.
    const ARRAY_PRODUCING = new Set(['tags', 'suggest-list', 'object-list']);

    for (const { type, field } of edgeFields()) {
      const schema = EDGE_PROPS_SCHEMAS[type];
      if (!(schema instanceof z.ZodObject)) continue;
      const shape = schema.shape as Record<string, z.ZodTypeAny>;
      const prop = shape[field.key];
      if (!prop) continue;

      // Unwrap optional/default/nullable to reach the underlying type.
      let inner: z.ZodTypeAny = prop;
      for (let i = 0; i < 5; i += 1) {
        const def = (inner as { _def?: { innerType?: z.ZodTypeAny } })._def;
        if (def?.innerType) inner = def.innerType;
        else break;
      }
      if (!(inner instanceof z.ZodArray)) continue;

      expect(
        ARRAY_PRODUCING.has(field.widget),
        `${type}.props.${field.key} is an array in the schema but its widget is ` +
          `"${field.widget}", which emits a scalar, the API will 422 on it`,
      ).toBe(true);
    }
  });

  it('the node-form renderer branches on every widget its descriptors declare', () => {
    for (const { type, field } of nodeFields()) {
      expect(
        NODE_HANDLED.has(field.widget),
        `${type}.${field.key} uses widget "${field.widget}", which FieldRenderer has no case for: ` +
          'it would fall through to the default and render nothing',
      ).toBe(true);
    }
  });

  it('every suggestible field resolves to a source, so none loses its suggestor', () => {
    // The point of the feature: a text field must always know where its
    // completions come from, whether that is a curated pool or its own history.
    for (const { type, field } of [...nodeFields(), ...edgeFields()]) {
      if (!fieldTakesSuggestions(field)) continue;
      const source = suggestSourceFor(type, field);
      if (source.mode === 'kind') expect(source.kind, `${type}.${field.key}`).toBeTruthy();
      else {
        expect(source.type, `${type}.${field.key}`).toBe(type);
        expect(source.prop, `${type}.${field.key}`).toBe(field.key);
      }
    }
  });
});
