/**
 * Deterministic ID helpers. Prefer these over random UUIDs in unit and fixture
 * builders so golden expectations stay stable across runs.
 */

let seq = 0;

/** Reset the sequence at the start of a suite that relies on stable IDs. */
export function resetIdSequence(start = 0): void {
  seq = start;
}

/** Next deterministic id with an optional prefix: `person-0001`. */
export function nextId(prefix = 'id'): string {
  seq += 1;
  return `${prefix}-${String(seq).padStart(4, '0')}`;
}

/** Stable space name for an isolated e2e or integration run. */
export function testSpace(label = 'case'): string {
  seq += 1;
  return `test_${label}_${String(seq).padStart(4, '0')}`;
}
