/**
 * Schema-backed node/edge factories. Build create payloads through
 * `validateNodeCreate` / `validateEdgeCreate` so fixtures stay aligned with
 * the domain model instead of inventing stale hand-written documents.
 */
import {
  validateEdgeCreate,
  validateNodeCreate,
  type EdgeCreateInput,
  type NodeCreateInput,
  type NodeRecord,
  type NodeType,
} from '@vitae/core';
import { fixedClock, type Clock } from './clock.js';
import { nextId } from './ids.js';

export type NodeCreateOverrides = Partial<NodeCreateInput> & {
  type?: NodeType;
  title?: string;
};

export type EdgeCreateOverrides = Partial<EdgeCreateInput> & {
  type: EdgeCreateInput['type'];
  src: string;
  dst: string;
};

/** Valid node-create payload. Throws with field errors if overrides are invalid. */
export function buildNodeCreate(overrides: NodeCreateOverrides = {}): NodeCreateInput {
  const type = overrides.type ?? 'person';
  const title = overrides.title ?? `Fixture ${type} ${nextId(type)}`;
  const result = validateNodeCreate({
    type,
    title,
    props: {},
    notes_md: '',
    date_precision: 'day',
    pinned: false,
    sensitivity: 'normal',
    source: 'manual',
    confidence: 1,
    identity_keys: [],
    ...overrides,
  });
  if (!result.ok) {
    throw new Error(
      `buildNodeCreate invalid for ${type}: ${result.errors.map((e) => `${e.path}: ${e.message}`).join('; ')}`,
    );
  }
  return result.value;
}

/** Persist-shaped node with system fields filled from a clock. */
export function buildNodeRecord(
  overrides: NodeCreateOverrides & { id?: string } = {},
  clock: Clock = fixedClock(),
): NodeRecord {
  const created = buildNodeCreate(overrides);
  const now = clock.nowIso();
  return {
    ...created,
    id: overrides.id ?? nextId(created.type),
    captured_at: now,
    created_at: now,
    updated_at: now,
    archived_at: null,
    deleted_at: null,
    merged_into: null,
    rev: 0,
  };
}

/** Valid edge-create payload. */
export function buildEdgeCreate(overrides: EdgeCreateOverrides): EdgeCreateInput {
  const result = validateEdgeCreate({
    props: {},
    notes_md: '',
    source: 'manual',
    confidence: 1,
    ...overrides,
  });
  if (!result.ok) {
    throw new Error(
      `buildEdgeCreate invalid for ${overrides.type}: ${result.errors.map((e) => `${e.path}: ${e.message}`).join('; ')}`,
    );
  }
  return result.value;
}

/** Minimal self person + role linked by HELD, for ownership/timeline fixtures. */
export function buildSelfWithRole(clock: Clock = fixedClock()): {
  self: NodeRecord;
  role: NodeRecord;
  held: EdgeCreateInput;
} {
  const self = buildNodeRecord(
    { type: 'person', title: 'Self Fixture', props: { given_name: 'Self', family_name: 'Fixture' } },
    clock,
  );
  const role = buildNodeRecord(
    {
      type: 'role',
      title: 'Fixture Role',
      props: { employment_type: 'full_time' },
      start_date: '2024-02-01',
      status: 'active',
    },
    clock,
  );
  const held = buildEdgeCreate({ type: 'HELD', src: self.id, dst: role.id });
  return { self, role, held };
}
