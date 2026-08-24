/**
 * A diagram and the table that is the same diagram in words.
 *
 * The claim under test is the one the design rules make of every visual: the
 * accessible equivalent is not a summary, an alt attribute or a second page,
 * and it is not conditional on anyone finding a button. So these check that the
 * table is in the document from the start, that the drawing is hidden from
 * assistive technology because it is a duplicate rather than a second set of
 * facts, and that nothing the drawing shows is missing from the words.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { DocsDiagramSpec } from './docsModel.js';
import { DocsDiagram } from './DocsDiagram.js';

const sequence: DocsDiagramSpec = {
  id: 'DGM-EXAMPLE',
  title: 'Asking for a thing',
  summary: 'What happens when the browser asks.',
  kind: 'sequence',
  sources: ['apps/api/src/app.ts'],
  note: 'The last step is closed in a default build.',
  actors: [
    { id: 'browser', label: 'Browser' },
    { id: 'api', label: 'API' },
    { id: 'db', label: 'Postgres' },
  ],
  steps: [
    { from: 'browser', to: 'api', label: 'Asks for the thing', source: 'apps/api/src/app.ts:12' },
    { from: 'api', to: 'api', label: 'Checks the session', kind: 'aside' },
    { from: 'api', to: 'browser', label: 'Refuses without one', kind: 'refusal' },
    { from: 'api', to: 'db', label: 'Reads the row' },
    { from: 'db', to: 'api', label: 'Returns it', kind: 'return' },
  ],
};

const state: DocsDiagramSpec = {
  id: 'DGM-STATE',
  title: 'A lifecycle',
  summary: 'How it moves.',
  kind: 'state',
  sources: ['packages/core/src/index.ts'],
  states: [
    { id: 'draft', label: 'Draft', initial: true, note: 'Nobody has sent it.' },
    { id: 'sent', label: 'Sent' },
    { id: 'closed', label: 'Closed', terminal: true },
    {
      id: 'shelved',
      label: 'Shelved',
      terminal: true,
      unreachable: true,
      note: 'Declared in the type; no code path sets it.',
    },
  ],
  transitions: [
    { from: 'draft', to: 'sent', label: 'Someone sends it' },
    { from: 'sent', to: 'closed', label: 'It is decided' },
  ],
};

const topology: DocsDiagramSpec = {
  id: 'DGM-TOPO',
  title: 'Where things run',
  summary: 'Processes by trust zone.',
  kind: 'topology',
  sources: ['apps/api/src/app.ts'],
  zones: [
    { id: 'outside', label: 'The public internet', trust: 'untrusted' },
    { id: 'inside', label: 'The private network', trust: 'trusted' },
  ],
  nodes: [
    { id: 'browser', label: 'Browser', zone: 'outside' },
    { id: 'api', label: 'API', zone: 'inside' },
  ],
  links: [{ from: 'browser', to: 'api', label: 'HTTPS', carries: 'A session cookie' }],
};

const lanes: DocsDiagramSpec = {
  id: 'DGM-LANES',
  title: 'A first session',
  summary: 'What a new person does.',
  kind: 'lanes',
  sources: ['apps/web/src/App.tsx'],
  lanes: [
    { id: 'person', label: 'Person' },
    { id: 'system', label: 'System' },
  ],
  phases: [
    { id: 'open', lane: 'person', label: 'Opens the app', route: '/today', covered_by: ['e2e/tests/today.spec.ts'] },
    { id: 'seed', lane: 'system', label: 'Offers demo data', covered_by: [] },
  ],
};

describe('a diagram and its words', () => {
  it('puts the table in the document before anyone asks for it', () => {
    // A screen reader gets the whole diagram on arrival. The button only
    // changes whether sighted readers can see it too.
    render(<DocsDiagram spec={sequence} />);
    expect(screen.getByRole('table', { name: 'Steps in order' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show as a table' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('reveals and hides the table without removing it', async () => {
    const user = userEvent.setup();
    render(<DocsDiagram spec={sequence} />);
    const toggle = screen.getByRole('button', { name: 'Show as a table' });

    await user.click(toggle);
    expect(screen.getByRole('button', { name: 'Hide the table' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('table', { name: 'Steps in order' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hide the table' }));
    expect(screen.getByRole('table', { name: 'Steps in order' })).toBeInTheDocument();
  });

  it('says every step in words, in order, with what kind of message it is', () => {
    render(<DocsDiagram spec={sequence} />);
    const table = screen.getByRole('table', { name: 'Steps in order' });
    const rows = within(table).getAllByRole('row').slice(1);

    expect(rows).toHaveLength(sequence.steps!.length);
    expect(rows[0]).toHaveTextContent('Calls: Asks for the thing');
    expect(rows[1]).toHaveTextContent('Aside: Checks the session');
    expect(rows[2]).toHaveTextContent('Refuses: Refuses without one');
    expect(rows[4]).toHaveTextContent('Returns: Returns it');
  });

  it('names the actors rather than their identifiers', () => {
    render(<DocsDiagram spec={sequence} />);
    const table = screen.getByRole('table', { name: 'Steps in order' });
    expect(within(table).getAllByText('Postgres').length).toBeGreaterThan(0);
    expect(within(table).queryByText('db')).not.toBeInTheDocument();
  });

  it('carries the note and the files it was read from', () => {
    render(<DocsDiagram spec={sequence} />);
    expect(screen.getByText('The last step is closed in a default build.')).toBeInTheDocument();
    expect(screen.getByText('apps/api/src/app.ts')).toBeInTheDocument();
  });

  it('says which state starts and which ends, in words', () => {
    render(<DocsDiagram spec={state} />);
    const table = screen.getByRole('table', { name: 'States' });
    expect(within(table).getByText('Starts here')).toBeInTheDocument();
    expect(within(table).getByText('Ends here')).toBeInTheDocument();
    expect(within(table).getByText('In progress')).toBeInTheDocument();
  });

  it('reports a state the code declares that nothing reaches', () => {
    // A dead state is a finding. Saying "ends here" about it would bury the
    // one thing worth noticing.
    render(<DocsDiagram spec={state} />);
    const table = screen.getByRole('table', { name: 'States' });
    expect(within(table).getByText('Nothing reaches this')).toBeInTheDocument();
  });

  it('names a trust level rather than showing a border style', () => {
    render(<DocsDiagram spec={topology} />);
    const table = screen.getByRole('table', { name: 'Trust zones' });
    expect(within(table).getByText('Untrusted')).toBeInTheDocument();
    expect(within(table).getByText('Trusted')).toBeInTheDocument();
  });

  it('says plainly when a journey phase has nothing running it', () => {
    // The empty list is a finding, and a blank cell would read as an oversight.
    render(<DocsDiagram spec={lanes} />);
    const table = screen.getByRole('table', { name: 'Phases in order' });
    expect(within(table).getByText('Nothing runs this phase')).toBeInTheDocument();
    expect(within(table).getByText('e2e/tests/today.spec.ts')).toBeInTheDocument();
  });

  it('hides the drawing from assistive technology, because it is a duplicate', () => {
    const { container } = render(<DocsDiagram spec={sequence} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('draws one lifeline per actor and one arrow per step', () => {
    const { container } = render(<DocsDiagram spec={sequence} />);
    expect(container.querySelectorAll('.docs-diagram__lifeline')).toHaveLength(3);
    expect(container.querySelectorAll('.docs-diagram__arrow')).toHaveLength(5);
    // A refusal is marked with a cross rather than a colour.
    expect(container.querySelectorAll('.docs-diagram__refusal')).toHaveLength(1);
  });
});
