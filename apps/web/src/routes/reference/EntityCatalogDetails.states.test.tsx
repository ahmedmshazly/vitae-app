/**
 * The dossier a selected entity or relation opens into: the facts that have to
 * be paired terms rather than prose, the marks that have to survive being read
 * aloud, and the envelope tables that stay folded until they are asked for.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type {
  CatalogEntity,
  CatalogField,
  CatalogRelation,
} from './entityCatalogModel.js';
import { EntityDetails, RelationDetails, SelectionDetails } from './EntityCatalogDetails.js';

function field(over: Partial<CatalogField> & { key: string }): CatalogField {
  return {
    label: over.key,
    type: 'string',
    required: false,
    nullable: false,
    defaultValue: undefined,
    enumValues: [],
    enumRef: null,
    min: null,
    max: null,
    length: null,
    note: null,
    children: [],
    ...over,
  };
}

const ENTITY: CatalogEntity = {
  kind: 'entity',
  id: 'entity:role',
  type: 'role',
  group: 'Career',
  titleLabel: 'Role title',
  subtitleLabel: 'Employer',
  fields: [
    field({ key: 'title', label: 'Title', required: true }),
    field({ key: 'seniority', label: 'Seniority' }),
  ],
  subject: {
    edgeType: 'ROLE_AT',
    direction: 'out',
    required: true,
    defaultToSelf: false,
    label: 'Employer',
  },
  formEdges: [
    {
      edgeType: 'USES_SKILL',
      direction: 'out',
      targets: ['skill'],
      cardinality: 'many',
      label: 'Skills used',
    },
    {
      edgeType: 'REPORTS_TO',
      direction: 'in',
      targets: '*',
      cardinality: 'one',
      label: 'Direct reports',
    },
  ],
  envelopeDates: true,
  notes: null,
};

const RELATION: CatalogRelation = {
  kind: 'relation',
  id: 'relation:ROLE_AT',
  type: 'ROLE_AT',
  label: 'Role at organization',
  description: 'A role held at an organization.',
  sources: ['role'],
  targets: ['organization'],
  allowedPairs: [['role', 'organization']],
  fields: [field({ key: 'is_current', label: 'Current', type: 'boolean' })],
  notes: null,
};

/** The term and its value, which is the row of the ledger they share. The
 * shared envelope table reuses some of the same words, so only a term counts. */
function ledgerRow(term: string): HTMLElement {
  const dt = screen.getAllByText(term).find((el) => el.tagName === 'DT');
  if (!dt) throw new Error(`no ledger term named ${term}`);
  return dt.closest('div') as HTMLElement;
}

describe('EntityCatalogDetails states', () => {
  it('pairs each identity fact with its value instead of writing four sentences', () => {
    render(<EntityDetails entity={ENTITY} />);

    expect(ledgerRow('Primary label')).toHaveTextContent('Role title');
    expect(ledgerRow('Secondary label')).toHaveTextContent('Employer');
    expect(ledgerRow('Dates')).toHaveTextContent('Start and end enabled');
    expect(ledgerRow('Subject')).toHaveTextContent('ROLE_AT');
  });

  it('omits the label rows a type does not have', () => {
    render(<EntityDetails entity={{ ...ENTITY, subtitleLabel: null, envelopeDates: false }} />);

    expect(screen.queryByText('Secondary label')).toBeNull();
    expect(ledgerRow('Dates')).toHaveTextContent('Not shown by default');
  });

  it('states a required field in words rather than as a coloured mark', () => {
    render(<EntityDetails entity={ENTITY} />);

    expect(screen.getByRole('row', { name: /Title/ })).toHaveTextContent('string · required');
    expect(screen.queryByTitle('Required')).toBeNull();
    expect(screen.queryByText('*')).toBeNull();
  });

  it('names the direction of each inline relation', () => {
    render(<EntityDetails entity={ENTITY} />);

    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('outgoing');
    expect(items[0]).toHaveTextContent('USES_SKILL');
    expect(items[1]).toHaveTextContent('incoming');
    expect(items[1]).toHaveTextContent('Any entity');
  });

  it('keeps the shared envelope folded away until it is asked for', () => {
    render(<EntityDetails entity={ENTITY} />);

    const trigger = screen.getByRole('button', { name: /Shared node fields/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('table', { name: 'Shared node fields' })).toBeNull();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('table', { name: 'Shared node fields' })).toBeInTheDocument();
  });

  it('pairs a relation endpoint with the word for the end it is', () => {
    render(<RelationDetails relation={RELATION} />);

    expect(ledgerRow('Source')).toHaveTextContent('role');
    expect(ledgerRow('Target')).toHaveTextContent('organization');
  });

  it('reads an allowed pair as one type to another, with the arrow left to the eye', () => {
    render(<RelationDetails relation={RELATION} />);

    const pair = screen.getAllByRole('listitem')[0] as HTMLElement;
    expect(within(pair).getByText('to')).toBeInTheDocument();
    expect(within(pair).getByText('→')).toHaveAttribute('aria-hidden', 'true');
  });

  it('opens the wildcard endpoint on its own dossier', () => {
    render(<SelectionDetails selection={{ kind: 'any', id: 'any', label: 'Any entity' }} />);
    expect(screen.getByRole('heading', { name: 'Any entity' })).toBeInTheDocument();
  });
});
