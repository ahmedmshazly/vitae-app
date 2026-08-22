/**
 * Path mode endpoints.
 *
 * The From endpoint used to explain itself only when `fromId !== selfId`, a
 * condition the caller cannot produce, so the sentence saying why From has no
 * control was dead code and people clicked a value that does nothing. The To
 * picker was handed every node type in the schema, which is a wall of chips.
 */
import './../../test/api-mock.js';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi, resetMockApi } from '../../test/api-mock.js';
import { renderWithApp } from '../../test/render.js';
import { GraphPathfinder } from './GraphPathfinder.js';

beforeEach(() => {
  resetMockApi();
  mockApi.get.mockResolvedValue({ results: [] });
});

function renderPathfinder(over: Partial<Parameters<typeof GraphPathfinder>[0]> = {}) {
  return renderWithApp(
    <GraphPathfinder
      fromId="self"
      fromTitle="Ada"
      toId={null}
      toTitle={null}
      onPickTo={() => {}}
      onClearTo={() => {}}
      selfId="self"
      {...over}
    />,
  );
}

describe('GraphPathfinder endpoints', () => {
  it('says why the From endpoint offers nothing to press', () => {
    renderPathfinder();
    expect(screen.getByText('Paths always start from you')).toBeInTheDocument();
  });

  it('says the From endpoint follows the focus when the focus is not you', () => {
    renderPathfinder({ fromId: 'n9', fromTitle: 'Grace' });
    expect(screen.getByText('Starting from the focused record')).toBeInTheDocument();
  });

  it('names both endpoints so From and To are not read as loose text', () => {
    renderPathfinder();
    expect(screen.getByRole('group', { name: 'From' })).toHaveTextContent('Ada');
    expect(screen.getByRole('group', { name: 'To' })).toBeInTheDocument();
  });

  it('offers the kinds the map draws, not every kind in the schema', () => {
    renderPathfinder();
    const narrow = screen.getByRole('group', { name: 'Narrow to one type' });
    // All, plus the seven types the life map draws by default.
    expect(within(narrow).getAllByRole('button')).toHaveLength(8);
    expect(within(narrow).getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('lets a caller that knows the drawn types narrow further', () => {
    renderPathfinder({ destinationTypes: ['person', 'project'] });
    const narrow = screen.getByRole('group', { name: 'Narrow to one type' });
    expect(within(narrow).getAllByRole('button')).toHaveLength(3);
  });
});
