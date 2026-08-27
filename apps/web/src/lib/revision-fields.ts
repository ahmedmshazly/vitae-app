/**
 * Reading the keys of a stored revision diff.
 *
 * The diff opens `props` one level and keys its fields `props.status`, so the
 * feed can say which field moved rather than repeating the name of the column
 * everything lives in. Revisions written before that change say `props` and
 * nothing more, and both shapes sit in the same history, so every screen that
 * renders a diff key goes through here.
 */

/**
 * The field name a diff key refers to, with the container it lives in dropped.
 * A bare `props` from an older revision is left alone: that revision really
 * does know only that much, and rewriting it as a field name would invent a
 * precision the record does not have.
 */
export function fieldLabel(key: string): string {
  return key.startsWith('props.') ? key.slice('props.'.length) : key;
}
