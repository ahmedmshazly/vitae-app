/**
 * Entity picker: search/switch hits and onPick.
 */
import './../test/api-mock.js';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { EntityPicker } from './EntityPicker.js';

beforeEach(() => {
  resetMockApi();
});

describe('EntityPicker', () => {
  it('searches switch results and calls onPick when a hit is chosen', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    mockApi.get.mockResolvedValue({
      results: [{ id: 'p1', type: 'person', title: 'Ada Lovelace', subtitle: 'Analyst' }],
    });

    renderWithApp(
      <EntityPicker types={['person']} onPick={onPick} placeholder="Search people…" />,
    );

    const input = screen.getByRole('combobox', { name: 'Search people…' });
    await user.type(input, 'Ada');

    await waitFor(() => {
      expect(mockApi.get).toHaveBeenCalledWith(expect.stringContaining('/search/switch?'));
    });
    expect(await screen.findByRole('option', { name: /Ada Lovelace/ })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: /Ada Lovelace/ }));
    expect(onPick).toHaveBeenCalledWith({ id: 'p1', type: 'person', title: 'Ada Lovelace' });
  });
});
