/**
 * The provenance appendix (SRS FR-DOS-001).
 *
 * This is the reason the dossier format exists. A reader who does not believe a
 * sentence follows its marker down here, finds the record it rests on, and sees
 * where that record came from, how confident it was, and every revision it has
 * been through. Nothing on this list is computed by the browser: each entry is
 * one `CitedRecord` the compiler resolved against the live graph.
 *
 * Two things it must not soften. `presence` has three values and each of them
 * is a different fact about the claim above: a record that is live, one that
 * was withdrawn after being cited, and one that never existed. Collapsing the
 * last two into "missing" tells a reader a citation was invented when it was in
 * fact deleted. And an empty revision trail means two different things
 * depending on what was cited, so it is said in words rather than left as a
 * blank column.
 */
import { Link } from 'react-router-dom';
import { Chip, Disclosure, Mono, ProvenanceChip } from '@vitae/ui';
import { entityHref, typeLabel } from '../lib/entity-href.js';

export interface CitedRecordRevision {
  rev: number;
  at: string;
  op: string;
  source: string;
  actor: string | null;
}

/** One record a claim rests on, exactly as the compiler resolved it. */
export interface CitedRecord {
  kind: 'node' | 'atom';
  id: string;
  presence: 'live' | 'deleted' | 'unknown';
  type: string | null;
  label: string | null;
  source: string | null;
  confidence: number | null;
  revisions: CitedRecordRevision[];
}

/** Never the colour alone: the word carries the state and the tone repeats it. */
const PRESENCE = {
  live: {
    word: 'in the graph',
    tone: 'success' as const,
    detail: 'This record is live, and the link above reaches it.',
  },
  deleted: {
    word: 'withdrawn',
    tone: 'warning' as const,
    detail:
      'This record was deleted after the dossier cited it. The citation stands and prints, because a reader is better served knowing the evidence was withdrawn than not knowing it was ever there.',
  },
  unknown: {
    word: 'never existed',
    tone: 'danger' as const,
    detail:
      'No record has ever carried this id, so there is nothing here for a reader to follow.',
  },
};

export const appendixKey = (record: Pick<CitedRecord, 'kind' | 'id'>): string =>
  `${record.kind}:${record.id}`;

/** The anchor a claim's citation marker points at. Positions are 1-based. */
export const appendixEntryId = (prefix: string, position: number): string =>
  `${prefix}-appendix-${position}`;

/** What to call a record whose title the graph never held. */
function recordLabel(record: CitedRecord): string {
  if (record.label) return record.label;
  return record.kind === 'atom' ? 'Atom with no default variant' : 'Record with no title';
}

export function DossierAppendix({
  records,
  idPrefix,
}: {
  records: CitedRecord[];
  /** Namespaces the anchors, so two appendices on one page cannot collide. */
  idPrefix: string;
}) {
  return (
    <ol className="m-0 list-none p-0" aria-label="Provenance appendix">
      {records.map((record, index) => {
        const position = index + 1;
        const presence = PRESENCE[record.presence];
        const label = recordLabel(record);
        return (
          <li
            key={appendixKey(record)}
            id={appendixEntryId(idPrefix, position)}
            className="border-b border-hairline py-3 last:border-b-0"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Mono className="text-muted">[{position}]</Mono>
              {/* Linked only while the record is live. A link to a record that
                  was deleted, or to one that never existed, is an invitation to
                  a dead end dressed as evidence. */}
              {record.presence === 'live' && record.kind === 'node' && record.type ? (
                <Link className="row__title" to={entityHref(record.type, record.id)}>
                  {label}
                </Link>
              ) : (
                <span className="row__title">{label}</span>
              )}
              <Chip mono>{record.kind === 'atom' ? 'atom' : typeLabel(record.type ?? 'record')}</Chip>
              <Chip tone={presence.tone}>{presence.word}</Chip>
              <Mono className="ml-auto text-xs text-muted">{record.id}</Mono>
            </div>

            <p className="mt-1 text-sm text-muted">{presence.detail}</p>

            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
              {record.source ? (
                <>
                  {/* The chip states confidence as a coloured dot, so the number
                      is printed beside it rather than left to the swatch. */}
                  <ProvenanceChip source={record.source} confidence={record.confidence ?? 1} />
                  <span>
                    {record.confidence == null ? (
                      'confidence not recorded'
                    ) : (
                      <>
                        confidence <Mono>{record.confidence.toFixed(2)}</Mono>
                      </>
                    )}
                  </span>
                </>
              ) : (
                <span>No source recorded for this record.</span>
              )}
            </div>

            {record.revisions.length > 0 ? (
              <Disclosure
                className="mt-2"
                label={`Revision trail of ${label}`}
                meta={record.revisions.length}
              >
                <ol className="m-0 list-none p-0" aria-label={`Revisions of ${label}`}>
                  {record.revisions.map((revision) => (
                    <li key={revision.rev} className="flex flex-wrap items-center gap-2 py-1">
                      <Mono>rev {revision.rev}</Mono>
                      <Mono className="text-muted">{revision.at.slice(0, 10)}</Mono>
                      <span>{revision.op}</span>
                      <Chip mono>{revision.source}</Chip>
                      <span className="text-muted">
                        {revision.actor ? `by ${revision.actor}` : 'no actor recorded'}
                      </span>
                    </li>
                  ))}
                </ol>
              </Disclosure>
            ) : (
              <p className="mt-2 text-sm text-muted">
                {record.kind === 'atom'
                  ? 'Atoms keep no revision trail. They live in the document store rather than the graph, so there is none to print.'
                  : 'This record has no revisions recorded, so there is no history to follow.'}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
