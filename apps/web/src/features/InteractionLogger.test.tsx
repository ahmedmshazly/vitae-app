/**
 * Interaction logger: save posts kind + note; busy while in flight.
 */
import './../test/api-mock.js';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { InteractionLogger } from './InteractionLogger.js';

beforeEach(() => {
  resetMockApi();
});

describe('InteractionLogger', () => {
  it('posts an interaction and closes on save', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    let resolvePost: (value: unknown) => void = () => {};
    mockApi.post.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePost = resolve;
        }),
    );

    renderWithApp(
      <InteractionLogger personId="p1" personName="Ada" onClose={onClose} />,
    );

    await user.click(screen.getByRole('radio', { name: /call/i }));
    await user.type(screen.getByLabelText('What happened?'), 'Quick sync');
    const save = screen.getByRole('button', { name: 'Save' });
    await user.click(save);
    expect(save).toBeDisabled();
    expect(save).toHaveTextContent('Saving…');

    resolvePost({ interaction: { id: 'i1' }, strength: { strength: 0.4 } });
    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith(
        '/interactions',
        expect.objectContaining({ personId: 'p1', kind: 'call', note: 'Quick sync' }),
      );
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce();
    });
  });
});
