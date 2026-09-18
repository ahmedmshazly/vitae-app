/**
 * Writing one entry into a dossier section (SRS FR-DOS-001).
 *
 * An entry is a sentence the operator wrote and the records it rests on.
 * Nothing here composes the sentence, suggests one, or picks evidence: the
 * whole product stance is that a dossier asserts only what a person was willing
 * to write and point at.
 *
 * The form is driven by the section's published grammar rather than by anything
 * this file knows about promotion packets or exhibit lists. Which record types
 * the picker offers, whether an atom may be cited at all, and how many records
 * one entry takes are read off the grammar the server sent.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Banner, Button, Chip, Field, Select, Textarea } from '@vitae/ui';
import type { DossierSectionGrammar } from '@vitae/core';
import { api } from '../lib/api.js';
import { EntityPicker, type PickedEntity } from '../components/EntityPicker.js';
import { admittedTypes } from './DossierGrammar.js';

/** A citation while it is still a draft, carrying the label the operator saw. */
export interface PickedCitation {
  kind: 'node' | 'atom';
  id: string;
  label: string;
}

export interface ClaimDraft {
  text: string;
  cites: PickedCitation[];
}

interface AtomRow {
  id: string;
  owner_title?: string;
  variants: Array<{ text: string; is_default?: boolean }>;
  deleted_at?: string | null;
}

/** The sentence a résumé would print, which is the only name an atom has. */
function atomLabel(atom: AtomRow): string {
  const text = atom.variants.find((v) => v.is_default)?.text ?? atom.variants[0]?.text ?? atom.id;
  const short = text.length > 72 ? `${text.slice(0, 72)}...` : text;
  return atom.owner_title ? `${atom.owner_title}: ${short}` : short;
}

export function DossierClaimForm({
  section,
  sectionFull,
  busy,
  onAdd,
  onDraftChange,
}: {
  section: DossierSectionGrammar;
  /** The section already holds every entry its grammar allows. */
  sectionFull: boolean;
  busy: boolean;
  /** Resolves true once the entry is stored, which is when the draft clears. */
  onAdd: (draft: ClaimDraft) => Promise<boolean>;
  onDraftChange?: (sectionId: string, dirty: boolean) => void;
}) {
  const ids = useId();
  const [text, setText] = useState('');
  const [cites, setCites] = useState<PickedCitation[]>([]);
  const [atomId, setAtomId] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const flight = useRef(false);
  const dirty = Boolean(text || cites.length || atomId);
  useEffect(() => {
    onDraftChange?.(section.id, dirty);
  }, [onDraftChange, section.id, dirty]);
  useEffect(() => () => onDraftChange?.(section.id, false), [onDraftChange, section.id]);

  // Only fetched for a section whose grammar admits atoms. Asking for them
  // everywhere would put a picker on screens where citing one is a violation.
  const atomsQuery = useQuery({
    queryKey: ['atoms'],
    queryFn: () => api.get<{ atoms: AtomRow[] }>('/atoms'),
    enabled: section.admitsAtoms,
  });
  const atoms = (atomsQuery.data?.atoms ?? []).filter((atom) => !atom.deleted_at);

  const max = Math.min(section.maxCitationsPerClaim ?? 12, 12);
  const atCitationCap = cites.length >= max;
  const disabled = busy || submitting || sectionFull;
  const canSubmit = text.trim().length > 0 && !disabled && !sectionFull;

  function addCitation(citation: PickedCitation) {
    if (disabled || atCitationCap) return;
    setCites((current) =>
      current.some((c) => c.kind === citation.kind && c.id === citation.id)
        ? current
        : [...current, citation],
    );
  }

  async function submit() {
    if (flight.current || !canSubmit) return;
    flight.current = true;
    setSubmitting(true);
    try {
      const added = await onAdd({ text: text.trim(), cites });
      if (!added) return;
      setText('');
      setCites([]);
      setAtomId(undefined);
    } finally {
      flight.current = false;
      setSubmitting(false);
    }
  }

  // Grouped and named. Every section on the page carries one of these forms, so
  // without the legend a screen reader meets several controls called "the
  // sentence this entry asserts" with nothing to say which section they write
  // into.
  if (sectionFull && !dirty) {
    return (
      <fieldset className="entity-form__section">
        <legend className="entity-form__legend">Add an entry to {section.heading}</legend>
        <p className="text-sm text-muted">
          This section holds every entry its grammar allows. Remove one to write another.
        </p>
      </fieldset>
    );
  }

  return (
    <fieldset
      className="entity-form__section dossier-claim-form flex flex-col gap-3"
      disabled={disabled}
    >
      <legend className="entity-form__legend">Add an entry to {section.heading}</legend>
      {sectionFull && (
        <p role="status">
          This section is now full. Your draft is kept here; remove an existing entry before adding
          it.
        </p>
      )}
      <Field
        label="The sentence this entry asserts"
        htmlFor={`${ids}-text`}
        help="Your own words. Up to 600 characters."
      >
        <Textarea
          id={`${ids}-text`}
          rows={2}
          maxLength={600}
          placeholder="What is true, stated plainly..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </Field>

      <div className="vt-fld">
        <span className="vt-fld__label">Evidence</span>
        {cites.length > 0 && (
          <ul
            className="m-0 flex list-none flex-wrap gap-2 p-0"
            aria-label={`Evidence on the new ${section.heading} entry`}
          >
            {cites.map((cite) => (
              <li key={`${cite.kind}:${cite.id}`}>
                <Chip
                  onRemove={() =>
                    setCites((current) =>
                      current.filter((c) => !(c.kind === cite.kind && c.id === cite.id)),
                    )
                  }
                >
                  {cite.label}
                </Chip>
              </li>
            ))}
          </ul>
        )}

        {atCitationCap ? (
          <p className="text-sm text-muted">
            This section takes {max} {max === 1 ? 'record' : 'records'} per entry. Remove one to
            cite something else.
          </p>
        ) : (
          <EntityPicker
            allowCreate={false}
            types={admittedTypes(section)}
            placeholder="Search the records this entry rests on..."
            excludeIds={cites.filter((c) => c.kind === 'node').map((c) => c.id)}
            onPick={(entity: PickedEntity) =>
              addCitation({ kind: 'node', id: entity.id, label: entity.title })
            }
          />
        )}
      </div>

      {section.admitsAtoms && !atCitationCap && (
        <>
          {/* A failed atom load leaves the picker empty, which reads as "you
              have written no atoms" rather than "we could not ask". */}
          {atomsQuery.isError && (
            <Banner
              tone="warning"
              title="Atoms could not be listed"
              action={
                <Button size="sm" onClick={() => void atomsQuery.refetch()}>
                  Try again
                </Button>
              }
            >
              Records can still be cited; only the atom picker is empty.
            </Banner>
          )}
          <Field
            label="Or cite a résumé atom"
            htmlFor={`${ids}-atom`}
            help={atomsQuery.isLoading ? 'Loading your atoms...' : 'This section admits atoms.'}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Select
                id={`${ids}-atom`}
                label="Résumé atom to cite"
                value={atomId}
                onChange={setAtomId}
                placeholder={atoms.length === 0 ? 'No atoms to cite' : 'Pick an atom'}
                disabled={atoms.length === 0}
                options={atoms.map((atom) => ({ value: atom.id, label: atomLabel(atom) }))}
              />
              <Button
                size="sm"
                disabled={!atomId}
                onClick={() => {
                  const atom = atoms.find((candidate) => candidate.id === atomId);
                  if (!atom) return;
                  addCitation({ kind: 'atom', id: atom.id, label: atomLabel(atom) });
                  setAtomId(undefined);
                }}
              >
                Cite this atom
              </Button>
            </div>
          </Field>
        </>
      )}

      {/* Stated, not enforced. An entry short of evidence is work the violations
          panel names; refusing to store it would lose the sentence the operator
          just wrote and leave them nothing to come back to. */}
      {cites.length < section.minCitationsPerClaim && (
        <p className="text-sm text-muted">
          This section asks for at least {section.minCitationsPerClaim}{' '}
          {section.minCitationsPerClaim === 1 ? 'record' : 'records'} per entry. Adding it now
          records the gap as outstanding work.
        </p>
      )}

      <div>
        <Button
          variant="primary"
          glyph="plus"
          aria-label={`Add this entry to ${section.heading}`}
          disabled={!canSubmit}
          onClick={() => void submit()}
        >
          {submitting ? 'Saving...' : 'Add this entry'}
        </Button>
      </div>
    </fieldset>
  );
}
