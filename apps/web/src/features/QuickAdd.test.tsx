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
  it('protects a typed capture when dismissing, and returns to the line when kept', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockApi.post.mockReturnValue(new Promise(() => {}));
    renderWithApp(<QuickAdd onClose={onClose} />);
    const input = await screen.findByLabelText('Capture line');
    await user.type(input, 'p Lina');
    await user.keyboard('{Escape}');
    expect(await screen.findByRole('dialog', { name: 'Discard changes?' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(input).toHaveValue('p Lina');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onClose).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Discard changes?' })).not.toBeInTheDocument());
  });

  it('offers a visible save action and prevents edits or duplicate submissions while saving', async () => {
    const user = userEvent.setup();
    mockApi.post.mockReturnValue(new Promise(() => {}));
    renderWithApp(<QuickAdd onClose={vi.fn()} />);
    const input = await screen.findByLabelText('Capture line');
    await user.type(input, 'i A useful idea');
    await user.click(screen.getByRole('button', { name: 'Capture' }));
    expect(input).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: 'Capturing...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await user.click(input);
    await user.keyboard('{Enter}{Enter}');
    expect(mockApi.post.mock.calls.filter(([path]) => path === '/capture')).toHaveLength(1);
  });

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

  it('keeps the capture line and explains how to recover when previewing fails', async () => {
    const user = userEvent.setup();
    mockApi.post.mockRejectedValueOnce(new Error('preview unavailable'));
    renderWithApp(<QuickAdd onClose={vi.fn()} />);

    const input = await screen.findByLabelText('Capture line');
    await user.type(input, 'p Lina');

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Preview unavailable. Your capture line is still here; keep typing to retry, or press Enter to save it.',
    );
    expect(input).toHaveValue('p Lina');

    mockApi.post.mockResolvedValueOnce({
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
        raw: 'p Lina F',
      },
    });
    await user.type(input, ' F');
    await waitFor(() =>
      expect(
        screen.queryByText(
          'Preview unavailable. Your capture line is still here; keep typing to retry, or press Enter to save it.',
        ),
      ).not.toBeInTheDocument(),
    );
    expect(await screen.findByText('person')).toBeInTheDocument();
  });
});
