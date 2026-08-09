/**
 * Knows editor: closeness auto-fills cadence; Save patches the edge.
 */
import './../../test/api-mock.js';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, resetMockApi } from '../../test/api-mock.js';
import { renderWithApp } from '../../test/render.js';
import { KnowsEditor } from './KnowsEditor.js';

beforeEach(() => {
  resetMockApi();
  mockApi.patch.mockResolvedValue({});
});

describe('KnowsEditor', () => {
  it('auto-fills cadence from closeness and saves merged props', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    renderWithApp(
      <KnowsEditor
        personId="p1"
        edgeId="e1"
        knowsProps={{ relation: 'colleague', topics: [] }}
        onDone={onDone}
      />,
    );

    await user.click(screen.getByRole('radio', { name: '4 of 5' }));
    expect(screen.getByLabelText('Reconnect cadence (days)')).toHaveValue(60);

    await user.click(screen.getByRole('button', { name: 'Save relationship' }));
    await waitFor(() => {
      expect(mockApi.patch).toHaveBeenCalledWith(
        '/edges/e1',
        expect.objectContaining({
          props: expect.objectContaining({
            closeness: 4,
            cadence_target_days: 60,
            relation: 'colleague',
          }),
        }),
      );
    });
    expect(onDone).toHaveBeenCalledOnce();
  });
});
