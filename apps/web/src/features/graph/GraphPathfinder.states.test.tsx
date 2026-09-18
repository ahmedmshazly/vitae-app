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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
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
      onPickFrom={() => {}}
      onResetFrom={() => {}}
      onClearTo={() => {}}
      selfId="self"
      {...over}
    />,
  );
}

describe('GraphPathfinder endpoints', () => {
  it('says why the From endpoint offers nothing to press', () => {
    renderPathfinder();
    expect(screen.getByText(/Paths always start from you/)).toBeInTheDocument();
  });

  it('shows a selected alternate origin and lets people restore self', async () => {
    const user = userEvent.setup();
    const onResetFrom = vi.fn();
    renderPathfinder({ fromId: 'n9', fromTitle: 'Grace', onResetFrom });
    expect(screen.getByText('Grace')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Use self' }));
    expect(onResetFrom).toHaveBeenCalledOnce();
  });

  it('names both endpoints so From and To are not read as loose text', () => {
    renderPathfinder();
    expect(screen.getByRole('group', { name: 'From' })).toHaveTextContent('Ada');
    expect(screen.getByRole('group', { name: 'To' })).toBeInTheDocument();
  });

  it('offers the kinds the map draws when changing the origin', async () => {
    const user = userEvent.setup();
    renderPathfinder();
    await user.click(screen.getByRole('button', { name: 'Change origin' }));
    const narrow = within(screen.getByRole('group', { name: 'From' })).getByRole('group', {
      name: 'Narrow to one type',
    });
    // All, plus the seven types the life map draws by default.
    expect(within(narrow).getAllByRole('button')).toHaveLength(8);
    expect(within(narrow).getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('lets someone leave origin search without changing the path', async () => {
    const user = userEvent.setup();
    renderPathfinder();
    await user.click(screen.getByRole('button', { name: 'Change origin' }));
    await user.click(screen.getByRole('button', { name: 'Keep self' }));
    expect(screen.getByRole('button', { name: 'Change origin' })).toBeInTheDocument();
  });

  it('lets a caller that knows the drawn types narrow the origin further', async () => {
    const user = userEvent.setup();
    renderPathfinder({ destinationTypes: ['person', 'project'] });
    await user.click(screen.getByRole('button', { name: 'Change origin' }));
    const narrow = within(screen.getByRole('group', { name: 'From' })).getByRole('group', {
      name: 'Narrow to one type',
    });
    expect(within(narrow).getAllByRole('button')).toHaveLength(3);
  });
});
