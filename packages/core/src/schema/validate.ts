/**
 * Full node/edge validation = envelope + per-type `props` schema.
 * Returns a discriminated result so callers (API routes, importers) can surface
 * field-level errors (FR-CAP-002) without throwing.
 */
import type { z } from 'zod';
import type { EdgeType, NodeType } from '../types.js';
import {
  edgeCreateEnvelope,
  edgeUpdateEnvelope,
  nodeCreateEnvelope,
  nodeUpdateEnvelope,
  type EdgeCreateInput,
  type EdgeUpdateInput,
  type NodeCreateInput,
  type NodeUpdateInput,
} from './envelope.js';
import { propsSchemaFor } from './node-props.js';
import { edgePropsSchemaFor } from './edge-props.js';

export interface FieldError {
  path: string;
  message: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: FieldError[] };

function collect(err: z.ZodError, prefix = ''): FieldError[] {
  return err.issues.map((i) => ({
    path: [prefix, ...i.path].filter(Boolean).join('.'),
    message: i.message,
  }));
}

/** Validate a node create payload, including its type-specific props. */
export function validateNodeCreate(input: unknown): ValidationResult<NodeCreateInput> {
  const base = nodeCreateEnvelope.safeParse(input);
  if (!base.success) return { ok: false, errors: collect(base.error) };

  const propsResult = propsSchemaFor(base.data.type as NodeType).safeParse(base.data.props);
  if (!propsResult.success) {
    return { ok: false, errors: collect(propsResult.error, 'props') };
  }
  return { ok: true, value: { ...base.data, props: propsResult.data as Record<string, unknown> } };
}

/**
 * Validate a node PATCH payload against the update envelope (which strips
 * system fields like `deleted_at`, clients can never set those) plus the
 * type-specific props schema when `props` is present.
 */
export function validateNodeUpdate(type: NodeType, input: unknown): ValidationResult<NodeUpdateInput> {
  const base = nodeUpdateEnvelope.safeParse(input);
  if (!base.success) return { ok: false, errors: collect(base.error) };
  if (base.data.props === undefined) return { ok: true, value: base.data };

  const propsResult = propsSchemaFor(type).safeParse(base.data.props);
  if (!propsResult.success) {
    return { ok: false, errors: collect(propsResult.error, 'props') };
  }
  return { ok: true, value: { ...base.data, props: propsResult.data as Record<string, unknown> } };
}

/** Validate an edge create payload, including its type-specific props. */
export function validateEdgeCreate(input: unknown): ValidationResult<EdgeCreateInput> {
  const base = edgeCreateEnvelope.safeParse(input);
  if (!base.success) return { ok: false, errors: collect(base.error) };

  const propsResult = edgePropsSchemaFor(base.data.type as EdgeType).safeParse(base.data.props);
  if (!propsResult.success) {
    return { ok: false, errors: collect(propsResult.error, 'props') };
  }
  return { ok: true, value: { ...base.data, props: propsResult.data as Record<string, unknown> } };
}

/** Validate an edge PATCH payload (type/src/dst are immutable and stripped). */
export function validateEdgeUpdate(type: EdgeType, input: unknown): ValidationResult<EdgeUpdateInput> {
  const base = edgeUpdateEnvelope.safeParse(input);
  if (!base.success) return { ok: false, errors: collect(base.error) };
  if (base.data.props === undefined) return { ok: true, value: base.data };

  const propsResult = edgePropsSchemaFor(type).safeParse(base.data.props);
  if (!propsResult.success) {
    return { ok: false, errors: collect(propsResult.error, 'props') };
  }
  return { ok: true, value: { ...base.data, props: propsResult.data as Record<string, unknown> } };
}
