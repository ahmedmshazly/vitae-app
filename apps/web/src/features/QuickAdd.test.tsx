/**
 * Quick capture: preview chips and Esc close.
 */
import './../test/api-mock.js';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { QuickAdd } from './QuickAdd.js';

beforeEach(() => {
  resetMockApi();
});

describe('QuickAdd', () => {
  it('previews a capture line and shows type chips', async () => {
    const user = userEvent.setup();
    mockApi.post.mockResolvedValue({
      plan: {
        primaryType: 'person',
        title: 'Lina Farouk',
        notes: '',
        tags: [],
        people: [],
        orgs: [],
        date: null,
        priority: null,
        url: null,
        chips: [{ kind: 'type', label: 'person' }],
        raw: 'p Lina Farouk',
      },
    });

    renderWithApp(<QuickAdd onClose={vi.fn()} />);
    const input = await screen.findByLabelText('Capture line');
    await user.type(input, 'p Lina');

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/capture/preview', { raw: 'p Lina' });
    });
    expect(await screen.findByText('person')).toBeInTheDocument();
  });

  it('closes when Escape is pressed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithApp(<QuickAdd onClose={onClose} />);
    await screen.findByLabelText('Capture line');
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });
});
