/**
 * The printable atlas sheets: the registers that have to be countable lists,
 * the direction marks that have to reach a reader who is not looking at an
 * arrow, and the heading level the page banner above the tabs already owns.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CATALOG_ENTITIES, CATALOG_RELATIONS, ENTITY_GROUPS } from './entityCatalogModel.js';
import { EntityCatalogAtlas } from './EntityCatalogAtlas.js';

// The matrix sheet is a whole second component with its own SVG machinery.
// Standing it in keeps this file about the atlas markup.
vi.mock('./EntityObservatorySnapshot.js', () => ({
  EntityObservatorySnapshot: () => <div data-testid="matrix-sheet" />,
}));

function notationSheet(): HTMLElement {
  const heading = screen.getByRole('heading', { name: 'Notation' });
  return heading.closest('section') as HTMLElement;
}

describe('EntityCatalogAtlas states', () => {
  it('counts each group of entity types as a named list', () => {
    render(<EntityCatalogAtlas visible />);

    for (const group of ENTITY_GROUPS) {
      const list = screen.getByRole('list', { name: `${group.label} entity types` });
      const expected = CATALOG_ENTITIES.filter((entity) => entity.group === group.label);
      expect(within(list).getAllByRole('listitem')).toHaveLength(expected.length);
    }
  });

  it('counts the directed relation types as a named list', () => {
    render(<EntityCatalogAtlas visible />);
    const list = screen.getByRole('list', { name: 'Directed relation types' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(CATALOG_RELATIONS.length);
  });

  it('says which way each relation points instead of only drawing an arrow', () => {
    render(<EntityCatalogAtlas visible />);

    const relations = screen.getByRole('list', { name: 'Directed relation types' });
    const first = within(relations).getAllByRole('listitem')[0] as HTMLElement;
    expect(within(first).getByText('to')).toBeInTheDocument();

    expect(screen.getAllByText('outgoing').length).toBeGreaterThan(0);
    expect(screen.getAllByText('incoming').length).toBeGreaterThan(0);
  });

  it('leaves the page banner as the only first level heading', () => {
    render(<EntityCatalogAtlas visible />);
    expect(screen.queryAllByRole('heading', { level: 1 })).toHaveLength(0);
    expect(
      screen.getByRole('heading', { level: 2, name: 'Entity and relation map' }),
    ).toBeInTheDocument();
  });

  it('gives the asterisk one meaning on the notation sheet', () => {
    render(<EntityCatalogAtlas visible />);
    const notation = notationSheet();
    expect(notation).toHaveTextContent('wildcard endpoint (*)');
    expect(notation).not.toHaveTextContent('required field');
    expect(notation).toHaveTextContent('the field must be supplied');
  });

  it('keeps a writing margin only on the two sheets that print one', () => {
    render(<EntityCatalogAtlas visible />);
    // The group and relation sheets used to carry the same block, hidden by a
    // print rule, so it cost screen height and bought nothing on paper.
    expect(screen.getAllByText('Review notes')).toHaveLength(2);
  });
});
