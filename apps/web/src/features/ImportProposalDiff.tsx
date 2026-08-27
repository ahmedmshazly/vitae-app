import { Checkbox, Mono } from '@vitae/ui';

/**
 * The per-field diff a re-import proposes for a record it already knows
 * (SRS FR-SYNC-001).
 *
 * A row that matched an existing record by identity key is not a duplicate to
 * wave through, it is a claim that something about that record has changed, and
 * the reviewer has to be able to see and refuse each change on its own. So this
 * shows both sides of every field and lets each one be kept or dropped; the row
 * itself stays skipped until somebody accepts it, and accepting nothing leaves
 * the record exactly as it was.
 *
 * It renders values, it never summarises them. "3 fields differ" would be a
 * figure the reviewer cannot check.
 */

export interface ProposalField {
  key: string;
  from: unknown;
  to: unknown;
}

export interface RowProposal {
  identity_key: string;
  target_node_id: string;
  target_title: string;
  target_rev: number;
  fields: ProposalField[];
  accepted: string[];
}

/**
 * A field key as a reviewer reads it. `props.` is storage layout, not
 * something anyone asked about, so it comes off; `notes_md` is a name only the
 * schema uses.
 */
export function fieldLabel(key: string): string {
  const bare = key.startsWith('props.') ? key.slice('props.'.length) : key;
  if (bare === 'notes_md') return 'notes';
  return bare.replace(/_/g, ' ');
}

/**
 * A stored value as text.
 *
 * An absent value is named as absent rather than drawn as an empty gap, because
 * "nothing there" and "we could not render it" look identical when blank, and
 * only one of them is true.
 */
export function formatFieldValue(value: unknown): string {
  if (value === undefined || value === null) return 'not set';
  if (value === '') return 'empty';
  if (Array.isArray(value)) return value.length === 0 ? 'none' : value.map(formatFieldValue).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function ImportProposalDiff({
  proposal,
  disabled,
  onToggleField,
}: {
  proposal: RowProposal;
  disabled?: boolean;
  /** Called with the full accepted set, so the caller sends one decision, not a delta. */
  onToggleField?: (acceptedKeys: string[]) => void;
}) {
  const accepted = new Set(proposal.accepted);
  return (
    <div className="imp__diff stack" data-import-proposal>
      <p className="imp__diff-lede m-0 text-sm text-ink-soft">
        Matches <strong>{proposal.target_title}</strong> on{' '}
        <Mono className="u-faint">{proposal.identity_key}</Mono>. Nothing is written until you
        accept this row.
      </p>
      {/* A group rather than a list: the browser's own list styling would need
          CSS to undo, and what a reviewer needs here is the grouping label, not
          bullets. */}
      <div
        className="imp__diff-list stack"
        role="group"
        aria-label={`Proposed changes to ${proposal.target_title}`}
      >
        {proposal.fields.map((field) => (
          <div key={field.key} className="imp__diff-row">
            <Checkbox
              checked={accepted.has(field.key)}
              disabled={disabled || !onToggleField}
              align="start"
              onChange={(next) => {
                if (!onToggleField) return;
                const keys = proposal.fields
                  .map((f) => f.key)
                  .filter((key) => (key === field.key ? next : accepted.has(key)));
                onToggleField(keys);
              }}
              label={
                <span className="imp__diff-field text-sm">
                  <Mono className="imp__diff-key">{fieldLabel(field.key)}</Mono>{' '}
                  {/* The arrow carries the relation for sighted readers and
                      nothing at all for a screen reader, so the two words it
                      stands in for are spoken instead. */}
                  <span className="sr-only">from </span>
                  <span className="imp__diff-from u-faint">{formatFieldValue(field.from)}</span>
                  <span className="imp__diff-arrow" aria-hidden>
                    {' → '}
                  </span>
                  <span className="sr-only">to </span>
                  <span className="imp__diff-to">{formatFieldValue(field.to)}</span>
                </span>
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}
