/**
 * The provenance appendix is the reason the dossier format exists, so what it
 * must never soften is what these prove: three presences stay three distinct
 * facts, a record with no revision trail says which of the two reasons it has
 * none, and confidence is a number beside the swatch rather than the swatch.
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithApp } from '../test/render.js';
import { DossierAppendix, appendixEntryId, type CitedRecord } from './DossierAppendix.js';

const LIVE: CitedRecord = {
  kind: 'node',
  id: 'n1',
  presence: 'live',
  type: 'project',
  label: 'Atlas rewrite',
  source: 'manual',
  confidence: 0.9,
  revisions: [
    { rev: 1, at: '2025-01-02T00:00:00.000Z', op: 'create', source: 'manual', actor: 'owner' },
    { rev: 2, at: '2025-04-11T00:00:00.000Z', op: 'update', source: 'import_github', actor: null },
  ],
};

const WITHDRAWN: CitedRecord = {
  kind: 'node',
  id: 'n2',
  presence: 'deleted',
  type: 'role',
  label: 'Staff Engineer',
  source: 'manual',
  confidence: 0.6,
  revisions: [{ rev: 1, at: '2024-06-01T00:00:00.000Z', op: 'create', source: 'manual', actor: null }],
};

const NEVER: CitedRecord = {
  kind: 'node',
  id: 'n3',
  presence: 'unknown',
  type: null,
  label: null,
  source: null,
  confidence: null,
  revisions: [],
};

const ATOM: CitedRecord = {
  kind: 'atom',
  id: 'a1',
  presence: 'live',
  type: 'atom',
  label: 'Cut p95 latency by 40%',
  source: 'manual',
  confidence: null,
  revisions: [],
};

function renderAppendix(records: CitedRecord[]) {
  return renderWithApp(<DossierAppendix records={records} idPrefix="test" />);
}

describe('provenance appendix', () => {
  it('keeps withdrawn and never recorded as two different answers', () => {
    renderAppendix([LIVE, WITHDRAWN, NEVER]);

    expect(screen.getByText('in the graph')).toBeInTheDocument();
    expect(screen.getByText('withdrawn')).toBeInTheDocument();
    expect(screen.getByText('never existed')).toBeInTheDocument();
    expect(screen.getByText(/deleted after the dossier cited it/)).toBeInTheDocument();
    expect(screen.getByText(/No record has ever carried this id/)).toBeInTheDocument();
  });

  it('links only the record a reader can actually reach', () => {
    renderAppendix([LIVE, WITHDRAWN, NEVER]);

    expect(screen.getByRole('link', { name: 'Atlas rewrite' })).toHaveAttribute('href', '/n/n1');
    expect(screen.queryByRole('link', { name: 'Staff Engineer' })).not.toBeInTheDocument();
    expect(screen.getByText('Record with no title')).toBeInTheDocument();
  });

  it('says why a trail is empty, which is not the same reason for an atom', () => {
    renderAppendix([ATOM, NEVER]);

    expect(screen.getByText(/Atoms keep no revision trail/)).toBeInTheDocument();
    expect(screen.getByText(/no revisions recorded/)).toBeInTheDocument();
  });

  it('prints the trail of a record that has one, entry by entry', async () => {
    renderAppendix([LIVE]);

    // Collapsed by default, and the trigger carries the count, so how much
    // history a record has is readable without opening every record on a page.
    const trigger = screen.getByRole('button', { name: 'Revision trail of Atlas rewrite' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(trigger);

    const trail = screen.getByRole('list', { name: 'Revisions of Atlas rewrite' });
    const rows = within(trail).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('rev 1');
    expect(rows[0]).toHaveTextContent('by owner');
    expect(rows[1]).toHaveTextContent('import_github');
    expect(rows[1]).toHaveTextContent('no actor recorded');
  });

  it('states confidence as a number, not only as a coloured dot', () => {
    renderAppendix([LIVE, ATOM, NEVER]);

    expect(screen.getByText('0.90')).toBeInTheDocument();
    expect(screen.getByText('confidence not recorded')).toBeInTheDocument();
    expect(screen.getByText('No source recorded for this record.')).toBeInTheDocument();
  });

  it('anchors each entry so a citation marker can lead to it', () => {
    const { container } = renderAppendix([LIVE, WITHDRAWN]);

    expect(container.querySelector(`#${appendixEntryId('test', 1)}`)).not.toBeNull();
    expect(container.querySelector(`#${appendixEntryId('test', 2)}`)).not.toBeNull();
  });
});
