/**
 * Connection row: neighbor title and unlink confirmation.
 */
import './../../test/api-mock.js';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi, resetMockApi } from '../../test/api-mock.js';
import { renderWithApp } from '../../test/render.js';
import { ConnectionRow } from './ConnectionRow.js';

beforeEach(() => {
  resetMockApi();
  mockApi.del.mockResolvedValue({});
});

describe('ConnectionRow', () => {
  it('renders the neighbor title and unlinks after confirm', async () => {
    const user = userEvent.setup();
    renderWithApp(
      <ConnectionRow
        edge={{
          id: 'e1',
          type: 'KNOWS',
          src: 'self-1',
          dst: 'p2',
          props: { relation: 'colleague' },
        }}
        nodeId="self-1"
        neighbors={{ p2: { id: 'p2', type: 'person', title: 'Grace Hopper' } }}
      />,
    );

    expect(screen.getByRole('link', { name: /Grace Hopper/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Unlink Grace Hopper' }));
    expect(await screen.findByRole('heading', { name: /Unlink Grace Hopper/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Unlink' }));
    await waitFor(() => {
      expect(mockApi.del).toHaveBeenCalledWith('/edges/e1');
    });
  });
});
